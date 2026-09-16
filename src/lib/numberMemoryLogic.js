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
