import { useCallback, useEffect, useMemo, useRef } from 'react'

// Captures local Space Duel ship input from keyboard and on-screen touch
// buttons (rendered by SpaceduelArena via the returned `touch` handlers).
//
//   getInput() => { turn, thrust, fire }
//
// `turn` (−1 left / 0 / +1 right) and `thrust` (0/1) are continuous held-state
// (keyboard keys held, or touch buttons held). `fire` is EDGE-triggered: a
// single keydown / tap sets a pending-fire flag that is cleared on the first
// read, so holding SPACE or the FIRE button fires once per press (the sim's
// FIRE_COOLDOWN still rate-limits). This makes firing feel deliberate even
// though turn/thrust stream continuously.
//
// Keyboard: ← / → or A / D rotate · ↑ or W thrust · SPACE or / fire.
//
// `touch` exposes handlers the arena wires to its on-screen buttons:
//   touch.turnLeft(dn), touch.turnRight(dn), touch.thrust(dn), touch.fire()
// where `dn` is true on pointerdown and false on pointerup/leave. Multi-touch
// (e.g. rotate + thrust + fire at once) is supported because each axis is an
// independent boolean the caller toggles.
export function useSpaceduelControls(arenaRef, enabled = true) {
  const leftRef = useRef(false)       // turn-left held (keyboard or touch)
  const rightRef = useRef(false)      // turn-right held
  const thrustRef = useRef(false)     // thrust held
  const firePendingRef = useRef(false) // edge-triggered fire (cleared on read)

  useEffect(() => {
    if (!enabled) return
    const isLeft = (k) => k === 'ArrowLeft' || k === 'a' || k === 'A'
    const isRight = (k) => k === 'ArrowRight' || k === 'd' || k === 'D'
    const isThrust = (k) => k === 'ArrowUp' || k === 'w' || k === 'W'
    const isFire = (k) => k === ' ' || k === '/' || k === 'Spacebar'

    const onDown = (e) => {
      const k = e.key
      if (isLeft(k)) { leftRef.current = true; e.preventDefault() }
      else if (isRight(k)) { rightRef.current = true; e.preventDefault() }
      else if (isThrust(k)) { thrustRef.current = true; e.preventDefault() }
      else if (isFire(k)) {
        // Ignore auto-repeat: one press = one shot.
        if (!e.repeat) firePendingRef.current = true
        e.preventDefault()
      }
    }
    const onUp = (e) => {
      const k = e.key
      if (isLeft(k)) leftRef.current = false
      else if (isRight(k)) rightRef.current = false
      else if (isThrust(k)) thrustRef.current = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [enabled])

  const getInput = useCallback(() => {
    const turn = (rightRef.current ? 1 : 0) - (leftRef.current ? 1 : 0)
    const thrust = thrustRef.current ? 1 : 0
    const fire = firePendingRef.current ? 1 : 0
    firePendingRef.current = false
    return { turn, thrust, fire }
  }, [])

  // Touch handlers used by SpaceduelArena's on-screen buttons. Created once
  // (useMemo, stable identity) and stable for the hook's lifetime so arena
  // effects can depend on it. The handlers close over the held-state refs and
  // only touch `.current` inside event handlers — not during render.
  const touch = useMemo(() => ({
    setLeft: (dn) => { leftRef.current = !!dn },
    setRight: (dn) => { rightRef.current = !!dn },
    setThrust: (dn) => { thrustRef.current = !!dn },
    fire: () => { firePendingRef.current = true },
  }), [])

  // (arenaRef is accepted for parity with sibling controls hooks; the arena
  //  owns the touch buttons and calls the `touch` handlers directly.)
  void arenaRef

  return { getInput, touch }
}