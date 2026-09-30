// Pure logic for PULP RUSH — slice the produce tossed into your field, never
// the rotten apple. No DOM/Firebase/React.
//
// The whole round is a seeded COURSE: piece n's launch time, arc, sprite and
// kind derive from (seed, n) through seededFraction, so every player faces
// byte-identical waves without shipping them through Firebase. A piece flies
// a closed-form ballistic arc (positionAt), so its position at course time t
// is the same on every device and at any frame rate.
//
// Arena units: the field is ARENA_W × ARENA_H (portrait); y grows downward.
// Screens map these units onto an element with the same aspect ratio, so a
// bigger phone gains nothing.
//
// A FIELD is what one arena tracks: which pieces are gone, pending double
// chops, and per-player slice stats. Online DUEL / HARVEST and split-screen
// DUEL use one player per field; TWO-TONE co-op puts both players on one.
import { seededFraction } from './raceLogic'

export const ARENA_W = 1
export const ARENA_H = 1.15
export const GRAVITY = 2.4          // units / s²
export const PIECE_R = 0.075        // a ≥44 px sprite on a ~300 px field
export const HIT_SLACK = 0.03       // forgiveness around each sprite
export const MIN_SWIPE_SPEED = 0.8  // units / s — a resting finger never slices
export const COMBO_WINDOW_MS = 300  // slices this close in one stroke chain
export const ROT_PENALTY = 5
export const STUN_MS = 1000
export const DOUBLE_CHOP_MS = 250   // both partners must hit a 2× piece this close
export const DOUBLE_CHOP_POINTS = 3

export const DUEL_MS = 45_000
export const HARVEST_MS = 60_000
export const SOLO_MS = 60_000
export const TEAM_HEARTS = 5
export const HARVEST_TARGET_PER_PLAYER = 60

export const FRUITS = ['lime', 'plum', 'peach', 'berry']

const FIRST_LAUNCH_MS = 600
const END_MARGIN_MS = 1200
const ROT_FREE_MS = 2500

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * The round's seeded course: pieces sorted by launch time.
 * `{ id, kind: 'fruit'|'rot', sprite, owner: 'X'|'O'|'both'|null, launchAt,
 *    x0, y0, vx, vy, flightMs, spin }` — times in ms from GO, speeds in units/s.
 * `twoTone` assigns each fruit an owner (TWO-TONE co-op).
 */
export function buildCourse(seed, durationMs, { twoTone = false } = {}) {
  const pieces = []
  const f = (index, slot) => seededFraction(seed, index, slot)
  const end = Math.max(0, durationMs - END_MARGIN_MS)
  let t = FIRST_LAUNCH_MS
  let n = 0
  for (let wave = 0; t < end; wave++) {
    const p = clamp(t / Math.max(1, durationMs), 0, 1)
    const count = Math.min(5, 1 + Math.floor(f(wave, 900) * (1.5 + 3 * p)))
    let rotInWave = false
    for (let i = 0; i < count; i++, n++) {
      const launchAt = Math.round(t + i * (80 + f(n, 1) * 140))
      const isRot = !rotInWave && wave > 0 && t >= ROT_FREE_MS && f(n, 2) < 0.08 + 0.1 * p
      if (isRot) rotInWave = true
      const apex = ARENA_H * (0.55 + 0.35 * f(n, 3))
      const vy = Math.sqrt(2 * GRAVITY * apex)
      const flight = (2 * vy) / GRAVITY
      const x0 = 0.12 + 0.76 * f(n, 4)
      const xEnd = clamp(x0 + (f(n, 5) - 0.5) * 0.6, 0.1, 0.9)
      let owner = null
      if (twoTone && !isRot) owner = wave > 1 && f(n, 6) < 0.15 ? 'both' : f(n, 7) < 0.5 ? 'X' : 'O'
      pieces.push({
        id: n,
        kind: isRot ? 'rot' : 'fruit',
        sprite: isRot ? 'rot' : FRUITS[Math.floor(f(n, 8) * FRUITS.length) % FRUITS.length],
        owner,
        launchAt,
        x0,
        y0: ARENA_H + PIECE_R,
        vx: (xEnd - x0) / flight,
        vy,
        flightMs: Math.round(flight * 1000),
        spin: Math.round((f(n, 9) - 0.5) * 720),
      })
    }
    t += 1500 - 700 * p + f(wave, 901) * 400
  }
  return pieces.sort((a, b) => a.launchAt - b.launchAt || a.id - b.id)
}

