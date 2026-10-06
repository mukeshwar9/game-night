// @ts-check
// The spring solver and gesture helpers behind the motion system (motion.js
// holds the tokens and presets): sheets, drags and press release run on
// these. Imported only by lazily loaded code, so they stay out of the entry.

/** @typedef {import('./motion').Spring} Spring */

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
