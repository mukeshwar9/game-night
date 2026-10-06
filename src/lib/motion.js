// @ts-check
// The motion system (.claude/rules/motion-rules.md): duration and easing
// tokens, spring presets per platform, and the small spring solver that
// gesture-driven UI (sheets, page drags, press release) runs on. The CSS side
// of the same tokens lives in src/index.css (--dur-*, --ease-*, --spring-*);
// motion.test.js checks that the CSS spring curves match the presets here.
//
// Two grammars, one rule: what a finger or the system moves (sheets, pages,
// presses) uses springs that keep velocity; what the game announces (pieces,
// stamps, loaders) may use the pixel steps() grammar. Reduced motion swaps
// movement for a short crossfade rather than removing the cue.

import { nativePlatform } from './platform'

/** Durations in ms. */
export const DUR = Object.freeze({ press: 80, fast: 150, base: 220, page: 300 })

/** Cubic-bezier easings (Material 3 standard / emphasized). */
export const EASE = Object.freeze({
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
})

/** @typedef {{ k: number, z: number }} Spring stiffness (mass 1) and damping ratio */
/** @typedef {'ios' | 'android' | 'web'} MotionPlatform */
/** @typedef {'page' | 'sheet' | 'press' | 'pop'} SpringRole */

// iOS values are SwiftUI's presets converted with k = (2π / duration)² and
// ζ = 1 - bounce (.smooth 0.5 s, .snappy 0.4 s / 0.1). Android values are the
// Material 3 spring tokens (AndroidX StandardMotionTokens /
// ExpressiveMotionTokens).
/** @type {Readonly<Record<MotionPlatform, Readonly<Record<SpringRole, Spring>>>>} */
export const SPRINGS = Object.freeze({
  ios: Object.freeze({ page: { k: 158, z: 1 }, sheet: { k: 247, z: 0.9 }, press: { k: 700, z: 0.6 }, pop: { k: 500, z: 0.55 } }),
  android: Object.freeze({ page: { k: 700, z: 0.9 }, sheet: { k: 700, z: 0.9 }, press: { k: 1400, z: 0.9 }, pop: { k: 800, z: 0.6 } }),
  web: Object.freeze({ page: { k: 380, z: 1 }, sheet: { k: 380, z: 0.95 }, press: { k: 900, z: 0.7 }, pop: { k: 500, z: 0.6 } }),
})

/**
 * Which preset family applies: the native shell's platform, else the web.
 * @param {string | null} [native]
 * @returns {MotionPlatform}
 */
export function motionPlatform(native = nativePlatform) {
  return native === 'ios' || native === 'android' ? native : 'web'
}

/**
 * @param {SpringRole} role
 * @param {MotionPlatform} [platform]
 * @returns {Spring}
 */
export function springPreset(role, platform = motionPlatform()) {
  return SPRINGS[platform][role]
}

/**
 * Advance a damped spring toward `target` by `dt` seconds (semi-implicit
 * Euler in sub-steps of at most 4 ms, so a dropped frame cannot blow it up).
 * @param {{ x: number, v: number }} state position and velocity (units per second)
 * @param {number} target
 * @param {Spring} spring
 * @param {number} dt seconds
 * @returns {{ x: number, v: number }}
 */
export function stepSpring(state, target, spring, dt) {
  const c = 2 * spring.z * Math.sqrt(spring.k)
  let { x, v } = state
  const n = Math.max(1, Math.ceil(dt / 0.004))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    const a = -spring.k * (x - target) - c * v
    v += a * h
    x += v * h
  }
  return { x, v }
}

/**
 * True once the spring is within `eps` of its target and nearly still.
 * @param {{ x: number, v: number }} state
 * @param {number} target
 * @param {number} eps distance in the spring's units
 */
export function isSettled(state, target, eps) {
  return Math.abs(state.x - target) <= eps && Math.abs(state.v) <= eps * 10
}

