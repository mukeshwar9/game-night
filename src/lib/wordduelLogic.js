import { commit, verifyReveal } from './commit'
import { has, isAnswerWord } from './dictionary'

export const MAX_GUESSES = 6
export const WORD_LENGTH = 5
export const MATCH_WINS = 3

// Two-pass duplicate-letter mark algorithm per Wordle convention.
// Pass 1: greens (exact match). Pass 2: yellows (in word, wrong spot),
// limited by remaining letters after greens are consumed.
export function markGuess(guess, answer) {
  if (!guess || !answer) return null
  if (guess.length !== WORD_LENGTH || answer.length !== WORD_LENGTH) return null

  const upper = guess.toUpperCase()
  const ans = answer.toUpperCase()
  const marks = Array(WORD_LENGTH).fill('B') // B = black/gray/absent

  // Build frequency map of answer letters
  const freq = {}
  for (let i = 0; i < WORD_LENGTH; i++) {
    freq[ans[i]] = (freq[ans[i]] || 0) + 1
  }

  // Pass 1: greens (exact matches) — consume a count for each
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (upper[i] === ans[i]) {
      marks[i] = 'G'
      freq[ans[i]]--
    }
  }

  // Pass 2: yellows (in word but wrong spot, limited by remaining freq)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (marks[i] === 'G') continue
    if (freq[upper[i]] > 0) {
      marks[i] = 'Y'
      freq[upper[i]]--
    }
  }

  return marks.join('')
}

// Compare round results: fewer guesses wins; equal → faster time; both fail → draw
export function compareResults(doneX, doneO) {
  if (!doneX || !doneO) return null

  const xSolved = doneX.solved
  const oSolved = doneO.solved

  // Both solved: fewer guesses wins; tie → faster time
  if (xSolved && oSolved) {
    if (doneX.guesses < doneO.guesses) return 'X'
    if (doneO.guesses < doneX.guesses) return 'O'
    if (doneX.at < doneO.at) return 'X'
    if (doneO.at < doneX.at) return 'O'
    return 'draw'
  }

  // One solved, one failed: solved wins
  if (xSolved && !oSolved) return 'X'
  if (oSolved && !xSolved) return 'O'

  // Both failed: draw
  return 'draw'
}

// Verify the entire transcript for a player:
// 1. Commitment matches reveal
// 2. Revealed word is a valid answer word
// 3. Every recorded guess mark matches what markGuess would produce
export async function verifyTranscript(commitmentHash, reveal, guesses) {
  if (!commitmentHash || !reveal || !reveal.word || !reveal.salt) {
    return { ok: false, reason: 'missing_data' }
  }

  const { word, salt } = reveal
  const upperWord = word.toUpperCase()

  // Check commitment
  const commitOk = await verifyReveal(commitmentHash, word, salt)
  if (!commitOk) return { ok: false, reason: 'commit_mismatch' }

  // Check answer word validity
  if (!isAnswerWord(upperWord)) return { ok: false, reason: 'not_answer_word' }

  // Recompute all marks
  if (guesses) {
    for (const g of guesses) {
      if (!g || !g.word) continue
      const expected = markGuess(g.word, upperWord)
      if (!expected) return { ok: false, reason: 'invalid_guess' }
      if (g.marks && g.marks !== expected) {
        return { ok: false, reason: 'marks_mismatch', detail: { guess: g.word, got: g.marks, expected } }
      }
    }
  }

  // Verify done state: solved check + guess count
  const solved = guesses && guesses.some(g => g.word && g.word.toUpperCase() === upperWord)
  if (solved) {
    const guessIndex = guesses.findIndex(g => g.word && g.word.toUpperCase() === upperWord)
    if (guessIndex >= MAX_GUESSES) return { ok: false, reason: 'solved_after_max' }
  }

  // Check that marks exist for all guesses (not still pending)
  if (guesses) {
    for (const g of guesses) {
      if (!g.marks) return { ok: false, reason: 'pending_marks' }
    }
  }

  return { ok: true }
}

// Check if a guess solves the word
export function isSolved(marksStr) {
  return marksStr === 'GGGGG'
}

// Check if player is done (solved OR max guesses reached)
export function isDone(guesses) {
  if (!guesses || !guesses.length) return false
  const last = guesses[guesses.length - 1]
  if (last && last.marks === 'GGGGG') return true
  return guesses.length >= MAX_GUESSES
}

// Get the solve state from guesses
export function getDoneState(guesses) {
  if (!guesses || !guesses.length) return null
  const solved = guesses.some(g => g.marks === 'GGGGG')
  const done = solved || guesses.length >= MAX_GUESSES
  if (!done) return null
  return {
    solved,
    guesses: guesses.length,
    at: Date.now(),
  }
}

// Check if a guess word is valid (in the dictionary)
export function isValidGuess(word) {
  return Boolean(word) && word.length === WORD_LENGTH && has(word)
}

// Commit a word (generates hash + salt, stores locally)
export async function commitWord(word) {
  return commit(word)
}

// Derive the keyboard letter states from a set of guesses
// Returns an object mapping letter -> 'G'|'Y'|'B'
export function getKeyboardState(guesses) {
  const state = {}
  if (!guesses) return state

  for (const g of guesses) {
    if (!g || !g.word || !g.marks) continue
    const word = g.word.toUpperCase()
    for (let i = 0; i < word.length; i++) {
      const letter = word[i]
      const mark = g.marks[i]
      const current = state[letter]
      // Priority: G > Y > B (green beats yellow beats gray)
      if (mark === 'G' || (mark === 'Y' && current !== 'G') || (mark === 'B' && !current)) {
        if (mark === 'G') state[letter] = 'G'
        else if (mark === 'Y' && current !== 'G') state[letter] = 'Y'
        else if (!current) state[letter] = 'B'
      }
    }
  }
  return state
}
