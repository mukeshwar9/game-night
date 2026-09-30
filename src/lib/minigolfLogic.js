// @ts-check
// minigolfLogic.js — Minigolf match rules as a pure replay.
//
// A match is fully described by: the course id, the seat order, the ordered
// list of strokes { by, h, a, p, k } and any pick-ups the room coordinator
// wrote (skips[h][uid]). replayCourse() folds those through the deterministic
// sim (minigolfPhysics.js) into everything the UI shows — whose turn, ball
// position, strokes, per-hole scores, totals. Online rooms store only those
// inputs; pass-and-play and solo keep the same inputs in React state, so every
// mode runs one rules engine.
//
// Rules:
//   * each player finishes the hole (holed, or picked up) before the next
//     player tees off; hole 1 uses seat order, later holes use honours — best
//     score on the previous hole first, ties keep the previous order
//   * STROKE_CAP strokes per hole; a ball not holed by then is picked up and
//     scores PICKUP_SCORE
//   * water costs +1 stroke and the ball goes back to where the shot started
//   * lowest total wins; a tie at the top is a draw (shared place)

import { HOLES, getCourse } from './minigolfCourses'
import { simulateShot } from './minigolfPhysics'

export const STROKE_CAP = 6
export const PICKUP_SCORE = 7

// Replays re-run every stroke of the match on each room update; results are a
// pure function of their inputs, so memoize them.
const simCache = new Map()
/** @param {any} hole @param {{x:number,y:number}} from @param {{a:number,p:number,k:number}} shot */
export function simulateCached(hole, from, shot) {
  const key = `${hole.id}|${from.x}|${from.y}|${shot.a}|${shot.p}|${shot.k}`
  let r = simCache.get(key)
  if (!r) {
    if (simCache.size > 4000) simCache.clear()
    r = simulateShot(hole, from, shot)
    simCache.set(key, r)
  }
  return r
}

/**
 * Order for course position `pos`: seat order on the first hole, then honours
 * (ascending previous-hole score; Array.prototype.sort is stable, so ties keep
 * the previous order).
 * @param {string[]} prevOrder
 * @param {Record<string, (number|null)[]>} scores
 * @param {number} pos
 */
export function honoursOrder(prevOrder, scores, pos) {
  if (pos === 0) return [...prevOrder]
  return [...prevOrder].sort((a, b) => (scores[a]?.[pos - 1] ?? 99) - (scores[b]?.[pos - 1] ?? 99))
}

/**
 * @typedef {{ by: string, h: number, a: number, p: number, k: number }} Shot
 * @typedef {{ by: string, h: number, from: {x:number,y:number}, shot: Shot | null,
 *   result: any, strokes: number, outcome: 'holed'|'pickup'|'rest'|'water'|'oob'|'skip',
 *   score: number | null, index: number }} LogEntry
 */

/**
 * Fold a match's inputs into its state.
 * @param {{ course?: string | null, order: string[], shots?: Shot[] | null,
 *   skips?: Record<string, Record<string, string>> | null }} input
 */
