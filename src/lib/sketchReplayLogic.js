// @ts-check
// SKETCH replay: the finished drawing redrawn in the order it was made, as a
// time-lapse. Pure timing only — no DOM, Firebase or React. The reveal runs it
// on every screen at once (each client derives the frame from the server
// clock), and the same plan can drive a REPLAY button anywhere a drawing is
// shown again.
//
// Reveal timeline (ms after `round.revealAt`):
//   0 – REPLAY_LEAD_MS        the word lands over a blank canvas
//   … – REPLAY_END_MS         strokes and fills redraw in push order
//   REPLAY_END_MS             the picture holds and the +points fly
//   REVEAL_MS (sketchLogic)   the coordinator moves on
//
// Pace: every unit (one pen gesture, or one fill) gets an equal base slice of
// the replay plus a share by its length (a fill counts by fillPace), so one long outline cannot eat the
// whole replay and a tiny dot does not flash by. Within a gesture the pen moves
// at one speed across its segments.

export const REPLAY_LEAD_MS = 300
export const REPLAY_MS = 3500
export const REPLAY_END_MS = REPLAY_LEAD_MS + REPLAY_MS
// Share of the replay split equally between units; the rest goes by length.
export const BASE_SHARE = 0.4

/**
 * A fill's pace, as the length of line it counts for: about the outline of a
 * square of its cells (each cell is 4 viewBox units), so a big fill pours
 * visibly and a small one does not hold the replay up.
 */
export function fillPace(cells) {
  return 8 * Math.sqrt(Math.max(0, cells))
}

/**
 * @typedef {{ c?: number, w?: number, p?: number[], g?: string }} Stroke
 * @typedef {{ c?: number, p?: number[] }} Fill
 * A stroke segment (kind 'stroke', `len` in viewBox units) or a fill (kind
 * 'fill', `cells` in flood order), drawn between `start` and `end` ms.
 * @typedef {{ kind: string, key: string, data: any, len: number, cells: number, start: number, end: number }} PlanItem
 * @typedef {{ ms: number, items: PlanItem[] }} ReplayPlan
 */

/** Length of a flat [x0,y0,x1,y1,...] polyline, in viewBox units. */
export function strokeLength(p) {
  if (!Array.isArray(p)) return 0
  let len = 0
  for (let i = 0; i + 3 < p.length; i += 2) len += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1])
  return len
}

// A map ({ pushId: item }) in push order (push ids sort chronologically), or
// an already ordered array (keys are its indexes).
function entries(items) {
  if (Array.isArray(items)) return items.map((v, i) => /** @type {[string, any]} */ ([String(i), v]))
  return Object.entries(items || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * The replay schedule for a drawing.
 *
 * Maps keyed by push id (the live round) interleave strokes and fills in the
 * order they were made. Plain arrays (the stored gallery, which keeps each kind
 * in order but not their interleaving) replay all strokes, then the fills.
 *
 * @param {Record<string, Stroke> | Stroke[] | null | undefined} strokes
 * @param {Record<string, Fill> | Fill[] | null | undefined} fills
 * @param {number} [ms] total replay time
 * @returns {ReplayPlan}
 */
export function replayPlan(strokes, fills, ms = REPLAY_MS) {
  const interleave = !Array.isArray(strokes) && !Array.isArray(fills)
  const s = entries(strokes)
    .filter(([, v]) => Array.isArray(v?.p) && v.p.length >= 2)
    .map(([key, data]) => ({ kind: 'stroke', key, data, len: strokeLength(data.p), cells: 0 }))
  const f = entries(fills)
    .filter(([, v]) => Array.isArray(v?.p) && v.p.length >= 2)
    .map(([key, data]) => ({ kind: 'fill', key, data, len: 0, cells: Math.floor(data.p.length / 2) }))
  const seq = interleave
    ? [...s, ...f].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    : [...s, ...f]

  // Units: consecutive segments of one gesture (same `g`) pace as one stroke.
  const units = []
  for (const item of seq) {
    const last = units[units.length - 1]
    const g = item.kind === 'stroke' ? item.data.g : null
    if (g && last && last.g === g) {
      last.items.push(item)
      last.len += item.len
    } else {
      units.push({ g, items: [item], len: item.kind === 'stroke' ? item.len : fillPace(item.cells) })
    }
  }
  if (units.length === 0) return { ms, items: [] }

  const totalLen = units.reduce((sum, u) => sum + u.len, 0)
  const base = totalLen > 0 ? (ms * BASE_SHARE) / units.length : ms / units.length
  const pool = totalLen > 0 ? ms * (1 - BASE_SHARE) : 0

  /** @type {PlanItem[]} */
  const items = []
  let t = 0
  units.forEach((u, ui) => {
    const unitEnd = ui === units.length - 1 ? ms : t + base + (totalLen > 0 ? (pool * u.len) / totalLen : 0)
    const span = unitEnd - t
    u.items.forEach((item, ii) => {
      const share = u.len > 0 && item.kind === 'stroke' ? item.len / u.len : 1 / u.items.length
      const end = ii === u.items.length - 1 ? unitEnd : t + span * share
      items.push({ ...item, start: t, end })
      t = end
    })
    t = unitEnd
  })
  return { ms, items }
}

/**
 * Where the replay is at `t` ms into it: items before `index` are drawn in
 * full, item `index` is `progress` (0–1) of the way through, the rest are not
 * drawn yet. `done` once everything is drawn.
 *
 * @param {ReplayPlan} plan
 * @param {number} t
 * @returns {{ index: number, progress: number, done: boolean }}
 */
export function frameAt(plan, t) {
  const items = plan?.items || []
  if (items.length === 0 || t >= (plan.ms ?? 0)) return { index: items.length, progress: 0, done: true }
  if (!(t > 0)) return { index: 0, progress: 0, done: false }
  // First item that has not finished by t.
  let lo = 0
  let hi = items.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].end > t) hi = mid
    else lo = mid + 1
  }
  const it = items[lo]
  const span = it.end - it.start
  const progress = span > 0 ? Math.min(1, Math.max(0, (t - it.start) / span)) : 1
  return { index: lo, progress, done: false }
}

/**
 * Dash settings that show the first `progress` of a stroke of length `len`.
 * The dash is a little longer than the line so the round caps never peek.
 */
export function strokeDash(len, progress) {
  const L = len + 2
  return { dasharray: `${L} ${L}`, dashoffset: L * (1 - Math.min(1, Math.max(0, progress))) }
}

/** How many of a fill's cells have poured in (cells are in flood order, from the tap). */
export function fillCount(cells, progress) {
  return Math.min(cells, Math.max(0, Math.ceil(cells * progress)))
}

/** Replay time for `elapsed` ms after the reveal started (negative during the lead-in). */
export function replayTime(elapsed) {
  return elapsed - REPLAY_LEAD_MS
}

/**
 * Has this phone's reveal replay finished — the moment the points fly?
 * Skipped, reduced motion and an empty drawing all finish at once.
 */
export function replayOver({ elapsed, skipped = false, reduced = false, empty = false }) {
  return skipped || reduced || empty || !(elapsed < REPLAY_END_MS)
}
