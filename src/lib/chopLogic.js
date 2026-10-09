// @ts-check
// chopLogic.js — pure Chop Chop (a 30-second crate-chopping race). No DOM, no
// Firebase, no React.
//
// A stack of crates stands in front of you; some carry a striped beam on the
// left or the right. Tap LEFT or RIGHT to stand on that side and knock the
// bottom crate out. The stack drops by one. If a beam is on your side when it
// arrives at the bottom, it lands on your head: you are stunned for a moment
// and lose your streak. Most crates when the clock stops wins.
//
// Everyone gets the same stack: the beam on row k comes from (seed, k), so a
// race is fair without shipping the stack through Firebase.
import { seededFraction } from './raceLogic'

/** The race window. The 30 seconds are the game, so room timer settings do not stretch it. */
export const CHOP_GAME_MS = 30_000
/** How long a beam on the head stops you chopping. */
export const CHOP_STUN_MS = 1000
/** Crates on screen at once. */
export const CHOP_VISIBLE = 5
/** The LEFT / RIGHT buttons warn about a beam for this many crates, then you read the stack yourself. */
export const CHOP_WARN_CRATES = 10

const BEAM_LEFT = 0.3
const BEAM_RIGHT = 0.6

/** @typedef {'L' | 'R' | ''} Beam */

const cache = new Map()

/**
 * The beam on row `k` of the stack (0 = the first crate you chop): 'L', 'R'
 * or '' for none. Row 0 is always clear and a beam never sits directly above
 * another, so there is always a safe side to stand on.
 * @returns {Beam}
 */
export function beamAt(seed, k) {
  const index = Math.floor(k)
  if (!(index > 0)) return ''
  let rows = cache.get(seed)
  if (!rows) {
    rows = ['']
    cache.clear() // one race at a time; do not grow without bound
    cache.set(seed, rows)
  }
  for (let i = rows.length; i <= index; i++) {
    const r = seededFraction(seed, i, 31)
    rows.push(rows[i - 1] ? '' : r < BEAM_LEFT ? 'L' : r < BEAM_RIGHT ? 'R' : '')
  }
  return rows[index]
}

/** Racer stats, clamped to whole non-negative counts. `cleared` is a row whose beam already fell. */
export function normalizeChopStats(raw) {
  const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0)
  return {
    chops: n(raw?.chops), bonks: n(raw?.bonks), streak: n(raw?.streak), best: n(raw?.best),
    cleared: Number.isFinite(Number(raw?.cleared)) ? Math.floor(Number(raw.cleared)) : -1,
  }
}

/** The beam on the racer's row `k`, with the one that already hit them removed. */
function liveBeam(seed, stats, k) {
  return k === stats.cleared ? '' : beamAt(seed, k)
}

/** The crates on screen for this racer, bottom first: [{ row, beam }]. */
export function visibleRows(seed, rawStats, count = CHOP_VISIBLE) {
  const s = normalizeChopStats(rawStats)
  return Array.from({ length: count }, (_, i) => ({ row: s.chops + i, beam: liveBeam(seed, s, s.chops + i) }))
}

/**
 * Is `side` unsafe right now? True when a beam is already at the bottom on
 * that side, or the next crate brings one down onto it.
 */
export function sideDanger(seed, rawStats, side) {
  const s = normalizeChopStats(rawStats)
  return liveBeam(seed, s, s.chops) === side || liveBeam(seed, s, s.chops + 1) === side
}

/** Do the buttons still warn this racer? Only for their first crates of the race. */
export function warnsStill(rawStats) {
  return normalizeChopStats(rawStats).chops < CHOP_WARN_CRATES
}

/**
 * One tap on `side`. Returns { stats, chopped, bonk }.
 * - A beam already at the bottom on that side: you walk into it. No crate.
 * - Otherwise the bottom crate goes. If the next crate's beam is on your
 *   side it lands on you: the crate still counts, the streak is gone.
 * The beam that hit you is spent, so you are never stuck under it.
 */
export function applyChop(seed, rawStats, side) {
  const s = normalizeChopStats(rawStats)
  if (side !== 'L' && side !== 'R') return { stats: s, chopped: false, bonk: false }
  if (liveBeam(seed, s, s.chops) === side) {
    return { stats: { ...s, bonks: s.bonks + 1, streak: 0, cleared: s.chops }, chopped: false, bonk: true }
  }
  const chops = s.chops + 1
  const streak = s.streak + 1
  const next = { ...s, chops, streak, best: Math.max(s.best, streak) }
  if (liveBeam(seed, next, chops) === side) {
    return { stats: { ...next, bonks: s.bonks + 1, streak: 0, cleared: chops }, chopped: true, bonk: true }
  }
  return { stats: next, chopped: true, bonk: false }
}

// ── N-player race hooks (see raceLogic.js) ────────────────────────────────

/** Ranking entry: most crates wins, then fewest beams taken; no stats = DNF. */
export function chopRaceEntry(stats) {
  if (!stats) return { sortKey: null, score: null }
  const s = normalizeChopStats(stats)
  return { sortKey: [-s.chops, s.bonks], score: s.chops }
}

export function chopRow(stats) {
  const s = normalizeChopStats(stats)
  return {
    primary: `${s.chops} CRATES`,
    secondary: `${s.bonks} BEAM${s.bonks === 1 ? '' : 'S'} · BEST ×${s.best}`,
    progress: null,
    status: stats ? 'racing' : 'idle',
    detail: `${s.chops}`,
  }
}

// ── Ghost rival for the solo page ─────────────────────────────────────────
// Crates per second at each level, already net of the beams it takes.
export const GHOST_RATES = { easy: 1.6, normal: 2.6, hard: 3.8 }
export const GHOST_LEVELS = ['easy', 'normal', 'hard']

/** The ghost's crate count `elapsedMs` into the race. Steady, so it is a pace to beat. */
export function ghostChops(level, elapsedMs) {
  const rate = GHOST_RATES[level] ?? GHOST_RATES.normal
  const t = Math.max(0, Math.min(CHOP_GAME_MS, elapsedMs)) / 1000
  return Math.floor(rate * t)
}
