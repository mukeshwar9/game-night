import { useEffect, useRef } from 'react'

// Captures local paddle input from keyboard (↑/↓, W/S) and pointer drag on the
// court. Exposes getDir(paddleY) → -1 | 0 | 1 so the caller can feed the pure
// sim (host / demo) or send the intent to the host (guest). Pointer control is
// only active while dragging, so a desktop player can use the keyboard without
// the resting mouse position hijacking the paddle.
export function usePongControls(courtRef, enabled = true) {
  const keyDir = useRef(0)
  const targetY = useRef(null)         // normalized 0..1 while dragging, else null
  const keys = useRef({ up: false, down: false })

  useEffect(() => {
    if (!enabled) return
    const recompute = () => { keyDir.current = (keys.current.down ? 1 : 0) - (keys.current.up ? 1 : 0) }
    const isUp = (k) => k === 'ArrowUp' || k === 'w' || k === 'W'
    const isDown = (k) => k === 'ArrowDown' || k === 's' || k === 'S'
    const onDown = (e) => {
      if (isUp(e.key)) { keys.current.up = true; targetY.current = null; recompute(); e.preventDefault() }
      else if (isDown(e.key)) { keys.current.down = true; targetY.current = null; recompute(); e.preventDefault() }
    }
    const onUp = (e) => {
      if (isUp(e.key)) { keys.current.up = false; recompute() }
      else if (isDown(e.key)) { keys.current.down = false; recompute() }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [enabled])

  useEffect(() => {
    const el = courtRef.current
    if (!el || !enabled) return
    let dragging = false
    const setFrom = (e) => {
      const rect = el.getBoundingClientRect()
      if (!rect.height) return
      targetY.current = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    }
    const onDown = (e) => { dragging = true; el.setPointerCapture?.(e.pointerId); setFrom(e) }
    const onMove = (e) => { if (dragging) setFrom(e) }
    const onEnd = () => { dragging = false; targetY.current = null }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onEnd)
    el.addEventListener('pointercancel', onEnd)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onEnd)
      el.removeEventListener('pointercancel', onEnd)
    }
  }, [courtRef, enabled])

  const getDir = (paddleY, deadzone = 0.012) => {
    if (targetY.current != null) {
      const d = targetY.current - paddleY
      return Math.abs(d) < deadzone ? 0 : d > 0 ? 1 : -1
    }
    return keyDir.current
  }

  return { getDir }
}
