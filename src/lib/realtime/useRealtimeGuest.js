import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useRealtimePeer } from './useRealtimePeer'

// useRealtimeGuest — render-only loop for the guest (O) seat of a 2-player
// real-time game. The guest never simulates; it paints the host's snapshots
// and ships its local input upstream. As with the host hook, transport is
// delegated to `useRealtimePeer`; the page provides a single `tick` callback
// that translates the latest snapshot + age + dt into (a) the view the page
// should render and (b) the optional input payload to send to the host.
//
//   tick(snap, ageSec, dt) => { view, input } | null
//
// Returning `null` means "no update yet" (no snapshot) and the hook wills push
// `initialRender` instead. Page-owned bits inside `tick`:
//   • decode the snapshot schema (game-specific) into a view,
//   • dead-reckon host entities (e.g. extrapolate the ball from `vy + spin*age`),
//   • locally predict the guest's own entity (e.g. advance own paddle by
//     `dir * speed * dt` for zero-input-lag feel),
//   • read the local controls hook and return the input to send upstream.
//
// `INPUT_MS` throttles upstream send frequency. The Pong guest sends a dir at
// ~30 Hz (INPUT_MS = 33); the Snake / Tron / Sumo guests send only on
// edge-triggered changes (INPUT_MS = 0, page returns input: null between
// presses). `input: null` is never sent.
//
// Between two throttled sends, `tick` can be called several times (it runs
// every rAF, ~60 Hz, while sends are capped to INPUT_MS). A plain
// last-write-wins replace of the pending payload silently drops anything true
// only on an intermediate frame — e.g. Space Duel's edge-triggered `fire`
// flag, which `tick`'s local input hook clears the moment it is read, so a
// press landing on a frame that isn't the send frame vanishes (~half of
// guest shots). `mergeInput(pending, next)` lets a page combine the pending
// payload with each new one instead of overwriting it — e.g. OR the boolean
// flag across frames — so nothing true gets lost before it is actually sent;
// the merged payload is cleared right after it goes out. Default (omitted)
// is `(pending, next) => next`, i.e. the previous plain replace behavior —
// every other game is unaffected.
//
// `sfxMap` is `{ [kind]: (by?) => void }` — applied to incoming `{t:'e', k, by?}`
// frames; `by` (the event's originating side, 'X'|'O') is passed through when
// the host included one, `undefined` otherwise — existing sfxMap callbacks
// that ignore their argument are unaffected.

export function useRealtimeGuest(opts) {
  const {
    gameId, mySymbol, enabled,
    tick,                                       // (snap, ageSec, dt) => { view, input } | null
    setRender, initialRender,
    sfxMap = {},
    INPUT_MS = 0,                                // ms between upstream input sends; 0 = no throttle
    mergeInput,                                  // (pending, next) => merged; default replaces (last-write-wins)
  } = opts

  const snapRef = useRef(null)
  const snapAtRef = useRef(0)

  // Page-supplied callbacks (and sfxMap) are kept in a ref refreshed every commit
  // so they stay OUT of the loop effect's / onMessage's dependency arrays. Same
  // class of bug as the host: the loop calls setRender() ~60×/s, so an unstable
  // `tick` (e.g. Tron's, which closes over an unmemoized getDir) would tear down
  // and re-register the rAF loop every frame. Reading through the ref lets the
  // loop run once per connection lifecycle while still calling the latest tick.
  const cbRef = useRef(null)
  useLayoutEffect(() => {
    cbRef.current = { tick, setRender, initialRender, sfxMap, mergeInput }
  })

  const onMessage = useCallback((msg) => {
    if (msg.t === 's') { snapRef.current = msg; snapAtRef.current = performance.now() }
    else if (msg.t === 'e') cbRef.current.sfxMap[msg.k]?.(msg.by)
  }, [])

  const peer = useRealtimePeer({ gameId, mySymbol, enabled, onMessage })
  const sendRef = useRef(peer.send)
  useEffect(() => { sendRef.current = peer.send }, [peer.send])
  const peerSend = (obj) => sendRef.current(obj)

  useEffect(() => {
    if (!enabled) return
    // A new round (or retry) must not repaint the previous round's final
    // snapshot while waiting for the host's first one.
    snapRef.current = null
    let raf, last = performance.now(), lastInput = 0
    // Pending outgoing payload, accumulated via mergeInput() across every
    // tick() call since the last send — reset per connection lifecycle, same
    // scope as `lastInput`/`last` above.
    let pending = null
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const c = cbRef.current
      const dt = Math.min((now - last) / 1000, 0.1); last = now
      const snap = snapRef.current
      if (!snap) { c.setRender(c.initialRender); return }
      const age = (now - snapAtRef.current) / 1000
      const res = c.tick(snap, age, dt)
      if (!res) { c.setRender(c.initialRender); return }
      c.setRender(res.view)
      if (res.input != null) {
        const merge = c.mergeInput || ((_pending, next) => next)
        pending = merge(pending, res.input)
      }
      if (pending != null && (INPUT_MS <= 0 || now - lastInput >= INPUT_MS)) {
        lastInput = now
        peerSend(pending)
        pending = null
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [gameId, mySymbol, enabled, peer.retryKey, INPUT_MS])

  return { status: peer.status, statusRef: peer.statusRef, retry: peer.retry, retryKey: peer.retryKey, isHost: false }
}