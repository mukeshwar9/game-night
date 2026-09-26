import { markGuess, isValidGuess } from './wordduelLogic'

export const MAX_GUESSES = 6
export const WORD_LENGTH = 5
// A partner offline this long no longer freezes the board: the online player
// may take the partner's turns and keep playing solo.
export const PARTNER_OFFLINE_SOLO_MS = 20_000
// Debounce for writing the typed-but-unlocked row to round/draft{X|O}, which
// the partner sees live on your turn.
export const DRAFT_WRITE_MS = 180

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

// `solo`: the partner has been offline for PARTNER_OFFLINE_SOLO_MS, so the
// online player may also play the partner's turn.
export function canSubmitGuess(round, player, { solo = false } = {}) {
  if (!round || round.phase !== 'playing') return false
  if (player !== 'X' && player !== 'O') return false
  if (round.currentTurn !== player && !solo) return false
  return normalizeGuesses(round.guesses).length < MAX_GUESSES
}

// Current streak, best streak, wins and losses of the pair, carried from round
// to round (and across Play Again / New Match) inside the round node.
export function normalizeCoopStats(raw) {
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0)
  return { streak: n(raw?.streak), bestStreak: n(raw?.bestStreak), wins: n(raw?.wins), losses: n(raw?.losses) }
}

export function updateCoopStats(raw, outcome) {
  const stats = normalizeCoopStats(raw)
  if (outcome === 'win') {
    const streak = stats.streak + 1
    return { ...stats, streak, bestStreak: Math.max(stats.bestStreak, streak), wins: stats.wins + 1 }
  }
  if (outcome === 'loss') return { ...stats, streak: 0, losses: stats.losses + 1 }
  return stats
}

export function isSoloMode({ partnerOnline, offlineSince, now }) {
  if (partnerOnline !== false || !offlineSince) return false
  return now - offlineSince >= PARTNER_OFFLINE_SOLO_MS
}

// Keep a typed draft to five letters A–Z (it is read from the partner's node).
export function sanitizeDraft(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, WORD_LENGTH)
}

export function applySharedGuess(round, { player, guess, answer, at = Date.now(), solo = false }) {
  if (!canSubmitGuess(round, player, { solo })) return null
  const word = String(guess ?? '').trim().toUpperCase()
  const secret = String(answer ?? '').trim().toUpperCase()
  if (!isValidGuess(word) || secret.length !== WORD_LENGTH) return null

  const marks = markGuess(word, secret)
  const guesses = [...normalizeGuesses(round.guesses), { by: player, word, marks, at }]
  const solved = marks === 'GGGGG'
  const exhausted = guesses.length >= MAX_GUESSES
  const outcome = solved ? 'win' : exhausted ? 'loss' : null
  return {
    ...round,
    // The locked row replaces the typed draft; an ended round clears both.
    [`draft${player}`]: null,
    ...(outcome ? { draftX: null, draftO: null, stats: updateCoopStats(round.stats, outcome) } : {}),
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
  return createNextRound({ seed, starter, answerIndex, answer, used, stats: previousRound?.stats })
}

// `stats` (streaks/losses) carries over from `stats` or the previous round, so
// Play Again and New Match keep the pair's record.
export function createNextRound({ previousRound, seed, starter = 'X', answerIndex, answer, used, stats }) {
  const usedList = used ?? (Array.isArray(previousRound?.used) ? previousRound.used : null)
  const carried = stats ?? previousRound?.stats
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
    ...(carried ? { stats: normalizeCoopStats(carried) } : {}),
  }
}
