// Party voice chat through the Cloudflare Realtime SFU. The browser never
// talks to Cloudflare's API: every session and track change goes through
// voiceSfu, which holds the app secret, checks the caller against the room,
// and owns every session id.
//
//  voiceSfu            callable  ice | join | pull | renegotiate | close | leave
//  voiceOnBlock        RTDB      blocks/{uid}/{blocked} created -> stop audio both ways
//  voiceOnRemove       RTDB      games/{gameId}/removed/{uid} created -> drop them from voice
//
// Data (database.rules.json):
//  voiceSessions/{gameId}/{uid}  server-only  { sessionId, trackName, mid, attempt, at, pulls: { [uid]: { mid } } }
//  voiceUsers/{uid}              server-only  { gameId }  (which room's voice a uid is in, for block/remove)
//  voice/{gameId}/{uid}          members read, owner writes  { on, muted, at }  (the client directory)
//
// Off by default. VOICE_ENABLED=1 turns voiceSfu on; VOICE_SECRETS=1 (read at
// deploy time) binds CF_SFU_APP_ID and CF_SFU_APP_SECRET from Secret Manager,
// and VOICE_TURN=1 also binds CF_TURN_KEY_ID and CF_TURN_TOKEN. Unset, nothing
// is bound and voiceSfu answers voice-not-configured.
//
// The pure checks (membership, cap, removal, public rooms, age, audio-only,
// pulls by uid with blocks both ways, the call budget) live in
// src/lib/voiceLogic.js, bundled into lib/core.cjs and shared with the app.
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onValueCreated } = require('firebase-functions/v2/database')
const { defineSecret } = require('firebase-functions/params')
const logger = require('firebase-functions/logger')
const { getDatabase } = require('firebase-admin/database')
const core = require('./lib/core.cjs')

const CF_BASE = 'https://rtc.live.cloudflare.com/v1'
const DEFAULT_ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }]
const TURN_TTL_S = 2 * 60 * 60

const flag = (raw) => String(raw || '').trim() === '1'
const SECRETS_ON = flag(process.env.VOICE_SECRETS)
const TURN_ON = SECRETS_ON && flag(process.env.VOICE_TURN)
const CF_SFU_APP_ID = SECRETS_ON ? defineSecret('CF_SFU_APP_ID') : null
const CF_SFU_APP_SECRET = SECRETS_ON ? defineSecret('CF_SFU_APP_SECRET') : null
const CF_TURN_KEY_ID = TURN_ON ? defineSecret('CF_TURN_KEY_ID') : null
const CF_TURN_TOKEN = TURN_ON ? defineSecret('CF_TURN_TOKEN') : null
const BOUND = [CF_SFU_APP_ID, CF_SFU_APP_SECRET, CF_TURN_KEY_ID, CF_TURN_TOKEN].filter(Boolean)
const bindSecrets = () => (BOUND.length ? { secrets: BOUND } : {})
const secretValue = (param) => (param ? param.value() || '' : '')

/** The Cloudflare config, or null when voice is off or not configured. */
function voiceConfig(env = process.env) {
  if (!flag(env.VOICE_ENABLED)) return null
  const appId = secretValue(CF_SFU_APP_ID)
  const secret = secretValue(CF_SFU_APP_SECRET)
  if (!appId || !secret) return null
  return { appId, secret, turnKeyId: secretValue(CF_TURN_KEY_ID), turnToken: secretValue(CF_TURN_TOKEN) }
}

// ---- Cloudflare SFU API (injectable for tests) --------------------------------

