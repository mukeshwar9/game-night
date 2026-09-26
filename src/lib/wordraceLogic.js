import {
  isSolved,
  isValidGuess,
  getKeyboardState,
  guessProblem,
  markGuess,
  MAX_GUESSES,
  WORD_LENGTH,
} from './wordduelLogic'

export { isSolved, isValidGuess, markGuess, getKeyboardState, guessProblem, MAX_GUESSES, WORD_LENGTH }

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

// True once both boards are done, or the grace clock started by the first
// finished board has run out (FINISH_GRACE_MS after a solve, DONE_GRACE_MS
// after a fail — a failed player no longer waits on an idle opponent forever).
export function shouldReveal(round, now = Date.now()) {
  if (!round || round.phase !== 'playing') return false
  if (round.doneX && round.doneO) return true
  const endsAt = getGraceEndsAt(round)
  return Boolean(endsAt && now >= endsAt)
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

// ── Pacing, pinning and hidden-information helpers ───────────────────────────

// Once one side has FAILED (6 misses) the other gets this long to finish, so
// an online-but-idle opponent can't hold the room forever. (A solve starts the
// shorter FINISH_GRACE_MS instead.)
export const DONE_GRACE_MS = 60_000
// How long a revealed round stays on screen before the next one starts on
// its own (within a match — no per-round consent).
export const RACE_REVEAL_MS = 6_000

// The answer a round is graded against: the pinned string when present (so a
// client on a stale cached word list still races the same word), else the
// bundled list entry for older rooms.
export function getRoundAnswer(round, answerList) {
  if (typeof round?.answer === 'string' && round.answer.length === WORD_LENGTH) return round.answer
  const idx = Number(round?.answerIndex)
  const list = normalizeList(answerList)
  return Number.isInteger(idx) && idx >= 0 ? list[idx] ?? null : null
}

// First round of a match (or a Play Again) built from the stub Game.jsx
// writes ({ used, roundNum }) — its roundNum is kept, never reset to 1.
export function buildRaceRoundStart({ stub, seed, answerList, at }) {
  const list = normalizeList(answerList)
  const used = normalizeList(stub?.used).map(Number).filter(Number.isInteger)
  const answerIndex = pickAnswer(list, seed, used)
  const answer = list[answerIndex]
  return {
    phase: 'playing',
    roundNum: Number(stub?.roundNum) || 1,
    seed,
    answerIndex,
    ...(typeof answer === 'string' ? { answer } : {}),
    startedAt: at,
    guessesX: [],
    guessesO: [],
    doneX: null,
    doneO: null,
    result: null,
    used: used.includes(answerIndex) ? used : [...used, answerIndex],
    revealEndsAt: null,
  }
}

// Next round inside a match: roundNum + 1, new pinned answer, same `used`.
export function buildNextRaceRound({ round, seed, answerList, at }) {
  const list = normalizeList(answerList)
  const used = normalizeList(round?.used).map(Number).filter(Number.isInteger)
  const answerIndex = pickAnswer(list, seed, used)
  const next = nextRound(round, seed, answerIndex)
  const answer = list[answerIndex]
  return { ...next, ...(typeof answer === 'string' ? { answer } : {}), startedAt: at }
}

// When the grace clock started by the first finished board runs out, or null.
export function getGraceEndsAt(round) {
  if (!round || round.phase !== 'playing') return null
  if (!!round.doneX === !!round.doneO) return null
  const done = round.doneX || round.doneO
  if (!done?.at) return null
  return done.at + (done.solved ? FINISH_GRACE_MS : DONE_GRACE_MS)
}

// Resolve a playing round inside a transaction: fill the unfinished board as
// a timed-out fail when the grace ran out, pick the winner, score it, and set
// the reveal window. Returns the next game state, or null when not due.
export function resolveRaceRound(game, at, { matchTarget = MATCH_TARGET, revealMs = RACE_REVEAL_MS } = {}) {
  const round = game?.round
  if (!game || game.status !== 'playing' || !round || round.phase !== 'playing' || round.result) return null
  const bothDone = !!(round.doneX && round.doneO)
  const endsAt = getGraceEndsAt(round)
  if (!bothDone && !(endsAt && at >= endsAt)) return null
  const resolved = { ...round }
  for (const sym of ['X', 'O']) {
    if (!resolved[`done${sym}`]) {
      resolved[`done${sym}`] = { solved: false, guesses: normalizeGuesses(resolved[`guesses${sym}`]).length, at, timedOut: true }
    }
  }
  const winner = compareRace(resolved.doneX, resolved.doneO)
  if (!winner) return null
  const next = {
    ...game,
    round: { ...resolved, phase: 'reveal', result: { winner, reason: getRaceReason(resolved.doneX, resolved.doneO) }, revealEndsAt: at + revealMs },
    lastActivityAt: at,
  }
  if (winner !== 'draw') {
    const scores = { X: game.scores?.X || 0, O: game.scores?.O || 0 }
    scores[winner] += 1
    next.scores = scores
    if (scores[winner] >= matchTarget) {
      next.status = 'finished'
      next.winner = winner
    }
  }
  return next
}

// Auto-advance: once the reveal window is over and the match isn't, either
// client may start the next round. Guarded on the round number so two
// clients (or a late retry) can't skip a round.
export function advanceRaceRound(game, { at, seed, answerList, expectedRoundNum }) {
  const round = game?.round
  if (!game || game.status !== 'playing' || !round || round.phase !== 'reveal' || !round.result) return null
  if ((Number(round.roundNum) || 1) !== expectedRoundNum) return null
  if (!round.revealEndsAt || at < round.revealEndsAt) return null
  return { ...game, round: buildNextRaceRound({ round, seed, answerList, at }), lastActivityAt: at }
}

function rowScore(marks) {
  if (!marks) return 0
  let score = 0
  for (const m of marks) score += m === 'G' ? 1 : m === 'Y' ? 0.5 : 0
  return score
}

// What an opponent may see mid-race: rows used, greens in their best row and
// whether they solved — never which positions are right.
export function ghostSummary(guesses) {
  const list = normalizeGuesses(guesses).filter(Boolean)
  let bestGreens = 0
  for (const g of list) {
    const greens = (g.marks || '').split('').filter(m => m === 'G').length
    if (greens > bestGreens) bestGreens = greens
  }
  return { rows: list.length, bestGreens, solved: list.some(g => g.marks && isSolved(g.marks)) }
}

// Race meter, 0..1: the best row's greens + 0.5·yellows out of 5 — closeness
// to the answer, not guesses spent. A solve fills the bar.
export function raceProgress(guesses) {
  const list = normalizeGuesses(guesses).filter(Boolean)
  if (list.some(g => g.marks && isSolved(g.marks))) return 1
  let best = 0
  for (const g of list) best = Math.max(best, rowScore(g.marks))
  return Math.min(1, best / WORD_LENGTH)
}
