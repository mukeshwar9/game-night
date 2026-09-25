// Pure rules for Anagrams Race. No React, Firebase, or browser APIs.

import { hashString, seededShuffle } from './fibbageLogic'
import { isBannedWord, isFamilySafe } from './wordDenylist'
import { topFamiliar } from './commonWords'

export const RACK_SIZE = 7
export const ROUND_MS = 90_000
export const MIN_WORD_LENGTH = 3
export const MATCH_TARGET = 2
export const MIN_SOLUTION_COUNT = 12
// 3-2-1 before each rack: the round's startedAt is this far in the future and
// no word counts before it.
export const COUNTDOWN_MS = 3_000
// How long the reveal stays up before the next rack starts on its own
// (startRound); starting value — long enough to read the missed words.
export const REVEAL_MS = 6_000
// Racks remembered per room (sorted-letter keys) so recent racks don't
// repeat across rounds and matches; older ones rotate back in.
export const RACK_HISTORY = 60
// How many "words you missed" the reveal lists.
export const MISSED_SHOWN = 5

const POINTS_BY_LENGTH = { 3: 1, 4: 2, 5: 4, 6: 7, 7: 11 }

export function normalizeWord(word) {
  return String(word ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

function lettersOf(value) {
  if (Array.isArray(value)) return value.map(normalizeWord).join('').split('')
  return normalizeWord(value).split('')
}

// Normalized word sets are cached per list object: the deck's word list is
// a module constant, and re-normalizing ~4k words on every rack check made
// seededRack take seconds.
const WORD_SET_CACHE = new WeakMap()

function wordSet(words) {
  const cacheable = words && typeof words === 'object'
  if (cacheable && WORD_SET_CACHE.has(words)) return WORD_SET_CACHE.get(words)
  const set = words instanceof Set
    ? new Set([...words].map(normalizeWord))
    : new Set((words || []).map(normalizeWord).filter(Boolean))
  if (cacheable) WORD_SET_CACHE.set(words, set)
  return set
}

function letterCounts(letters) {
  const counts = new Array(26).fill(0)
  for (const letter of letters) {
    const i = letter.charCodeAt(0) - 97
    if (i >= 0 && i < 26) counts[i] += 1
  }
  return counts
}

// True when `word` (already normalized) fits in the rack's letter counts.
function fitsCounts(word, counts) {
  const left = counts.slice()
  for (let k = 0; k < word.length; k++) {
    const i = word.charCodeAt(k) - 97
    if (!(left[i] > 0)) return false
    left[i] -= 1
  }
  return true
}

export function canBuildWord(word, rack) {
  const target = normalizeWord(word)
  const rackLetters = lettersOf(rack)
  if (!target || target.length > rackLetters.length) return false
  return fitsCounts(target, letterCounts(rackLetters))
}

export function scoreWord(word) {
  const length = normalizeWord(word).length
  if (length < MIN_WORD_LENGTH || length > RACK_SIZE) return 0
  return POINTS_BY_LENGTH[length] + (length === RACK_SIZE ? 5 : 0)
}

export function scoreFound(found) {
  if (Array.isArray(found)) return found.reduce((sum, word) => sum + scoreWord(word), 0)
  return Object.keys(found || {}).reduce((sum, word) => sum + scoreWord(word), 0)
}

export function compareRound(foundX, foundO) {
  const scoreX = scoreFound(foundX)
  const scoreO = scoreFound(foundO)
  const wordsX = Array.isArray(foundX) ? foundX.length : Object.keys(foundX || {}).length
  const wordsO = Array.isArray(foundO) ? foundO.length : Object.keys(foundO || {}).length
  const winner = scoreX > scoreO || (scoreX === scoreO && wordsX > wordsO)
    ? 'X'
    : scoreO > scoreX || (scoreX === scoreO && wordsO > wordsX)
      ? 'O'
      : 'draw'
  // Why: 'points', 'words' (tied on points, more words won) or 'draw'.
  const decidedBy = winner === 'draw' ? 'draw' : scoreX !== scoreO ? 'points' : 'words'
  return { winner, decidedBy, scoreX, scoreO, wordsX, wordsO }
}

// Firebase returns a stored list as an array or a numeric-keyed object; map
// by numeric key order (never Object.values) and drop gaps.
function listOf(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw !== 'object') return []
  return Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b).map(k => raw[k]).filter(Boolean)
}

