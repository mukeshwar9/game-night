// Party voice chat: the rules shared by the app and the voiceSfu Cloud Function
// (functions/voice.js, bundled through functions/src/core.mjs), and the
// client's per-session negotiation queue.
//
// Voice is a Cloudflare Realtime SFU session per client, created and changed
// only through the voiceSfu proxy, which holds the Cloudflare secret and owns
// every session id (voiceSessions/{gameId}/{uid}, server-only). Clients pull
// other people's audio BY UID; the function resolves the track, so nobody can
// point a pull at someone else's session or publish under another name.
//
// Captain calls: voice is for party rooms only (never public rooms), for
// anyone holding a place in the party (link joiners included, C2), for 13+
// only through the existing birth-year gate (C3), and it pauses while the app
// is in the background and rejoins on return (C1).
//
// Pure — no DOM/Firebase/React.
// @ts-check

import { partyMembers } from './nightLogic'

export const VOICE_MIN_AGE = 13
/** The SFU drops a track after 30 s without packets; rejoin well before. */
export const VOICE_REJOIN_AFTER_MS = 25_000
/** Callable budget per uid (join, pull, renegotiate, close), per minute. */
export const VOICE_CALLS_PER_MINUTE = 20
const DEFAULT_CAP = 4

/** Which seat family a room is in, from the players node's shape. */
function isPartyFamily(room) {
  return !room?.players?.X && !room?.players?.O
}

/**
 * Age in whole years from a birth year (the app only asks for the year), or
 * null for a missing or impossible year.
 * @param {unknown} year
 * @param {Date} [now]
 */
export function ageFromBirthYear(year, now = new Date()) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1900 || year > now.getUTCFullYear()) return null
  return now.getUTCFullYear() - year
}

/**
 * The party's members in join order, capped: everyone past the cap is not in
 * the party for voice either.
 * @param {any} room
 */
export function voiceMembers(room) {
  const cap = typeof room?.partyCap === 'number' && room.partyCap > 0 ? room.partyCap : DEFAULT_CAP
  return partyMembers(room, isPartyFamily(room)).slice(0, cap)
}

/**
 * Why `uid` may not use voice in `room`, or null when they may.
 *   'room-not-found' | 'not-party' | 'public-room' | 'not-member' | 'removed'
 *   | 'age-required' | 'under-age'
 * `birthYear` undefined skips the age check (the client calls this before it
 * has read the gate; the server always passes the stored value or null).
 * @param {{ room: any, uid: string, birthYear?: number | null, now?: Date }} input
 * @returns {string | null}
 */
export function voiceAccess({ room, uid, birthYear, now = new Date() }) {
  if (!room || typeof room !== 'object') return 'room-not-found'
  if (!room.partyRoom) return 'not-party'
  if (room.visibility === 'public') return 'public-room'
  if (!uid) return 'not-member'
  if (room.removed?.[uid]) return 'removed'
  if (!voiceMembers(room).some(m => m.uid === uid)) return 'not-member'
  if (birthYear === undefined) return null
  const age = ageFromBirthYear(birthYear, now)
  if (age === null) return 'age-required'
  if (age < VOICE_MIN_AGE) return 'under-age'
  return null
}

/**
 * Whether an SDP offer carries only audio, with at most `maxAudio` m-sections
 * (one microphone track per person). Video, data channels or extra tracks are
 * refused: the proxy is not an open relay.
 * @param {unknown} sdp
 * @param {number} [maxAudio]
 */
export function isAudioOnlyOffer(sdp, maxAudio = 1) {
  if (typeof sdp !== 'string' || sdp.length > 20_000 || !sdp.startsWith('v=0')) return false
  const media = sdp.split(/\r?\n/).filter(l => l.startsWith('m='))
  if (!media.length || media.length > maxAudio) return false
  return media.every(l => l.startsWith('m=audio '))
}

/**
 * Which of the requested uids `me` may pull: current voice members other than
 * themselves, who have a published track, and with no block between the two
 * in either direction. At most cap − 1.
 * @param {{ room: any, me: string, requested: unknown, published: Record<string, any>, blocked: (a: string, b: string) => boolean }} input
 * @returns {string[]}
 */
export function allowedPulls({ room, me, requested, published, blocked }) {
  const members = voiceMembers(room).map(m => m.uid)
  const want = Array.isArray(requested) ? requested.filter(u => typeof u === 'string') : []
  const out = []
  for (const uid of want) {
    if (uid === me || out.includes(uid)) continue
    if (!members.includes(uid) || room?.removed?.[uid]) continue
    if (!published?.[uid]?.sessionId || !published[uid].trackName) continue
    if (blocked(me, uid) || blocked(uid, me)) continue
    out.push(uid)
  }
  return out.slice(0, Math.max(0, members.length - 1))
}