export function replayCourse({ course, order, shots, skips }) {
  const holes = getCourse(course).holes
  const list = shots || []
  /** @type {Record<string, (number|null)[]>} */
  const scores = {}
  for (const uid of order) scores[uid] = holes.map(() => null)
  /** @type {LogEntry[]} */
  const log = []
  let si = 0
  let prevOrder = order
  for (let pos = 0; pos < holes.length; pos++) {
    const hole = HOLES[holes[pos]]
    const holeOrder = honoursOrder(prevOrder, scores, pos)
    for (const uid of holeOrder) {
      let ball = { x: hole.tee[0], y: hole.tee[1] }
      let strokes = 0
      for (;;) {
        if (skips?.[pos]?.[uid]) {
          scores[uid][pos] = PICKUP_SCORE
          log.push({ by: uid, h: pos, from: ball, shot: null, result: null, strokes, outcome: 'skip', score: PICKUP_SCORE, index: -1 })
          break
        }
        const next = list[si]
        if (!next) {
          return {
            done: false, pos, holeIndex: holes[pos], hole, holeOrder, turn: uid,
            ball, strokes, scores, log, shotsUsed: si,
          }
        }
        si++
        // Defensive: a stroke out of turn (stale write) is ignored.
        if (next.by !== uid || next.h !== pos) continue
        const from = ball
        const r = simulateCached(hole, from, next)
        strokes += r.water ? 2 : 1
        if (r.holed) {
          scores[uid][pos] = strokes
          log.push({ by: uid, h: pos, from, shot: next, result: r, strokes, outcome: 'holed', score: strokes, index: si - 1 })
          break
        }
        ball = { x: r.x, y: r.y }
        if (strokes >= STROKE_CAP) {
          scores[uid][pos] = PICKUP_SCORE
          log.push({ by: uid, h: pos, from, shot: next, result: r, strokes, outcome: 'pickup', score: PICKUP_SCORE, index: si - 1 })
          break
        }
        log.push({ by: uid, h: pos, from, shot: next, result: r, strokes, outcome: r.water ? 'water' : r.oob ? 'oob' : 'rest', score: null, index: si - 1 })
      }
    }
    prevOrder = holeOrder
  }
  return {
    done: true, pos: holes.length, holeIndex: null, hole: null, holeOrder: prevOrder, turn: null,
    ball: null, strokes: 0, scores, log, shotsUsed: si,
  }
}

/** Sum of the scores played so far. @param {(number|null)[]} row */
export const totalOf = (row) => (row || []).reduce((s, v) => s + (v ?? 0), 0)

/**
 * Strokes relative to par over the holes played so far.
 * @param {(number|null)[]} row @param {string | null | undefined} course
 */
export function vsPar(row, course) {
  const holes = getCourse(course).holes
  let d = 0
  ;(row || []).forEach((v, i) => { if (v != null) d += v - HOLES[holes[i]].par })
  return d
}

/** "E", "+2", "-1" @param {number} d */
export const formatVsPar = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`)

/**
 * Standings, lowest total first; tied totals share a rank.
 * @param {Record<string, (number|null)[]>} scores @param {string[]} order
 */
export function standings(scores, order) {
  const rows = order.map((uid, seat) => ({ uid, seat, total: totalOf(scores[uid]) }))
  rows.sort((a, b) => a.total - b.total || a.seat - b.seat)
  let rank = 0
  return rows.map((r, i) => {
    if (i === 0 || r.total !== rows[i - 1].total) rank = i + 1
    return { ...r, rank }
  })
}

/**
 * Winner uid, or 'draw' when the lowest total is shared.
 * @param {Record<string, (number|null)[]>} scores @param {string[]} order
 */
export function matchWinner(scores, order) {
  const s = standings(scores, order)
  if (s.length === 0) return 'draw'
  if (s.length > 1 && s[1].total === s[0].total) return 'draw'
  return s[0].uid
}

/**
 * Banner for a finished hole.
 * @param {number} strokes @param {number} par @param {boolean} [pickedUp]
 */
export function scoreName(strokes, par, pickedUp = false) {
  if (pickedUp) return 'PICKED UP'
  if (strokes === 1) return 'HOLE IN ONE!'
  const d = strokes - par
  if (d <= -2) return 'EAGLE!'
  if (d === -1) return 'BIRDIE!'
  if (d === 0) return 'PAR'
  if (d === 1) return 'BOGEY'
  return `+${d}`
}

/** Solo par-run stars for one hole: 3 hole in one, 2 under par, 1 par. */
export function holeStars(strokes, par) {
  if (strokes == null || strokes >= PICKUP_SCORE) return 0
  if (strokes === 1) return 3
  if (strokes < par) return 2
  if (strokes === par) return 1
  return 0
}