/**
 * A spring from 0 to 1 sampled into a CSS `linear()` easing and the duration
 * it needs, for CSS transitions and Web Animations that should feel like the
 * JS spring. Settles at `eps` (0.005 = within half a percent).
 * @param {Spring} spring
 * @param {{ points?: number, eps?: number }} [opts]
 * @returns {{ easing: string, durationMs: number }}
 */
export function springLinear(spring, { points = 16, eps = 0.005 } = {}) {
  const dt = 1 / 1000
  let state = { x: 0, v: 0 }
  /** @type {number[]} */
  const xs = [0]
  let t = 0
  while (t < 3) {
    state = stepSpring(state, 1, spring, dt)
    t += dt
    xs.push(state.x)
    if (isSettled(state, 1, eps)) break
  }
  const steps = xs.length - 1
  const out = []
  for (let i = 0; i <= points; i++) {
    const v = i === points ? 1 : xs[Math.round((i / points) * steps)]
    out.push(Number(v.toFixed(3)))
  }
  return { easing: `linear(${out.join(', ')})`, durationMs: Math.round(t * 100) * 10 }
}

/**
 * Release velocity (units per second) from recent [position, timeMs] samples,
 * using the oldest sample within the last 100 ms. 0 with too few samples.
 * @param {Array<[number, number]>} samples
 */
export function releaseVelocity(samples) {
  if (samples.length < 2) return 0
  const [x1, t1] = samples[samples.length - 1]
  let i = samples.length - 2
  while (i > 0 && t1 - samples[i - 1][1] <= 100) i--
  const [x0, t0] = samples[i]
  return t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0
}

/**
 * iOS-style rubber band: dragging past an edge by `overshoot` moves the
 * surface less and less, approaching `dimension * c` (UIScrollView's curve).
 * @param {number} overshoot distance past the edge (>= 0)
 * @param {number} dimension size of the surface in the drag axis
 * @param {number} [c]
 */
export function rubberBand(overshoot, dimension, c = 0.55) {
  if (overshoot <= 0 || dimension <= 0) return 0
  return (1 - 1 / ((overshoot * c) / dimension + 1)) * dimension
}

/**
 * Whether a drag-to-dismiss surface should close on release: far enough, or
 * flicked fast enough in the closing direction.
 * @param {number} travel distance dragged toward closing (px)
 * @param {number} velocity px/s, positive toward closing
 * @param {number} size the surface's size in the drag axis (px)
 */
export function shouldDismiss(travel, velocity, size) {
  if (velocity > 600) return true
  if (velocity < -300) return false
  return travel > Math.min(size * 0.35, 160)
}

/**
 * How long to hold a press state after release so even a very quick tap shows
 * a visible dip.
 * @param {number} heldMs
 * @param {number} [minMs]
 */
export function pressReleaseDelay(heldMs, minMs = 70) {
  return Math.max(0, Math.round(minMs - heldMs))
}

/**
 * Drive a spring on animation frames. Returns a handle whose value and
 * velocity can be read to hand the motion over to a gesture (or another
 * spring) without a jump.
 * @param {{ from: number, to: number, velocity?: number, spring: Spring, eps?: number,
 *   onUpdate: (x: number) => void, onDone?: () => void }} opts
 */
export function animateSpring({ from, to, velocity = 0, spring, eps = 0.5, onUpdate, onDone }) {
  let state = { x: from, v: velocity }
  let last = performance.now()
  let frame = 0
  let stopped = false
  /** @param {number} now */
  const tick = (now) => {
    if (stopped) return
    const dt = Math.min(0.064, Math.max(0, (now - last) / 1000))
    last = now
    state = stepSpring(state, to, spring, dt)
    if (isSettled(state, to, eps)) {
      state = { x: to, v: 0 }
      onUpdate(to)
      stopped = true
      onDone?.()
      return
    }
    onUpdate(state.x)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return {
    stop() { stopped = true; cancelAnimationFrame(frame) },
    get value() { return state.x },
    get velocity() { return state.v },
  }
}
