import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useRealtimePeer } from './useRealtimePeer'
import {
  createDelayLine, delaySteps, hostInputDelayMs, isInputStale, latestInput, mergeTapInput, STALE_INPUT_MS,
} from './netLogic'

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
//   • emits `{t:'e', k: event.type, by?: event.by}` to the guest for each event
//     (sfx broadcast) — `by` is included only when the event carries one
//     (e.g. Space Duel/Air Hockey's `{type, by: 'X'|'O'}`), so events with no
//     `by` (Sumo's `clash`/`out`) go out exactly as before,
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
// Pause/resume (F-47): the sim only steps while the peer is 'connected'. On
// 'reconnecting'/'failed' the loop freezes on the current sim view (no
// scoring against a dropped player), clears the guest's input and the host
// input delay line, and on reconnect runs the COUNTDOWN again before
// resuming the same sim — a reconnect never rebuilds the round.
//
// Fairness (opt-in, rAF driver only): with `equalizeHostInput: true` the
// host's own input goes through a delay line of ≈ RTT/2 (capped) so it
// reaches the sim no sooner than the guest's does — see netLogic.js for the
// measurement and the rationale. Tick-driven games skip it (tick quantisation
// dwarfs one network hop). Off by default so existing pages are unchanged.
//
// Returns `{ status, statusRef, retry, retryKey, isHost: true }` so the page can render
// the connecting / countdown / reconnecting / failed overlay via
// `RealtimeOverlay` and switch to its spectator + finished views.

const DEFAULT_COUNTDOWN = 2000

// Guest input is expired after STALE_INPUT_MS (netLogic.js) with no `{t:'i'}`
// message — only when consumeGuestInput is false (a latched, non-tap payload
// like Space Duel's {turn,thrust,fire} or Air Hockey's target). Without this,
// a stalled/dropped data channel leaves the last continuous input (e.g.
// "turning left, thrusting") applied forever — the ship keeps moving with no
// guest actually driving it. consumeGuestInput:true games (Sumo's tap-count)
// already self-clear every step, so they never hit this path.

