// BIRDSEYE camera framing: pure maths, no DOM. The renderer
// (components/birdseye/birdseyeView.js) owns the live camera and its easing;
// this file holds the fixed framings and the checks that keep the sling, the
// pulled-back bird and the fort on screen on any canvas shape.
import { SLING } from './birdseyeCore'

const TAN14 = Math.tan(14 * Math.PI / 180)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * The resting 3/4 aim view, sitting nearly in the flight lane so the sling
 * lands at the horizontal centre of the canvas (a pulled-back bird then has
 * room on every side) and in the upper half (the pull travels down and toward
 * the camera).
 */
export const AIM_CAM = { pos: [-9, 4.5, 0.8], target: [15, 1.2, -1.2], fov: 54 }

/** How far the sling band stretches (metres) at full power, see birdState in the view. */
export const MAX_PULL = 1.3

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** Where world point `p` lands on a canvas of width/height `aspect`: x 0..1 left to right, y 0..1 top to bottom. Null behind the camera. */
export function projectToScreen(cam, aspect, p) {
  const f = norm(sub(cam.target, cam.pos))
  let r = cross(f, [0, 1, 0]); if (Math.hypot(r[0], r[1], r[2]) < 1e-6) r = [0, 0, 1]; r = norm(r)
  const u = cross(r, f), d = sub(p, cam.pos), z = dot(d, f)
  if (z <= 0.1) return null
  const F = 0.5 / Math.tan(cam.fov * Math.PI / 360)
  return [0.5 + F * dot(d, r) / z / aspect, 0.5 - F * dot(d, u) / z]
}

/** Position of the bird in the sling for a pull of angle `ang` (rad) and power `pow` 0..1. */
export function pulledBird(ang, pow) {
  const pull = MAX_PULL * pow
  return [SLING.x - Math.cos(ang) * pull, SLING.y - Math.sin(ang) * pull, 0]
}

/**
 * The classic side-on framing used by the SIDE camera. Framed by horizontal
 * span so a narrow phone canvas still sees what it should: the whole
 * sling-to-fort line while aiming (±25 m), the bird while it flies (±10 m),
 * the settled fort afterwards (±12 m).
 */
export function sideCamGoal({ phase, birdX = 0, fortX = 30, aspect = 0.7 }) {
  const resting = phase === 'aim' || phase === 'idle'
  const done = phase === 'done'
  const hw = done ? 12 : resting ? 25 : 10
  const z = Math.max(40, hw / (TAN14 * (aspect || 0.7)))
  const x = done ? clamp(fortX, 14, 40) : resting ? 21.5 : clamp(birdX + 4, 10, 37)
  // a settled fort sits high: the result panel covers the bottom
  const ty = done ? z * TAN14 * 0.1 : Math.max(4.5, z * TAN14 * 0.45)
  return { pos: [x, ty + 1, z], target: [x, ty, 0], fov: 28 }
}

/**
 * The picture-in-picture side view shown while CHASE or BEAK is the main
 * camera: a fixed window over the whole lane (sling to fort) with the ground
 * near the bottom edge, so the arc and where it meets the fort read at a glance.
 */
export function pipCamGoal(aspect = 1.7) {
  const hw = 24, x = 20
  const z = Math.max(34, hw / (TAN14 * (aspect || 1.7)))
  const ty = z * TAN14 * 0.72
  return { pos: [x, ty + 1, z], target: [x, ty, 0], fov: 28 }
}

/** Whether the side picture-in-picture is up: only behind CHASE/BEAK, while a shot is being aimed or flown. */
export function pipVisible({ cam, phase, peek = false }) {
  if (cam !== 'chase' && cam !== 'beak') return false
  if (phase === 'done' || phase === 'idle') return false
  if (phase === 'aim' && peek) return false // the main view is already side-on
  return true
}
