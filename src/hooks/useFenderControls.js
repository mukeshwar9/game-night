import { useCallback, useEffect, useRef } from 'react'
import { shouldIgnoreGameKey } from '../lib/keyGuard'

// Thumb pads for Fender Bender: one floating stick per seat, so several people
// can drive one phone at once. The stick starts wherever the thumb lands and
// the car follows the thumb's direction on screen; a quick tap (no drag) is the
// horn. Keyboard: arrows + Space, and WASD + F for a second seat.
//
//   bind(i)      → pointer handlers to spread on seat i's pad element
//   getInput(i)  → { x, y, hq }  stick in [-1, 1]; `hq` is a horn press counter
//                  the sim applies once per value, so resent packets cannot honk twice
//   getKnob(i)   → { x, y, held } for drawing the stick
//
// `keymap` maps a seat to a key scheme: 'arrows', 'wasd' or 'both'.
const FULL = 34           // px of drag for full deflection
const TAP_MS = 220
const TAP_SLOP = 9
const SCHEMES = {
  arrows: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], horn: [' '] },
  wasd: { left: ['a'], right: ['d'], up: ['w'], down: ['s'], horn: ['f'] },
}
SCHEMES.both = Object.fromEntries(Object.keys(SCHEMES.arrows).map((k) => [k, [...SCHEMES.arrows[k], ...SCHEMES.wasd[k]]]))

const blank = () => ({ id: null, ox: 0, oy: 0, x: 0, y: 0, t0: 0, moved: 0, hq: 0 })

export function useFenderControls({ count = 2, keymap = { 0: 'both' }, enabled = true } = {}) {
  const pads = useRef([blank(), blank(), blank(), blank()])
  const keys = useRef(new Set())
  const keyHq = useRef([0, 0, 0, 0])
  const keymapRef = useRef(keymap)
  useEffect(() => { keymapRef.current = keymap })
  const enabledRef = useRef(enabled)
  useEffect(() => { enabledRef.current = enabled })

  const reset = useCallback(() => {
    pads.current = [blank(), blank(), blank(), blank()]
    keys.current.clear()
  }, [])

  useEffect(() => {
    if (!enabled) { keys.current.clear(); return }
    const norm = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key)
    const owned = (k) => Object.values(keymapRef.current).some((scheme) => Object.values(SCHEMES[scheme]).some((list) => list.includes(k)))
    const down = (e) => {
      if (shouldIgnoreGameKey(e)) return
      const k = norm(e)
      if (!owned(k)) return
      // Space on a focused button is that button's own activation.
      if (k === ' ' && e.target?.closest?.('button, a, [role="button"]')) return
      e.preventDefault()
      if (e.repeat) return
      keys.current.add(k)
      for (const [seat, scheme] of Object.entries(keymapRef.current)) {
        if (SCHEMES[scheme].horn.includes(k)) keyHq.current[seat] += 1
      }
    }
    const up = (e) => { keys.current.delete(norm(e)) }
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [enabled])

  const bind = useCallback((i) => ({
    onPointerDown: (e) => {
      const p = pads.current[i]
      if (!enabledRef.current || p.id !== null) return
      e.preventDefault()
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
      p.id = e.pointerId; p.ox = e.clientX; p.oy = e.clientY; p.t0 = performance.now(); p.moved = 0; p.x = 0; p.y = 0
    },
    onPointerMove: (e) => {
      const p = pads.current[i]
      if (e.pointerId !== p.id) return
      const dx = e.clientX - p.ox
      const dy = e.clientY - p.oy
      p.moved = Math.max(p.moved, Math.hypot(dx, dy))
      let x = dx / FULL
      let y = dy / FULL
      const m = Math.hypot(x, y)
      if (m > 1) { x /= m; y /= m }
      p.x = x; p.y = y
    },
    onPointerUp: (e) => {
      const p = pads.current[i]
      if (e.pointerId !== p.id) return
      if (performance.now() - p.t0 < TAP_MS && p.moved < TAP_SLOP) p.hq += 1
      p.id = null; p.x = 0; p.y = 0
    },
    onPointerCancel: (e) => {
      const p = pads.current[i]
      if (e.pointerId !== p.id) return
      p.id = null; p.x = 0; p.y = 0
    },
  }), [])

  const getInput = useCallback((i) => {
    const p = pads.current[i]
    let x = p.x
    let y = p.y
    const scheme = SCHEMES[keymapRef.current[i]]
    if (scheme && enabledRef.current) {
      const has = (list) => list.some((k) => keys.current.has(k))
      x += (has(scheme.right) ? 1 : 0) - (has(scheme.left) ? 1 : 0)
      y += (has(scheme.down) ? 1 : 0) - (has(scheme.up) ? 1 : 0)
    }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), hq: p.hq + keyHq.current[i] }
  }, [])

  const getKnob = useCallback((i) => {
    const p = pads.current[i]
    return { x: p.x, y: p.y, held: p.id !== null }
  }, [])

  return { bind, getInput, getKnob, reset, count }
}