function rackKey(rack) {
  return lettersOf(rack).sort().join('')
}

// Every valid word buildable from the rack. Banned words (slurs, vulgarity)
// are never solutions, even if a stale word list still carries one.
export function getSolutions(rack, validWords) {
  const rackLetters = lettersOf(rack)
  const counts = letterCounts(rackLetters)
  const out = []
  for (const word of wordSet(validWords)) {
    if (word.length < MIN_WORD_LENGTH || word.length > RACK_SIZE || word.length > rackLetters.length) continue
    if (!fitsCounts(word, counts) || isBannedWord(word)) continue
    out.push(word)
  }
  return out.sort((a, b) => b.length - a.length || a.localeCompare(b))
}

// Rack roots are served by the game itself, so they must be family-safe (a
// homograph root would be both shown and the round's bingo).
// Picks a rack for `seed`: a family-safe 7-letter root with at least
// MIN_SOLUTION_COUNT solutions, preferring one whose letters are not in
// `used` (sorted-letter keys kept across rounds and matches). Solution counts
// are checked lazily in seeded order, so only the racks tried are solved.
export function seededRack({ rackWords, validWords, seed, used = [] }) {
  const candidates = [...wordSet(rackWords)].filter(word => word.length === RACK_SIZE)
    .filter(isFamilySafe)
  if (!candidates.length) return []

  const usedKeys = new Set(listOf(used).map(value => rackKey(value)))
  const ordered = seededShuffle(candidates, hashString(String(seed ?? '')))
  const enough = word => getSolutions(word, validWords).length >= MIN_SOLUTION_COUNT
  const chosen = ordered.find(word => !usedKeys.has(rackKey(word)) && enough(word)) || ordered.find(enough)
  if (!chosen) return []
  return seededShuffle(chosen.toUpperCase().split(''), hashString(`${seed}:rack`))
}

export function applyFoundWord(found, word, rack, validWords, at = Date.now()) {
  const normalized = normalizeWord(word)
  const current = found || {}
  if (
    normalized.length < MIN_WORD_LENGTH ||
    normalized.length > RACK_SIZE ||
    current[normalized] ||
    isBannedWord(normalized) ||
    !canBuildWord(normalized, rack) ||
    !wordSet(validWords).has(normalized)
  ) return null
  return { ...current, [normalized]: { at, points: scoreWord(normalized) } }
}

export function shouldReveal(round, now = Date.now()) {
  if (!round || round.phase !== 'playing') return false
  return Number(now) >= Number(round.endsAt || 0) || (!!round.doneX && !!round.doneO)
}

export function getMatchWinner(scores) {
  if ((scores?.X || 0) >= MATCH_TARGET) return 'X'
  if ((scores?.O || 0) >= MATCH_TARGET) return 'O'
  return null
}

// Keeps only the found words that are really legal on this rack: canonical
// key, 3–7 letters, buildable from the rack, in the valid word list and not
// banned. Found keys are written by clients, so a devtools write of
// `foundX/zzzzzzz` must score 0 — this is re-run when the round resolves.
export function validFound(found, rack, validWords) {
  const valid = validWords instanceof Set ? validWords : wordSet(validWords)
  const out = {}
  for (const [key, value] of Object.entries(found || {})) {
    if (!value || typeof value !== 'object') continue
    const word = normalizeWord(key)
    if (word !== key || word.length < MIN_WORD_LENGTH || word.length > RACK_SIZE) continue
    if (isBannedWord(word) || !canBuildWord(word, rack) || !valid.has(word)) continue
    out[word] = value
  }
  return out
}

