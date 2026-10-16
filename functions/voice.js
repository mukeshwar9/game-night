// Party voice chat through the Cloudflare Realtime SFU. The browser never
// talks to Cloudflare's API: every session and track change goes through
// voiceSfu, which holds the app secret, checks the caller against the room,
// and owns every session id.
//
//  voiceSfu            callable  ice | join | pull | renegotiate | close | leave | camOn | camOff
//  voiceOnBlock        RTDB      blocks/{uid}/{blocked} created -> stop audio both ways
//  voiceOnRemove       RTDB      games/{gameId}/removed/{uid} created -> drop them from voice
//
// Data (database.rules.json):
//  voiceSessions/{gameId}/{uid}  server-only  { sessionId, trackName, mid, attempt, at, pulls: { [uid]: { mid } },
//                                cam?: { trackName, mid, at }, vpulls: { [uid]: { mid } } }
//     (cam is the camera track in the same session; vpulls are the video tracks this uid pulled.)
//  voiceUsers/{uid}              server-only  { gameId }  (which room's voice a uid is in, for block/remove)
//  voice/{gameId}/{uid}          members read, owner writes  { on, muted, at, cam?, camAll? }  (the client directory)
//
// Camera (video): published in the same SFU session as the mic (camOn / camOff)
// and pulled by uid like audio, but pulls are friends first: a viewer gets
// someone's video only when the publisher has the viewer on their friends list
// (friends/{publisher}/{viewer}) or has chosen to show their video to everyone
// (voice/{gameId}/{publisher}/camAll). Never in public rooms, never under 13,
// never while the host has cameras off (games/{gameId}/camerasOff).
//
// Off by default. VOICE_ENABLED=1 turns voiceSfu on; VOICE_SECRETS=1 (read at
// deploy time, from the shell or functions/.env) binds CF_SFU_APP_ID and CF_SFU_APP_SECRET from Secret Manager,
// and VOICE_TURN=1 also binds CF_TURN_KEY_ID and CF_TURN_TOKEN. Unset, nothing
// is bound and voiceSfu answers voice-not-configured.
//
// The pure checks (membership, cap, removal, public rooms, age, audio-only,
// pulls by uid with blocks both ways, the call budget) live in
// src/lib/voiceLogic.js, bundled into lib/core.cjs and shared with the app.
const fs = require('node:fs')
const path = require('node:path')
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

/**
 * The deploy-time switch `name`: the process env first, then functions/.env.
 * firebase-tools evaluates this file to decide which secrets to bind with an
 * environment that holds neither the .env file nor the shell's variables, so
 * `process.env.VOICE_SECRETS` is never set at that moment and the file has to
 * be read here.
 */
function deployFlag(name, env = process.env, file = path.join(__dirname, '.env')) {
  if (env[name] !== undefined && env[name] !== '') return env[name]
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && m[1] === name) return m[2].replace(/^(["'])(.*)\1$/, '$2')
    }
  } catch { /* no .env: the switch is off */ }
  return ''
}
const SECRETS_ON = flag(deployFlag('VOICE_SECRETS'))
const TURN_ON = SECRETS_ON && flag(deployFlag('VOICE_TURN'))
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

