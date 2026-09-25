import { useEffect, useRef } from 'react'

// Captures local paddle input from the keyboard and pointer drags, and turns
// it into the sim's analog paddle intent via getDir(paddleY) → [-1, 1]. The
// caller feeds that to the pure sim (host / demo) or sends it to the host
// (guest).
//
// The court can be drawn landscape or portrait with either side nearest the
// viewer (see PongCourt), so screen input is mapped back into sim space
// through `viewRef.current = { orientation, nearSide }`:
//   - landscape: the paddle runs up/down  → ↑/↓, W/S, vertical drags
//   - portrait:  the paddle runs sideways → ←/→, A/D, horizontal drags
// Drags are absolute (the paddle chases the finger) and are read against the
// court's rect but can start anywhere on `touchRef` (a larger area around the
// court), so a thumb below the court still steers without covering the ball.
// Pointer control is only active while dragging, so a desktop player can use
// the keyboard without the resting mouse position hijacking the paddle.
const DRAG_GAIN = 0.06       // sim distance at which a drag reaches full speed
const DRAG_DEADZONE = 0.006

export function usePongControls(courtRef, enabled = true, { touchRef, viewRef } = {}) {
  const keys = useRef({ neg: false, pos: false })
  const targetY = useRef(null)         // sim-space 0..1 while dragging, else null

  const view = () => viewRef?.current || { orientation: 'landscape', nearSide: 'X' }

  useEffect(() => {
    if (!enabled) return
    // Screen-direction keys for each orientation: `neg` moves the paddle
    // up (landscape) or left (portrait) on screen.
    const which = (k) => {
      const portrait = view().orientation === 'portrait'
      if (portrait) {
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') return 'neg'
        if (k === 'ArrowRight' || k === 'd' || k === 'D') return 'pos'
      } else {
        if (k === 'ArrowUp' || k === 'w' || k === 'W') return 'neg'
        if (k === 'ArrowDown' || k === 's' || k === 'S') return 'pos'
      }
      return null
    }
    const onDown = (e) => {
      const w = which(e.key)
      if (!w) return
      keys.current[w] = true
      targetY.current = null
      e.preventDefault()
    }
    const onUp = (e) => {
      const w = which(e.key)
      if (w) keys.current[w] = false
    }
    const clear = () => { keys.current = { neg: false, pos: false } }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
      clear()
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- view() reads a ref

  useEffect(() => {
    const el = touchRef?.current || courtRef.current
    if (!el || !enabled) return
    let dragging = false
    const setFrom = (e) => {
      const court = courtRef.current
      if (!court) return
      const rect = court.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const { orientation, nearSide } = view()
      let y
      if (orientation === 'portrait') {
        const fx = (e.clientX - rect.left) / rect.width
        y = nearSide === 'O' ? 1 - fx : fx
      } else {
        y = (e.clientY - rect.top) / rect.height
      }
      targetY.current = Math.max(0, Math.min(1, y))
    }
    const onDown = (e) => {
      // Let real controls (buttons, links) inside the touch area work normally.
      if (e.target.closest?.('button, a, input, select, [role="button"]')) return
      dragging = true
      el.setPointerCapture?.(e.pointerId)
      setFrom(e)
    }
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
  }, [courtRef, touchRef, enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- view() reads a ref

  const getDir = (paddleY) => {
    if (targetY.current != null) {
      const d = targetY.current - paddleY
      if (Math.abs(d) < DRAG_DEADZONE) return 0
      return Math.max(-1, Math.min(1, d / DRAG_GAIN))
    }
    const screen = (keys.current.pos ? 1 : 0) - (keys.current.neg ? 1 : 0)
    const { orientation, nearSide } = view()
    // Portrait with O nearest the viewer mirrors the cross axis on screen.
    return orientation === 'portrait' && nearSide === 'O' ? -screen : screen
  }

  return { getDir }
}
