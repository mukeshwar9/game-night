// @ts-check
// UPDRAFT's full-height stage: the layout, rail and chart maths. Pure — no
// DOM, no React. The arena (UpdraftArena.jsx) and the pages draw what this says.
import { VIEW_H, WORLD_W, toMetres } from './updraftLogic'

/** The tallest window onto the tower, in world units, on a very tall phone. */
export const MAX_VIEW_H = 900
/** In-play text never goes below this many CSS px (the mobile audit's floor). */
export const MIN_PLAY_TEXT_PX = 10

/**
 * How the arena fills a stage of `w`×`h` px. The tower is WORLD_W wide, so a
 * phone is width-bound: the arena takes the whole height and shows more of the
 * tower above you (`viewH` ≥ VIEW_H) instead of leaving a band of nothing. A
 * wide window is height-bound and keeps the classic 360×640 window, centred.
 * `viewH` is only what is drawn — the sim's camera and fall line do not change.
 * @param {{ w: number, h: number }} stage
 * @returns {{ scale: number, arenaW: number, arenaH: number, viewH: number }}
 */
export function fitStage({ w, h }) {
  if (!(w > 0 && h > 0)) return { scale: 1, arenaW: WORLD_W, arenaH: VIEW_H, viewH: VIEW_H }
  const scale = Math.min(w / WORLD_W, h / VIEW_H)
  const viewH = Math.min(MAX_VIEW_H, Math.max(VIEW_H, h / scale))
  return { scale, arenaW: WORLD_W * scale, arenaH: viewH * scale, viewH }
}

/** Where a height sits on the 0–goal rail, 0 (bottom) to 1 (the flag). */
export function railFraction(y, goal) {
  if (!(goal > 0)) return 0
  return Math.min(1, Math.max(0, (Number(y) || 0) / goal))
}

/**
 * The top strip's gap to the rival, from the two heights in world units.
 * Whole metres, like the rest of the screen.
 * @param {number} mine
 * @param {number} theirs
 * @returns {{ metres: number, ahead: 'me' | 'them' | 'even' }}
 */
export function gapToRival(mine, theirs) {
  const d = toMetres(mine) - toMetres(theirs)
  return { metres: Math.abs(d), ahead: d > 0 ? 'me' : d < 0 ? 'them' : 'even' }
}

/** The strip's gap text: "BOB +18m", "YOU +4m" or "LEVEL". */
export function gapText(gap, rivalName) {
  if (gap.ahead === 'even') return 'LEVEL'
  return `${gap.ahead === 'me' ? 'YOU' : rivalName} +${gap.metres}m`
}

// ── The climb chart ────────────────────────────────────────────────────────

/** @typedef {{ t: number, me: number, rival: number }} Sample  a stored sample: t in seconds, heights in whole metres */
/** @typedef {{ t: number, kind: 'sent' | 'took' | 'fall' }} Mark */

/** Samples closer together than this are merged; the chart needs no more. */
export const SAMPLE_GAP_S = 0.5
/** A round is never drawn on an axis shorter than this many seconds. */
export const MIN_AXIS_S = 10
/** The axis end rounds up to a multiple of this. */
export const AXIS_STEP_S = 5

/**
 * Append a sample to a trace (a new array). Heights come in as world units
 * and are stored as whole metres. A sample inside SAMPLE_GAP_S of the last
 * replaces it, so the final heights always win; time never runs back.
 * @param {readonly Sample[]} trace
 * @param {{ t: number, me: number, rival: number }} sample
 * @returns {Sample[]}
 */
export function appendSample(trace, sample) {
  const last = trace[trace.length - 1]
  const next = { t: Math.max(0, sample.t), me: toMetres(sample.me), rival: toMetres(sample.rival) }
  if (last && next.t < last.t) next.t = last.t
  if (last && next.t - last.t < SAMPLE_GAP_S) return [...trace.slice(0, -1), next]
  return [...trace, next]
}

/** The chart's x axis end in seconds for a trace. */
export function axisEnd(trace) {
  const last = trace.length ? trace[trace.length - 1].t : 0
  return Math.max(MIN_AXIS_S, Math.ceil(last / AXIS_STEP_S) * AXIS_STEP_S)
}

/**
 * SVG path data for both climbs and the position of the marks, inside a
 * `w`×`h` plot. A height never draws above the goal line.
 * @param {readonly Sample[]} trace
 * @param {readonly Mark[]} marks
 * @param {{ goalM: number, w: number, h: number }} box
 */
export function chartGeometry(trace, marks, { goalM, w, h }) {
  const end = axisEnd(trace)
  const px = (t) => Math.min(1, Math.max(0, t / end)) * w
  const py = (m) => h - Math.min(1, Math.max(0, m / goalM)) * h
  const line = (key) => (trace.length
    ? `M${px(0).toFixed(1)} ${py(0).toFixed(1)}${trace.map(s => `L${px(s.t).toFixed(1)} ${py(s[key]).toFixed(1)}`).join('')}`
    : '')
  const at = (t) => {
    // The height I had when the mark happened: the last sample at or before it.
    let m = 0
    for (const s of trace) { if (s.t <= t) m = s.me; else break }
    return m
  }
  return {
    end,
    me: line('me'),
    rival: line('rival'),
    marks: marks.map(k => ({ ...k, x: px(k.t), y: py(at(k.t)) })),
    last: trace.length ? { x: px(trace[trace.length - 1].t), y: py(trace[trace.length - 1].me) } : null,
  }
}

/**
 * The numbers under the chart.
 * @param {{ springs?: number, dead?: boolean, top?: boolean, t?: number }} run
 * @param {{ sent?: number, took?: number }} [tally]
 */
export function climbCards(run, { sent = 0, took = 0 } = {}) {
  return [
    { id: 'fell', label: 'FELL', value: run.dead && !run.top ? 1 : 0 },
    { id: 'springs', label: 'SPRING', value: run.springs ?? 0 },
    { id: 'sent', label: 'SENT', value: sent },
    { id: 'took', label: 'TOOK', value: took },
  ]
}

/** A summit time as "34.8s", or null when the climber did not reach it. */
export function summitTime(run) {
  return run.top && Number.isFinite(run.t) ? `${run.t.toFixed(1)}s` : null
}

/**
 * The previous best summit time for a level, and whether this run beat it.
 * `prev` is what was stored before this run (null for a first summit).
 * @param {number | null | undefined} prev
 * @param {number} now
 */
export function bestDelta(prev, now) {
  if (prev == null) return { best: true, text: 'FIRST SUMMIT' }
  if (now < prev) return { best: true, text: `NEW BEST · −${(prev - now).toFixed(1)}s` }
  return { best: false, text: `BEST ${prev.toFixed(1)}s` }
}
