import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useRealtimePeer } from './useRealtimePeer'

// useRealtimeHost — host-authoritative simulation loop for a 2-player real-time
// game. X (the room creator) is the host; the host runs the one true sim and
// streams snapshots to the guest over the WebRTC data channel. The page supplies
// the game-specific bits (sim, snapshot schema, sfx map, finish-firebase-work);
// this hook owns the connection lifecycle, the loop, the countdown, the snapshot
// throttle, and the sfx-broadcast plumbing.
//
// Two loop drivers:
//   • 'rAF'  — requestAnimationFrame with a fixed-timestep accumulator (Pong).
//              Pass `stepSim(state, inputs, dt) => { state, events }`.
//   • 'tick' — setTimeout(tickMs) running one discrete step per tick (Snake).
//              Pass `tickSim(state, inputs) => { state, events }`.
//
// `stepSim` / `tickSim` are pure (never mutate their `state` arg, return a new
// state). `readHostInput(sim)` reads the page's local controls hook and
// returns what the host player (X) wants this step. The guest's input is read
// from a ref the hook owns (`guestInputRef`); the hook's internal `onMessage`
// writes into it on every incoming `{t:'i'}` frame.
//
// After every step the hook:
//   • emits `{t:'e', k: event.type}` to the guest for each event (sfx broadcast),
//   • calls `onEvent(event, sim)` so the page can do local sfx + Firebase writes
//     (e.g. `update(ref(db, …), { snakeScoreX, … })` on `eat`).
//   • `setRender(buildView(sim))` once per rAF frame (rAF driver) or per tick
//     (tick driver) so the host's own UI updates live — distinct from the wire
//     payload built by `buildSnapshot` so the page owns its view shape.
//   • on driver==='rAF': throttles snapshot emission to `snapshotMs` (~30 Hz).
//   • on driver==='tick': snapshots every tick (bandwidth is tiny at <10 Hz).
//
// `getWinner(sim)` → 'X'|'O'|'draw'|null. When non-null the loop stops and
// `finishRound(winner)` runs once (page owns the runTransaction patch — it
// knows which per-game score keys to stamp).
//
// Returns `{ status, retry, retryKey, isHost: true }` so the page can render
// the connecting / countdown / failed overlay via `RealtimeOverlay` and switch
// to its spectator + finished views.

const DEFAULT_COUNTDOWN = 2000

