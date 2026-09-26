// Pure logic for the Reaction Time game — no DOM/Firebase/React.
import { normalizeList } from './normalize'
import { seededFraction } from './raceLogic'

export const ROUNDS = 4

// Random wait before the GO signal. In a live race the wait for tap-round i is
// seeded, so every racer gets the same sequence of waits.
export const MIN_DELAY_MS = 1500
export const MAX_DELAY_MS = 4000
// Base DNF cutoff for a live race (scaled by the room's timer setting).
export const REACTION_RACE_MS = 60_000

/** Firebase returns a real array or a numeric-keyed object depending on
 * sparsity — always normalize on read (by key, never Object.values). Missing
 * data becomes []. */
export function normalizeReactionTimes(raw) {
  return normalizeList(raw).map(Number).filter(Number.isFinite)
}

/** Average of a list of reaction times, or null when there's nothing to
 * average yet (an empty/incomplete round should never render NaN). */
export function avgReactionTime(times) {
  if (!times || times.length === 0) return null
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
}

/** Fastest (lowest) reaction time, or null when empty — Math.min(...[]) is
 * Infinity, which is never a valid ms value to render. */
export function fastestReactionTime(times) {
  if (!times || times.length === 0) return null
  return Math.min(...times)
}

/** 'X' | 'O' | 'draw' | null — null only when either side has no times yet. */
export function getReactionWinner(timesX, timesO) {
  const avgX = avgReactionTime(timesX)
  const avgO = avgReactionTime(timesO)
  if (avgX == null || avgO == null) return null
  if (avgX < avgO) return 'X'
  if (avgX > avgO) return 'O'
  return 'draw'
}

/** Renders a ms value, or an em-dash when there's nothing to show yet. */
export function formatMs(ms) {
  return ms == null ? '—' : `${ms}ms`
}

/** Seeded wait (ms) before GO on tap-round `index` of a race. `attempt`
 * counts false starts on that round, so a TOO EARLY retry doesn't replay a
 * wait the racer has just learned. */
export function seededDelayMs(seed, index, attempt = 0) {
  return Math.round(MIN_DELAY_MS + seededFraction(seed, index, 7 + attempt) * (MAX_DELAY_MS - MIN_DELAY_MS))
}

// ── N-player race hooks (see raceLogic.js) ────────────────────────────────
// Stats per racer: { times: number[], done: boolean, doneAt: ms }

export function reactionTimesOf(stats) {
  return normalizeReactionTimes(stats?.times).slice(0, ROUNDS)
}

export function isReactionDone(stats) {
  return reactionTimesOf(stats).length >= ROUNDS
}

/** Ranking entry: lowest average wins; unfinished racers DNF. */
export function reactionRaceEntry(stats) {
  if (!isReactionDone(stats)) return { sortKey: null, score: null }
  const avg = avgReactionTime(reactionTimesOf(stats))
  return { sortKey: [avg], score: avg }
}

/** Live standing: finishers by average, then everyone else by rounds done. */
export function reactionLiveKey(stats) {
  const times = reactionTimesOf(stats)
  if (times.length >= ROUNDS) return [0, avgReactionTime(times)]
  return stats ? [1, -times.length] : null
}

/** Live/final table cells for one racer. */
export function reactionRow(stats) {
  const times = reactionTimesOf(stats)
  const done = times.length >= ROUNDS
  return {
    primary: times.length ? formatMs(avgReactionTime(times)) : '—',
    secondary: times.length ? `BEST ${formatMs(fastestReactionTime(times))}` : `0/${ROUNDS}`,
    progress: times.length / ROUNDS,
    status: done ? 'done' : times.length ? 'racing' : 'idle',
    detail: `${times.length}/${ROUNDS}`,
  }
}
