import { useEffect, useRef } from 'react'

// Captures local snake direction input from keyboard (arrows + WASD) and
// touch swipe. Exposes getDir() → 'up'|'down'|'left'|'right'|null so the
// caller can feed the pure sim (host) or send the intent to the host (guest).
//
// Direction changes are edge-triggered: a keypress sets the pending direction
// once; the caller reads (and clears) it via getDir(). This prevents a held
// key from spamming direction changes every frame and avoids the 180° reversal
// issue (the sim validates, but we also guard here).
export function useSnakeControls(arenaRef, enabled = true) {
  const pendingRef = useRef(null)       // 'up'|'down'|'left'|'right'|null
  const currentRef = useRef(null)       // last acknowledged direction (for 180° guard)
  const touchStart = useRef(null)       // gesture-start point (for the discrete-swipe fallback)
  const anchorRef = useRef(null)        // last accepted point (for continuous hold-to-steer)
  const movedRef = useRef(false)        // true once this gesture has already emitted a move-based turn

  useEffect(() => {
    if (!enabled) return
    const KEY_MAP = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    }
    const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

    const onDown = (e) => {
      const dir = KEY_MAP[e.key]
      if (!dir) return
      e.preventDefault()
      if (currentRef.current && OPPOSITE[currentRef.current] === dir) return
      pendingRef.current = dir
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [enabled])

  // Touch: discrete swipe (lift-and-retouch) still works via pointerup, but a
  // held finger also steers continuously — pointermove re-checks the delta
  // from the last *accepted* point (not the original touchdown) so a single
  // held drag can chain several turns (e.g. right then up) without lifting.
  useEffect(() => {
    const el = arenaRef.current
    if (!el || !enabled) return
    const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
    const THRESHOLD = 16
    const dirFromDelta = (dx, dy) => (
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    )
    const onDown = (e) => {
      touchStart.current = { x: e.clientX, y: e.clientY }
      anchorRef.current = { x: e.clientX, y: e.clientY }
      movedRef.current = false
    }
    const onMove = (e) => {
      if (!touchStart.current || !anchorRef.current) return
      const dx = e.clientX - anchorRef.current.x
      const dy = e.clientY - anchorRef.current.y
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return
      const dir = dirFromDelta(dx, dy)
      if (!(currentRef.current && OPPOSITE[currentRef.current] === dir)) {
        pendingRef.current = dir
      }
      // Re-anchor so the next hold-drag delta is measured from here.
      anchorRef.current = { x: e.clientX, y: e.clientY }
      movedRef.current = true
    }
    const onUp = (e) => {
      const start = touchStart.current
      touchStart.current = null
      anchorRef.current = null
      if (movedRef.current) { movedRef.current = false; return } // already steered via pointermove
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return
      const dir = dirFromDelta(dx, dy)
      if (currentRef.current && OPPOSITE[currentRef.current] === dir) return
      pendingRef.current = dir
    }
    const onCancel = () => { touchStart.current = null; anchorRef.current = null; movedRef.current = false }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
    }
  }, [arenaRef, enabled])

  // Read and clear the pending direction. The caller passes the snake's
  // current direction so we can guard against 180° reversals here too.
  const getDir = (currentDir) => {
    const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return null
    if (currentDir && OPPOSITE[currentDir] === pending) return null
    currentRef.current = pending
    return pending
  }

  return { getDir }
}
