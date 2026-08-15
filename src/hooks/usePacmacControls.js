import { useCallback, useEffect, useRef } from 'react'

// 4-way PAC MAC steering. Reverse is legal (unlike Snake/Tron). Edge-triggered
// keys plus hold-to-steer swipe so a maze can be cornered without lifting.
export function usePacmacControls(arenaRef, enabled = true) {
  const pendingRef = useRef(null)
  const touchStart = useRef(null)
  const anchorRef = useRef(null)
  const movedRef = useRef(false)

  const heldRef = useRef(new Set())
  useEffect(() => {
    if (!enabled) return
    const KEY_MAP = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    }
    const keyToDir = (k) => KEY_MAP[k] ?? null
    const onDown = (e) => {
      const dir = keyToDir(e.key)
      if (!dir) return
      e.preventDefault()
      heldRef.current.add(e.key)
      pendingRef.current = dir
    }
    const onUp = (e) => {
      heldRef.current.delete(e.key)
      // if still holding another direction, keep steering that way
      for (const k of [...heldRef.current].reverse()) {
        const d = keyToDir(k)
        if (d) { pendingRef.current = d; return }
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [enabled])

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

  const getDir = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    return pending
  }, [])

  return { getDir }
}
