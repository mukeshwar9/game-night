// @ts-check
// SHORELINE theme: the pure half of the beach backdrop (BeachBackdrop.jsx) and
// of the surf ambience (musicAmbience.js). Shoreline shapes, the shared wave
// clock, and the surf/gull timing. No DOM, no WebAudio, no React.

/** The shoreline repeats every SHORE_TILE px, so a strip one tile wider than
 * the screen can slide left by exactly one tile and loop without a seam. */
export const SHORE_TILE = 390

/** One wave: runs up the sand for WASH_PEAK of the cycle, then drains back.
 * The CSS keyframes (index.css `beach-wash`) and the surf envelope share it. */
export const WASH_SECONDS = 7
export const WASH_PEAK = 0.42

/**
 * The shoreline's y at `x`: three sines whose wavelengths divide SHORE_TILE,
 * so shoreEdge(x) === shoreEdge(x + SHORE_TILE).
 * @param {number} x
 * @param {{ base: number, amp: number, phase?: number }} shape
 */
export function shoreEdge(x, { base, amp, phase = 0 }) {
  const k = 2 * Math.PI / SHORE_TILE
  return base + amp * (
    0.55 * Math.sin(3 * k * x + phase)
    + 0.3 * Math.sin(2 * k * x + phase * 1.7)
    + 0.15 * Math.sin(k * x + 0.6)
  )
}

const r1 = (/** @type {number} */ n) => Math.round(n * 10) / 10

/**
 * SVG paths for a strip of sea `width` px wide: `fill` covers the water from
 * the top edge down to the shoreline, `line` traces the shoreline for foam.
 * @param {{ width: number, base: number, amp: number, phase?: number, step?: number }} opts
 * @returns {{ fill: string, line: string }}
 */
export function shorePath({ width, base, amp, phase = 0, step = 6 }) {
  const pts = []
  for (let x = 0; x < width; x += step) pts.push([x, r1(shoreEdge(x, { base, amp, phase }))])
  pts.push([width, r1(shoreEdge(width, { base, amp, phase }))])
  const line = 'M' + pts.map(([x, y]) => `${x} ${y}`).join(' L')
  const fill = `M0 0 L${width} 0 ` + pts.slice().reverse().map(([x, y]) => `L${x} ${y}`).join(' ') + ' Z'
  return { fill, line }
}

/**
 * Foam bubbles along the shoreline, the same in every tile (deterministic, so
 * they loop with the strip): spray just past the foam line on the sand, or,
 * with `inWater`, just inside the water.
 * @param {{ width: number, base: number, amp: number, phase?: number, perTile?: number, seed?: number, inWater?: boolean }} opts
 * @returns {{ x: number, y: number, r: number }[]}
 */
export function foamBubbles({ width, base, amp, phase = 0, perTile = 14, seed = 7, inWater = false }) {
  let s = seed
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647
  const tile = []
  for (let i = 0; i < perTile; i++) {
    const x = (i / perTile) * SHORE_TILE + rand() * 20
    tile.push({ x, dy: 4 + rand() * 7, r: 1 + rand() * 1.6 })
  }
  const out = []
  for (let off = 0; off < width + SHORE_TILE; off += SHORE_TILE) {
    for (const b of tile) {
      const x = b.x + off
      if (x > width) continue
      out.push({ x: r1(x), y: r1(shoreEdge(b.x, { base, amp, phase }) + (inWater ? -b.dy : b.dy)), r: r1(b.r) })
    }
  }
  return out
}

/**
 * Seconds into the current wave at `ms` on the page clock (performance.now()).
 * The backdrop starts its CSS animation this far in (a negative delay), and
 * the surf schedules its swells from the same clock, so they stay in step.
 * @param {number} ms
 * @param {number} [period] seconds
 */
export function washPhase(ms, period = WASH_SECONDS) {
  const p = (ms / 1000) % period
  return p < 0 ? p + period : p
}

