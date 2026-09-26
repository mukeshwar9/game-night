import { useCallback, useEffect, useRef, useState } from 'react'
import { DT, startDrop, stepDrop, simResult } from '../lib/animalStackLogic'
import { getStoredMotion } from '../lib/displayPrefs'

const FALL_MS = 1700

// Animates one ANIMAL STACK drop in real time on the same fixed 1/60 steps the
// headless replay uses, so what a player watches IS the verdict every other
// client computes. `play(state, drop)` resolves with `{ fell, state, hash }`
// the moment the drop settles or topples; on a topple the doomed tower keeps
// falling (at half speed unless reduced motion) for the drama, then clears.
//
// `simRef.current` is the live sim for the arena to draw; it stays set after a
// standing drop (bodies at rest) until the next `play` or `reset`.
export default function useStackPlayback({ onLand } = {}) {
  const simRef = useRef(null)
  const rafRef = useRef(0)
  const onLandRef = useRef(onLand)
  useEffect(() => { onLandRef.current = onLand })
  const [running, setRunning] = useState(false)

  const cancel = () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
  useEffect(() => cancel, [])

  const reset = useCallback(() => { cancel(); simRef.current = null; setRunning(false) }, [])

  const play = useCallback((state, drop) => new Promise((resolve) => {
    cancel()
    const sim = startDrop(state, drop)
    let landed = false
    sim.world.on('begin-contact', (contact) => {
      if (landed) return
      const a = contact.getFixtureA().getBody(), b = contact.getFixtureB().getBody()
      if (a !== sim.dropBody && b !== sim.dropBody) return
      landed = true
      const v = sim.dropBody.getLinearVelocity()
      const p = sim.dropBody.getPosition()
      onLandRef.current?.({ speed: Math.min(1, Math.abs(v.y) / 6), x: p.x, y: p.y })
    })
    simRef.current = sim
    setRunning(true)
    const reduced = getStoredMotion() === 'reduced'
    let last = performance.now(), acc = 0
    const tick = (now) => {
      acc += Math.min(0.1, (now - last) / 1000); last = now
      while (acc >= DT && !sim.done) { stepDrop(sim); acc -= DT }
      if (!sim.done) { rafRef.current = requestAnimationFrame(tick); return }
      const result = simResult(sim)
      resolve(result)
      if (!result.fell) { setRunning(false); rafRef.current = 0; return }
      sim.falling = true
      const end = now + (reduced ? 600 : FALL_MS)
      let frame = 0
      const fall = (t) => {
        frame++
        if (reduced || frame % 2 === 0 || t > end - 800) sim.world.step(DT, 8, 3)
        if (t < end) { rafRef.current = requestAnimationFrame(fall); return }
        simRef.current = null
        rafRef.current = 0
        setRunning(false)
      }
      rafRef.current = requestAnimationFrame(fall)
    }
    rafRef.current = requestAnimationFrame(tick)
  }), [])

  return { simRef, running, play, reset }
}
