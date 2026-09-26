// Pure connection-lifecycle logic for the real-time WebRTC layer (rtc.js).
// No DOM, no Firebase, no timers — rtc.js feeds events in and performs the
// returned effects, so every transition here is unit-testable.
//
// ── Signaling attempts ────────────────────────────────────────────────────
// Every connection attempt has an id. Firebase layout under the room:
//
//   games/{gameId}/signaling/attempt            { id, by, at }   ← the ONE current attempt
//   games/{gameId}/signaling/runs/{id}/offer    host (X) → guest
//   games/{gameId}/signaling/runs/{id}/answer   guest (O) → host
//   games/{gameId}/signaling/runs/{id}/ice/{X|O}/{key}
//
// Rules: (1) whoever starts an attempt (mount, reload, RETRY, host auto-retry)
// overwrites the whole `signaling` node with just `{ attempt }` — one write
// that both bumps the attempt and clears every stale offer/answer/ICE;
// (2) every peer follows whatever attempt is current: a different id means
// tear down the RTCPeerConnection and start a fresh one for that id;
// (3) following never starts an attempt, so peers converge instead of
// ping-ponging. Host = X always offers, guest = O always answers, so there is
// no SDP glare — RETRY works from either side, in any order, after reloads.

// ICE 'disconnected' is often transient (wifi blip) and can recover on its own.
// The sim freezes immediately ('reconnecting'); only after this long without
// recovery does the attempt count as failed.
export const DISCONNECT_GRACE_MS = 5000
// A fresh attempt that hasn't opened its data channel within this long fails
// (e.g. the other side is gone). Before this existed a dead attempt sat on
// "LINKING PLAYERS" forever.
export const NEGOTIATION_TIMEOUT_MS = 15000
// Failures the HOST retries on its own (one fresh attempt) before surfacing
// 'failed' + RETRY. A network switch (wifi → cellular) never recovers via the
// old ICE candidates; a new attempt usually does. Only the host auto-retries
// so the two sides never race each other's attempts. Reset on 'connected'.
export const MAX_AUTO_RETRIES = 1
// Host → guest ping interval. The pings feed the RTT estimate (netLogic.js)
// and double as a heartbeat: each side hears the other at least this often
// (ping one way, the echo the other), even when no gameplay frames flow.
export const PING_MS = 500
// No frame at all from the peer for this long pauses the game at once. A
// closed tab usually doesn't close the channel cleanly, and ICE only notices
// ~5 s later — without this the host sim kept running (and scoring) for those
// 5 s against a player who was already gone.
export const SILENCE_MS = 1500
// An opponent whose Firebase presence has been offline this long while the
// peer link is down can be claimed against (see dropPrompt).
export const CLAIM_AFTER_MS = 10000

/** New attempt id — a valid Firebase key (no . $ # [ ] /). */
export function makeAttemptId(now = Date.now(), rand = Math.random()) {
  return `a${Math.floor(now).toString(36)}${Math.floor(rand * 36 ** 6).toString(36).padStart(6, '0')}`
}

/** New attempt record, as written to `signaling/attempt`. */
export function makeAttempt(by, now = Date.now(), rand = Math.random()) {
  return { id: makeAttemptId(now, rand), by, at: Math.floor(now) }
}

/** Validate a raw `signaling/attempt` read; null if absent or malformed. */
export function normalizeAttempt(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  return {
    id: raw.id,
    by: raw.by === 'X' || raw.by === 'O' ? raw.by : null,
    at: typeof raw.at === 'number' ? raw.at : 0,
  }
}

/**
 * Should this peer tear down its current run and start one for `incoming`?
 * A missing attempt (the other side's close() removed the node) is NOT a
 * reason to drop a live connection — keep the current run until a real new
 * attempt shows up.
 */
export function shouldFollowAttempt(currentId, incoming) {
  const a = normalizeAttempt(incoming)
  if (!a) return false
  return a.id !== currentId
}

// ── Status machine ────────────────────────────────────────────────────────
// Public statuses: 'idle' (before the first attempt) | 'connecting' (first
// link-up) | 'connected' | 'reconnecting' (link lost after it was up, or a
// new attempt after one — the host sim is frozen) | 'failed' (show RETRY).

export function initialConnState() {
  return {
    status: 'idle', everConnected: false, autoRetries: 0,
    // The link is up only when all three agree.
    channelOpen: false, pcDown: false, silent: false,
  }
}

const pendingStatus = (s) => (s.everConnected ? 'reconnecting' : 'connecting')
const linkUp = (s) => s.channelOpen && !s.pcDown && !s.silent

/**
 * Pure reducer. Events:
 *   { type: 'start' }            the peer was created (surfaces 'connecting'
 *                                synchronously, before any Firebase round trip)
 *   { type: 'attempt' }          a new run (RTCPeerConnection) just started
 *   { type: 'manual-retry' }     the local player pressed RETRY
 *   { type: 'channel-open' }     the data channel opened
 *   { type: 'channel-close' }    the data channel closed (remote left/reloaded)
 *   { type: 'pc', state }        RTCPeerConnection.connectionState changed
 *   { type: 'silence' }          no frame from the peer for SILENCE_MS
 *   { type: 'heard' }            a frame arrived after a silence
 *   { type: 'timeout' }          the armed timer fired
 *
 * Returns `{ state, effects }`, effects ⊆ { timer: ms, clearTimer: true,
 * retry: true }. `timer` replaces any armed timer; `retry` = start a new
 * attempt (host auto-retry).
 */