/** Piece position at course time `ms`, or null while it is not in flight. */
export function positionAt(piece, ms) {
  const dt = (ms - piece.launchAt) / 1000
  if (dt < 0 || ms > piece.launchAt + piece.flightMs) return null
  return {
    x: piece.x0 + piece.vx * dt,
    y: piece.y0 - piece.vy * dt + 0.5 * GRAVITY * dt * dt,
  }
}

/** Pieces in flight at `ms` (launched, not yet fallen out). */
export function piecesInFlight(course, ms) {
  const out = []
  for (const piece of course) {
    if (piece.launchAt > ms) break
    if (ms <= piece.launchAt + piece.flightMs) out.push(piece)
  }
  return out
}

/** Does segment A→B pass within `r` of C? */
export function segmentHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const u = len2 === 0 ? 0 : clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1)
  const px = ax + u * dx - cx
  const py = ay + u * dy - cy
  return px * px + py * py <= r * r
}

const newPlayer = () => ({ score: 0, sliced: 0, combo: 0, best: 0, rot: 0, wrong: 0, lastSliceAt: null, stunUntil: 0 })

/** A fresh field for these players (ids like 'X'/'O' or 'me'). */
export function createField(playerIds = ['me']) {
  const players = {}
  for (const id of playerIds) players[id] = newPlayer()
  return { gone: {}, pending: {}, players }
}

/** Points for the combo-th slice in a chain: 1, 1, then +4 (3× = 6 total), then +2 each. */
export function comboGain(combo) {
  if (combo < 3) return 1
  return combo === 3 ? 4 : 2
}

/**
 * Apply one swipe segment by `player`: `seg = { ax, ay, bx, by, t0, t1 }`
 * (arena units, course ms). Returns `{ field, events }` with a new field;
 * events are `{ type: 'slice'|'rot'|'wrong'|'half'|'double', id, x, y, by, gain? , combo? }`.
 */
export function applySwipe(field, course, player, seg, { twoTone = false } = {}) {
  const me = field.players[player]
  if (!me) return { field, events: [] }
  const { ax, ay, bx, by, t0, t1 } = seg
  if (t1 < me.stunUntil) return { field, events: [] }
  const dist = Math.hypot(bx - ax, by - ay)
  const speed = dist / (Math.max(1, t1 - t0) / 1000)
  if (speed < MIN_SWIPE_SPEED) return { field, events: [] }

  const reach = PIECE_R + HIT_SLACK
  const hits = []
  for (const piece of piecesInFlight(course, t1)) {
    if (field.gone[piece.id]) continue
    const pos = positionAt(piece, t1)
    if (pos && segmentHitsCircle(ax, ay, bx, by, pos.x, pos.y, reach)) hits.push({ piece, pos })
  }
  if (!hits.length) return { field, events: [] }

  const gone = { ...field.gone }
  const pending = { ...field.pending }
  const players = { ...field.players }
  let p = { ...me }
  const events = []
  for (const { piece, pos } of hits) {
    const at = { id: piece.id, x: pos.x, y: pos.y, by: player }
    if (piece.kind === 'rot') {
      gone[piece.id] = true
      p = { ...p, score: Math.max(0, p.score - ROT_PENALTY), rot: p.rot + 1, combo: 0, stunUntil: t1 + STUN_MS }
      events.push({ type: 'rot', ...at })
      break // stunned: the rest of this swipe does nothing
    }
    if (twoTone && piece.owner === 'both') {
      const half = pending[piece.id]
      if (half && half.by !== player && t1 - half.at <= DOUBLE_CHOP_MS) {
        gone[piece.id] = true
        delete pending[piece.id]
        p = { ...p, score: p.score + DOUBLE_CHOP_POINTS, sliced: p.sliced + 1 }
        const partner = players[half.by]
        if (partner) players[half.by] = { ...partner, score: partner.score + DOUBLE_CHOP_POINTS, sliced: partner.sliced + 1 }
        events.push({ type: 'double', ...at, gain: DOUBLE_CHOP_POINTS })
      } else if (!half || half.by !== player || t1 - half.at > DOUBLE_CHOP_MS) {
        pending[piece.id] = { by: player, at: t1 }
        events.push({ type: 'half', ...at })
      }
      continue
    }
    if (twoTone && piece.owner && piece.owner !== player) {
      gone[piece.id] = true
      p = { ...p, wrong: p.wrong + 1, combo: 0 }
      events.push({ type: 'wrong', ...at })
      continue
    }
    gone[piece.id] = true
    const chained = p.lastSliceAt != null && t1 - p.lastSliceAt <= COMBO_WINDOW_MS
    const combo = chained ? p.combo + 1 : 1
    const gain = comboGain(combo)
    p = { ...p, score: p.score + gain, sliced: p.sliced + 1, combo, best: Math.max(p.best, combo), lastSliceAt: t1 }
    events.push({ type: 'slice', ...at, gain, combo })
  }
  players[player] = p
  return { field: { gone, pending, players }, events }
}

