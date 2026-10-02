// Invite → push. Fires on invites/{uid}/{inviteId} create, sends FCM to
// recipient's users/{uid}/fcmTokens (web, iOS and Android), drops dead tokens (404/410).
// Clients never send push directly; only this sender reads tokens.
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
  const title = 'Game Night'
  const body = inviteBody(invite, from)
  const url = gameId ? `/game/${gameId}` : '/'
  if (!NATIVE_PLATFORMS.includes(token.platform)) {
    return { token: token.token, data: { title, body, url, kind: 'invite' } }
  }
  const data = { url, kind: 'invite', ...(gameId ? { gameId } : {}) }
  if (token.platform === 'ios') {
    return {
      token: token.token,
      notification: { title, body },
      data,
      apns: {
        ...(gameId ? { headers: { 'apns-collapse-id': gameId } } : {}),
        payload: { aps: { sound: 'default', 'thread-id': gameId || 'invites' } },
      },
    }
  }
  return {
    token: token.token,
    notification: { title, body },
    data,
    android: {
      priority: 'high',
      notification: { channelId: ANDROID_CHANNEL, ...(gameId ? { tag: gameId } : {}) },
    },
  }
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
  const tokens = await tokensFor(uid)
  if (!tokens.length) return { sent: 0, reason: 'no-tokens' }
  const gameId = String(invite.gameId || '')
  // One message per token (each carries its own platform payload); responses
  // come back in the same order.
  const res = await messaging().sendEach(buildInviteMessages(invite, tokens))
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
  logger.info('invite push', { uid, gameId, sent: res.successCount, failed: res.failureCount })
  return { sent: res.successCount }
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

// Exported for unit test without emulator.
exports._test = { sendInvitePush, isBlocked, tokensFor, buildInviteMessage, buildInviteMessages, inviteBody }
