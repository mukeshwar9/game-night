// WebRTC peer connection for real-time gameplay, with Firebase Realtime
// Database used only as the signaling channel (offer/answer/ICE exchange —
// small, infrequent writes RTDB is good at). Once the peer connection is up,
// gameplay frames travel peer-to-peer and never touch Firebase. This keeps
// the platform's "no backend server" property intact.
//
// Trust/role model: X (the room creator) is the HOST, O is the GUEST. The
// host always offers, the guest always answers — so there is no SDP glare.
//
// The data channel is unreliable + unordered (UDP-like): dropping a stale
// snapshot or input frame is fine and avoids head-of-line blocking.
//
// Reconnects (v2): every connection attempt has an id, and each peer follows
// the latest one — see connectionLogic.js for the signaling layout and rules.
// Mounting, reloading, pressing RETRY (either side, any order) and the host's
// one automatic retry all start a new attempt; the other side tears down its
// RTCPeerConnection and renegotiates without the page remounting, so the
// round's sim survives a reconnect (the host freezes it while not connected).
//
// ICE servers (see iceConfig.js). Public STUN is always used. Optional TURN,
// read from Vite env at build time:
//   VITE_TURN_URLS        comma-separated turn:/turns: URLs
//                         e.g. "turn:turn.example.com:3478,turns:turn.example.com:5349"
//   VITE_TURN_USERNAME    TURN username
//   VITE_TURN_CREDENTIAL  TURN credential
// TURN is only used when all three are set. With TURN configured, public-lobby
// rooms (game.visibility === 'public') run relay-only so strangers never learn
// each other's IP address; private rooms keep direct paths and fall back to the
// relay for the ~5–10% of peer pairs behind symmetric NATs. Without TURN those
// peers surface as 'failed' with a RETRY button, as before.

import { ref, onValue, onChildAdded, set, remove } from 'firebase/database'
import { db } from '../firebase'
import { buildIceConfig, readTurnEnv } from './iceConfig'
import {
  makeAttempt, normalizeAttempt, shouldFollowAttempt,
  initialConnState, connReducer, PING_MS, SILENCE_MS,
} from './connectionLogic'
import { createRttEstimator } from './netLogic'

const sigRef = (gameId, child) => ref(db, `games/${gameId}/signaling${child ? `/${child}` : ''}`)
const runRef = (gameId, attemptId, child) => sigRef(gameId, `runs/${attemptId}/${child}`)

/**
 * Establish a P2P data channel between the two seats of a room.
 *
 * @param {object} opts
 * @param {string} opts.gameId
 * @param {'X'|'O'} opts.mySymbol      X = host (offerer), O = guest (answerer)
 * @param {boolean} [opts.isPublic]    public-lobby room (relay-only when TURN is configured)
 * @param {(msg:any)=>void} opts.onMessage   called with each decoded JSON frame
 * @param {(s:'connecting'|'connected'|'reconnecting'|'failed')=>void} [opts.onStatus]
 * @returns {{ send:(obj:any)=>void, retry:()=>void, getRtt:()=>number|null, close:()=>void }}
 */
