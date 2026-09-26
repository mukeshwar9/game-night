import { commit, verifyReveal } from './commit'
import { has } from './dictionary'
import { isBannedWord } from './wordDenylist'

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

  // Check the revealed word was legal to set in the first place — must accept
  // exactly what the setting UI accepted (isValidGuess), not the smaller
  // answer-only list, or the vast majority of legitimately-set words fail
  // verification as "cheating".
  if (!isValidGuess(upperWord)) return { ok: false, reason: 'not_valid_word' }

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

// ── Round flow helpers (multiplayer) ─────────────────────────────────────────
//
// Each seat's guesses are graded by the OTHER seat's client, the only one that
// knows the secret word it is guessing. So in a verified round:
//   - my guesses were marked with the opponent's word, and
//   - the opponent's guesses were marked with my word.
// Everything below keeps those two directions straight.

// Once one side has finished its board, the other side has this long before
// the finished player can call time (the unfinished board counts as a fail).
export const DUEL_FINISH_GRACE_MS = 90_000

// Guesses by index. Firebase returns an array or a numeric-keyed object; map
// by explicit key so a sparse read never shifts a guess to the wrong row.
export function normalizeGuessList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(g => g ?? null)
  const arr = []
  Object.entries(raw).forEach(([k, v]) => {
    const i = parseInt(k, 10)
    if (Number.isInteger(i) && i >= 0) arr[i] = v ?? null
  })
  for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = null
  return arr
}

// Why a typed guess can't be played, or null when it can.
export function guessProblem(word) {
  const w = String(word ?? '').trim()
  if (w.length < WORD_LENGTH) return 'TOO SHORT'
  if (isBannedWord(w)) return 'NOT ALLOWED'
  if (!isValidGuess(w)) return 'NOT IN WORD LIST'
  return null
}

// Why a secret word can't be set, or null when it can. Setters may pick any
// valid word except banned ones (slurs / vulgarity are never shown).
export function secretWordProblem(word) {
  const w = String(word ?? '').trim()
  if (w.length < WORD_LENGTH) return 'TOO SHORT'
  if (isBannedWord(w)) return 'NOT ALLOWED — PICK ANOTHER WORD'
  if (!isValidGuess(w)) return 'NOT IN WORD LIST'
  return null
}

export function isAllowedSecret(word) {
  return secretWordProblem(word) === null
}

// The done state a board has reached from its graded guesses, or null while
// it is still in play (or a counted guess is still waiting for its marks).
// Speed is the solving guess's own `at`, never the time it was graded, so a
// slow grader cannot change who was faster.
export function getGradedDoneState(guesses) {
  const list = guesses || []
  const limit = Math.min(list.length, MAX_GUESSES)
  for (let i = 0; i < limit; i++) {
    const g = list[i]
    if (!g || !g.marks) return null
    if (g.marks === 'GGGGG') return { solved: true, guesses: i + 1, at: Number(g.at) || 0 }
  }
  if (limit === MAX_GUESSES) {
    return { solved: false, guesses: MAX_GUESSES, at: Number(list[MAX_GUESSES - 1]?.at) || 0 }
  }
  return null
}

// Mark every ungraded guess with the grader's secret word.
export function gradeGuesses(guesses, word) {
  let changed = false
  const next = (guesses || []).map(g => {
    if (!g || !g.word || g.marks) return g
    const marks = markGuess(g.word, word)
    if (!marks) return g
    changed = true
    return { ...g, marks }
  })
  return { guesses: next, changed, done: getGradedDoneState(next) }
}

// Transaction body for the grader: mark `guesser`'s pending guesses with the
// grader's word and, when that finishes the board (solved, or 6 graded
// guesses), write done{guesser} in the same write — so done never lands
// before the final grade and a 6th-guess solve is never recorded as a fail.
// Returns the next round, or null when there is nothing to write.
export function applyGrading(round, { guesser, word, now }) {
  if (!round || round.phase !== 'guessing' || round.result) return null
  if (guesser !== 'X' && guesser !== 'O') return null
  if (!word || String(word).length !== WORD_LENGTH) return null
  const key = `guesses${guesser}`
  const doneKey = `done${guesser}`
  const { guesses, changed, done } = gradeGuesses(normalizeGuessList(round[key]), word)
  const writeDone = !!done && !round[doneKey]
  if (!changed && !writeDone) return null
  const next = { ...round, [key]: guesses }
  if (writeDone) {
    next[doneKey] = { ...done, gradedAt: now }
    if (!round.firstDoneAt) next.firstDoneAt = now
  }
  return next
}

// Transaction body for a guess. Caps a board at MAX_GUESSES and refuses
// guesses after a solve, after done, or outside the guessing phase.
export function applyDuelGuess(round, { player, word, at }) {
  if (!round || round.phase !== 'guessing' || round.result) return null
  if (player !== 'X' && player !== 'O') return null
  const w = String(word ?? '').trim().toUpperCase()
  if (guessProblem(w)) return null
  if (round[`done${player}`]) return null
  const list = normalizeGuessList(round[`guesses${player}`])
  if (list.length >= MAX_GUESSES) return null
  if (list.some(g => g?.marks === 'GGGGG')) return null
  return { ...round, [`guesses${player}`]: [...list, { word: w, at }] }
}

