import { useCallback, useEffect, useRef } from 'react'

// Captures local Tron cycle direction input from keyboard (arrows + WASD)
// and touch swipe. Exposes getDir() → 'up'|'down'|'left'|'right'|null so the
// caller can feed the pure sim (host) or send the intent to the host (guest).
//
// Direction changes are edge-triggered: a keypress sets the pending direction
// once; the caller reads (and clears) it via getDir(). This prevents a held
// key from spamming direction changes every frame and avoids the 180° reversal
// issue (the sim validates, but we also guard here).
export function useTronControls(arenaRef, enabled = true) {
  const pendingRef = useRef(null)
  const currentRef = useRef(null)
  const touchStart = useRef(null)

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
      const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
      if (currentRef.current && OPPOSITE[currentRef.current] === dir) return
      pendingRef.current = dir
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
    }
  }, [arenaRef, enabled])

  // Memoized (deps: none — reads/writes refs only) so consumers that put getDir
  // in a dependency array (TronGame's readHostInput / guestTick) stay stable and
  // don't churn the realtime loop effects every render.
  const getDir = useCallback((currentDir) => {
    const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return null
    if (currentDir && OPPOSITE[currentDir] === pending) return null
    currentRef.current = pending
    return pending
  }, [])

  return { getDir }
}
