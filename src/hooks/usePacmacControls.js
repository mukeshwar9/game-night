import { useCallback, useEffect, useRef } from 'react'

const KEY_MAP = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
}

// Swipe distance (px) that counts as a direction. Small on purpose: a maze
// wants quick flicks, and the drag re-anchors so one finger can keep steering.
const SWIPE_PX = 14

// 4-way PAC MAC steering. Three inputs feed one pending direction:
//   • keys (arrows / WASD),
//   • swipes anywhere inside `zoneRef` (maze + pad) — hold-and-drag re-anchors
//     after each turn so a corridor can be cornered without lifting,
//   • `press(dir)` for on-screen d-pad buttons (fire on pointerdown).
// The sim keeps a turn queued until a junction allows it, so a direction is a
// one-shot edge: `getDir()` returns it once and clears it.
export function usePacmacControls(zoneRef, enabled = true) {
  const pendingRef = useRef(null)

  const press = useCallback((dir) => {
    if (enabled) pendingRef.current = dir
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const held = []
    const onDown = (e) => {
      const dir = KEY_MAP[e.key]
      if (!dir) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      if (!held.includes(e.key)) held.push(e.key)
      pendingRef.current = dir
    }
    const onUp = (e) => {
      const i = held.indexOf(e.key)
      if (i === -1) return
      held.splice(i, 1)
      // Still holding another direction: steer that way again.
      const last = held[held.length - 1]
      if (last) pendingRef.current = KEY_MAP[last]
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [enabled])

  useEffect(() => {
    const el = zoneRef.current
    if (!el || !enabled) return
    let anchor = null
    let pointerId = null
    const dirFromDelta = (dx, dy) => (
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    )
    const onDown = (e) => {
      if (pointerId !== null) return
      pointerId = e.pointerId
      anchor = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e) => {
      if (e.pointerId !== pointerId || !anchor) return
      const dx = e.clientX - anchor.x
      const dy = e.clientY - anchor.y
      if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return
      pendingRef.current = dirFromDelta(dx, dy)
      anchor = { x: e.clientX, y: e.clientY }
    }
    const onEnd = (e) => {
      if (e.pointerId !== pointerId) return
      pointerId = null
      anchor = null
    }
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
  }, [zoneRef, enabled])

  const getDir = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    return pending
  }, [])

  return { getDir, press }
}
