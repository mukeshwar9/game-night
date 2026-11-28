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
// `surface` is `{ el, toCourse(clientX, clientY) }`: the element that takes the
// pointer events and the map from client coordinates to course units. The 2D
// course builds it from its world <g> (svgSurface); the 3D view raycasts onto
// the turf plane. Null until the course has mounted.
//
// mode 'ball' (holes played from behind the ball): the aim is camera-relative.
// Drag sideways to turn it (the camera turns with it), pull down to set power,
// let go to putt; while pulling, sideways drag turns at about a quarter speed
// for fine aim. Dragging back up cancels. The angle persists between drags and
// starts at `angle0` whenever `resetKey` changes (a new ball position).

const PULL_FULL = 137
const DEAD_ZONE_PX = 12
const MIN_POWER = 0.04
const BALL_PULL_FULL = 0.32   // share of the surface height a full-power pull takes
const BALL_TURN = 0.0055      // rad per px of sideways drag
const BALL_TURN_FINE = 0.0012 // rad per px while pulling

/**
 * The surface of the 2D course: its world <g>'s getScreenCTM() maps client
 * coordinates to course units (and undoes the landscape rotation).
 * @param {SVGGraphicsElement | null | undefined} group
 */
export function svgSurface(group) {
  const el = group?.ownerSVGElement
  if (!group || !el) return null
  return {
    el,
    toCourse(clientX, clientY) {
      const m = group.getScreenCTM()
      if (!m) return null
      const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
      return { x: p.x, y: p.y }
    },
  }
}

export default function useGolfAim({ surface, enabled, onShoot, mode = 'pull', angle0 = -Math.PI / 2, resetKey = null }) {
  const [aim, setAim] = useState(null) // { angle, power, src: 'pull' | 'ball', key } | null
  const aimRef = useRef(null)
  const dragRef = useRef(null)
  const enabledRef = useRef(enabled)
  const onShootRef = useRef(onShoot)
  const optsRef = useRef({ mode, angle0, resetKey })
  useEffect(() => { enabledRef.current = enabled; onShootRef.current = onShoot; optsRef.current = { mode, angle0, resetKey } })

  const set = (next) => { aimRef.current = next; setAim(next) }
  // The ball-mode aim for the current ball position (read inside handlers).
  const ballAim = () => {
    const o = optsRef.current, cur = aimRef.current
    return cur && cur.src === 'ball' && cur.key === o.resetKey ? cur : { angle: o.angle0, power: 0, src: 'ball', key: o.resetKey }
  }

  // Drop any half-drawn drag when control is taken away (turn over, overlay);
  // the returned aim is already hidden while disabled.
  useEffect(() => {
    if (!enabled) { dragRef.current = null; aimRef.current = null }
  }, [enabled])

  useEffect(() => {
    if (!surface) return undefined
    const el = surface.el
    const toWorld = (e) => surface.toCourse(e.clientX, e.clientY)
    const down = (e) => {
      if (!enabledRef.current) return
      if (dragRef.current) { // second finger: cancel
        dragRef.current = null
        set(optsRef.current.mode === 'ball' ? { ...ballAim(), power: 0 } : null)
        return
      }
      if (optsRef.current.mode === 'ball') {
        try { el.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
        dragRef.current = { id: e.pointerId, sy: e.clientY, lastX: e.clientX, ball: true }
        e.preventDefault()
        return
      }
      const w = toWorld(e)
      if (!w) return
      try { el.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
      dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, w }
      e.preventDefault()
    }
    const move = (e) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id || !enabledRef.current) return
      if (d.ball) {
        const cur = ballAim()
        const dx = e.clientX - d.lastX
        d.lastX = e.clientX
        const power = Math.min(1, Math.max(0, e.clientY - d.sy) / Math.max(1, el.clientHeight * BALL_PULL_FULL))
        set({ ...cur, angle: cur.angle + dx * (power > 0.05 ? BALL_TURN_FINE : BALL_TURN), power })
        return
      }
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DEAD_ZONE_PX) { set(null); return }
      const w = toWorld(e)
      if (!w) return
      const vx = d.w.x - w.x, vy = d.w.y - w.y
      set({ angle: Math.atan2(vy, vx), power: Math.min(1, Math.hypot(vx, vy) / PULL_FULL), src: 'pull' })
    }
    const up = (e) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id) return
      dragRef.current = null
      if (d.ball) {
        const cur = ballAim()
        set({ ...cur, power: 0 })
        if (e.type === 'pointerup' && cur.power > MIN_POWER && enabledRef.current) onShootRef.current?.(cur.angle, cur.power)
        return
      }
      const a = aimRef.current
      set(null)
      if (e.type === 'pointerup' && a && a.power > MIN_POWER && enabledRef.current) onShootRef.current?.(a.angle, a.power)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [surface])

  useGameKeys((e) => {
    const k = e.key
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(k)) return false
    // Space/Enter on a focused button presses that button, not the putt.
    if ((k === ' ' || k === 'Enter') && e.target?.closest?.('button, a')) return false
    const ball = optsRef.current.mode === 'ball'
    const cur = ball ? ballAim() : aimRef.current?.src === 'pull' ? aimRef.current : { angle: -Math.PI / 2, power: 0.4, src: 'pull' }
    if (k === ' ' || k === 'Enter') {
      if (ball) {
        // Ball camera: ↑/↓ set the power first; a putt needs some.
        if (cur.power > MIN_POWER) { set({ ...cur, power: 0 }); onShootRef.current?.(cur.angle, cur.power) }
        return true
      }
      set(null)
      onShootRef.current?.(cur.angle, cur.power)
      return true
    }
    const next = { ...cur }
    if (k === 'ArrowLeft') next.angle -= 0.03
    if (k === 'ArrowRight') next.angle += 0.03
    if (k === 'ArrowUp') next.power = Math.min(1, next.power + 0.03)
    if (k === 'ArrowDown') next.power = Math.max(ball ? 0 : 0.05, next.power - 0.03)
    set(next)
    return true
  }, { enabled })

  if (!enabled) return null
  if (mode === 'ball') return aim && aim.src === 'ball' && aim.key === resetKey ? aim : { angle: angle0, power: 0, src: 'ball', key: resetKey }
  return aim && aim.src === 'pull' ? aim : null
}
