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

  useEffect(() => {
    const el = arenaRef.current
    if (!el || !enabled) return
    const onDown = (e) => { touchStart.current = { x: e.clientX, y: e.clientY } }
    const onUp = (e) => {
      if (!touchStart.current) return
      const dx = e.clientX - touchStart.current.x
      const dy = e.clientY - touchStart.current.y
      touchStart.current = null
      if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return
      let dir
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'
      else dir = dy > 0 ? 'down' : 'up'
      pendingRef.current = dir
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
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
