import { useCallback, useEffect, useRef } from 'react'
import useGameKeys from './useGameKeys'

// ANIMAL STACK touch + keyboard controls.
//  - Relative drag anywhere on the arena moves the piece (the finger never
//    covers it); `ppmRef` converts screen px to metres.
//  - ROTATE: tap for one 15° step, hold to repeat every 140 ms after 380 ms.
//  - DROP is its own button — releasing a drag never drops.
//  - Keys (via useGameKeys, so chat typing is ignored): ←/→ aim, ↑/R rotate,
//    ↓ rotate back, Space/Enter drop.
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

  const rotateHandlers = {
    onPointerDown: (e) => {
      e.preventDefault()
      if (!enabled) return
      cb.current.onRotate(1)
      stopHold()
      const repeat = () => { cb.current.onRotate(1); hold.current = setTimeout(repeat, 140) }
      hold.current = setTimeout(repeat, 380)
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    onContextMenu: (e) => e.preventDefault(),
  }

  useGameKeys((e) => {
    const { onAimDelta: aim, onRotate: rot, onDrop: drop } = cb.current
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { aim(-0.1); return true }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { aim(0.1); return true }
    if (e.key === 'ArrowUp' || e.key === 'r' || e.key === 'R') { rot(1); return true }
    if (e.key === 'ArrowDown') { rot(-1); return true }
    if (e.key === ' ' || e.key === 'Enter') { if (!e.repeat) drop(); return true }
    return false
  }, { enabled })

  return { arenaHandlers, rotateHandlers }
}
