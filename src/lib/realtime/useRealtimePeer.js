import { useCallback, useEffect, useRef, useState } from 'react'
import { createPeer } from './rtc'

// Reusable WebRTC peer connection lifecycle for real-time games. Wraps
// createPeer (src/lib/realtime/rtc.js) so each live game page doesn't
// duplicate the connection/retry/message-dispatch boilerplate that
// PongGame originally inlined.
//
// The hook owns: the peer object and status state. The page owns: what each
// incoming message means (via onMessage) and how to render — those are
// game-specific and stay in the page.
//
// Reconnects don't need to remount the page's loops: rtc.js swaps the
// underlying RTCPeerConnection in place (new signaling attempt), so a sim can
// survive — freeze while status !== 'connected', resume after the countdown.
// useRealtimeHost/useRealtimeGuest work that way. `retryKey` (bumps on each
// local retry()) is kept for pages that still restart their own loops on it
// (Pong); new code should not depend on it.
//
// @param {object} opts
// @param {string} opts.gameId
// @param {'X'|'O'} opts.mySymbol   X = host (offerer), O = guest (answerer)
// @param {boolean} opts.enabled    gate the connection (e.g. !isSpectator && status==='playing')
// @param {boolean} [opts.isPublic] public-lobby room → relay-only ICE when TURN is configured
// @param {(msg:any)=>void} opts.onMessage  called with each decoded JSON frame
// @param {(s:string)=>void} [opts.onStatus]
// @returns {{ status, statusRef, retryKey, retry, send, getRtt }}
//   status: 'idle'|'connecting'|'connected'|'reconnecting'|'failed'
//     ('reconnecting' = the link was up and dropped, or a new attempt started
//     after it was up — gameplay must pause; see connectionLogic.js)
//   statusRef: ref mirroring status for use inside rAF/interval loops
//   retryKey: legacy counter, bumps on each local retry()
//   retry(): start a new signaling attempt (works from either side)
//   send(obj): no-op if the channel isn't open
//   getRtt(): smoothed round-trip ms (host side; null until measured)
export function useRealtimePeer({ gameId, mySymbol, enabled, isPublic = false, onMessage, onStatus }) {
  // peerStatus is only meaningful when enabled; when disabled we surface 'idle'
  // via the derived `status` below (avoids a synchronous setState in the effect).
  const [peerStatus, setPeerStatus] = useState('connecting')
  const [retryKey, setRetryKey] = useState(0)
  const peerRef = useRef(null)
  const statusRef = useRef(enabled ? 'connecting' : 'idle')
  const status = enabled ? peerStatus : 'idle'
  // Keep the ref in sync with the derived status for use inside rAF/interval loops.
  useEffect(() => { statusRef.current = status }, [status])

  // Keep callbacks in refs so the connection effect doesn't tear down and
  // re-establish the peer when the page re-renders with a new onMessage.
  const onMessageRef = useRef(onMessage)
  const onStatusRef = useRef(onStatus)
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onStatusRef.current = onStatus }, [onStatus])

  useEffect(() => {
    if (!enabled) return
    const peer = createPeer({
      gameId,
      mySymbol,
      isPublic,
      onStatus: (s) => {
        statusRef.current = s
        setPeerStatus(s)
        onStatusRef.current?.(s)
      },
      onMessage: (msg) => onMessageRef.current?.(msg),
    })
    peerRef.current = peer
    return () => { peer.close(); peerRef.current = null }
  }, [gameId, mySymbol, enabled, isPublic])

  const send = useCallback((obj) => {
    peerRef.current?.send(obj)
  }, [])

  const retry = useCallback(() => {
    peerRef.current?.retry()
    setRetryKey(n => n + 1)
  }, [])

  const getRtt = useCallback(() => peerRef.current?.getRtt() ?? null, [])

  return { status, statusRef, retryKey, retry, send, getRtt }
}
