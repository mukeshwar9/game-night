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
