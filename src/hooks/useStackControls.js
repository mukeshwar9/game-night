import { useCallback, useEffect, useRef } from 'react'
import useGameKeys from './useGameKeys'

// ANIMAL STACK touch + keyboard controls.
//  - Relative drag anywhere on the arena moves the piece (the finger never
//    covers it); `ppmRef` converts screen px to metres.
//  - ⟲ / ⟳: tap for one 15° step either way, hold to repeat every 140 ms
//    after 380 ms.
//  - DROP is its own button — releasing a drag never drops.
//  - Keys (via useGameKeys, so chat typing is ignored): ←/→ aim, ↑/R rotate,
//    ↓ rotate back, Space/Enter drop. Off-turn, Space/arrows pressed on the
//    page body are swallowed so they do not scroll the tower away.
export default function useStackControls({ enabled, ppmRef, onAimDelta, onRotate, onDrop }) {
  const drag = useRef(null)
  const hold = useRef(0)
  const cb = useRef({ onAimDelta, onRotate, onDrop })
  useEffect(() => { cb.current = { onAimDelta, onRotate, onDrop } })

  const stopHold = useCallback(() => { clearTimeout(hold.current); hold.current = 0 }, [])
  useEffect(() => { if (!enabled) { stopHold(); drag.current = null } }, [enabled, stopHold])
  useEffect(() => stopHold, [stopHold])

  const arenaHandlers = {
    onPointerDown: (e) => {
      if (!enabled) return
      if (e.target.closest?.('button')) return
      drag.current = { id: e.pointerId, x: e.clientX }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    onPointerMove: (e) => {
      const d = drag.current
      if (!enabled || !d || d.id !== e.pointerId) return
      const ppm = ppmRef.current || 50
      cb.current.onAimDelta((e.clientX - d.x) / ppm)
      d.x = e.clientX
    },
    onPointerUp: () => { drag.current = null },
    onPointerCancel: () => { drag.current = null },
  }

  // ⟲ turns counter-clockwise (+1 step), ⟳ clockwise (-1 step).
  const startRotate = (e, dir) => {
    e.preventDefault()
    if (!enabled) return
    cb.current.onRotate(dir)
    stopHold()
    const repeat = () => { cb.current.onRotate(dir); hold.current = setTimeout(repeat, 140) }
    hold.current = setTimeout(repeat, 380)
  }
  const holdEnd = {
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    onContextMenu: (e) => e.preventDefault(),
  }
  const rotateHandlers = { onPointerDown: (e) => startRotate(e, 1), ...holdEnd }
  const rotateBackHandlers = { onPointerDown: (e) => startRotate(e, -1), ...holdEnd }

  useGameKeys((e) => {
    const { onAimDelta: aim, onRotate: rot, onDrop: drop } = cb.current
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { aim(-0.1); return true }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { aim(0.1); return true }
    if (e.key === 'ArrowUp' || e.key === 'r' || e.key === 'R') { rot(1); return true }
    if (e.key === 'ArrowDown') { rot(-1); return true }
    if (e.key === ' ' || e.key === 'Enter') { if (!e.repeat) drop(); return true }
    return false
  }, { enabled })

  // While someone else aims (or the drop settles), a player still mashing
  // Space/arrows would scroll the page away from the tower; swallow those
  // keys unless focus is on a control that needs them.
  useGameKeys((e) => (
    (e.key === ' ' || e.key.startsWith('Arrow')) && (e.target === document.body || e.target === document.documentElement)
  ), { enabled: !enabled })

  return { arenaHandlers, rotateHandlers, rotateBackHandlers }
}
