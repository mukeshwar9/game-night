import { useCallback, useEffect, useRef, useState } from 'react'
import { createPeer } from './rtc'

// Reusable WebRTC peer connection lifecycle for real-time games. Wraps
// createPeer (src/lib/realtime/rtc.js) so each live game page doesn't
// duplicate the connection/retry/message-dispatch boilerplate that
// PongGame originally inlined.
//
// The hook owns: the peer object, retry counter, and status state. The
// page owns: what each incoming message means (via onMessage) and how to
// render — those are game-specific and stay in the page.
//
// @param {object} opts
// @param {string} opts.gameId
// @param {'X'|'O'} opts.mySymbol   X = host (offerer), O = guest (answerer)
// @param {boolean} opts.enabled    gate the connection (e.g. !isSpectator && status==='playing')
// @param {(msg:any)=>void} opts.onMessage  called with each decoded JSON frame
// @param {(s:'connecting'|'connected'|'failed'|'closed')=>void} [opts.onStatus]
// @returns {{ status, statusRef, retryKey, retry, send }}
//   status: 'idle'|'connecting'|'connected'|'failed'|'closed'
//   statusRef: ref mirroring status for use inside rAF/interval loops
//   retryKey: number that bumps on each retry() — include in effect deps
//     so host/guest loops restart on reconnect
//   retry(): re-establish the connection (bumps retryKey)
//   send(obj): no-op if the channel isn't open
export function useRealtimePeer({ gameId, mySymbol, enabled, onMessage, onStatus }) {
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
      onStatus: (s) => {
        statusRef.current = s
        setPeerStatus(s)
        onStatusRef.current?.(s)
      },
      onMessage: (msg) => onMessageRef.current?.(msg),
    })
    peerRef.current = peer
    return () => { peer.close(); peerRef.current = null }
  }, [gameId, mySymbol, enabled, retryKey])

  const send = useCallback((obj) => {
    peerRef.current?.send(obj)
  }, [])

  const retry = useCallback(() => {
    statusRef.current = 'connecting'
    setPeerStatus('connecting')
    setRetryKey(n => n + 1)
  }, [])

  return { status, statusRef, retryKey, retry, send }
}