// Transaction updater that closes a round (moved from AnagramsGame.jsx).
// Returns undefined (abort) until the round should reveal. Re-validates both
// players' words before scoring, awards the round, and ends the match at
// MATCH_TARGET. `now` is server-corrected time.
export function resolveRound(current, now, validWords) {
  // A finished match (e.g. the platform's CLAIM WIN) is never reopened.
  if (!current?.round || current.status === 'finished' || !shouldReveal(current.round, now)) return undefined
  const { rack } = current.round
  const valid = validWords instanceof Set ? validWords : wordSet(validWords)
  const result = compareRound(
    validFound(current.round.foundX, rack, valid),
    validFound(current.round.foundO, rack, valid),
  )
  const scores = { X: current.scores?.X || 0, O: current.scores?.O || 0 }
  if (result.winner !== 'draw') scores[result.winner] += 1
  const matchWinner = getMatchWinner(scores)
  return {
    ...current,
    round: { ...current.round, phase: 'reveal', result, revealEndsAt: now + REVEAL_MS },
    scores,
    winner: matchWinner,
    status: matchWinner ? 'finished' : 'playing',
    proposal: null,
    lastActivityAt: now,
  }
}

// Appends this rack to the room's no-repeat history, keeping the last
// RACK_HISTORY keys so the list stays bounded and old racks rotate back.
export function rememberRack(used, rack) {
  return [...listOf(used), rackKey(rack)].slice(-RACK_HISTORY)
}

// "Words you missed": rack solutions this player did not find, family-safe
// only, everyday words first (then by points) — not the top scorers, which
// were dominated by words like platens/latens.
export function missedWords(rack, validWords, found, limit = MISSED_SHOWN) {
  const have = new Set((Array.isArray(found) ? found : Object.keys(found || {})).map(normalizeWord))
  const missed = getSolutions(rack, validWords).filter(word => !have.has(word))
  return topFamiliar(missed, { limit, score: scoreWord })
}

// When the rack should start: from the 'ready' round Game.jsx writes (first
// rack, new match), or automatically once the reveal has been up REVEAL_MS
// and the match is not over. A pending proposal (e.g. someone asked to
// switch games) holds the reveal until it is answered. Either seated client
// may run it.
export function roundStartDue(game, now) {
  if (!game || game.status !== 'playing') return false
  const round = game.round
  if (!round || round.phase === 'ready') return true
  if (round.phase !== 'reveal' || getMatchWinner(game.scores)) return false
  if (game.proposal && !game.proposal.declined) return false
  return Number(now) >= Number(round.revealEndsAt || 0)
}

// Transaction updater that deals the next rack (moved from AnagramsGame.jsx):
// a fresh seeded rack not in the room's history, a COUNTDOWN_MS 3-2-1
// (startedAt in the future), then ROUND_MS to play. Aborts (undefined)
// unless roundStartDue.
export function startRound(current, { now, gameId = '', rackWords, validWords }) {
  if (!roundStartDue(current, now)) return undefined
  const prev = current.round
  const roundNum = !prev ? 1 : prev.phase === 'ready' ? (prev.roundNum || 1) : (prev.roundNum || 1) + 1
  const usedRacks = listOf(prev?.usedRacks)
  const seed = `${gameId}:${current.createdAt || ''}:${current.scores?.X || 0}:${current.scores?.O || 0}:${roundNum}:${now}`
  const rack = seededRack({ rackWords, validWords, seed, used: usedRacks })
  if (!rack.length) return undefined
  const startedAt = now + COUNTDOWN_MS
  return {
    ...current,
    round: {
      phase: 'playing', roundNum, seed, rack,
      startedAt, endsAt: startedAt + ROUND_MS,
      foundX: {}, foundO: {}, doneX: false, doneO: false,
      result: null, revealEndsAt: null,
      usedRacks: rememberRack(usedRacks, rack),
    },
    lastActivityAt: now,
  }
}
