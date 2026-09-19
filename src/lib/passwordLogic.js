export const TARGET_SCORE = 15
export const MAX_ROUNDS = 12
export const MAX_CLUES = 5
export const CLUE_POINTS = [5, 4, 3, 2, 1]
export const INTRO_MS = 2000
export const REVEAL_MS = 5000

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
    endsAt: null,
  }
}

export function applyClue(round, clue, now = Date.now()) {
  if (!round || round.phase !== 'clue' || round.clues?.length >= MAX_CLUES) return null
  const check = validateClue({ clue, word: round.word ?? '', previousClues: round.clues })
  if (!check.valid) return null
  const next = {
    ...round,
    phase: 'guess',
    clues: [...(round.clues || []), { text: check.value, at: now }],
    endsAt: null,
  }
  delete next.word
  return next
}

export function applyGuess(round, guess, word, now = Date.now()) {
  if (!round || round.phase !== 'guess' || (round.clues?.length ?? 0) < 1) return null
  const text = normalizeText(guess)
  if (!text || text.length > 24) return null
  const correct = isCorrectGuess(text, word)
  const clueNumber = round.clues.length
  const nextGuesses = [...(round.guesses || []), { text, at: now, correct }]
  return {
    ...round,
    phase: correct || clueNumber >= MAX_CLUES ? 'reveal' : 'clue',
    guesses: nextGuesses,
    lastDelta: correct ? { player: round.guesser, points: scoreForClueNumber(clueNumber), clueNumber } : null,
    endsAt: correct || clueNumber >= MAX_CLUES ? now + REVEAL_MS : null,
  }
}

export function getMatchWinner(scores = {}, roundNum = 0) {
  const x = Number(scores.X || 0)
  const o = Number(scores.O || 0)
  if (x >= TARGET_SCORE) return 'X'
  if (o >= TARGET_SCORE) return 'O'
  if (roundNum >= MAX_ROUNDS) return x === o ? 'draw' : x > o ? 'X' : 'O'
  return null
}

export function advanceAfterReveal(round, scores = {}, deck, now = Date.now()) {
  if (!round || round.phase !== 'reveal') return null
  const winner = getMatchWinner(scores, round.roundNum)
  if (winner) return { winner, status: 'finished', scores, round: { ...round, phase: 'finished', endsAt: null } }
  const index = pickWord(deck, round.matchSeed, round.used || [])
  const roles = nextRoles(round.clueGiver)
  const next = {
    ...round,
    phase: 'intro',
    roundNum: round.roundNum + 1,
    clueGiver: roles.clueGiver,
    guesser: roles.guesser,
    used: [...(round.used || []), index],
    wordIndex: index,
    wordPattern: deck?.[index]?.word ? String(deck[index].word.length) : '',
    clues: [],
    guesses: [],
    lastDelta: null,
    endsAt: now + INTRO_MS,
  }
  return { winner: null, status: 'playing', scores, round: next }
}
