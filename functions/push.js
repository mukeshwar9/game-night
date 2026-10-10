// Pushes. Each fires on a create and sends FCM to the recipient's
// users/{uid}/fcmTokens (web, iOS and Android), dropping dead tokens (404/410):
//   sendInvitePush         invites/{uid}/{inviteId}       "Alice invited you to play!"
//   sendFriendRequestPush  friendRequests/{uid}/{fromUid}  "Alice wants to be friends"
//   sendJoinedPush         games/{id}/players/O           "Bob joined your room" (host away)
// Clients never send push directly; only these senders read tokens.
const { onValueWritten } = require('firebase-functions/v2/database')
const logger = require('firebase-functions/logger')
const { getDatabase } = require('firebase-admin/database')
const core = require('./lib/core.cjs')

let messagingCache = null
function messaging() {
  if (!messagingCache) messagingCache = require('firebase-admin/messaging').getMessaging()
  return messagingCache
}

async function tokensFor(uid) {
  const snap = await getDatabase().ref(`users/${uid}/fcmTokens`).get()
  if (!snap.exists()) return []
  const out = []
  snap.forEach(child => {
    const v = child.val() || {}
    if (typeof v.token === 'string' && v.token.length >= 20) {
      // Records from before the platform field existed are web tokens.
      out.push({ hash: child.key, token: v.token, platform: NATIVE_PLATFORMS.includes(v.platform) ? v.platform : 'web' })
    }
  })
  return out
}

const NATIVE_PLATFORMS = ['ios', 'android']
// Android notification channel the app creates (src/lib/native/nativePush.js);
// an unknown id falls back to FCM's default channel.
const ANDROID_CHANNEL = 'invites'

// The message for one token of one invite. The link is the app route
// /game/:gameId (there is no /g/ route).
//
// Web tokens get a data-only message: the service worker
// (public/firebase-messaging-sw.js) draws the notification, and a
// `notification` key as well would make the browser show one of its own and the
// worker a second.
//
// Native tokens get a `notification` block. A data-only message is a silent
// background push on iOS that is never displayed, and on Android it never
// reaches the tray while the app is closed. The system draws the notification
// and a tap hands the data back to the app (src/lib/pushRouteLogic.js reads
// `gameId` / `url`). `tag` / `thread-id` / `apns-collapse-id` keep one
// notification per room.
// Party invites (kind 'party') say so, with the head-count when the client
// sent one; older game invites keep their copy.
function inviteBody(invite, from) {
  if (invite?.kind !== 'party') return `${from} invited you to play!`
  const size = Number.isInteger(invite.size) && invite.size > 0 && invite.size <= 8 ? invite.size : null
  const cap = Number.isInteger(invite.cap) && invite.cap >= 2 && invite.cap <= 8 ? invite.cap : 4
  return size ? `${from} invited you to their party (${size}/${cap})` : `${from} invited you to their party`
}

function buildInviteMessage(invite, token) {
  const from = core.displayNameFor(invite.fromName, 'A friend')
  const gameId = String(invite.gameId || '').slice(0, 40)
  return buildPushMessage({ body: inviteBody(invite, from), kind: 'invite', gameId, thread: 'invites' }, token)
}

// One notification for one token, in that platform's shape (see above).
// `gameId` links to the room and collapses repeats per room; `url` is used
// when there is no room (a friend request opens /friends); `collapse` groups
// notifications that are not about a room.
function buildPushMessage({ body, kind, gameId = '', url: path = '', thread, collapse = '' }, token) {
  const title = 'Game Night'
  const url = gameId ? `/game/${gameId}` : path || '/'
  const key = gameId || collapse
  if (!NATIVE_PLATFORMS.includes(token.platform)) {
    return { token: token.token, data: { title, body, url, kind } }
  }
  const data = { url, kind, ...(gameId ? { gameId } : {}) }
  if (token.platform === 'ios') {
    return {
      token: token.token,
      notification: { title, body },
      data,
      apns: {
        ...(key ? { headers: { 'apns-collapse-id': key } } : {}),
        payload: { aps: { sound: 'default', 'thread-id': gameId || thread } },
      },
    }
  }
  return {
    token: token.token,
    notification: { title, body },
    data,
    android: {
      priority: 'high',
      notification: { channelId: ANDROID_CHANNEL, ...(key ? { tag: key } : {}) },
    },
  }
}

// Someone sent `uid` a friend request (friendRequests/{uid}/{fromUid}).
function buildFriendRequestMessage(request, fromUid, token) {
  const from = core.displayNameFor(request?.name, 'Someone')
  return buildPushMessage({ body: `${from} wants to be friends on Game Night`, kind: 'friend', url: '/friends', thread: 'friends', collapse: `friend-${String(fromUid).slice(0, 40)}` }, token)
}

// A second player took the open seat of `uid`'s room while the host was away
// (shared the link, then switched to another app).
function buildJoinedMessage(player, gameId, token) {
  const who = core.displayNameFor(player?.name, 'Your friend')
  return buildPushMessage({ body: `${who} joined your room. Jump back in!`, kind: 'joined', gameId: String(gameId).slice(0, 40), thread: 'rooms' }, token)
}

