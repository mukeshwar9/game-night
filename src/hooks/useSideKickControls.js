import { useCallback, useEffect, useMemo, useRef } from 'react'
import { shouldIgnoreGameKey } from '../lib/keyGuard'
import { DT } from '../lib/sideKickLogic'
import { tiltRecenter, tiltUpdate } from '../lib/tiltLogic'
import { tiltState } from '../lib/tiltSensor'
import { getPrefs } from '../lib/sideKickPrefs'
import { useSideKickPrefs, useTilt } from './useSideKickPrefs'

// Controls for SIDE KICK. Steering is the phone's tilt where the phone has a
// working sensor (the default there), else two STEER buttons (hold). Right
// thumb: KICK L and KICK R (tap), and BOOST (tap: one tap spends the whole
// meter). Throttle is automatic. Buttons are plain pointer targets, so steer
// and kick work together under multi-touch. Keyboard: arrows steer, A / Z kick
// left, D / X kick right, Space / ArrowUp / W boost, C switches camera. A pressed steer button or
// key always wins over the tilt.
//
//   bind.steer(-1|1), bind.boost, bind.kick(-1|1) → handlers to spread on a button
//   getInput(world) → { steer, kick, boost } from tilt + buttons + keys: the live object
//              the sim reads each step (the sim clears `kick` and `boost` once it has
//              taken them). The countdown is when straight ahead is learned for tilt.
//   tilt → { on, status, recenter } for the pad and the permission button
const KEYS = {
  left: ['ArrowLeft'], right: ['ArrowRight'],
  boost: [' ', 'ArrowUp', 'w'],
  kickL: ['a', 'z'], kickR: ['d', 'x'],
  cam: ['c'],
}
const norm = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key)

export function useSideKickControls({ enabled = true } = {}) {
  const input = useRef({ steer: 0, kick: 0, boost: false })
  const held = useRef({ l: false, r: false })
  const keys = useRef(new Set())
  const enabledRef = useRef(enabled)
  const [prefs, setPrefs] = useSideKickPrefs()
  const sensor = useTilt(prefs.steer === 'tilt')
  const tiltOn = prefs.steer === 'tilt' && sensor.status === 'live'
  const tiltOnRef = useRef(tiltOn)
  useEffect(() => { enabledRef.current = enabled; tiltOnRef.current = tiltOn })

  const reset = useCallback(() => {
    held.current = { l: false, r: false }
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
      else if (KEYS.boost.includes(k)) input.current.boost = true
      else if (KEYS.cam.includes(k)) setPrefs({ cam: getPrefs().cam === 'first' ? 'chase' : 'first' })
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
  }, [enabled, setPrefs])

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
    boost: {
      onPointerDown: (e) => {
        if (!enabledRef.current) return
        e.preventDefault()
        input.current.boost = true
        const el = e.currentTarget
        el.dataset.down = '1'
        setTimeout(() => { delete el.dataset.down }, 120)
      },
      onContextMenu: (e) => e.preventDefault(),
    },
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

  const getInput = useCallback((world) => {
    const has = (list) => list.some((k) => keys.current.has(k))
    const i = input.current
    const on = enabledRef.current
    const l = held.current.l || has(KEYS.left)
    const r = held.current.r || has(KEYS.right)
    const pressed = (r ? 1 : 0) - (l ? 1 : 0)
    let steer = pressed
    if (tiltOnRef.current) {
      // During the countdown straight ahead follows how the phone is held; at GO it is fixed.
      const lean = tiltUpdate(tiltState(), DT, !on || world?.phase === 'count')
      if (!pressed) steer = lean
    }
    i.steer = on ? steer : 0
    if (!on) i.boost = false
    return i
  }, [])

  const tilt = useMemo(() => ({
    on: tiltOn,
    status: sensor.status,
    recenter: () => tiltRecenter(tiltState()),
  }), [tiltOn, sensor.status])

  return { getInput, bind, reset, tilt }
}
