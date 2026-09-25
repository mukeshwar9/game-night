// Pure logic for Aim Trainer — no DOM/Firebase/React.
//
// Every racer shoots the same seeded target sequence: target k's position is
// derived from (seed, k), so racers see identical targets in identical order
// no matter their screen size (positions are fractions of the arena).
import { seededFraction } from './raceLogic'

// The race window (fixed — the 30 seconds ARE the game, so the room's timer
// setting doesn't stretch it).
export const AIM_GAME_MS = 30_000
// Target radius in px (rendering) and the arena margin, as a fraction, that
// keeps a target clear of the edges on a phone-width arena.
export const AIM_RADIUS_PX = 24
export const AIM_MARGIN = 0.1
// Consecutive targets are at least this far apart (fraction of the arena) so
// the next target never spawns under the finger that just hit the last one.
export const AIM_MIN_JUMP = 0.28

const MAX_TRIES = 12

function rawTarget(seed, k, attempt) {
  const span = 1 - 2 * AIM_MARGIN
  return {
    xPct: AIM_MARGIN + seededFraction(seed, k, 11 + attempt * 2) * span,
    yPct: AIM_MARGIN + seededFraction(seed, k, 12 + attempt * 2) * span,
  }
}

/** Position of target `k` (0-based) for this seed — same for every racer. */
export function targetAt(seed, k) {
  const index = Math.max(0, Math.floor(k))
  let pos = rawTarget(seed, index, 0)
  if (index === 0) return pos
  const prev = targetAt(seed, index - 1)
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    pos = rawTarget(seed, index, attempt)
    if (Math.hypot(pos.xPct - prev.xPct, pos.yPct - prev.yPct) >= AIM_MIN_JUMP) return pos
  }
  return pos
}

/** Racer stats `{ hits, misses, score }`, clamped to whole non-negative counts. */
export function normalizeAimStats(raw) {
  const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0)
  const hits = n(raw?.hits)
  const misses = n(raw?.misses)
  return { hits, misses, score: hits - misses }
}

/** A hit: +1 point and the next target. */
export function applyHit(stats) {
  const s = normalizeAimStats(stats)
  return { hits: s.hits + 1, misses: s.misses, score: s.score + 1 }
}

/** A miss (tap on empty arena): −1 point, same target stays up. */
export function applyMiss(stats) {
  const s = normalizeAimStats(stats)
  return { hits: s.hits, misses: s.misses + 1, score: s.score - 1 }
}

/** Index of the racer's current target = targets hit so far. */
export function currentTargetIndex(stats) {
  return normalizeAimStats(stats).hits
}

// ── N-player race hooks (see raceLogic.js) ────────────────────────────────

/** Ranking entry: highest net score wins, then most hits; no stats = DNF. */
export function aimRaceEntry(stats) {
  if (!stats) return { sortKey: null, score: null }
  const s = normalizeAimStats(stats)
  return { sortKey: [-s.score, -s.hits], score: s.score }
}

export function aimRow(stats) {
  const s = normalizeAimStats(stats)
  return {
    primary: `${s.score} PTS`,
    secondary: `${s.hits} HIT · ${s.misses} MISS`,
    progress: null,
    status: stats ? 'racing' : 'idle',
    detail: `${s.hits}`,
  }
}