const OPS = ['ice', 'join', 'pull', 'renegotiate', 'close', 'leave', 'camOn', 'camOff']
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
    const videoUids = Array.isArray(data.videoUids) ? data.videoUids.filter(u => typeof u === 'string').slice(0, 8) : []
    const mids = [
      ...uids.map(u => mine.pulls?.[u]?.mid),
      ...videoUids.map(u => mine.vpulls?.[u]?.mid),
    ].filter(Boolean)
    if (mids.length) {
      // A video track whose sender already stopped is gone on the SFU; that must
      // not keep the records (or the audio close) from being cleared.
      try { await cf.closeTracks(mine.sessionId, mids) } catch (e) { if (!videoUids.length) throw e; logger.warn('voice close failed', { error: e?.message }) }
    }
    const updates = {}
    for (const u of uids) updates[`voiceSessions/${gameId}/${uid}/pulls/${u}`] = null
    for (const u of videoUids) updates[`voiceSessions/${gameId}/${uid}/vpulls/${u}`] = null
    if (uids.length || videoUids.length) await db.ref().update(updates)
    return { ok: true }
  }

  if (op === 'camOn') {
    const camRefusal = core.cameraAccess({ room, uid, birthYear: birthSnap.val() ?? null, now: date })
    if (camRefusal) throw new HttpsError('permission-denied', camRefusal)
    const { sdp, mid } = data
    if (!core.isCameraOffer(sdp) || typeof mid !== 'string' || !MID.test(mid)) throw new HttpsError('invalid-argument', 'bad-offer')
    if (mine.cam?.mid) {
      try { await cf.closeTracks(mine.sessionId, [mine.cam.mid]) } catch (e) { logger.warn('voice cam close failed', { error: e?.message }) }
    }
    const trackName = `cam-${attempt}-${now.toString(36)}`
    const res = await cf.pushTrack(mine.sessionId, sdp, mid, trackName)
    await db.ref().update({ [`voiceSessions/${gameId}/${uid}/cam`]: { trackName, mid, at: now } })
    return { sdp: res.sessionDescription?.sdp || null }
  }

  if (op === 'camOff') {
    if (mine.cam?.mid) {
      try { await cf.closeTracks(mine.sessionId, [mine.cam.mid]) } catch (e) { logger.warn('voice cam close failed', { error: e?.message }) }
    }
    await db.ref().update({ [`voiceSessions/${gameId}/${uid}/cam`]: null })
    return { ok: true }
  }

  // op === 'pull': by uid; the server resolves each uid's track itself. Audio
  // from `uids`, video (friends first) from `videoUids`.
  const published = (await db.ref(`voiceSessions/${gameId}`).get()).val() || {}
  const requested = Array.isArray(data.uids) ? data.uids : []
  const requestedVideo = Array.isArray(data.videoUids) ? data.videoUids.filter(u => typeof u === 'string' && u !== uid).slice(0, 8) : []
  const candidates = [...new Set([...requested, ...requestedVideo].filter(u => typeof u === 'string' && u !== uid))].slice(0, 8)
  const blockSnaps = await Promise.all(candidates.flatMap(u => [
    db.ref(`blocks/${uid}/${u}`).get().then(s => [uid, u, s.exists()]),
    db.ref(`blocks/${u}/${uid}`).get().then(s => [u, uid, s.exists()]),
  ]))
  const blockedSet = new Set(blockSnaps.filter(([, , on]) => on).map(([a, b]) => `${a}>${b}`))
  const blocked = (a, b) => blockedSet.has(`${a}>${b}`)
  const allowed = core.allowedPulls({
    room, me: uid, requested, published, blocked,
  }).filter(u => !mine.pulls?.[u])

  let allowedVideo = []
  if (requestedVideo.length) {
    const friendSnaps = await Promise.all(requestedVideo.map(u => db.ref(`friends/${u}/${uid}`).get().then(s => [u, s.exists()])))
    const everyoneSnaps = await Promise.all(requestedVideo.map(u => db.ref(`voice/${gameId}/${u}/camAll`).get().then(s => [u, s.val() === true])))
    const friends = new Set(friendSnaps.filter(([, on]) => on).map(([u]) => u))
    const everyone = new Set(everyoneSnaps.filter(([, on]) => on).map(([u]) => u))
    allowedVideo = core.allowedVideoPulls({
      room, me: uid, requested: requestedVideo, sessions: published, blocked,
      isFriend: (owner) => friends.has(owner), showsEveryone: (owner) => everyone.has(owner),
    }).filter(u => !mine.vpulls?.[u])
  }
  if (!allowed.length && !allowedVideo.length) return { sdp: null, tracks: [] }

  const remotes = [
    ...allowed.map(u => ({ uid: u, kind: 'audio', sessionId: published[u].sessionId, trackName: published[u].trackName })),
    ...allowedVideo.map(u => ({ uid: u, kind: 'video', sessionId: published[u].sessionId, trackName: published[u].cam.trackName })),
  ]
  const res = await cf.pullTracks(mine.sessionId, remotes)
  const byTrack = new Map(remotes.map(r => [r.trackName, r]))
  const tracks = []
  const updates = {}
  for (const t of res.tracks || []) {
    const r = byTrack.get(t.trackName)
    if (!r || t.error || !t.mid) continue
    tracks.push({ uid: r.uid, mid: t.mid, kind: r.kind })
    updates[`voiceSessions/${gameId}/${uid}/${r.kind === 'video' ? 'vpulls' : 'pulls'}/${r.uid}`] = { mid: t.mid }
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
    const mids = [s?.pulls?.[target]?.mid, s?.vpulls?.[target]?.mid].filter(Boolean)
    if (!s?.sessionId || !mids.length) continue
    try { await cf.closeTracks(s.sessionId, mids); closed++ } catch (e) { logger.warn('voice close failed', { error: e?.message }) }
    await db.ref().update({
      [`voiceSessions/${gameId}/${puller}/pulls/${target}`]: null,
      [`voiceSessions/${gameId}/${puller}/vpulls/${target}`]: null,
    })
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
    const mids = [s?.pulls?.[uid]?.mid, s?.vpulls?.[uid]?.mid].filter(Boolean)
    if (puller === uid || !s?.sessionId || !mids.length) continue
    try { await cf.closeTracks(s.sessionId, mids) } catch (e) { logger.warn('voice close failed', { error: e?.message }) }
  }
  const updates = { [`voiceSessions/${gameId}/${uid}`]: null, [`voice/${gameId}/${uid}`]: null }
  for (const puller of Object.keys(all)) {
    if (all[puller]?.pulls?.[uid]) updates[`voiceSessions/${gameId}/${puller}/pulls/${uid}`] = null
    if (all[puller]?.vpulls?.[uid]) updates[`voiceSessions/${gameId}/${puller}/vpulls/${uid}`] = null
  }
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

exports._test = { deployFlag, handleVoice, closePullsBetween, dropFromVoice, makeCf, voiceConfig, calls }