export function useRealtimeHost(opts) {
  const {
    gameId, mySymbol, enabled,
    driver,                                   // 'rAF' | 'tick'
    COUNTDOWN_MS = DEFAULT_COUNTDOWN,
    tickMs,                                    // REQUIRED when driver==='tick'
    createState,                               // () => simState
    stepSim,                                   // (state, inputs, dt) => { state, events }  (rAF)
    tickSim,                                   // (state, inputs) => { state, events }      (tick)
    readHostInput,                             // (sim) => local input for X
    consumeGuestInput = false,                  // clear guest input after each step so edge-triggered taps are consumed once
    onEvent,                                   // (event, sim) => void  (sfx + firebase; page-owned)
    snapshotMs = 33,                            // rAF: snapshot throttle; tick: ignored
    buildView,                                  // (sim) => view   — pushed to setRender per frame/tick
    buildSnapshot,                             // (sim) => { t:'s', ... } payload sent to the guest
    getWinner,                                  // (sim) => 'X'|'O'|'draw'|null
    finishRound,                                // (winner) => Promise<void>
    setRender,                                  // (view) => void
    initialRender,                              // view pushed while idle / waiting for connection
  } = opts

  const simRef = useRef(null)
  const finishedRef = useRef(false)
  const guestInputRef = useRef(null)

  // Page-supplied callbacks live in a ref that is refreshed on every commit
  // (in a layout effect, so it lands before the loop effect below can re-run).
  // The ~60 Hz loop reads the latest ones through this ref, which keeps them OUT
  // of the loop effect's dependency array. That is the fix for the frozen-sim
  // bug: the loop calls setRender() ~60×/s, so if a page-supplied callback whose
  // identity changes each render (e.g. an inline `readHostInput`) were a dep, the
  // effect would tear down and re-run every frame — and its first line rebuilds
  // the authoritative sim via createState(). Stashing them here means the sim is
  // created exactly once per connection lifecycle. Mirrors the sendRef pattern.
  const cbRef = useRef(null)
  useLayoutEffect(() => {
    cbRef.current = {
      createState, stepSim, tickSim, readHostInput, onEvent,
      buildView, buildSnapshot, getWinner, finishRound, setRender, initialRender,
    }
  })

  // `onMessage` is stable (owns no game-specific deps) so the peer connection
  // effect inside useRealtimePeer won't tear down on every re-render.
  const onMessage = useCallback((msg) => {
    if (msg.t === 'i') guestInputRef.current = msg.d
    // 's' never arrives on the host; 'e' is what we emit, not receive.
  }, [])

  const peer = useRealtimePeer({ gameId, mySymbol, enabled, onMessage })
  const sendRef = useRef(peer.send)
  useEffect(() => { sendRef.current = peer.send }, [peer.send])
  const peerSend = (obj) => sendRef.current(obj)

  // Reset the round-guard whenever the round (re)starts.
  useEffect(() => {
    if (enabled) finishedRef.current = false
  }, [enabled, peer.retryKey])

  // The loop effect depends ONLY on connection/identity values, so it (and the
  // createState() below) runs exactly once per connection lifecycle — never per
  // render. All game-specific callbacks are read fresh from cbRef.current.
  useEffect(() => {
    if (!enabled) return
    simRef.current = cbRef.current.createState()
    finishedRef.current = false

    if (driver === 'rAF') {
      const DT = 1 / 120
      let raf, last = performance.now(), acc = 0, lastSnap = 0, startAt = 0

      const loop = (now) => {
        raf = requestAnimationFrame(loop)
        const c = cbRef.current
        if (peer.statusRef.current !== 'connected') {
          last = now; startAt = now + COUNTDOWN_MS
          c.setRender(c.initialRender)
          return
        }
        if (now < startAt) {
          last = now
          c.setRender({ ...c.initialRender, countdown: Math.ceil((startAt - now) / 1000) })
          return
        }
        let dt = (now - last) / 1000; last = now
        if (dt > 0.1) dt = 0.1
        acc += dt
        const events = []
        while (acc >= DT) {
          const inputs = { X: c.readHostInput(simRef.current), O: guestInputRef.current }
          if (consumeGuestInput) guestInputRef.current = null
          const res = c.stepSim(simRef.current, inputs, DT)
          simRef.current = res.state
          if (res.events?.length) events.push(...res.events)
          acc -= DT
        }
        for (const e of events) {
          peerSend({ t: 'e', k: e.type })
          c.onEvent?.(e, simRef.current)
        }
        // Host renders its own view every frame (same view shape the page would
        // paint on the guest side, drawn straight from the authoritative sim).
        c.setRender(c.buildView(simRef.current))
        // Snapshot throttle.
        if (now - lastSnap >= snapshotMs) {
          lastSnap = now
          peerSend(c.buildSnapshot(simRef.current))
        }
        const w = c.getWinner(simRef.current)
        if (w && !finishedRef.current) {
          finishedRef.current = true
          cancelAnimationFrame(raf)
          c.finishRound(w)
        }
      }
      raf = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(raf)
    }

    if (driver === 'tick') {
      if (!tickMs) throw new Error('useRealtimeHost: driver "tick" requires tickMs')
      let timer, lastSnap = 0, startAt = 0

      const loop = () => {
        timer = setTimeout(loop, tickMs)
        const c = cbRef.current
        if (peer.statusRef.current !== 'connected') {
          startAt = Date.now() + COUNTDOWN_MS
          c.setRender(c.initialRender)
          return
        }
        if (Date.now() < startAt) {
          c.setRender({ ...c.initialRender, countdown: Math.ceil((startAt - Date.now()) / 1000) })
          return
        }
        const inputs = { X: c.readHostInput(simRef.current), O: guestInputRef.current }
        if (consumeGuestInput) guestInputRef.current = null
        const res = c.tickSim(simRef.current, inputs)
        simRef.current = res.state
        for (const e of res.events || []) {
          peerSend({ t: 'e', k: e.type })
          c.onEvent?.(e, simRef.current)
        }
        // Host paints its own view each tick.
        c.setRender(c.buildView(simRef.current))
        // Tick games snapshot every tick (bandwidth is small at ≤10 Hz).
        const now = performance.now()
        if (now - lastSnap >= tickMs) {
          lastSnap = now
          peerSend(c.buildSnapshot(simRef.current))
        }
        const w = c.getWinner(simRef.current)
        if (w && !finishedRef.current) {
          finishedRef.current = true
          clearTimeout(timer)
          c.finishRound(w)
        }
      }
      timer = setTimeout(loop, tickMs)
      return () => clearTimeout(timer)
    }

    throw new Error(`useRealtimeHost: unknown driver "${driver}"`)
  }, [gameId, mySymbol, enabled, peer.retryKey, peer.statusRef, driver, tickMs,
      COUNTDOWN_MS, consumeGuestInput, snapshotMs])

  return { status: peer.status, statusRef: peer.statusRef, retry: peer.retry, retryKey: peer.retryKey, isHost: true }
}