// When the finish-grace clock (started by the first finished board) runs out.
export function getFinishGraceEndsAt(round, graceMs = DUEL_FINISH_GRACE_MS) {
  if (!round || round.phase !== 'guessing' || round.result) return null
  if (!!round.doneX === !!round.doneO) return null
  const first = round.firstDoneAt || round.doneX?.gradedAt || round.doneO?.gradedAt
  return first ? first + graceMs : null
}

// Transaction body for "time's up": the finished `claimer` ends the other
// board. The claimer grades any pending guesses first (it holds the word), so
// a last-second solve still counts; otherwise the other board is recorded as
// an unsolved, timed-out fail.
export function applyFinishTimeout(round, { claimer, word, now, graceMs = DUEL_FINISH_GRACE_MS }) {
  if (claimer !== 'X' && claimer !== 'O') return null
  const endsAt = getFinishGraceEndsAt(round, graceMs)
  if (!endsAt || now < endsAt) return null
  const other = claimer === 'X' ? 'O' : 'X'
  if (!round[`done${claimer}`] || round[`done${other}`]) return null
  const graded = word ? applyGrading(round, { guesser: other, word, now }) : null
  const base = graded || round
  if (base[`done${other}`]) return base
  const list = normalizeGuessList(base[`guesses${other}`])
  if (list.some(g => g && g.word && !g.marks)) return null // cannot grade without the word
  return {
    ...base,
    [`done${other}`]: { solved: false, guesses: list.length, at: now, gradedAt: now, timedOut: true },
  }
}

// Re-check one board against the revealed word that graded it. Recorded marks
// must equal what the word produces (a mismatch means the grader lied);
// guesses still waiting for marks are graded here from the verified word, so
// a pending mark never reads as cheating. Returns the verified done state,
// which decides the round instead of the recorded one.
export function verifyGradedBoard({ word, guesses, done }) {
  const upper = String(word ?? '').toUpperCase()
  if (upper.length !== WORD_LENGTH) return { ok: false, reason: 'missing_data' }
  const list = normalizeGuessList(guesses)
  const counted = done?.timedOut ? list.slice(0, Math.max(0, Number(done.guesses) || 0)) : list
  const filled = []
  for (const g of counted) {
    if (!g || !g.word) { filled.push(g); continue }
    const expected = markGuess(g.word, upper)
    if (!expected) return { ok: false, reason: 'invalid_guess' }
    if (g.marks && g.marks !== expected) {
      return { ok: false, reason: 'marks_mismatch', detail: { guess: g.word, got: g.marks, expected } }
    }
    filled.push({ ...g, marks: expected })
  }
  let verified = getGradedDoneState(filled)
  if (!verified && done?.timedOut) {
    verified = { solved: false, guesses: counted.length, at: Number(done.at) || 0, timedOut: true }
  }
  if (!verified) return { ok: false, pending: true, reason: 'board_not_finished' }
  return { ok: true, done: verified }
}

// Verify the opponent's reveal (THEIR word) against MY guesses, which the
// opponent graded with that word. (Checking their word against their own
// guesses — at my word — flagged honest rounds as cheating.)
export async function verifyOpponentRound({ oppCommit, oppReveal, myGuesses, myDone }) {
  if (!oppCommit || !oppReveal?.word || !oppReveal?.salt) return { ok: false, reason: 'missing_data' }
  const word = String(oppReveal.word).toUpperCase()
  const commitOk = await verifyReveal(oppCommit, oppReveal.word, oppReveal.salt)
  if (!commitOk) return { ok: false, reason: 'commit_mismatch' }
  if (!isValidGuess(word)) return { ok: false, reason: 'not_valid_word' }
  if (isBannedWord(word)) return { ok: false, reason: 'banned_word' }
  return verifyGradedBoard({ word, guesses: myGuesses, done: myDone })
}

// The round winner from both verified boards (seat-positional).
export function decideDuelRound(verifiedX, verifiedO) {
  return compareResults(verifiedX, verifiedO)
}

// Fallback for a grader on an older client that writes marks but not done:
// the guesser may record its own done — derived only from graded marks, so it
// is identical to what the grader would write and never lands before grading.
export function applySelfDone(round, { player, now }) {
  if (!round || round.phase !== 'guessing' || round.result) return null
  if (player !== 'X' && player !== 'O') return null
  if (round[`done${player}`]) return null
  const done = getGradedDoneState(normalizeGuessList(round[`guesses${player}`]))
  if (!done) return null
  const next = { ...round, [`done${player}`]: { ...done, gradedAt: now } }
  if (!round.firstDoneAt) next.firstDoneAt = now
  return next
}

// The next round's stub. `roundNum` identifies the round, so both clients
// reset their per-round state when it changes (the page is not remounted).
export function nextDuelRound(round) {
  return { phase: 'setting', roundNum: (Number(round?.roundNum) || 1) + 1 }
}
