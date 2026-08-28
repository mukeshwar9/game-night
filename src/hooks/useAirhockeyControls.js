import { useEffect, useRef } from 'react'
import { COURT_W, COURT_H } from '../lib/airhockeyLogic'

// Captures local mallet TARGET position from pointer drag on the table (plus
// an arrow/WASD keyboard fallback) — continuous input, not edge-triggered,
// unlike the tap/edge-trigger controls of the other real-time games. The sim
// is position-driven (trackVelocity() just clamps + teleports to the target
// every tick, no physical lag beyond that clamp — see clampMalletTarget in
// airhockeyLogic), so getInput() only needs to report the raw target; the
// page clamps it locally with the same helper for zero-input-lag prediction.
//
//   getInput(dt) => { x, y }  (court coords, unclamped — the sim/page clamp)
//
// `dt` scales the keyboard nudge only (pointer drag sets the target directly,
// no dt dependence). Pass it when calling once per variable-length rAF frame
// (the guest's tick loop); omit it when calling once per fixed physics
// substep (the host's readHostInput, called once per accumulator iteration
// at exactly 1/120s) — the default matches that substep length exactly.
const SUBSTEP_DT = 1 / 120
const KEY_SPEED = 1.44 // court units/sec while a key is held

export function useAirhockeyControls(tableRef, mySymbol, enabled = true) {
  const targetRef = useRef({
    x: COURT_W / 2,
    y: mySymbol === 'X' ? COURT_H - 0.25 : 0.25,
  })
  const keysRef = useRef(new Set())

  useEffect(() => {
    const el = tableRef.current
    if (!el || !enabled) return
    const toCourt = (e) => {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return targetRef.current
      return {
        x: ((e.clientX - rect.left) / rect.width) * COURT_W,
        y: ((e.clientY - rect.top) / rect.height) * COURT_H,
      }
    }
    let dragging = false
    const down = (e) => { dragging = true; el.setPointerCapture?.(e.pointerId); targetRef.current = toCourt(e) }
    const move = (e) => { if (dragging) targetRef.current = toCourt(e) }
    const up = () => { dragging = false }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [tableRef, enabled])

  useEffect(() => {
    if (!enabled) return
    const kd = (e) => keysRef.current.add(e.key.toLowerCase())
    const ku = (e) => keysRef.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [enabled])

  const getInput = (dt = SUBSTEP_DT) => {
    const k = keysRef.current
    if (k.size) {
      const step = KEY_SPEED * dt
      let { x, y } = targetRef.current
      if (k.has('arrowup') || k.has('w')) y -= step
      if (k.has('arrowdown') || k.has('s')) y += step
      if (k.has('arrowleft') || k.has('a')) x -= step
      if (k.has('arrowright') || k.has('d')) x += step
      targetRef.current = { x, y }
    }
    return targetRef.current
  }

  return { getInput }
}
