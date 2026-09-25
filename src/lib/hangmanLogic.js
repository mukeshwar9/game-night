export const MAX_WRONG = 6

export function validateWord(raw) {
  if (!raw) return null
  const up = String(raw).toUpperCase().replace(/\s+/g, ' ').trim()
  if (!/^[A-Z]+( [A-Z]+)*$/.test(up)) return null
  const letters = up.replace(/ /g, '').length
  if (letters < 3 || letters > 30) return null
  return up
}

export function wordStructure(word) {
  return String(word).trim().split(' ').filter(Boolean).map(w => w.length)
}

export function applyGuess(word, letter) {
  const positions = []
  for (let i = 0; i < word.length; i++) {
    if (word[i] === letter) positions.push(i)
  }
  return positions
}

// guesses: { LETTER: number[]|false }  (false = miss, array = hit positions)
export function isWordGuessed(word, guesses) {
  const distinct = new Set(word.replace(/ /g, '').split(''))
  for (const letter of distinct) {
    const entry = guesses[letter]
    if (!entry || entry === false || entry === 'pending') return false
    // entry must be a non-empty array
    if (!Array.isArray(entry) || entry.length === 0) return false
  }
  return true
}

export function countWrong(guesses) {
  return Object.values(guesses || {}).filter(v => v === false).length
}

// Normalise a guess entry from Firebase (array or numeric-keyed object) to number[]
function normalizePositions(val) {
  if (!val || val === false || val === 'pending') return val
  if (Array.isArray(val)) return val
  return Object.values(val).map(Number)
}

export function verifyRoundConsistency(word, guesses) {
  for (const [letter, recorded] of Object.entries(guesses || {})) {
    if (recorded === 'pending') continue
    const expected = applyGuess(word, letter)
    if (recorded === false) {
      if (expected.length > 0) return false
    } else {
      const positions = normalizePositions(recorded)
      if (!Array.isArray(positions)) return false
      if (positions.length !== expected.length) return false
      if (!positions.every((p, i) => Number(p) === expected[i])) return false
    }
  }
  return true
}

// Re-derive the round outcome from the revealed word and the recorded guesses,
// independent of the setter-written `result`. Returns 'guessed' | 'hanged' |
// null (guesses don't actually end the round). Mirrors the setter's priority:
// a fully guessed word wins even if the wrong count also reached MAX_WRONG.
export function deriveRoundResult(word, guesses) {
  const normalized = {}
  for (const [letter, val] of Object.entries(guesses || {})) {
    normalized[letter] = normalizePositions(val)
  }
  if (isWordGuessed(word, normalized)) return 'guessed'
  if (countWrong(normalized) >= MAX_WRONG) return 'hanged'
  return null
}

// --- One pending guess at a time -------------------------------------------
//
// The guesser writes `guesses/{L} = 'pending'` and the word-keeper's client
// grades it. Letting several guesses queue up while the keeper's phone slept
// let a guesser tap all 26 letters and win after 20+ misses, because the whole
// batch was graded at once with "guessed" taking priority over "hanged".
// Now only one guess may be pending, and any leftover queue (from an older
// client) is graded in a fixed order that stops the moment the round is
// decided.

export const PENDING = 'pending'

/** Letters still waiting for the word-keeper, in the order they are graded. */
export function pendingLetters(guesses) {
  return Object.keys(guesses || {})
    .filter(letter => guesses[letter] === PENDING)
    .sort()
}

export function hasPendingGuess(guesses) {
  return pendingLetters(guesses).length > 0
}

/** True when the guesser may send `letter` now: a new A–Z letter and nothing pending. */
export function canQueueGuess(guesses, letter) {
  if (!/^[A-Z]$/.test(String(letter ?? ''))) return false
  const g = guesses || {}
  if (g[letter] !== undefined && g[letter] !== null) return false
  return !hasPendingGuess(g)
}

function roundOutcome(word, guesses) {
  if (isWordGuessed(word, guesses)) return 'guessed'
  if (countWrong(guesses) >= MAX_WRONG) return 'hanged'
  return null
}

// Grade every pending guess against `word`, one letter at a time in
// pendingLetters() order, and stop as soon as the round is decided: six misses
// hang her even if a later queued letter would have completed the word.
// Pending letters left after that are discarded (removed from `guesses`).
//
// Returns { guesses, graded, discarded, wrongCount, result, lastGuess } where
// `guesses` is the full record to write back, `result` is
// 'guessed' | 'hanged' | null and `lastGuess` is { letter, hits } for the last
// graded letter (null when nothing was graded).
export function gradePending(word, guesses) {
  const out = {}
  for (const [letter, val] of Object.entries(guesses || {})) {
    if (val === null || val === undefined) continue
    out[letter] = normalizePositions(val)
  }
  const graded = []
  const discarded = []
  let lastGuess = null
  let result = roundOutcome(word, out)
  for (const letter of pendingLetters(out)) {
    if (result) {
      delete out[letter]
      discarded.push(letter)
      continue
    }
    const positions = applyGuess(word, letter)
    out[letter] = positions.length > 0 ? positions : false
    graded.push(letter)
    lastGuess = { letter, hits: positions.length }
    result = roundOutcome(word, out)
  }
  return { guesses: out, graded, discarded, wrongCount: countWrong(out), result, lastGuess }
}