/** Fruit that fell out unsliced by course time `ms` (rotten apples never count). */
export function countDropped(course, field, ms) {
  let n = 0
  for (const piece of course) {
    if (piece.launchAt > ms) break
    if (piece.kind === 'fruit' && !field.gone[piece.id] && piece.launchAt + piece.flightMs < ms) n++
  }
  return n
}

/** Team hearts left on a shared field (TWO-TONE): drops, rotten slices and wrong colours each cost one. */
export function fieldHearts(course, field, ms, hearts = TEAM_HEARTS) {
  let lost = countDropped(course, field, ms)
  for (const p of Object.values(field.players)) lost += p.rot + p.wrong
  return Math.max(0, hearts - lost)
}

/** Sum of every player's score on a field. */
export function fieldScore(field) {
  return Object.values(field.players).reduce((s, p) => s + p.score, 0)
}

// ── Race stats (online DUEL / HARVEST; see raceLogic.js) ─────────────────

/** Racer stats written to Firebase: `{ score, sliced, best, rot, dropped }` as whole non-negative counts. */
export function normalizePulpStats(raw) {
  const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0)
  return { score: n(raw?.score), sliced: n(raw?.sliced), best: n(raw?.best), rot: n(raw?.rot), dropped: n(raw?.dropped) }
}

/** Stats for one player of a field at course time `ms`. */
export function pulpStats(course, field, player, ms) {
  const p = field.players[player] || newPlayer()
  return normalizePulpStats({ score: p.score, sliced: p.sliced, best: p.best, rot: p.rot, dropped: countDropped(course, field, ms) })
}

/** DUEL ranking: highest score, then most slices; no stats = DNF. */
export function pulpRaceEntry(stats) {
  if (!stats) return { sortKey: null, score: null }
  const s = normalizePulpStats(stats)
  return { sortKey: [-s.score, -s.sliced], score: s.score }
}

export function pulpRow(stats) {
  const s = normalizePulpStats(stats)
  return {
    primary: `${s.score} PTS`,
    secondary: `${s.sliced} SLICED · ${s.best}× BEST${s.rot ? ` · ${s.rot} ROT` : ''}`,
    progress: null,
    status: stats ? 'racing' : 'idle',
    detail: `${s.score}`,
  }
}

/**
 * HARVEST team state from every racer's stats: pulp (summed scores) against
 * a target that scales with the team, and shared hearts lost to each racer's
 * drops and rotten slices.
 */
export function harvestTeam(statsById, racers) {
  const ids = Array.isArray(racers) ? racers : []
  let pulp = 0
  let lost = 0
  for (const id of ids) {
    const s = normalizePulpStats(statsById?.[id])
    pulp += s.score
    lost += s.dropped + s.rot
  }
  const target = HARVEST_TARGET_PER_PLAYER * Math.max(1, ids.length)
  const hearts = Math.max(0, TEAM_HEARTS - lost)
  return { pulp, target, hearts, won: pulp >= target, failed: hearts <= 0 && pulp < target }
}

/** HARVEST round ends early once the team fills the basket or runs out of hearts. */
export function harvestDecided(statsById, racers) {
  const team = harvestTeam(statsById, racers)
  return team.won || team.failed
}

/** HARVEST ranking: a full basket = everyone ties for first; otherwise nobody finishes. */
export function harvestEntry(stats, round) {
  const team = harvestTeam(round?.stats, round?.racers)
  if (!team.won) return { sortKey: null, score: null }
  return { sortKey: [0], score: normalizePulpStats(stats).score }
}
