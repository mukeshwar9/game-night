// Co-op scoring (captain decision D1, 2026-09-26 — reversible). The approved
// option was "the clue-giver scores like the guesser": both players earn the
// same points every round. In a two-player game that is one shared team score
// (a 1v1 under that rule would always tie), so Password is played as a team:
// each round's 5/4/3/2/1 points go to a team total over a fixed 12 rounds —
// 6 guessing turns each, roles alternating from `starter` — and the match
// ends with a star rating instead of a winner. To go back to head-to-head,
// credit only `lastDelta.player` and restore a first-to target.
export const MAX_ROUNDS = 12
export const MAX_CLUES = 5
export const CLUE_POINTS = [5, 4, 3, 2, 1]
export const MAX_TEAM_SCORE = MAX_ROUNDS * CLUE_POINTS[0]
// Kept for Game.jsx's `matchTargetFor` import. Co-op Password has no
// first-to target — the match is always MAX_ROUNDS long — so the "target" is
// the perfect team score, which can never end a match early.
export const TARGET_SCORE = MAX_TEAM_SCORE
// Team score needed for one, two and three stars (out of MAX_TEAM_SCORE).
// Starting values to playtest.
export const STAR_THRESHOLDS = [20, 30, 40]
export const INTRO_MS = 2000
export const REVEAL_MS = 5000
// Guess clock per clue number (1-indexed): the first two guesses get 30s,
// the next two 25s, the last 20s. Guessing gets tenser as clues run out.
export const GUESS_SECONDS = [30, 30, 25, 25, 20]

export function guessSecondsForClueNumber(clueNumber) {
  const n = Number(clueNumber)
  if (!Number.isFinite(n) || n < 1) return GUESS_SECONDS[0]
  return GUESS_SECONDS[Math.min(Math.floor(n), GUESS_SECONDS.length) - 1]
}

export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
}

export function validateClue({ clue, word, previousClues = [] }) {
  const normalizedClue = normalizeText(clue)
  const normalizedWord = normalizeText(word)
  if (!normalizedClue) return { valid: false, reason: 'CLUE CANNOT BE BLANK' }
  if (normalizedClue.split(' ').length !== 1) return { valid: false, reason: 'CLUE MUST BE ONE WORD' }
  if (normalizedClue.length > 16) return { valid: false, reason: 'CLUE MUST BE 16 CHARACTERS OR LESS' }
  if (normalizedClue === normalizedWord) return { valid: false, reason: 'CLUE CANNOT USE THE PASSWORD' }
  if (normalizedClue.length >= 3 && normalizedWord.length >= 3 &&
    (normalizedWord.includes(normalizedClue) || normalizedClue.includes(normalizedWord))) {
    return { valid: false, reason: 'CLUE CANNOT CONTAIN THE PASSWORD' }
  }
  if (previousClues.some(item => normalizeText(item?.text ?? item) === normalizedClue)) {
    return { valid: false, reason: 'CLUE ALREADY USED' }
  }
  return { valid: true, value: normalizedClue }
}

export function isCorrectGuess(guess, word) {
  return normalizeText(guess) === normalizeText(word)
}

export function scoreForClueNumber(clueNumber) {
  return CLUE_POINTS[Number(clueNumber) - 1] ?? 0
}

/** Stars (0–3) a team total earns against STAR_THRESHOLDS. */
export function starRating(teamScore) {
  const total = Number(teamScore) || 0
  return STAR_THRESHOLDS.filter(threshold => total >= threshold).length
}

/** Both seats carry the team total so shared UI (player cards, history)
 * never shows the partners as rivals. */
export function teamScoresFor(teamScore) {
  const total = Math.max(0, Number(teamScore) || 0)
  return { X: total, O: total }
}

/** Firebase returns append-only lists as arrays, numeric-keyed objects, or
 * nothing at all (empty arrays are deleted) — map by explicit key. */
export function toList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(item => item != null)
  const out = []
  Object.entries(raw).forEach(([key, value]) => {
    const index = parseInt(key, 10)
    if (Number.isInteger(index) && index >= 0 && value != null) out[index] = value
  })
  return out.filter(item => item != null)
}

/** The highest-scoring round of a match recap (earliest wins a tie), or null
 * when the team never scored. */
export function bestRound(history) {
  let best = null
  for (const entry of toList(history)) {
    if ((entry?.points || 0) > (best?.points || 0)) best = entry
  }
  return best
}

export function nextRoles(currentClueGiver) {
  const clueGiver = currentClueGiver === 'O' ? 'X' : 'O'
  return { clueGiver, guesser: clueGiver === 'X' ? 'O' : 'X' }
}

