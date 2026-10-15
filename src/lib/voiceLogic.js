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

// --- Camera (video) -------------------------------------------------------------
//
// Video rides the same SFU session as voice: one small camera track per person
// (240p, 15 fps, set by the client's send encoding), published through the
// voiceSfu `camOn` op. Captain calls: private invite-only party rooms only and
// 13+ (both already part of voiceAccess), camera off by default every session,
// friends first (your video goes only to people on your friends list unless you
// choose SHOW MY VIDEO TO EVERYONE), per-viewer hide, and a host CAMERAS OFF
// switch. The server resolves who may pull whose video; a client only asks.

/** The camera send limits the client applies (240p-class, 15 fps, ~200 kbps). */
export const CAMERA_LIMITS = Object.freeze({ width: 320, height: 240, frameRate: 15, maxBitrate: 200_000 })

/** A queue entry for pulling someone's video (voice audio uses the bare uid). */
const VIDEO_SUFFIX = '#v'

/**
 * The pull-queue key for someone's video. `everyone` marks a camera shown to
 * everyone; the key changes when that flips, so a viewer who was refused asks
 * again.
 * @param {string} uid
 * @param {boolean} [everyone]
 */
export function videoKey(uid, everyone = false) {
  return `${uid}${VIDEO_SUFFIX}${everyone ? '+' : ''}`
}

/** @param {string} key */
export function isVideoKey(key) {
  return typeof key === 'string' && key.includes(VIDEO_SUFFIX)
}

/** The uid inside a queue key (audio or video). @param {string} key */
export function uidOfKey(key) {
  return String(key).split(VIDEO_SUFFIX)[0]
}

/**
 * Split a mixed queue step into the audio uids and the video uids it carries.
 * @param {string[]} keys
 */
export function splitKeys(keys) {
  const audio = []
  const video = []
  for (const k of keys) (isVideoKey(k) ? video : audio).push(uidOfKey(k))
  return { audio, video }
}

/**
 * Count the media sections of an SDP offer: how many are audio, video, or
 * anything else (data channels, application sections).
 * @param {unknown} sdp
 */
export function offerMedia(sdp) {
  if (typeof sdp !== 'string' || sdp.length > 20_000 || !sdp.startsWith('v=0')) return null
  // A section with port 0 is a stopped transceiver (a camera turned off
  // earlier): it carries nothing, so it does not count.
  const media = sdp.split(/\r?\n/).filter(l => l.startsWith('m=') && l.split(' ')[1] !== '0')
  const kind = (l) => l.slice(2, l.indexOf(' '))
  return {
    audio: media.filter(l => kind(l) === 'audio').length,
    video: media.filter(l => kind(l) === 'video').length,
    other: media.filter(l => kind(l) !== 'audio' && kind(l) !== 'video').length,
  }
}

/**
 * Whether an offer for turning the camera on is acceptable: audio and video
 * sections only, at most one video (the camera), at most one audio (the mic
 * already published in the same peer connection), at least one video.
 * @param {unknown} sdp
 */
export function isCameraOffer(sdp) {
  const m = offerMedia(sdp)
  return !!m && m.other === 0 && m.video === 1 && m.audio <= 1
}

/**
 * Why `uid` may not publish a camera in `room`, or null when they may: every
 * voice refusal, plus 'cameras-off' while the host has switched cameras off.
 * @param {{ room: any, uid: string, birthYear?: number | null, now?: Date }} input
 * @returns {string | null}
 */
export function cameraAccess({ room, uid, birthYear, now }) {
  const refusal = voiceAccess({ room, uid, birthYear, now })
  if (refusal) return refusal
  return room?.camerasOff === true ? 'cameras-off' : null
}

/**
 * Which of the requested uids `me` may see on video: members with a published
 * camera track, no block in either direction, not removed, cameras not switched
 * off for the room — and, friends first, only people who have `me` on their
 * friends list or who chose to show their video to everyone.
 * @param {{ room: any, me: string, requested: unknown, sessions: Record<string, any>,
 *   blocked: (a: string, b: string) => boolean, isFriend: (owner: string, viewer: string) => boolean,
 *   showsEveryone: (uid: string) => boolean }} input
 * @returns {string[]}
 */