/**
 * Sliding-window rate limit. `history` is the uid's recent call times.
 * @param {number[] | undefined} history
 * @param {number} now
 * @param {number} [limit]
 * @param {number} [windowMs]
 */
export function rateAllow(history, now, limit = VOICE_CALLS_PER_MINUTE, windowMs = 60_000) {
  const recent = (history || []).filter(t => now - t < windowMs)
  if (recent.length >= limit) return { ok: false, history: recent }
  return { ok: true, history: [...recent, now] }
}

// --- Client negotiation queue ---------------------------------------------------

/**
 * The client's pull queue for one SFU session. The SFU answers 406 when a
 * second track change arrives before the previous offer/answer finished, so
 * changes are serialized: the directory says who SHOULD be heard (`want`),
 * the session knows who IS (`have`), and only one batched step runs at a time.
 * Changes arriving mid-step are kept and run next.
 * @typedef {{ attempt: string, busy: boolean, want: string[], have: string[] }} PullQueue
 */

/** @param {string} attempt */
export function newPullQueue(attempt) {
  return /** @type {PullQueue} */ ({ attempt, busy: false, want: [], have: [] })
}

/** @param {PullQueue} q @param {string[]} want */
export function setWanted(q, want) {
  return { ...q, want: [...new Set(want)].sort() }
}

/**
 * The next step, or null when idle or busy: close tracks of people no longer
 * wanted first (a block or a removal must stop audio promptly), then one
 * batched pull of everyone new.
 * @param {PullQueue} q
 * @returns {{ op: 'close' | 'pull', uids: string[] } | null}
 */
export function nextStep(q) {
  if (q.busy) return null
  const close = q.have.filter(u => !q.want.includes(u))
  if (close.length) return { op: 'close', uids: close }
  const pull = q.want.filter(u => !q.have.includes(u))
  if (pull.length) return { op: 'pull', uids: pull }
  return null
}

/** @param {PullQueue} q */
export function startStep(q) {
  return { ...q, busy: true }
}

/**
 * Apply a finished step's result. A result for an older attempt (a late
 * response after a rejoin) is ignored.
 * @param {PullQueue} q
 * @param {{ attempt: string, op: 'close' | 'pull', uids: string[], ok: boolean }} result
 */
export function finishStep(q, result) {
  if (result.attempt !== q.attempt) return q
  let have = q.have
  if (result.ok && result.op === 'pull') have = [...new Set([...have, ...result.uids])].sort()
  if (result.ok && result.op === 'close') have = have.filter(u => !result.uids.includes(u))
  return { ...q, busy: false, have }
}

/**
 * Who the client should hear: voice members who are in voice (the public
 * voice/{gameId} directory says `on`), minus itself and anyone it blocked.
 * @param {{ room: any, me: string, directory: Record<string, any> | null | undefined, myBlocks: Record<string, unknown> | null | undefined }} input
 */
export function wantedFromDirectory({ room, me, directory, myBlocks }) {
  const members = voiceMembers(room).map(m => m.uid)
  return Object.entries(directory || {})
    .filter(([uid, d]) => uid !== me && d?.on === true && members.includes(uid) && !myBlocks?.[uid])
    .map(([uid]) => uid)
    .sort()
}

/**
 * C1: a client that was in the background for longer than the SFU keeps an
 * idle track rejoins with a fresh session instead of reviving the old one.
 * @param {number | null} pausedAt
 * @param {number} now
 */
export function shouldRejoinAfterPause(pausedAt, now) {
  return typeof pausedAt === 'number' && now - pausedAt > VOICE_REJOIN_AFTER_MS
}

/** A fresh attempt id: every join gets one, and late responses are dropped. */
export function newAttemptId(now = Date.now(), rand = Math.random) {
  return `${now.toString(36)}${Math.floor(rand() * 1e8).toString(36)}`
}

/** Speaking ring from an analyser's RMS level (0–1). */
export function isSpeaking(level) {
  return typeof level === 'number' && level > 0.045
}

const ERROR_TEXT = {
  'voice-not-configured': 'VOICE ISN’T SWITCHED ON YET',
  'not-party': 'VOICE IS FOR PARTIES',
  'public-room': 'NO VOICE IN PUBLIC ROOMS',
  'not-member': 'JOIN THE PARTY TO USE VOICE',
  removed: 'YOU WERE REMOVED FROM THIS PARTY',
  'age-required': 'VOICE NEEDS AN AGE CHECK',
  'under-age': 'VOICE IS FOR 13 AND OVER',
  'rate-limited': 'TOO MANY TRIES — WAIT A MINUTE',
  'bad-offer': 'VOICE COULDN’T START — TRY AGAIN',
}

/** Player-facing text for a voiceSfu refusal code. */
export function voiceErrorText(code) {
  return ERROR_TEXT[/** @type {keyof typeof ERROR_TEXT} */ (code)] || 'VOICE COULDN’T CONNECT — TRY AGAIN'
}