export function createPeer({ gameId, mySymbol, isPublic = false, onMessage, onStatus = () => {} }) {
  const isHost = mySymbol === 'X'
  const opSymbol = isHost ? 'O' : 'X'
  const rtcConfig = buildIceConfig({ ...readTurnEnv(import.meta.env), isPublic })

  let closed = false
  let conn = initialConnState()
  let run = null                 // current attempt: { id, pc, channel, cleanups }
  let timer = null
  const rtt = createRttEstimator()

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null } }

  // Feed an event through the pure status machine and perform its effects.
  const dispatch = (event) => {
    if (closed) return
    const prev = conn.status
    const { state, effects } = connReducer(conn, event, { isHost })
    conn = state
    if (effects.clearTimer || effects.timer) clearTimer()
    if (effects.timer) timer = setTimeout(() => { timer = null; dispatch({ type: 'timeout' }) }, effects.timer)
    if (state.status !== prev) onStatus(state.status)
    if (effects.retry) startAttempt()
  }

  // One write both bumps the attempt and clears every stale run under it.
  const startAttempt = () => {
    if (closed) return
    set(sigRef(gameId), { attempt: makeAttempt(mySymbol) }).catch(() => {})
  }

  const teardownRun = () => {
    const r = run
    run = null
    if (!r) return
    r.cleanups.forEach(fn => { try { fn() } catch { /* ignore */ } })
    try { r.channel?.close() } catch { /* ignore */ }
    try { r.pc.close() } catch { /* ignore */ }
  }

  const startRun = (attemptId) => {
    teardownRun()
    rtt.reset()                  // a new attempt may take a different network path
    let pc
    try {
      pc = new RTCPeerConnection(rtcConfig)
    } catch {
      dispatch({ type: 'attempt' })
      dispatch({ type: 'pc', state: 'failed' })
      return
    }
    const r = { id: attemptId, pc, channel: null, cleanups: [] }
    run = r
    const isCurrent = () => !closed && run === r
    dispatch({ type: 'attempt' })

    const wireChannel = (ch) => {
      r.channel = ch
      ch.binaryType = 'arraybuffer'
      let pingTimer = null
      let watchdog = null
      let lastHeard = 0
      let silent = false
      const stopTimers = () => {
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
        if (watchdog) { clearInterval(watchdog); watchdog = null }
      }
      ch.onopen = () => {
        if (!isCurrent()) return
        lastHeard = performance.now()
        dispatch({ type: 'channel-open' })
        // Host pings (RTT, netLogic.js); the guest echoes. Either way each side
        // hears the other every PING_MS, which the watchdog relies on.
        if (isHost && !pingTimer) {
          const ping = () => {
            if (ch.readyState !== 'open') return
            try { ch.send(JSON.stringify({ t: 'p', s: Math.round(performance.now() * 10) / 10 })) } catch { /* dropped */ }
          }
          pingTimer = setInterval(ping, PING_MS)
        }
        if (!watchdog) {
          watchdog = setInterval(() => {
            if (!isCurrent() || silent) return
            if (performance.now() - lastHeard > SILENCE_MS) { silent = true; dispatch({ type: 'silence' }) }
          }, 250)
        }
      }
      ch.onclose = () => {
        stopTimers()
        if (isCurrent()) dispatch({ type: 'channel-close' })
      }
      ch.onmessage = (e) => {
        if (!isCurrent()) return
        lastHeard = performance.now()
        if (silent) { silent = false; dispatch({ type: 'heard' }) }
        let msg
        try { msg = JSON.parse(e.data) } catch { return /* ignore malformed frame */ }
        if (msg?.t === 'p') {
          try { ch.send(JSON.stringify({ t: 'q', s: msg.s })) } catch { /* dropped */ }
          return
        }
        if (msg?.t === 'q') {
          if (isHost && typeof msg.s === 'number') rtt.add(performance.now() - msg.s)
          return
        }
        onMessage(msg)
      }
      r.cleanups.push(stopTimers)
    }

    if (isHost) {
      wireChannel(pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }))
    } else {
      pc.ondatachannel = (e) => { if (isCurrent()) wireChannel(e.channel) }
    }

    // Trickle ICE: publish our candidates under our own symbol, consume the peer's.
    pc.onicecandidate = (e) => {
      if (!e.candidate || !isCurrent()) return
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      set(runRef(gameId, attemptId, `ice/${mySymbol}/${key}`), e.candidate.toJSON()).catch(() => {})
    }

    pc.onconnectionstatechange = () => {
      if (isCurrent()) dispatch({ type: 'pc', state: pc.connectionState })
    }

    // Remote candidates can arrive over signaling before this side has called
    // setRemoteDescription (addIceCandidate would reject and the error is
    // swallowed); buffer them until then, flush in order, then add directly.
    let remoteDescSet = false
    let pendingCandidates = []
    const addCandidate = (cand) =>
      pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {})
    const flushCandidates = () => {
      remoteDescSet = true
      pendingCandidates.forEach(addCandidate)
      pendingCandidates = []
    }

    // on*() return their own unsubscribe — off(ref, type, thatFn) would not
    // match the registered callback and silently leak the listener.
    r.cleanups.push(onChildAdded(runRef(gameId, attemptId, `ice/${opSymbol}`), (snap) => {
      const cand = snap.val()
      if (!cand || !isCurrent()) return
      if (remoteDescSet) addCandidate(cand)
      else pendingCandidates.push(cand)
    }))

    const fail = () => { if (isCurrent()) dispatch({ type: 'pc', state: 'failed' }) }

    if (isHost) {
      // Offer, then wait for this attempt's answer. Each attempt has its own
      // RTCPeerConnection, so "apply the first answer" is exactly right here.
      let answered = false
      r.cleanups.push(onValue(runRef(gameId, attemptId, 'answer'), (snap) => {
        const ans = snap.val()
        if (!ans || answered || !isCurrent()) return
        answered = true
        pc.setRemoteDescription(new RTCSessionDescription(ans))
          .then(() => { if (isCurrent()) flushCandidates() })
          .catch(fail)
      }))
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer).then(() => offer))
        .then(offer => {
          if (!isCurrent()) return
          return set(runRef(gameId, attemptId, 'offer'), { type: offer.type, sdp: offer.sdp })
        })
        .catch(fail)
    } else {
      // Guest: wait for this attempt's offer, then answer.
      let answering = false
      r.cleanups.push(onValue(runRef(gameId, attemptId, 'offer'), (snap) => {
        const offer = snap.val()
        if (!offer || answering || !isCurrent()) return
        answering = true
        pc.setRemoteDescription(new RTCSessionDescription(offer))
          .then(() => { if (isCurrent()) flushCandidates() })
          .then(() => pc.createAnswer())
          .then(answer => pc.setLocalDescription(answer).then(() => answer))
          .then(answer => {
            if (!isCurrent()) return
            return set(runRef(gameId, attemptId, 'answer'), { type: answer.type, sdp: answer.sdp })
          })
          .catch(fail)
      }))
    }
  }

  // Surface 'connecting' synchronously so a status left over from the previous
  // round never lets a loop run before this peer has linked up.
  dispatch({ type: 'start' })

  // Start our own attempt BEFORE subscribing, so the first value this client
  // sees is its own (optimistic local write) rather than a stale one it would
  // briefly negotiate against. Then follow whatever attempt is current.
  startAttempt()
  const unsubAttempt = onValue(sigRef(gameId, 'attempt'), (snap) => {
    if (closed) return
    const incoming = snap.val()
    if (shouldFollowAttempt(run?.id ?? null, incoming)) startRun(normalizeAttempt(incoming).id)
  })

  return {
    send(obj) {
      const ch = run?.channel
      if (ch && ch.readyState === 'open') {
        try { ch.send(JSON.stringify(obj)) } catch { /* dropped frame */ }
      }
    },
    // RETRY: from either side, in any order — the other peer follows.
    retry() {
      if (closed) return
      dispatch({ type: 'manual-retry' })
      startAttempt()
    },
    // Smoothed round-trip time in ms (host only; null until measured).
    getRtt: () => rtt.value(),
    close() {
      if (closed) return
      closed = true
      clearTimer()
      try { unsubAttempt() } catch { /* ignore */ }
      teardownRun()
      // Either side clears signaling when it leaves (round over, game switch).
      // A peer that remounts starts a fresh attempt anyway, and a writer's
      // own later set() is ordered after this remove.
      remove(sigRef(gameId)).catch(() => {})
    },
  }
}