export function useRealtimeHost(opts) {
  const {
    gameId, mySymbol, enabled,
    isPublic = false,                         // public-lobby room → relay-only ICE when TURN is configured
    driver,                                   // 'rAF' | 'tick'
    COUNTDOWN_MS = DEFAULT_COUNTDOWN,
    tickMs,                                    // REQUIRED when driver==='tick'
    createState,                               // () => simState
    stepSim,                                   // (state, inputs, dt) => { state, events }  (rAF)
    tickSim,                                   // (state, inputs) => { state, events }      (tick)
    readHostInput,                             // (sim) => local input for X
    consumeGuestInput = false,                  // clear guest input after each step so edge-triggered taps are consumed once
    equalizeHostInput = false,                  // rAF: delay the host's own input by ≈ RTT/2 (fairness, netLogic.js)
    mergeHostInput,                             // (a, b) => merged — host delay line shrink; default: sum taps (consume) / latest wins
    holdHostInput,                              // (last) => input — host delay line growth; default: repeat last (latched) / null (consume)
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
  const guestInputAtRef = useRef(0)   // performance.now() of the last received {t:'i'} message

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
      mergeHostInput, holdHostInput,
    }
  })

  // `onMessage` is stable (owns no game-specific deps) so the peer connection
  // effect inside useRealtimePeer won't tear down on every re-render.
  const onMessage = useCallback((msg) => {
    if (msg.t === 'i') {
      guestInputAtRef.current = performance.now()
      // Additive accumulation for tap-count inputs (Sumo's { press: N }):
      // two guest taps can land between host substeps, and a plain
      // last-write-wins assignment would coalesce them into a single
      // impulse — the guest silently loses pushes the host never loses.
      // Only messages that carry a numeric `press` field accumulate; every
      // other shape (Pong's continuous paddle dir, Pac-Mac's direction
      // string) keeps the prior last-write-wins replace behavior.
      const prev = guestInputRef.current
      if (prev && typeof prev.press === 'number' && typeof msg.d?.press === 'number') {
        guestInputRef.current = { ...msg.d, press: prev.press + msg.d.press }
      } else {
        guestInputRef.current = msg.d
      }
    }
    // 's' never arrives on the host; 'e' is what we emit, not receive.
  }, [])

  const peer = useRealtimePeer({ gameId, mySymbol, enabled, isPublic, onMessage })
  const { getRtt } = peer
  const sendRef = useRef(peer.send)
  useEffect(() => { sendRef.current = peer.send }, [peer.send])
  const peerSend = (obj) => sendRef.current(obj)

  // Reset the round-guard whenever the round (re)starts.
  useEffect(() => {
    if (enabled) {
      finishedRef.current = false
      guestInputRef.current = null
      guestInputAtRef.current = 0
    }
  }, [enabled])

  // The loop effect depends ONLY on connection/identity values, so it (and the
  // createState() below) runs exactly once per connection lifecycle — never per
  // render. All game-specific callbacks are read fresh from cbRef.current.
  useEffect(() => {
    if (!enabled) return
    simRef.current = cbRef.current.createState()
    finishedRef.current = false

    // Once the sim has stepped, pauses (reconnecting, the resume countdown)
    // freeze on its current view instead of snapping back to initialRender.
    let started = false
    const pausedView = (c, countdown) => (started
      ? { ...c.buildView(simRef.current), countdown }
      : countdown ? { ...c.initialRender, countdown } : c.initialRender)

    if (driver === 'rAF') {
      const DT = 1 / 120
      let raf, last = performance.now(), acc = 0, lastSnap = 0, startAt = 0
      // Page hooks read through cbRef (inline lambdas must not restart the loop).
      const hostDelay = createDelayLine({
        merge: (a, b) => (cbRef.current.mergeHostInput || (consumeGuestInput ? mergeTapInput : latestInput))(a, b),
        hold: (last) => (cbRef.current.holdHostInput
          ? cbRef.current.holdHostInput(last)
          : consumeGuestInput ? null : last),
      })

      const loop = (now) => {
        raf = requestAnimationFrame(loop)
        const c = cbRef.current
        if (peer.statusRef.current !== 'connected') {
          last = now; startAt = now + COUNTDOWN_MS; acc = 0
          hostDelay.reset()
          guestInputRef.current = null
          c.setRender(pausedView(c, 0))
          return
        }
        if (now < startAt) {
          last = now
          c.setRender(pausedView(c, Math.ceil((startAt - now) / 1000)))
          return
        }
        let dt = (now - last) / 1000; last = now
        if (dt > 0.1) dt = 0.1
        acc += dt
        if (!consumeGuestInput && guestInputRef.current && isInputStale(guestInputAtRef.current, now, STALE_INPUT_MS)) {
          guestInputRef.current = null
        }
        const hostDelaySteps = equalizeHostInput ? delaySteps(hostInputDelayMs(getRtt()), DT) : 0
        const events = []
        while (acc >= DT) {
          started = true
          const inputs = {
            X: hostDelay.push(c.readHostInput(simRef.current), hostDelaySteps),
            O: guestInputRef.current,
          }
          if (consumeGuestInput) guestInputRef.current = null
          const res = c.stepSim(simRef.current, inputs, DT)
          simRef.current = res.state
          if (res.events?.length) events.push(...res.events)
          acc -= DT
        }
        for (const e of events) {
          peerSend(e.by != null ? { t: 'e', k: e.type, by: e.by } : { t: 'e', k: e.type })
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
          guestInputRef.current = null
          c.setRender(pausedView(c, 0))
          return
        }
        if (Date.now() < startAt) {
          c.setRender(pausedView(c, Math.ceil((startAt - Date.now()) / 1000)))
          return
        }
        if (!consumeGuestInput && guestInputRef.current && isInputStale(guestInputAtRef.current, performance.now(), STALE_INPUT_MS)) {
          guestInputRef.current = null
        }
        started = true
        const inputs = { X: c.readHostInput(simRef.current), O: guestInputRef.current }
        if (consumeGuestInput) guestInputRef.current = null
        const res = c.tickSim(simRef.current, inputs)
        simRef.current = res.state
        for (const e of res.events || []) {
          peerSend(e.by != null ? { t: 'e', k: e.type, by: e.by } : { t: 'e', k: e.type })
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
  }, [gameId, mySymbol, enabled, peer.statusRef, getRtt, driver, tickMs,
      COUNTDOWN_MS, consumeGuestInput, snapshotMs, equalizeHostInput])

  return { status: peer.status, statusRef: peer.statusRef, retry: peer.retry, retryKey: peer.retryKey, isHost: true }
}