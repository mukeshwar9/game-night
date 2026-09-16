// Pure logic for the Typing Race game — no DOM/Firebase/React.

// Floor on elapsed time used for WPM math. Without this, a clock-skew or
// same-millisecond finish divides by ~0 and produces Infinity/absurd WPM.
export const MIN_ELAPSED_MS = 1000

/** Count of characters typed correctly against the passage, position by
 * position. This — not the raw passage length — is what WPM/accuracy score. */
export function countCorrectChars(typed, passage) {
  let matches = 0
  const len = Math.min(typed.length, passage.length)
  for (let i = 0; i < len; i++) {
    if (typed[i] === passage[i]) matches++
  }
  return matches
}

/** Standard WPM: (correct chars / 5) per minute, clamped to a 1s-minimum
 * elapsed window and a 1 WPM floor so a fast/skewed finish never reports
 * 0, negative, or Infinity. */
export function computeWpm(correctChars, elapsedMs) {
  const minutes = Math.max(elapsedMs, MIN_ELAPSED_MS) / 60_000
  return Math.max(1, Math.round((correctChars / 5) / minutes))
}

/** Accuracy as a percentage of the passage typed correctly. */
export function computeAccuracy(correctChars, passageLength) {
  if (!passageLength) return 100
  return Math.round((correctChars / passageLength) * 100)
}

/** Accuracy-weighted "effective WPM" used to rank finishers — null when
 * either input is missing (e.g. the opponent hasn't finished yet). */
export function computeEffWpm(wpm, acc) {
  if (wpm == null || acc == null) return null
  return Math.round((wpm * acc) / 100)
}
