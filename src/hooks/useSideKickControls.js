import { useCallback, useEffect, useMemo, useRef } from 'react'
import { shouldIgnoreGameKey } from '../lib/keyGuard'

// Thumb controls for SIDE KICK. Left thumb: two STEER buttons (hold). Right
// thumb: KICK L and KICK R (tap), with BOOST between (hold). Throttle is
// automatic. Buttons are plain pointer targets, so steer and kick work together
// under multi-touch. Keyboard: arrows steer, A / Z kick left, D / X kick right,
// Space / ArrowUp / W boost.
//
//   bind.steer(-1|1), bind.boost, bind.kick(-1|1) → handlers to spread on a button
//   getInput → { steer, kick, boost } from buttons + keys: the live object the sim
//              reads each step (the sim clears `kick` once it has taken it)
const KEYS = {
  left: ['ArrowLeft'], right: ['ArrowRight'],
  boost: [' ', 'ArrowUp', 'w'],
  kickL: ['a', 'z'], kickR: ['d', 'x'],
}
const norm = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key)

export function useSideKickControls({ enabled = true } = {}) {
  const input = useRef({ steer: 0, kick: 0, boost: false })
  const held = useRef({ l: false, r: false, boost: false })
  const keys = useRef(new Set())
  const enabledRef = useRef(enabled)
  useEffect(() => { enabledRef.current = enabled })

  const reset = useCallback(() => {
    held.current = { l: false, r: false, boost: false }
    keys.current.clear()
    input.current.steer = 0; input.current.kick = 0; input.current.boost = false
  }, [])

  useEffect(() => {
    if (!enabled) { keys.current.clear(); return undefined }
    const owned = (k) => Object.values(KEYS).some((list) => list.includes(k))
    const down = (e) => {
      if (shouldIgnoreGameKey(e)) return
      const k = norm(e)
      if (!owned(k)) return
      // Space on a focused button is that button's own activation.
      if (k === ' ' && e.target?.closest?.('button, a, [role="button"]')) return
      e.preventDefault()
      if (e.repeat) return
      keys.current.add(k)
      if (KEYS.kickL.includes(k)) input.current.kick = -1
      else if (KEYS.kickR.includes(k)) input.current.kick = 1
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

  // A button held by a pointer: down sets it, up / cancel / leave clears it.
  const holdHandlers = useCallback((key) => ({
    onPointerDown: (e) => {
      if (!enabledRef.current) return
      e.preventDefault()
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
      held.current[key] = true
      e.currentTarget.dataset.down = '1'
    },
    onPointerUp: (e) => { held.current[key] = false; delete e.currentTarget.dataset.down },
    onPointerCancel: (e) => { held.current[key] = false; delete e.currentTarget.dataset.down },
    onLostPointerCapture: (e) => { held.current[key] = false; delete e.currentTarget.dataset.down },
    onContextMenu: (e) => e.preventDefault(),
  }), [])

  const bind = useMemo(() => ({
    steer: (side) => holdHandlers(side < 0 ? 'l' : 'r'),
    boost: holdHandlers('boost'),
    kick: (side) => ({
      onPointerDown: (e) => {
        if (!enabledRef.current) return
        e.preventDefault()
        input.current.kick = side
        const el = e.currentTarget
        el.dataset.down = '1'
        setTimeout(() => { delete el.dataset.down }, 120)
      },
      onContextMenu: (e) => e.preventDefault(),
    }),
  }), [holdHandlers])

  const getInput = useCallback(() => {
    const has = (list) => list.some((k) => keys.current.has(k))
    const i = input.current
    const on = enabledRef.current
    const l = held.current.l || has(KEYS.left)
    const r = held.current.r || has(KEYS.right)
    i.steer = on ? (r ? 1 : 0) - (l ? 1 : 0) : 0
    i.boost = on && (held.current.boost || has(KEYS.boost))
    return i
  }, [])

  return { getInput, bind, reset }
}
