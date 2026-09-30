import { useCallback, useEffect, useRef, useState } from 'react'
import { shouldIgnoreGameKey } from '../lib/keyGuard'
import { WORLD_W, dragInput, tiltInput } from '../lib/updraftLogic'

// Steering for UPDRAFT — one horizontal axis, jumping is automatic.
//
//   • Drag (default): a finger anywhere on `touchRef` (the arena plus its
//     thumb band) sets a target x read against the arena's rect; the hopper
//     chases it. Only active while pressed, so a resting mouse never steers.
//   • Keys: ←/→ or A/D, held. Typing into the room chat is left alone
//     (keyGuard), and only those keys are prevented.
//   • Tilt (opt-in, remembered per device): the phone's roll steers. iOS
//     needs DeviceOrientationEvent.requestPermission() from a tap, which
//     `setTilt(true)` makes when it is called from the toggle's click.
//
// `readInput(run)` → [-1, 1] for the sim; the most recent source wins.
const TILT_KEY = 'updraft-tilt'

function readTiltPref() {
  try { return localStorage.getItem(TILT_KEY) === '1' } catch { return false }
}

export const tiltSupported = () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  && !!window.matchMedia?.('(pointer: coarse)').matches

export function useUpdraftControls(arenaRef, touchRef, enabled = true) {
  const keys = useRef({ l: false, r: false })
  const target = useRef(null)          // world x while dragging, else null
  const gamma = useRef(null)
  const [tilt, setTiltState] = useState(() => tiltSupported() && readTiltPref())

  useEffect(() => {
    if (!enabled) return
    const which = (k) => (k === 'ArrowLeft' || k === 'a' || k === 'A' ? 'l'
      : k === 'ArrowRight' || k === 'd' || k === 'D' ? 'r' : null)
    const onDown = (e) => {
      if (shouldIgnoreGameKey(e)) return
      const w = which(e.key)
      if (!w) return
      keys.current[w] = true
      target.current = null
      e.preventDefault()
    }
    const onUp = (e) => {
      const w = which(e.key)
      if (w) keys.current[w] = false
    }
    const clear = () => { keys.current = { l: false, r: false }; target.current = null }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
      clear()
    }
  }, [enabled])

  useEffect(() => {
    const el = touchRef.current
    if (!el || !enabled) return
    let pointer = null
    const setFrom = (e) => {
      const rect = arenaRef.current?.getBoundingClientRect()
      if (!rect?.width) return
      target.current = Math.max(0, Math.min(WORLD_W, ((e.clientX - rect.left) / rect.width) * WORLD_W))
    }
    const down = (e) => {
      if (e.target.closest?.('button, a')) return
      pointer = e.pointerId
      el.setPointerCapture?.(e.pointerId)
      setFrom(e)
      e.preventDefault()
    }
    const move = (e) => { if (e.pointerId === pointer) setFrom(e) }
    const up = (e) => {
      if (e.pointerId !== pointer) return
      pointer = null
      target.current = null
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
      target.current = null
    }
  }, [enabled, arenaRef, touchRef])

  useEffect(() => {
    if (!tilt || !enabled) return
    const onTilt = (e) => { gamma.current = e.gamma }
    window.addEventListener('deviceorientation', onTilt)
    return () => {
      window.removeEventListener('deviceorientation', onTilt)
      gamma.current = null
    }
  }, [tilt, enabled])

  // Call from a click handler: the iOS permission prompt needs the gesture.
  const setTilt = useCallback(async (on) => {
    if (on) {
      const req = window.DeviceOrientationEvent?.requestPermission
      if (typeof req === 'function') {
        const answer = await req.call(window.DeviceOrientationEvent)
        if (answer !== 'granted') throw new Error('tilt permission denied')
      }
    }
    try { localStorage.setItem(TILT_KEY, on ? '1' : '0') } catch { /* ignore */ }
    setTiltState(on)
  }, [])

  const readInput = useCallback((run) => {
    if (target.current != null) return dragInput(target.current, run.x)
    const k = keys.current
    if (k.l !== k.r) return k.l ? -1 : 1
    if (tilt && gamma.current != null) return tiltInput(gamma.current)
    return 0
  }, [tilt])

  return { readInput, tilt, setTilt }
}