export function connReducer(state, event, { isHost = false } = {}) {
  const s = state
  const fail = () => {
    if (isHost && s.autoRetries < MAX_AUTO_RETRIES) {
      // Stay paused (not 'failed') while the host's fresh attempt runs.
      return {
        state: { ...s, status: pendingStatus(s), channelOpen: false, autoRetries: s.autoRetries + 1 },
        effects: { clearTimer: true, retry: true },
      }
    }
    return { state: { ...s, status: 'failed', channelOpen: false }, effects: { clearTimer: true } }
  }

  // Re-derive the status after a link flag changed.
  const settle = (next) => {
    if (s.status === 'failed' || s.status === 'idle') return { state: next, effects: {} }
    if (linkUp(next)) {
      if (s.status === 'connected') return { state: next, effects: {} }
      return {
        state: { ...next, status: 'connected', everConnected: true, autoRetries: 0 },
        effects: { clearTimer: true },
      }
    }
    if (s.status === 'connected') {
      // Pause at once; fail only if the link stays down for the grace window.
      return { state: { ...next, status: 'reconnecting' }, effects: { timer: DISCONNECT_GRACE_MS } }
    }
    return { state: next, effects: {} }  // still negotiating — keep its timer
  }

  switch (event.type) {
    case 'start':
      return { state: { ...s, status: pendingStatus(s) }, effects: {} }
    case 'attempt':
      return {
        state: { ...s, status: pendingStatus(s), channelOpen: false, pcDown: false, silent: false },
        effects: { timer: NEGOTIATION_TIMEOUT_MS },
      }
    case 'manual-retry':
      return {
        state: { ...s, status: pendingStatus(s), autoRetries: 0 },
        effects: { clearTimer: true },
      }
    case 'channel-open':
      return settle({ ...s, channelOpen: true, silent: false })
    case 'channel-close':
      return settle({ ...s, channelOpen: false })
    case 'silence':
      return settle({ ...s, silent: true })
    case 'heard':
      return settle({ ...s, silent: false })
    case 'pc':
      if (event.state === 'connected') return settle({ ...s, pcDown: false })
      if (event.state === 'disconnected') return settle({ ...s, pcDown: true })
      if (event.state === 'failed') {
        if (s.status === 'failed') return { state: s, effects: {} }
        return fail()
      }
      return { state: s, effects: {} }
    case 'timeout':
      if (s.status === 'connected' || s.status === 'failed') return { state: s, effects: {} }
      return fail()
    default:
      return { state: s, effects: {} }
  }
}

/**
 * Whether a page should mount the in-court overlay at all. The arenas render
 * their dimming backdrop whenever `overlay` is truthy, so passing an element
 * that renders null still dims and blurs the live court.
 */
export function showRealtimeOverlay(conn, countdown) {
  return conn !== 'connected' || countdown > 0
}

// ── Opponent-gone prompt ──────────────────────────────────────────────────

/**
 * What the in-court overlay should offer when the link is down.
 *
 * @param {object} o
 * @param {string} o.conn               peer status (see connReducer)
 * @param {boolean} o.opponentOnline    opponent's Firebase room presence
 * @param {number|null} o.offlineSince  ms timestamp the opponent went offline (null = online)
 * @param {number} o.now
 * @returns {{ show: false } | { show: true, canClaim: boolean, claimInMs: number }}
 *
 * Only a presence-offline opponent is claimable: a peer link that died while
 * both players are still in the room is a network problem (RETRY), and the
 * claim transaction re-checks presence server-side so a player can't cut
 * their own link to claim a win against someone who is still there.
 */
export function dropPrompt({ conn, opponentOnline, offlineSince, now }) {
  if (conn === 'connected' || conn === 'idle' || conn == null) return { show: false }
  if (opponentOnline !== false) return { show: false }
  const offlineFor = offlineSince == null ? 0 : Math.max(0, now - offlineSince)
  const claimInMs = Math.max(0, CLAIM_AFTER_MS - offlineFor)
  return { show: true, canClaim: claimInMs === 0, claimInMs }
}

/**
 * Transaction body for claiming a round against an abandoned opponent — the
 * same finish shape and presence guard as Game.jsx's F-23 claimAbandonedWin,
 * so the shared win-effect/recordMatch machinery fires unchanged. Returns the
 * next room value, or undefined to abort (not playing / opponent back).
 */
export function claimAbandonedPatch(cur, mySym, now = Date.now()) {
  if (!cur || cur.status !== 'playing') return undefined
  if (mySym !== 'X' && mySym !== 'O') return undefined
  const opSym = mySym === 'X' ? 'O' : 'X'
  if (cur.presence?.[opSym]?.online !== false) return undefined
  return {
    ...cur,
    winner: mySym,
    status: 'finished',
    scores: { ...(cur.scores || {}), [mySym]: (cur.scores?.[mySym] || 0) + 1 },
    lastActivityAt: now,
  }
}
