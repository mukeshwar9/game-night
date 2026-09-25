// Pure logic for Number Memory — number generation and round-outcome rules.
// No DOM/Firebase/React; see NumberMemoryGame.jsx for the Firebase wiring.

export function generateNumber(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
}

// How many leading digits of `answer` match `number`, used to break ties
// when both players guess wrong.
export function countMatchingPrefix(answer, number) {
  const a = answer ?? ''
  const n = number ?? ''
  let i = 0
  while (i < a.length && i < n.length && a[i] === n[i]) i++
  return i
}

// Resolves a finished round (both players have answered) into one of:
//   { type: 'advance' } — both correct, move to the next level
//   { type: 'win', winner: 'X' | 'O' } — exactly one correct, or both wrong
//     with a strictly longer correct prefix
//   { type: 'replay' } — both wrong with an equal-length correct prefix
//     (including neither matching any digit) — a fair tie, replay the round
export function resolveNumberMemoryRound({ answerX, answerO, number }) {
  const xCorrect = answerX === number
  const oCorrect = answerO === number

  if (xCorrect && oCorrect) return { type: 'advance' }
  if (xCorrect) return { type: 'win', winner: 'X' }
  if (oCorrect) return { type: 'win', winner: 'O' }

  const px = countMatchingPrefix(answerX, number)
  const po = countMatchingPrefix(answerO, number)
  if (px > po) return { type: 'win', winner: 'X' }
  if (po > px) return { type: 'win', winner: 'O' }
  return { type: 'replay' }
}

// Reveal window scales with digit count so longer numbers get more time to memorize.
// Level 1 (the starting difficulty) works out to ~3s.
const SHOW_MS_BASE = 2000
const SHOW_MS_PER_DIGIT = 1000
export function showMsForLevel(level) {
  return SHOW_MS_BASE + SHOW_MS_PER_DIGIT * level
}

// Firebase-safe read of the `numRound` node (absent keys → defaults).
export function normalizeNumberRound(raw) {
  if (!raw) return { phase: 'showing', level: 1, number: '1', answerX: null, answerO: null, showUntil: null, tie: false }
  return {
    phase: raw.phase ?? 'showing',
    level: raw.level ?? 1,
    number: raw.number ?? '1',
    answerX: raw.answerX ?? null,
    answerO: raw.answerO ?? null,
    showUntil: raw.showUntil ?? null,
    tie: !!raw.tie,
  }
}

// The whole next `numRound` for an 'advance' or 'replay' outcome, or null when the
// stored round is no longer the one being resolved (another client got there first).
// Written as ONE transaction on numRound so phase, number, answers and showUntil can
// never be seen half-updated: the old two-step write let a client observe
// phase 'showing' next to the previous round's expired showUntil and flip straight
// to recall, so the replayed number was never shown.
export function buildNextNumberRound(current, outcome, expectedLevel, makeNumber = generateNumber) {
  if (!current || current.phase !== 'recall' || (current.level ?? 1) !== expectedLevel) return null
  if (outcome.type === 'advance') {
    const level = expectedLevel + 1
    return { phase: 'showing', level, number: makeNumber(level) }
  }
  if (outcome.type === 'replay') {
    return { phase: 'showing', level: expectedLevel, number: makeNumber(expectedLevel), tie: true }
  }
  return null
}

// Splits a long number into groups of three for display ("123 456 78") so it wraps
// and reads at phone width instead of running off the screen.
export function chunkDigits(number, size = 3) {
  const s = String(number ?? '')
  const out = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}
