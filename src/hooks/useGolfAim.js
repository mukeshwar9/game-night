import { useEffect, useRef, useState } from 'react'
import useGameKeys from './useGameKeys'

// Minigolf's pull-back putt.
//
// Touch down ANYWHERE on the course (not on the ball) and pull back: the shot
// goes the opposite way of the drag, so a ball at the top of the screen is
// aimed from the thumb zone at the bottom. Power = drag length ÷ PULL_FULL
// world units (38% of the course width). Dragging back inside the dead zone,
// a second finger, or a release under MIN_POWER cancels — never a wasted
// stroke. Keyboard: ←/→ aim, ↑/↓ power, Space/Enter putt.
//
// `worldRef` is the course's world <g>; its getScreenCTM() maps client
// coordinates to world units (and undoes the landscape rotation).

const PULL_FULL = 137
const DEAD_ZONE_PX = 12
const MIN_POWER = 0.04

export default function useGolfAim({ worldRef, enabled, onShoot, attachKey }) {
  const [aim, setAim] = useState(null) // { angle, power } | null
  const aimRef = useRef(null)
  const dragRef = useRef(null)
  const enabledRef = useRef(enabled)
  const onShootRef = useRef(onShoot)
  useEffect(() => { enabledRef.current = enabled; onShootRef.current = onShoot })

  const set = (next) => { aimRef.current = next; setAim(next) }

  // Drop any half-drawn drag when control is taken away (turn over, overlay);
  // the returned aim is already hidden while disabled.
  useEffect(() => {
    if (!enabled) { dragRef.current = null; aimRef.current = null }
  }, [enabled])

  useEffect(() => {
    const group = worldRef.current
    const svg = group?.ownerSVGElement
    if (!svg) return undefined
    const toWorld = (e) => {
      const m = group.getScreenCTM()
      if (!m) return null
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
      return { x: p.x, y: p.y }
    }
    const down = (e) => {
      if (!enabledRef.current) return
      if (dragRef.current) { // second finger: cancel
        dragRef.current = null
        set(null)
        return
      }
      const w = toWorld(e)
      if (!w) return
      try { svg.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
      dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, w }
      e.preventDefault()
    }
    const move = (e) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id || !enabledRef.current) return
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DEAD_ZONE_PX) { set(null); return }
      const w = toWorld(e)
      if (!w) return
      const vx = d.w.x - w.x, vy = d.w.y - w.y
      set({ angle: Math.atan2(vy, vx), power: Math.min(1, Math.hypot(vx, vy) / PULL_FULL) })
    }
    const up = (e) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id) return
      dragRef.current = null
      const a = aimRef.current
      set(null)
      if (e.type === 'pointerup' && a && a.power > MIN_POWER && enabledRef.current) onShootRef.current?.(a.angle, a.power)
    }
    svg.addEventListener('pointerdown', down)
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerup', up)
    svg.addEventListener('pointercancel', up)
    return () => {
      svg.removeEventListener('pointerdown', down)
      svg.removeEventListener('pointermove', move)
      svg.removeEventListener('pointerup', up)
      svg.removeEventListener('pointercancel', up)
    }
  }, [worldRef, attachKey])

  useGameKeys((e) => {
    const k = e.key
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(k)) return false
    // Space/Enter on a focused button presses that button, not the putt.
    if ((k === ' ' || k === 'Enter') && e.target?.closest?.('button, a')) return false
    const cur = aimRef.current ?? { angle: -Math.PI / 2, power: 0.4 }
    if (k === ' ' || k === 'Enter') {
      set(null)
      onShootRef.current?.(cur.angle, cur.power)
      return true
    }
    const next = { ...cur }
    if (k === 'ArrowLeft') next.angle -= 0.03
    if (k === 'ArrowRight') next.angle += 0.03
    if (k === 'ArrowUp') next.power = Math.min(1, next.power + 0.03)
    if (k === 'ArrowDown') next.power = Math.max(0.05, next.power - 0.03)
    set(next)
    return true
  }, { enabled })

  return enabled ? aim : null
}
