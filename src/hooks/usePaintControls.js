import { useCallback, useEffect, useRef } from 'react'

// Captures local Paint Turf direction input from keyboard (arrows + WASD)
// and touch swipe. Exposes getDir() → 'up'|'down'|'left'|'right'|null so the
// caller can feed the pure sim (host) or send the intent to the host (guest).
//
// Direction changes are edge-triggered: a keypress sets the pending direction
// once; the caller reads (and clears) it via getDir(). Unlike
// useTronControls/useSnakeControls, this hook deliberately does NOT carry the
// OPPOSITE-direction guard — Paint has no trail-collision risk (no body, no
// death-on-crash), so a 180° reversal (dart in, dart back out) is a
// legitimate tactic and must be accepted instantly.
export function usePaintControls(arenaRef, enabled = true) {
  const pendingRef = useRef(null)
  const touchStart = useRef(null)
  const anchorRef = useRef(null)
  const movedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const KEY_MAP = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    }

    const onDown = (e) => {
      const dir = KEY_MAP[e.key]
      if (!dir) return
      e.preventDefault()
      pendingRef.current = dir
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [enabled])

  // Hold-and-drag re-anchoring (mirrors usePacmacControls' pattern): a swipe
  // re-anchors every time it crosses THRESHOLD so a held drag keeps steering
  // continuously instead of firing once per discrete lift-and-reswipe
  // ("phantom turns") — and pointercancel (e.g. an OS gesture stealing the
  // pointer mid-drag) clears state instead of leaving a stale anchor.
  useEffect(() => {
    const el = arenaRef.current
    if (!el || !enabled) return
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
      pendingRef.current = dirFromDelta(dx, dy)
      anchorRef.current = { x: e.clientX, y: e.clientY }
      movedRef.current = true
    }
    const onUp = (e) => {
      const start = touchStart.current
      touchStart.current = null
      anchorRef.current = null
      if (movedRef.current) { movedRef.current = false; return }
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return
      pendingRef.current = dirFromDelta(dx, dy)
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

  // Memoized (deps: none — reads/writes refs only) so consumers that put
  // getDir in a dependency array stay stable and don't churn realtime loop
  // effects every render (mirrors useTronControls's stability fix).
  // `currentDir` is accepted (unused) to keep the call signature identical
  // to useTronControls/useSnakeControls's getDir(currentDir) — Paint just
  // never rejects a reversal against it (see the file-level note above).
  const getDir = useCallback((currentDir) => { // eslint-disable-line no-unused-vars
    const pending = pendingRef.current
    pendingRef.current = null
    return pending
  }, [])

  return { getDir }
}
