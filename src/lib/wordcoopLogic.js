import { markGuess, isValidGuess } from './wordduelLogic'

export const MAX_GUESSES = 6
export const WORD_LENGTH = 5

function hashSeed(seed) {
  const text = String(seed ?? '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function pickAnswer(answerList, seed, used = []) {
  const words = Array.isArray(answerList) ? answerList : []
  const usedSet = new Set((used || []).map(value => {
    if (typeof value === 'number') return words[value]?.toLowerCase()
    return String(value).toLowerCase()
  }))
  const available = words
    .map((word, index) => ({ word: String(word).toLowerCase(), index }))
    .filter(({ word }) => word.length === WORD_LENGTH && !usedSet.has(word))
  const pool = available.length > 0 ? available : words.map((word, index) => ({ word: String(word).toLowerCase(), index }))
  if (pool.length === 0) return -1
  return pool[hashSeed(seed) % pool.length].index
}

export function nextTurn(currentTurn) {
  return currentTurn === 'O' ? 'X' : 'O'
}

export function normalizeGuesses(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, guess]) => guess)
    .filter(Boolean)
}

export function canSubmitGuess(round, player) {
  if (!round || round.phase !== 'playing') return false
  if (player !== 'X' && player !== 'O') return false
  if (round.currentTurn !== player) return false
  return normalizeGuesses(round.guesses).length < MAX_GUESSES
}

export function applySharedGuess(round, { player, guess, answer, at = Date.now() }) {
  if (!canSubmitGuess(round, player)) return null
  const word = String(guess ?? '').trim().toUpperCase()
  const secret = String(answer ?? '').trim().toUpperCase()
  if (!isValidGuess(word) || secret.length !== WORD_LENGTH) return null

  const marks = markGuess(word, secret)
  const guesses = [...normalizeGuesses(round.guesses), { by: player, word, marks, at }]
  const solved = marks === 'GGGGG'
  const exhausted = guesses.length >= MAX_GUESSES
  return {
    ...round,
    phase: solved || exhausted ? 'reveal' : 'playing',
    currentTurn: solved || exhausted ? null : nextTurn(player),
    guesses,
    result: solved
      ? { outcome: 'win', solvedBy: player, answer: secret }
      : exhausted
        ? { outcome: 'loss', solvedBy: null, answer: secret }
        : null,
  }
}

export function getRoundOutcome(round) {
  return round?.result?.outcome || null
}

export function collectUsedAnswers(previousRound) {
  const used = Array.isArray(previousRound?.used) ? [...previousRound.used] : []
  const idx = previousRound?.answerIndex
  if (Number.isInteger(idx) && idx >= 0 && !used.includes(idx)) used.push(idx)
  return used
}

export function buildWordCoopRoundStart({ answerList, previousRound, seed, starter }) {
  const used = collectUsedAnswers(previousRound)
  const answerIndex = pickAnswer(answerList, seed, used)
  const answer = Array.isArray(answerList) ? answerList[answerIndex] : undefined
  return createNextRound({ seed, starter, answerIndex, answer, used })
}

export function createNextRound({ previousRound, seed, starter = 'X', answerIndex, answer, used }) {
  const usedList = used ?? (Array.isArray(previousRound?.used) ? previousRound.used : null)
  return {
    phase: 'playing',
    seed: String(seed ?? ''),
    answerIndex: Number.isInteger(answerIndex) ? answerIndex : -1,
    // Pin the answer word itself: grading against only the local bundle's
    // answerList lets clients on different deploys mark the same guess
    // differently. Readers fall back to the bundle when absent (old rooms).
    ...(typeof answer === 'string' && answer ? { answer } : {}),
    currentTurn: starter === 'O' ? 'O' : 'X',
    guesses: [],
    result: null,
    ...(usedList?.length ? { used: usedList } : {}),
  }
}
