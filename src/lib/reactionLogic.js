// Pure logic for the Reaction Time game — no DOM/Firebase/React.

export const ROUNDS = 4

/** Firebase returns a real array or a numeric-keyed object depending on
 * sparsity — always normalize on read. Missing/absent data becomes []. */
export function normalizeReactionTimes(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(v => v != null).map(Number)
  return Object.values(raw).map(Number)
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
