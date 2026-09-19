import {
  isSolved,
  isValidGuess,
  getKeyboardState,
  markGuess,
  MAX_GUESSES,
  WORD_LENGTH,
} from './wordduelLogic'

export { isSolved, isValidGuess, markGuess, getKeyboardState, MAX_GUESSES, WORD_LENGTH }

export const MATCH_TARGET = 3
export const FINISH_GRACE_MS = 30_000

function hashSeed(seed) {
  const text = String(seed ?? '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function nextRandom(state) {
  let value = (state + 0x6D2B79F5) | 0
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return { state: value | 0, value: ((value ^ (value >>> 14)) >>> 0) / 4294967296 }
}

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw
  if (!raw) return []
  return Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map(key => raw[key])
}

export function normalizeGuesses(raw) {
  return normalizeList(raw)
}

// Returns an index into answerList. The seeded Fisher-Yates order makes every
// round deterministic for both clients while `used` prevents repeats.
export function pickAnswer(answerList, seed, used = []) {
  const list = normalizeList(answerList)
  if (!list.length) return -1

  const usedSet = new Set(normalizeList(used).map(Number))
  const order = list.map((_, index) => index)
  let state = hashSeed(seed)
  for (let i = order.length - 1; i > 0; i--) {
    const next = nextRandom(state)
    state = next.state
    const j = Math.floor(next.value * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order.find(index => !usedSet.has(index)) ?? order[0]
}

function doneForGuesses(guesses, at) {
  const list = normalizeGuesses(guesses)
  if (!list.length) return null
  const solved = list.some(guess => guess?.marks && isSolved(guess.marks))
  if (!solved && list.length < MAX_GUESSES) return null
  return { solved, guesses: list.length, at }
}

export function getDoneState(guesses, at = Date.now()) {
  return doneForGuesses(guesses, at)
}

// Apply one player's guess. Returns null when round/player/guess is invalid.
// This function never mutates its input, so it can run inside an RTDB
// transaction callback.
export function applyGuessForPlayer(round, player, guess, answer, at) {
  if (!round || round.phase !== 'playing' || !['X', 'O'].includes(player)) return null
  const word = String(guess ?? '').trim().toLowerCase()
  if (word.length !== WORD_LENGTH || !isValidGuess(word) || !answer) return null

  const key = `guesses${player}`
  const doneKey = `done${player}`
  const guesses = normalizeGuesses(round[key])
  if (round[doneKey] || guesses.length >= MAX_GUESSES) return null

  const nextGuesses = [...guesses, {
    word,
    marks: markGuess(word, answer),
    at,
  }]
  const next = { ...round, [key]: nextGuesses }
  const done = doneForGuesses(nextGuesses, at)
  if (done) next[doneKey] = done
  return next
}

export function compareRace(doneX, doneO) {
  if (!doneX && !doneO) return null
  if (doneX?.solved && !doneO) return 'X'
  if (doneO?.solved && !doneX) return 'O'
  if (!doneX || !doneO) return null

  if (doneX.solved && !doneO.solved) return 'X'
  if (doneO.solved && !doneX.solved) return 'O'
  if (!doneX.solved && !doneO.solved) return 'draw'
  if (doneX.guesses < doneO.guesses) return 'X'
  if (doneO.guesses < doneX.guesses) return 'O'
  if (doneX.at < doneO.at) return 'X'
  if (doneO.at < doneX.at) return 'O'
  return 'draw'
}

export function getRaceReason(doneX, doneO) {
  if (!doneX && !doneO) return null
  if (doneX?.solved && !doneO) return 'solved'
  if (doneO?.solved && !doneX) return 'solved'
  if (!doneX || !doneO) return null
  if (!doneX.solved && !doneO.solved) return 'fail'
  if (doneX.solved !== doneO.solved) return 'solved'
  return doneX.guesses === doneO.guesses ? 'speed' : 'solved'
}

export function shouldReveal(round, now = Date.now()) {
  if (!round || round.phase !== 'playing') return false
  if (round.doneX && round.doneO) return true
  const solved = round.doneX?.solved ? round.doneX : round.doneO?.solved ? round.doneO : null
  if (!solved || !solved.at) return false
  const otherDone = round.doneX?.solved ? round.doneO : round.doneX
  return Boolean(otherDone || now >= solved.at + FINISH_GRACE_MS)
}

export function nextRound(round, seed, answerIndex) {
  const previousUsed = normalizeList(round?.used).map(Number).filter(Number.isInteger)
  const used = previousUsed.includes(answerIndex) ? previousUsed : [...previousUsed, answerIndex]
  return {
    phase: 'playing',
    roundNum: (Number(round?.roundNum) || 0) + 1,
    seed,
    answerIndex,
    startedAt: null,
    guessesX: [],
    guessesO: [],
    doneX: null,
    doneO: null,
    result: null,
    used,
    revealEndsAt: null,
  }
}