export function allowedVideoPulls({ room, me, requested, sessions, blocked, isFriend, showsEveryone }) {
  if (room?.camerasOff === true) return []
  const members = voiceMembers(room).map(m => m.uid)
  const want = Array.isArray(requested) ? requested.filter(u => typeof u === 'string') : []
  const out = []
  for (const uid of want) {
    if (uid === me || out.includes(uid)) continue
    if (!members.includes(uid) || room?.removed?.[uid]) continue
    const cam = sessions?.[uid]?.cam
    if (!sessions?.[uid]?.sessionId || !cam?.trackName) continue
    if (blocked(me, uid) || blocked(uid, me)) continue
    if (!isFriend(uid, me) && !showsEveryone(uid)) continue
    out.push(uid)
  }
  return out.slice(0, Math.max(0, members.length - 1))
}

/**
 * Whose video the client should ask for: voice members whose directory entry
 * says `cam`, other than itself, not blocked, not hidden by this viewer
 * (per person or all video), and none while the host has cameras off. Keys
 * come out as video queue keys.
 * @param {{ room: any, me: string, directory: Record<string, any> | null | undefined,
 *   myBlocks: Record<string, unknown> | null | undefined, hidden?: Record<string, unknown>, hideAll?: boolean }} input
 */
export function wantedVideoFromDirectory({ room, me, directory, myBlocks, hidden = {}, hideAll = false }) {
  if (hideAll || room?.camerasOff === true) return []
  const members = voiceMembers(room).map(m => m.uid)
  return Object.entries(directory || {})
    .filter(([uid, d]) => uid !== me && d?.on === true && d?.cam === true && members.includes(uid) && !myBlocks?.[uid] && !hidden[uid])
    .map(([uid, d]) => videoKey(uid, d?.camAll === true))
    .sort()
}

/**
 * Link quality for the camera, from one stats sample: round-trip time, the
 * sender's available outgoing bitrate (kbps) and the received loss ratio.
 * Weak links drop video first (voice is never dropped for video).
 * @param {{ rttMs?: number | null, outKbps?: number | null, lossRatio?: number | null }} sample
 * @returns {'good' | 'weak'}
 */
export function classifyLink({ rttMs = null, outKbps = null, lossRatio = null } = {}) {
  if (typeof rttMs === 'number' && rttMs > 700) return 'weak'
  if (typeof outKbps === 'number' && outKbps > 0 && outKbps < 120) return 'weak'
  if (typeof lossRatio === 'number' && lossRatio > 0.15) return 'weak'
  return 'good'
}

/**
 * Hysteresis on the link: two weak samples in a row pause video, three good
 * ones in a row bring it back, so one bad second does not flicker faces.
 * @param {{ paused: boolean, weak: number, good: number }} state
 * @param {'good' | 'weak'} quality
 */
export function nextLinkState(state, quality) {
  if (quality === 'weak') {
    const weak = state.weak + 1
    return { paused: state.paused || weak >= 2, weak, good: 0 }
  }
  const good = state.good + 1
  return { paused: state.paused && good < 3, weak: 0, good }
}

export const LINK_START = Object.freeze({ paused: false, weak: 0, good: 0 })

/** Whether a controller status means a session exists (or is being restored). */
export function isVoiceLive(status) {
  return status === 'connecting' || status === 'connected' || status === 'reconnecting' || status === 'failed'
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
  'cameras-off': 'THE HOST TURNED CAMERAS OFF',
  'cam-denied': 'CAMERA IS BLOCKED',
}

/** Player-facing text for a voiceSfu refusal code. */
export function voiceErrorText(code) {
  return ERROR_TEXT[/** @type {keyof typeof ERROR_TEXT} */ (code)] || 'VOICE COULDN’T CONNECT — TRY AGAIN'
}