function buildInviteMessages(invite, tokens) {
  return tokens.map(t => buildInviteMessage(invite, t))
}

// True when `uid` has blocked `fromUid`. The rules already refuse such an
// invite; this keeps a push from going out if one ever slips through (an invite
// written before the block, a rules gap). `database` is injectable for tests.
async function isBlocked(uid, fromUid, database = getDatabase()) {
  if (!uid || !fromUid) return false
  const snap = await database.ref(`blocks/${uid}/${fromUid}`).get()
  return snap.exists()
}

async function sendInvitePush(uid, invite) {
  if (await isBlocked(uid, invite.fromUid)) return { sent: 0, reason: 'blocked' }
  const gameId = String(invite.gameId || '')
  return sendToUser(uid, (tokens) => buildInviteMessages(invite, tokens), { what: 'invite push', gameId })
}

// Sends one message per token of `uid` (each carries its own platform
// payload; responses come back in the same order) and drops the tokens FCM
// reports dead.
async function sendToUser(uid, build, logFields) {
  const tokens = await tokensFor(uid)
  if (!tokens.length) return { sent: 0, reason: 'no-tokens' }
  const res = await messaging().sendEach(build(tokens))
  // Drop tokens FCM reports dead so inbox doesn't fill with junk.
  const dead = []
  res.responses.forEach((r, i) => {
    if (!r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code)) {
      dead.push(tokens[i].hash)
    }
  })
  if (dead.length) {
    const updates = {}
    for (const h of dead) updates[`users/${uid}/fcmTokens/${h}`] = null
    await getDatabase().ref().update(updates)
  }
  const { what, ...fields } = logFields
  logger.info(what, { uid, ...fields, sent: res.successCount, failed: res.failureCount })
  return { sent: res.successCount }
}

async function sendFriendRequestPush(uid, fromUid, request) {
  if (await isBlocked(uid, fromUid)) return { sent: 0, reason: 'blocked' }
  return sendToUser(uid, (tokens) => tokens.map(t => buildFriendRequestMessage(request, fromUid, t)), { what: 'friend request push' })
}

// True when the room's host (seat X) has no live connection: away from the
// app, so a push is the only way they learn someone joined.
function hostAway(game) {
  const conns = game?.presence?.X?.conns
  return !(conns && typeof conns === 'object' && Object.keys(conns).length > 0)
}

async function sendJoinedPush(gameId, joiner, database = getDatabase()) {
  const snap = await database.ref(`games/${gameId}`).get()
  const game = snap.val()
  const hostUid = game?.players?.X?.playerId
  if (!hostUid || !joiner?.playerId || hostUid === joiner.playerId) return { sent: 0, reason: 'no-host' }
  if (game.status === 'finished' || !hostAway(game)) return { sent: 0, reason: 'host-here' }
  if (await isBlocked(hostUid, joiner.playerId, database)) return { sent: 0, reason: 'blocked' }
  return sendToUser(hostUid, (tokens) => tokens.map(t => buildJoinedMessage(joiner, gameId, t)), { what: 'joined push', gameId })
}

exports.sendInvitePush = onValueWritten({ ref: 'invites/{uid}/{inviteId}', maxInstances: 10 }, async (event) => {
  const after = event.data?.after?.val()
  const before = event.data?.before?.exists()
  // Create only — updates/deletes carry no new invite.
  if (!after || before) return null
  if (!after.gameId || !after.fromUid) return null
  try {
    await sendInvitePush(event.params.uid, after)
  } catch (e) {
    logger.warn('invite push failed', { uid: event.params.uid, error: e?.message || e })
  }
  return null
})

exports.sendFriendRequestPush = onValueWritten({ ref: 'friendRequests/{uid}/{fromUid}', maxInstances: 10 }, async (event) => {
  const after = event.data?.after?.val()
  if (!after || event.data?.before?.exists()) return null
  try {
    await sendFriendRequestPush(event.params.uid, event.params.fromUid, after)
  } catch (e) {
    logger.warn('friend request push failed', { uid: event.params.uid, error: e?.message || e })
  }
  return null
})

// 2P rooms only: seat O filling is "your friend joined". Party rooms fill a
// lobby the host is watching.
exports.sendJoinedPush = onValueWritten({ ref: 'games/{gameId}/players/O', maxInstances: 10 }, async (event) => {
  const after = event.data?.after?.val()
  if (!after || event.data?.before?.exists()) return null
  try {
    await sendJoinedPush(event.params.gameId, after)
  } catch (e) {
    logger.warn('joined push failed', { gameId: event.params.gameId, error: e?.message || e })
  }
  return null
})

// Exported for unit test without emulator.
exports._test = {
  sendInvitePush, sendJoinedPush, isBlocked, tokensFor, hostAway,
  buildInviteMessage, buildInviteMessages, buildFriendRequestMessage, buildJoinedMessage, inviteBody,
}