function makeCf({ appId, secret, turnKeyId = '', turnToken = '' }, fetchImpl = fetch) {
  const call = async (method, path, body, token = secret) => {
    const res = await fetchImpl(`${CF_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.errorCode) {
      const err = new Error(`cloudflare ${method} ${path.replace(/[A-Za-z0-9_-]{20,}/g, '…')} ${res.status} ${json.errorCode || ''}`)
      err.status = res.status
      throw err
    }
    return json
  }
  const app = `/apps/${appId}`
  return {
    newSession: () => call('POST', `${app}/sessions/new`),
    pushTrack: (sessionId, sdp, mid, trackName) => call('POST', `${app}/sessions/${sessionId}/tracks/new`, {
      sessionDescription: { type: 'offer', sdp },
      tracks: [{ location: 'local', mid, trackName }],
    }),
    pullTracks: (sessionId, remotes) => call('POST', `${app}/sessions/${sessionId}/tracks/new`, {
      tracks: remotes.map(r => ({ location: 'remote', sessionId: r.sessionId, trackName: r.trackName })),
    }),
    renegotiate: (sessionId, sdp) => call('PUT', `${app}/sessions/${sessionId}/renegotiate`, {
      sessionDescription: { type: 'answer', sdp },
    }),
    closeTracks: (sessionId, mids) => call('PUT', `${app}/sessions/${sessionId}/tracks/close`, {
      tracks: mids.map(mid => ({ mid })),
      force: true,
    }),
    iceServers: async () => {
      if (!turnKeyId || !turnToken) return DEFAULT_ICE
      const res = await call('POST', `/turn/keys/${turnKeyId}/credentials/generate-ice-servers`, { ttl: TURN_TTL_S }, turnToken)
      return Array.isArray(res.iceServers) && res.iceServers.length ? res.iceServers : DEFAULT_ICE
    },
  }
}

// ---- The proxy ------------------------------------------------------------------

const OPS = ['ice', 'join', 'pull', 'renegotiate', 'close', 'leave']
const GAME_ID = /^[A-Z0-9]{4,12}$/
const ATTEMPT = /^[a-z0-9]{4,24}$/
const MID = /^[A-Za-z0-9_-]{1,16}$/

// Per-instance call budget per uid (best effort: instances do not share it).
const calls = new Map()

/**
 * One voiceSfu request. `db` (admin Database), `cf` (makeCf) and `now` are
 * injected so the whole flow is unit-tested against fakes.
 */
async function handleVoice({ uid, data, db, cf, now = Date.now(), date = new Date(now) }) {
  if (!uid) throw new HttpsError('unauthenticated', 'sign-in-required')
  const op = data?.op
  const gameId = data?.gameId
  if (!OPS.includes(op) || typeof gameId !== 'string' || !GAME_ID.test(gameId)) throw new HttpsError('invalid-argument', 'bad-request')
  const budget = core.rateAllow(calls.get(uid), now)
  calls.set(uid, budget.history)
  if (!budget.ok) throw new HttpsError('resource-exhausted', 'rate-limited')

  const mineRef = db.ref(`voiceSessions/${gameId}/${uid}`)
  if (op === 'leave') {
    await db.ref().update({ [`voiceSessions/${gameId}/${uid}`]: null, [`voiceUsers/${uid}`]: null })
    return { ok: true }
  }

  const [roomSnap, birthSnap] = await Promise.all([db.ref(`games/${gameId}`).get(), db.ref(`ageGate/${uid}/year`).get()])
  const refusal = core.voiceAccess({ room: roomSnap.val(), uid, birthYear: birthSnap.val() ?? null, now: date })
  if (refusal) throw new HttpsError(refusal === 'room-not-found' ? 'not-found' : 'permission-denied', refusal)
  const room = roomSnap.val()

  if (op === 'ice') return { iceServers: await cf.iceServers() }

  const attempt = data?.attempt
  if (typeof attempt !== 'string' || !ATTEMPT.test(attempt)) throw new HttpsError('invalid-argument', 'bad-request')

  if (op === 'join' && data.listen === true) {
    // Listen only (mic denied or declined): a session with nothing published,
    // so it can pull others but nobody can pull it.
    const { sessionId } = await cf.newSession()
    await db.ref().update({
      [`voiceSessions/${gameId}/${uid}`]: { sessionId, attempt, at: now, listen: true },
      [`voiceUsers/${uid}`]: { gameId },
    })
    return { sdp: null }
  }

  if (op === 'join') {
    const { sdp, mid } = data
    if (!core.isAudioOnlyOffer(sdp) || typeof mid !== 'string' || !MID.test(mid)) throw new HttpsError('invalid-argument', 'bad-offer')
    const { sessionId } = await cf.newSession()
    const trackName = `mic-${attempt}`
    const res = await cf.pushTrack(sessionId, sdp, mid, trackName)
    await db.ref().update({
      [`voiceSessions/${gameId}/${uid}`]: { sessionId, trackName, mid, attempt, at: now },
      [`voiceUsers/${uid}`]: { gameId },
    })
    return { sdp: res.sessionDescription?.sdp || null }
  }

  const mine = (await mineRef.get()).val()
  if (!mine?.sessionId || mine.attempt !== attempt) throw new HttpsError('failed-precondition', 'stale-attempt')

  if (op === 'renegotiate') {
    if (typeof data.sdp !== 'string' || data.sdp.length > 20_000 || !data.sdp.startsWith('v=0')) throw new HttpsError('invalid-argument', 'bad-offer')
    await cf.renegotiate(mine.sessionId, data.sdp)
    return { ok: true }
  }

  if (op === 'close') {
    const uids = Array.isArray(data.uids) ? data.uids.filter(u => typeof u === 'string').slice(0, 8) : []
    const mids = uids.map(u => mine.pulls?.[u]?.mid).filter(Boolean)
    if (mids.length) await cf.closeTracks(mine.sessionId, mids)
    const updates = {}
    for (const u of uids) updates[`voiceSessions/${gameId}/${uid}/pulls/${u}`] = null
    if (uids.length) await db.ref().update(updates)
    return { ok: true }
  }

  // op === 'pull': by uid; the server resolves each uid's track itself.
  const published = (await db.ref(`voiceSessions/${gameId}`).get()).val() || {}
  const requested = Array.isArray(data.uids) ? data.uids : []
  const blockSnaps = await Promise.all(requested.filter(u => typeof u === 'string' && u !== uid).slice(0, 8).flatMap(u => [
    db.ref(`blocks/${uid}/${u}`).get().then(s => [uid, u, s.exists()]),
    db.ref(`blocks/${u}/${uid}`).get().then(s => [u, uid, s.exists()]),
  ]))
  const blockedSet = new Set(blockSnaps.filter(([, , on]) => on).map(([a, b]) => `${a}>${b}`))
  const allowed = core.allowedPulls({
    room, me: uid, requested, published, blocked: (a, b) => blockedSet.has(`${a}>${b}`),
  }).filter(u => !mine.pulls?.[u])
  if (!allowed.length) return { sdp: null, tracks: [] }
  const res = await cf.pullTracks(mine.sessionId, allowed.map(u => published[u]))
  const byTrack = new Map(allowed.map(u => [published[u].trackName, u]))
  const tracks = []
  const updates = {}
  for (const t of res.tracks || []) {
    const u = byTrack.get(t.trackName)
    if (!u || t.error || !t.mid) continue
    tracks.push({ uid: u, mid: t.mid })
    updates[`voiceSessions/${gameId}/${uid}/pulls/${u}`] = { mid: t.mid }
  }
  if (Object.keys(updates).length) await db.ref().update(updates)
  return { sdp: res.requiresImmediateRenegotiation ? res.sessionDescription?.sdp || null : null, tracks }
}

/**
 * Stop audio between `a` and `b` (a block, either direction): close each
 * one's pull of the other on the SFU and forget it. Never throws.
 */
async function closePullsBetween({ a, b, db, cf }) {
  const [ga, gb] = await Promise.all([db.ref(`voiceUsers/${a}/gameId`).get(), db.ref(`voiceUsers/${b}/gameId`).get()])
  const gameId = ga.val()
  if (!gameId || gameId !== gb.val()) return 0
  let closed = 0
  for (const [puller, target] of [[a, b], [b, a]]) {
    const s = (await db.ref(`voiceSessions/${gameId}/${puller}`).get()).val()
    const mid = s?.pulls?.[target]?.mid
    if (!s?.sessionId || !mid) continue
    try { await cf.closeTracks(s.sessionId, [mid]); closed++ } catch (e) { logger.warn('voice close failed', { error: e?.message }) }
    await db.ref(`voiceSessions/${gameId}/${puller}/pulls/${target}`).remove()
  }
  return closed
}

/**
 * A member removed from the party leaves voice: everyone's pull of them is
 * closed, and their own session record (so they can't pull again) is dropped.
 */
async function dropFromVoice({ gameId, uid, db, cf }) {
  const all = (await db.ref(`voiceSessions/${gameId}`).get()).val() || {}
  for (const [puller, s] of Object.entries(all)) {
    const mid = s?.pulls?.[uid]?.mid
    if (puller === uid || !s?.sessionId || !mid) continue
    try { await cf.closeTracks(s.sessionId, [mid]) } catch (e) { logger.warn('voice close failed', { error: e?.message }) }
  }
  const updates = { [`voiceSessions/${gameId}/${uid}`]: null, [`voice/${gameId}/${uid}`]: null }
  for (const puller of Object.keys(all)) if (all[puller]?.pulls?.[uid]) updates[`voiceSessions/${gameId}/${puller}/pulls/${uid}`] = null
  const user = (await db.ref(`voiceUsers/${uid}/gameId`).get()).val()
  if (user === gameId) updates[`voiceUsers/${uid}`] = null
  await db.ref().update(updates)
}

function liveCf() {
  const config = voiceConfig()
  return config ? makeCf(config) : null
}

exports.voiceSfu = onCall({ ...bindSecrets(), maxInstances: 10 }, async (request) => {
  const cf = liveCf()
  if (!cf) throw new HttpsError('failed-precondition', 'voice-not-configured')
  try {
    return await handleVoice({ uid: request.auth?.uid, data: request.data, db: getDatabase(), cf })
  } catch (e) {
    if (e instanceof HttpsError) throw e
    logger.warn('voiceSfu failed', { op: request.data?.op, error: e?.message })
    throw new HttpsError('unavailable', 'sfu-error')
  }
})

exports.voiceOnBlock = onValueCreated({ ref: 'blocks/{uid}/{blocked}', ...bindSecrets(), maxInstances: 5 }, async (event) => {
  const cf = liveCf()
  if (!cf) return null
  await closePullsBetween({ a: event.params.uid, b: event.params.blocked, db: getDatabase(), cf }).catch(e => logger.warn('voiceOnBlock', { error: e?.message }))
  return null
})

exports.voiceOnRemove = onValueCreated({ ref: 'games/{gameId}/removed/{uid}', ...bindSecrets(), maxInstances: 5 }, async (event) => {
  const cf = liveCf()
  if (!cf) return null
  await dropFromVoice({ gameId: event.params.gameId, uid: event.params.uid, db: getDatabase(), cf }).catch(e => logger.warn('voiceOnRemove', { error: e?.message }))
  return null
})

exports._test = { handleVoice, closePullsBetween, dropFromVoice, makeCf, voiceConfig, calls }
