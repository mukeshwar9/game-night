// Invite → push. Fires on invites/{uid}/{inviteId} create, sends FCM to
// recipient's users/{uid}/fcmTokens, drops dead tokens (404/410).
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
    if (typeof v.token === 'string' && v.token.length >= 20) out.push({ hash: child.key, token: v.token })
  })
  return out
}

// The multicast message for one invite. Data-only: the service worker
// (public/firebase-messaging-sw.js) draws the notification. A `notification`
// key as well makes the browser show one of its own and the worker a second.
// The link is the app route /game/:gameId (there is no /g/ route).
function buildInviteMessage(invite, tokens) {
  const from = core.displayNameFor(invite.fromName, 'A friend')
  const gameId = String(invite.gameId || '').slice(0, 40)
  return {
    data: { title: 'Game Night', body: `${from} invited you to play!`, url: gameId ? `/game/${gameId}` : '/', kind: 'invite' },
    tokens: tokens.map(t => t.token),
  }
}

async function sendInvitePush(uid, invite) {
  const tokens = await tokensFor(uid)
  if (!tokens.length) return { sent: 0, reason: 'no-tokens' }
  const gameId = String(invite.gameId || '')
  const message = buildInviteMessage(invite, tokens)
  const res = await messaging().sendEachForMulticast(message)
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
exports._test = { sendInvitePush, tokensFor, buildInviteMessage }
