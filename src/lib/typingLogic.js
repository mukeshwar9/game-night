// Pure logic for the Typing Race game — no DOM/Firebase/React.
import { pickFresh } from './seenHistory'

// Race passages. APPEND-ONLY: rooms remember passages by index in their
// per-room seen history (seenHistory.js), so reordering would repeat cards.
export const PASSAGES = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. A wizard's job is to vex chumps quickly in fog.",
  "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment. Never stop being who you are.",
  "Success is not final, failure is not fatal. It is the courage to continue that counts. Keep moving forward and never give up on your dreams.",
  "The only way to do great work is to love what you do. If you have not found it yet, keep looking. Do not settle for less than what makes you happy.",
  "In the middle of every difficulty lies opportunity. Those who dare to fail greatly can achieve greatly. Believe in yourself and your abilities.",
  "Typing fast requires practice, focus, and the right technique. Keep your fingers on the home row, stay relaxed, and let your muscle memory do the work.",
  "The best time to plant a tree was twenty years ago. The second best time is now. Start today and your future self will thank you for the effort.",
  "We are what we repeatedly do. Excellence, then, is not an act but a habit. Small daily improvements over time lead to remarkable results.",
  "All great things are simple, and many can be expressed in single words such as freedom, justice, honor, duty, mercy, and hope. These words guide us.",
  "Life is what happens when you are busy making other plans. Enjoy the little things, for one day you may look back and realize they were the big things.",
  "It does not matter how slowly you go as long as you do not stop. Perseverance and patience are the keys to mastering any skill worth having.",
  "The secret of getting ahead is getting started. Break your tasks into small steps and tackle one at a time. Progress, not perfection, is the goal.",
]

// Base DNF cutoff for a live race (scaled by the room's timer setting): long
// enough for a slow phone typist to finish a ~150-char passage.
export const TYPING_RACE_MS = 150_000

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

/** A passage index for the next race — never-seen in this room first. */
export function pickPassageIndex(seen, rng = Math.random) {
  return pickFresh(PASSAGES.length, seen, rng) ?? 0
}

// ── N-player race hooks (see raceLogic.js) ────────────────────────────────
// Stats per racer: { progress, wpm?, acc?, eff?, done?, doneAt? }

export function isTypingDone(stats) {
  return !!stats?.done && stats?.wpm != null
}

/** Ranking entry: highest accuracy-weighted WPM wins; unfinished racers DNF. */
export function typingRaceEntry(stats) {
  if (!isTypingDone(stats)) return { sortKey: null, score: null }
  const eff = computeEffWpm(Number(stats.wpm), Number(stats.acc ?? 100))
  return { sortKey: [-eff], score: eff }
}

/** Live standing: finishers by eff-WPM, then everyone else by progress. */
export function typingLiveKey(stats) {
  if (isTypingDone(stats)) return [0, -computeEffWpm(Number(stats.wpm), Number(stats.acc ?? 100))]
  return stats ? [1, -(Number(stats.progress) || 0)] : null
}

/** Live/final table cells for one racer (`passageLength` scales progress). */
export function typingRow(stats, passageLength) {
  const progress = Math.max(0, Number(stats?.progress) || 0)
  const pct = passageLength > 0 ? Math.min(1, progress / passageLength) : 0
  if (isTypingDone(stats)) {
    const eff = computeEffWpm(Number(stats.wpm), Number(stats.acc ?? 100))
    return { primary: `${eff} EFF`, secondary: `${stats.wpm} WPM · ${stats.acc ?? 100}%`, progress: 1, status: 'done', detail: '100%' }
  }
  return { primary: `${Math.round(pct * 100)}%`, secondary: '', progress: pct, status: progress > 0 ? 'racing' : 'idle', detail: `${Math.round(pct * 100)}%` }
}
