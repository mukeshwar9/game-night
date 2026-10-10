// @ts-check
// minigolfBot.js — the VS BOT opponent (and the course solvability check).
//
// The bot plays through the same deterministic sim as everyone else: it
// samples candidate strokes, scores where each one comes to rest with a path
// distance to the cup (a BFS field over a 6-unit grid that routes around walls
// and blocks, avoids water, and follows portals), keeps the best, refines it
// locally, then adds its level's execution error. Pure — randomness comes in
// through `rng`.

import { COURSE_W, COURSE_H } from './minigolfCourses'
import { BALL_R, simulateShot, quantizeShot, pointInPoly, inRect, holeSegments } from './minigolfPhysics'

export const BOT_LEVELS = {
  easy: { angleErrDeg: 6, powerErr: 0.15, angles: 36 },
  med: { angleErrDeg: 2.5, powerErr: 0.06, angles: 60 },
  hard: { angleErrDeg: 0.8, powerErr: 0.02, angles: 96 },
}
const POWERS = [0.15, 0.25, 0.35, 0.45, 0.6, 0.75, 0.9, 1]
const CELL = 6
const GW = Math.ceil(COURSE_W / CELL)
const GH = Math.ceil(COURSE_H / CELL)
const INF = 1e9

const fields = new WeakMap()
const cellOf = (x, y) =>
  Math.max(0, Math.min(GH - 1, Math.floor(y / CELL))) * GW + Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)))

/**
 * Path distance (in cells) from every grid cell to the cup. Cached per hole.
 * @param {any} hole
 */
export function distanceField(hole) {
  const cached = fields.get(hole)
  if (cached) return cached
  const segs = holeSegments(hole)
  const open = new Uint8Array(GW * GH)
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2
      if (!hole.bounds.some(p => pointInPoly(x, y, p))) continue
      if ((hole.blocks || []).some(p => pointInPoly(x, y, p))) continue
      if ((hole.zones || []).some(z => z.t === 'water' && inRect(x, y, z.r))) continue
      let nearWall = false
      for (const [x1, y1, x2, y2] of segs) {
        const dx = x2 - x1, dy = y2 - y1
        let u = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
        u = Math.max(0, Math.min(1, u))
        const ex = x - x1 - dx * u, ey = y - y1 - dy * u
        if (ex * ex + ey * ey < BALL_R * BALL_R) { nearWall = true; break }
      }
      if (!nearWall) open[gy * GW + gx] = 1
    }
  }
  const dist = new Float64Array(GW * GH).fill(INF)
  const cup = cellOf(hole.cup[0], hole.cup[1])
  dist[cup] = 0
  // A ball entering portal a appears at b, so a is as close as b.
  const warp = new Map()
  for (const pt of hole.portals || []) warp.set(cellOf(pt.b[0], pt.b[1]), cellOf(pt.a[0], pt.a[1]))
  const queue = [cup]
  const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]
    const d = dist[c]
    const w = warp.get(c)
    if (w != null && dist[w] > d) { dist[w] = d; queue.push(w) }
    const cx = c % GW, cy = (c - cx) / GW
    for (const [dx, dy, cost] of N) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue
      const n = ny * GW + nx
      if (!open[n]) continue
      if (dist[n] > d + cost) { dist[n] = d + cost; queue.push(n) }
    }
  }
  const field = { dist, cellOf }
  fields.set(hole, field)
  return field
}

/** Lower is better. @param {any} hole @param {any} r a simulateShot result */
export function scoreRest(hole, r) {
  if (r.holed) return -1e6
  const { dist } = distanceField(hole)
  let d = dist[cellOf(r.x, r.y)]
  if (d >= INF) d = 400
  return d * CELL + (r.water ? 250 : 0) + (r.oob ? 300 : 0)
}

/**
 * The bot's search as a generator, so a page can time-slice it across frames
 * (it runs ~1000 full sims per stroke). Yields after every sampled angle and
 * refinement step; the return value is the chosen quantized stroke.
 * @param {any} hole
 * @param {{ x: number, y: number }} ball
 * @param {number} k obstacle tick the stroke will be released at
 * @param {'easy'|'med'|'hard'} level
 * @param {() => number} rng 0..1
 * @returns {Generator<undefined, { a: number, p: number, k: number }, unknown>}
 */
export function* botSearch(hole, ball, k, level, rng) {
  const L = BOT_LEVELS[level] ?? BOT_LEVELS.med
  const TAU = Math.PI * 2
  /** @param {number} angle @param {number} power */
  const evaluate = (angle, power) => {
    const q = quantizeShot(angle, power)
    return scoreRest(hole, simulateShot(hole, ball, { ...q, k })) + power * 2
  }
  let best = { s: Infinity, angle: 0, power: 0.5 }
  for (let i = 0; i < L.angles; i++) {
    const angle = (i / L.angles) * TAU
    for (const power of POWERS) {
      const s = evaluate(angle, power)
      if (s < best.s) best = { s, angle, power }
    }
    yield
  }
  const step = TAU / L.angles
  for (let i = 0; i < 30 && best.s > -1e6; i++) {
    const angle = best.angle + (rng() - 0.5) * step * 1.5
    const power = Math.max(0.08, Math.min(1, best.power + (rng() - 0.5) * 0.14))
    const s = evaluate(angle, power)
    if (s < best.s) best = { s, angle, power }
    if (i % 4 === 3) yield
  }
  const angle = best.angle + (rng() - 0.5) * 2 * L.angleErrDeg * Math.PI / 180
  const power = Math.max(0.05, Math.min(1, best.power * (1 + (rng() - 0.5) * 2 * L.powerErr)))
  return { ...quantizeShot(angle, power), k }
}

/**
 * Pick the bot's stroke synchronously (tests, and the solvability check).
 * @param {any} hole @param {{ x: number, y: number }} ball @param {number} k
 * @param {'easy'|'med'|'hard'} level @param {() => number} rng
 */
export function botShot(hole, ball, k, level, rng) {
  const it = botSearch(hole, ball, k, level, rng)
  for (;;) {
    const r = it.next()
    if (r.done) return r.value
  }
}
