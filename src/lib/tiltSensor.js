// The phone's tilt sensor for SIDE KICK: availability, the iOS permission tap,
// and the live reading. One shared instance, so the permission button in the
// lobby and the controls in the race see the same state. The maths is in
// tiltLogic.js; this file is the browser side of it.
//
// status:
//   idle         nobody has asked yet
//   unsupported  not a touch device, or no reading ever arrived: steer by touch
//   prompt       iOS: needs a tap on a button (requestTilt) before readings flow
//   denied       the player said no: steer by touch
//   waiting      listening, no reading yet
//   live         readings are arriving

import { leanDeg, newTilt, tiltRecenter } from './tiltLogic'

export const WAIT_MS = 2500

const state = newTilt()
const listeners = new Set()
let status = 'idle'
let users = 0
let attached = false
let permitted = false
let waitTimer = 0

const set = (next) => {
  if (status === next) return
  status = next
  for (const fn of listeners) fn()
}

const needsPermission = () => typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function'
const screenAngle = () => globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0

/** A phone or tablet: a touch screen and an orientation sensor API. Desktops are touch/keyboard only. */
export function tiltSupported() {
  if (typeof globalThis.DeviceOrientationEvent === 'undefined') return false
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches } catch { return false }
}

const onOrientation = (e) => {
  const deg = leanDeg(e.beta, e.gamma, screenAngle())
  if (deg == null) return
  state.raw = deg
  if (status !== 'live') { clearTimeout(waitTimer); set('live') }
}
// Turning the phone to the other orientation changes what the angle means: straight ahead is re-learned.
const onTurn = () => { state.neutral = null }

function attach() {
  if (attached) return
  attached = true
  globalThis.addEventListener('deviceorientation', onOrientation)
  globalThis.screen?.orientation?.addEventListener?.('change', onTurn)
  set('waiting')
  clearTimeout(waitTimer)
  waitTimer = setTimeout(() => { if (status === 'waiting') set('unsupported') }, WAIT_MS)
}

function detach() {
  if (!attached) return
  attached = false
  clearTimeout(waitTimer)
  globalThis.removeEventListener('deviceorientation', onOrientation)
  globalThis.screen?.orientation?.removeEventListener?.('change', onTurn)
  state.raw = null; state.neutral = null; state.steer = 0
  if (status === 'waiting' || status === 'live') status = 'idle'
}

/** Begin listening (call stopTilt when done). On iOS this stops at `prompt` until requestTilt. */
export function startTilt() {
  users++
  if (users > 1 || attached) return
  if (!tiltSupported()) { set('unsupported'); return }
  if (needsPermission() && !permitted) { set('prompt'); return }
  attach()
}

export function stopTilt() {
  users = Math.max(0, users - 1)
  if (users === 0) detach()
}

/** Ask for the iOS permission. Must run inside a tap. Resolves true when readings may flow. */
export async function requestTilt() {
  if (!tiltSupported()) { set('unsupported'); return false }
  try {
    if (needsPermission()) {
      const res = await globalThis.DeviceOrientationEvent.requestPermission()
      if (res !== 'granted') { set('denied'); return false }
    }
    permitted = true
    if (users > 0) attach()
    return true
  } catch {
    set('denied')
    return false
  }
}

export const getTiltStatus = () => status
export const tiltState = () => state
export const recenterTilt = () => tiltRecenter(state)
export function subscribeTilt(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