function seededRandom(seed) {
  let value = 2166136261
  for (const char of String(seed ?? '')) {
    value ^= char.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return () => {
    value += 0x6D2B79F5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickWord(deck, seed, used = []) {
  if (!Array.isArray(deck) || deck.length === 0) return -1
  const usedSet = new Set(used.map(Number))
  const available = deck.map((_, index) => index).filter(index => !usedSet.has(index))
  const pool = available.length ? available : deck.map((_, index) => index)
  const random = seededRandom(seed)
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool[0]
}

export function createInitialRound({ starter = 'X', seed, wordIndex, wordLength = null }) {
  const clueGiver = starter === 'O' ? 'O' : 'X'
  return {
    phase: 'intro',
    roundNum: 1,
    clueGiver,
    guesser: clueGiver === 'X' ? 'O' : 'X',
    matchSeed: String(seed ?? ''),
    used: [wordIndex],
    wordIndex,
    wordPattern: wordLength ? String(wordLength) : '',
    clues: [],
    guesses: [],
    lastDelta: null,
    teamScore: 0,
    history: [],
    endsAt: null,
  }
}

// Close out a round: record it in the match recap, bank its points into the
// team total, and hand over to the reveal.
function resolveRound(round, { points = 0, clueNumber = 0, guesses, now }) {
  const entry = {
    roundNum: round.roundNum,
    wordIndex: round.wordIndex,
    clueGiver: round.clueGiver,
    guesser: round.guesser,
    points,
    clueNumber: points ? clueNumber : 0,
  }
  return {
    ...round,
    phase: 'reveal',
    guesses,
    lastDelta: points ? { player: round.guesser, points, clueNumber } : null,
    teamScore: (Number(round.teamScore) || 0) + points,
    history: [...toList(round.history), entry],
    endsAt: now + REVEAL_MS,
  }
}

export function applyClue(round, clue, now = Date.now()) {
  const clues = toList(round?.clues)
  if (!round || round.phase !== 'clue' || clues.length >= MAX_CLUES) return null
  const check = validateClue({ clue, word: round.word ?? '', previousClues: clues })
  if (!check.valid) return null
  const clueNumber = clues.length + 1
  const next = {
    ...round,
    phase: 'guess',
    clues: [...clues, { text: check.value, at: now }],
    endsAt: now + guessSecondsForClueNumber(clueNumber) * 1000,
  }
  delete next.word
  return next
}

export function applyGuess(round, guess, word, now = Date.now()) {
  const clueNumber = toList(round?.clues).length
  if (!round || round.phase !== 'guess' || clueNumber < 1) return null
  // Late guesses lose the race to the clock — the timeout owns the slot.
  if (round.endsAt && now > round.endsAt) return null
  const text = normalizeText(guess)
  if (!text || text.length > 24) return null
  const correct = isCorrectGuess(text, word)
  const nextGuesses = [...toList(round.guesses), { text, at: now, correct }]
  if (correct) return resolveRound(round, { points: scoreForClueNumber(clueNumber), clueNumber, guesses: nextGuesses, now })
  if (clueNumber >= MAX_CLUES) return resolveRound(round, { guesses: nextGuesses, now })
  return {
    ...round,
    phase: 'clue',
    guesses: nextGuesses,
    lastDelta: null,
    endsAt: null,
  }
}

// A guess slot left to expire: records a timed-out miss and hands play back
// to the clue giver (or to reveal when the last clue is spent). Returns null
// when the timeout does not apply (wrong phase, stale clock, already moved).
export function applyGuessTimeout(round, now = Date.now()) {
  const clueNumber = toList(round?.clues).length
  if (!round || round.phase !== 'guess' || clueNumber < 1) return null
  if (!round.endsAt || now <= round.endsAt) return null
  const nextGuesses = [...toList(round.guesses), { text: '', at: now, correct: false, timeout: true }]
  if (clueNumber >= MAX_CLUES) return resolveRound(round, { guesses: nextGuesses, now })
  return {
    ...round,
    phase: 'clue',
    guesses: nextGuesses,
    lastDelta: null,
    endsAt: null,
  }
}

/** Co-op: the match is over after MAX_ROUNDS rounds, and nobody loses — the
 * result is always 'draw' (the team score and stars are the outcome).
 * The first argument (seat scores) is kept for backward compatibility and
 * no longer decides anything. */
export function getMatchWinner(...args) {
  const roundNum = args[1] ?? 0
  return Number(roundNum) >= MAX_ROUNDS ? 'draw' : null
}

/** The team total a round carries, falling back to the seat scores for
 * rounds written before co-op scoring existed. */
export function teamScoreOf(round, scores = {}) {
  const stored = Number(round?.teamScore)
  if (round?.teamScore != null && Number.isFinite(stored)) return stored
  return Math.max(Number(scores?.X) || 0, Number(scores?.O) || 0)
}

export function advanceAfterReveal(round, scores = {}, deck, now = Date.now()) {
  if (!round || round.phase !== 'reveal') return null
  const teamScore = teamScoreOf(round, scores)
  const team = teamScoresFor(teamScore)
  const winner = getMatchWinner(team, round.roundNum)
  if (winner) return { winner, status: 'finished', scores: team, round: { ...round, teamScore, phase: 'finished', endsAt: null } }
  const used = toList(round.used)
  const index = pickWord(deck, round.matchSeed, used)
  const roles = nextRoles(round.clueGiver)
  const next = {
    ...round,
    phase: 'intro',
    roundNum: round.roundNum + 1,
    clueGiver: roles.clueGiver,
    guesser: roles.guesser,
    used: [...used, index],
    wordIndex: index,
    wordPattern: deck?.[index]?.word ? String(deck[index].word.length) : '',
    clues: [],
    guesses: [],
    lastDelta: null,
    teamScore,
    endsAt: now + INTRO_MS,
  }
  return { winner: null, status: 'playing', scores: team, round: next }
}
