// Tilt steering for SIDE KICK: phone orientation in, a steer value in [-1, 1] out.
// Pure maths, no DOM. The sensor, the permission and the storage are in
// tiltSensor.js; the pad and the sim read the result through useSideKickControls.
//
// The lean is the sideways pull of gravity on the screen, so it means the same
// thing whether the phone is held upright and turned like a steering wheel or
// laid back and rolled, and it has no gimbal lock when the phone stands up
// (beta near 90), which the raw gamma angle does.

export const TILT_DEAD = 2.5      // degrees either side of neutral that do nothing
export const TILT_FULL = 18       // degrees from neutral for full lock
export const TILT_TAU = 0.06      // seconds: smoothing of the steer value
export const TILT_CAL_TAU = 0.2   // seconds: how fast neutral follows the phone while calibrating

const RAD = Math.PI / 180
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/**
 * Lean in degrees, positive = steer right. `beta` / `gamma` are the DeviceOrientation angles,
 * `screenAngle` is screen.orientation.angle (0, 90, 180, 270). Null when the phone gave no reading.
 */
export function leanDeg(beta, gamma, screenAngle = 0) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null
  // Gravity ("up") in the device frame, from the W3C Z-X'-Y'' rotation order.
  const ux = -Math.sin(gamma * RAD) * Math.cos(beta * RAD)
  const uy = Math.sin(beta * RAD)
  const a = ((Math.round(screenAngle / 90) % 4) + 4) % 4
  // Its horizontal component on the screen as the player sees it.
  const sx = a === 0 ? ux : a === 1 ? -uy : a === 2 ? -ux : uy
  return Math.asin(clamp(-sx, -1, 1)) / RAD
}

/** Dead zone, then a linear ramp to full lock. */
export function steerFromDelta(deg) {
  const m = Math.abs(deg)
  if (m <= TILT_DEAD) return 0
  return Math.sign(deg) * clamp((m - TILT_DEAD) / (TILT_FULL - TILT_DEAD), 0, 1)
}

/** @returns {{ raw: number|null, neutral: number|null, steer: number }} */
export function newTilt() {
  return { raw: null, neutral: null, steer: 0 }
}

/** Take the pose the phone is in now as straight ahead. */
export function tiltRecenter(t) {
  t.neutral = t.raw
  t.steer = 0
}

/**
 * Advance by `dt` seconds. While `calibrating` (the countdown) neutral follows the phone and the
 * steer is zero, so at GO straight ahead is wherever the player is holding it. Returns the steer.
 */
export function tiltUpdate(t, dt, calibrating) {
  if (t.raw == null) return 0
  if (t.neutral == null) t.neutral = t.raw
  let target = 0
  if (calibrating) t.neutral += (t.raw - t.neutral) * (1 - Math.exp(-dt / TILT_CAL_TAU))
  else target = steerFromDelta(t.raw - t.neutral)
  t.steer += (target - t.steer) * (1 - Math.exp(-dt / TILT_TAU))
  if (Math.abs(t.steer) < 0.001) t.steer = 0
  return t.steer
}