/**
 * The audio-clock time the next wave starts, given a matching pair of clock
 * readings (AudioContext.getOutputTimestamp: contextTime s, performanceTime ms).
 * @param {number} contextTime seconds
 * @param {number} performanceTime ms
 * @param {number} [period] seconds
 */
export function nextWaveAt(contextTime, performanceTime, period = WASH_SECONDS) {
  const into = washPhase(performanceTime, period)
  return into === 0 ? contextTime : contextTime + (period - into)
}

/**
 * One wave of surf as automation points, offsets in seconds from the wave's
 * start, scaled by the wave's `strength` (see waveStrength). Three layers:
 * `body` is the low rumble of the breaking water (gain + low-pass cutoff),
 * `wash` the mid-band rush of water running up the sand, a beat later, and
 * `fizz` the foam hiss that peaks as the water turns and drains. Every layer
 * ends where it began, so back-to-back waves join without a step.
 * @param {number} [period] seconds
 * @param {number} [strength] 1 is an average wave
 */
export function surfEnvelope(period = WASH_SECONDS, strength = 1) {
  const up = WASH_PEAK * period
  const s = strength
  return {
    body: [
      { at: 0, gain: 0.14, cutoff: 320 },
      { at: up * 0.55, gain: 0.5 * s, cutoff: 900 + 500 * s },
      { at: up * 0.85, gain: 0.85 * s, cutoff: 1500 + 700 * s },
      { at: up * 1.6, gain: 0.32, cutoff: 600 },
      { at: period, gain: 0.14, cutoff: 320 },
    ],
    wash: [
      { at: 0, gain: 0.02 },
      { at: up * 0.7, gain: 0.16 * s },
      { at: up * 1.05, gain: 0.22 * s },
      { at: up * 1.9, gain: 0.05 },
      { at: period, gain: 0.02 },
    ],
    fizz: [
      { at: 0, gain: 0 },
      { at: up * 0.8, gain: 0.025 * s },
      { at: up * 1.08, gain: 0.11 * s },
      { at: up * 1.6, gain: 0.05 * s },
      { at: Math.min(period, up * 2.25), gain: 0 },
    ],
  }
}

/** How much bigger or smaller than average a wave breaks. */
export const WAVE_STRENGTH = [0.7, 1.15]

/**
 * A wave's strength from a random number in [0, 1): most waves near the
 * middle, now and then a small one or a big set wave.
 * @param {number} rand
 */
export function waveStrength(rand) {
  const [lo, hi] = WAVE_STRENGTH
  const r = Math.min(Math.max(rand, 0), 1)
  // Smoothstep: values bunch toward the middle, the ends stay reachable.
  const u = r * r * (3 - 2 * r)
  return lo + u * (hi - lo)
}

/**
 * Makes `samples` loop without a click: the last `fade` samples are
 * crossfaded (equal power, right for uncorrelated noise) into the first ones,
 * and the result drops the tail, so sample n-1 runs smoothly into sample 0.
 * @param {Float32Array} samples
 * @param {number} fade
 * @returns {Float32Array}
 */
export function seamlessLoop(samples, fade) {
  const f = Math.max(1, Math.min(fade, Math.floor(samples.length / 2)))
  const n = samples.length - f
  const out = samples.slice(0, n)
  for (let i = 0; i < f; i++) {
    const t = (i + 0.5) / f
    out[i] = samples[i] * Math.sin(t * Math.PI / 2) + samples[n + i] * Math.cos(t * Math.PI / 2)
  }
  return out
}

/** Seconds between bursts of gull calls: far off, now and then. */
export const GULL_GAP = [9, 24]

/**
 * Seconds until the next burst of gull calls, from a random number in [0, 1).
 * @param {number} rand
 */
export function gullDelay(rand) {
  const [lo, hi] = GULL_GAP
  return lo + Math.min(Math.max(rand, 0), 1) * (hi - lo)
}
