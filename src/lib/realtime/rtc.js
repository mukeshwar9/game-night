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

import { ref, onValue, onChildAdded, set, remove, off } from 'firebase/database'
import { db } from '../firebase'

// Public STUN only. NAT traversal fails for ~5–10% of peer pairs (symmetric
// NATs); the honest fix is a TURN relay, which is a backend with bandwidth
// cost — deliberately out of scope. Those peers surface as onStatus('failed').
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const sigRef = (gameId, child) => ref(db, `games/${gameId}/signaling/${child}`)

/**
 * Establish a P2P data channel between the two seats of a room.
 *
 * @param {object} opts
 * @param {string} opts.gameId
 * @param {'X'|'O'} opts.mySymbol      X = host (offerer), O = guest (answerer)
 * @param {(msg:any)=>void} opts.onMessage   called with each decoded JSON frame
 * @param {(s:'connecting'|'connected'|'failed'|'closed')=>void} [opts.onStatus]
 * @returns {{ send:(obj:any)=>void, close:()=>void }}
 */
export function createPeer({ gameId, mySymbol, onMessage, onStatus = () => {} }) {
  const isHost = mySymbol === 'X'
  const opSymbol = isHost ? 'O' : 'X'

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  let channel = null
  let closed = false
  const cleanups = []

  const emitStatus = (s) => { if (!closed) onStatus(s) }

  const wireChannel = (ch) => {
    channel = ch
    ch.binaryType = 'arraybuffer'
    ch.onopen = () => emitStatus('connected')
    ch.onclose = () => emitStatus('closed')
    ch.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)) } catch { /* ignore malformed frame */ }
    }
  }

  if (isHost) {
    wireChannel(pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }))
  } else {
    pc.ondatachannel = (e) => wireChannel(e.channel)
  }

  // Trickle ICE: publish our candidates under our own symbol, consume the peer's.
  pc.onicecandidate = (e) => {
    if (!e.candidate || closed) return
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set(sigRef(gameId, `ice/${mySymbol}/${key}`), e.candidate.toJSON()).catch(() => {})
  }

  pc.onconnectionstatechange = () => {
    if (closed) return
    const st = pc.connectionState
    if (st === 'connected') emitStatus('connected')
    else if (st === 'failed') emitStatus('failed')
    else if (st === 'disconnected') emitStatus('failed')
  }

  // Consume the peer's ICE candidates as they arrive.
  const peerIce = sigRef(gameId, `ice/${opSymbol}`)
  const iceCb = onChildAdded(peerIce, (snap) => {
    const cand = snap.val()
    if (cand) pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {})
  })
  cleanups.push(() => off(peerIce, 'child_added', iceCb))

  const negotiate = async () => {
    emitStatus('connecting')
    try {
      if (isHost) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await set(sigRef(gameId, 'offer'), { type: offer.type, sdp: offer.sdp })
        // Wait for the guest's answer.
        const answerRef = sigRef(gameId, 'answer')
        const cb = onValue(answerRef, async (snap) => {
          const ans = snap.val()
          if (ans && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(ans)).catch(() => {})
          }
        })
        cleanups.push(() => off(answerRef, 'value', cb))
      } else {
        // Guest: wait for the host's offer, then answer.
        const offerRef = sigRef(gameId, 'offer')
        const cb = onValue(offerRef, async (snap) => {
          const offer = snap.val()
          if (offer && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(offer))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await set(sigRef(gameId, 'answer'), { type: answer.type, sdp: answer.sdp })
          }
        })
        cleanups.push(() => off(offerRef, 'value', cb))
      }
    } catch {
      emitStatus('failed')
    }
  }
  negotiate()

  return {
    send(obj) {
      if (channel && channel.readyState === 'open') {
        try { channel.send(JSON.stringify(obj)) } catch { /* dropped frame */ }
      }
    },
    close() {
      if (closed) return
      closed = true
      cleanups.forEach(fn => { try { fn() } catch { /* ignore */ } })
      try { channel?.close() } catch { /* ignore */ }
      try { pc.close() } catch { /* ignore */ }
      // The host owns signaling-node cleanup so a fresh peer can renegotiate.
      if (isHost) remove(sigRef(gameId, '')).catch(() => {})
    },
  }
}
