// Pure rules for Anagrams Race. No React, Firebase, or browser APIs.

import { hashString, seededShuffle } from './fibbageLogic'
import { isBannedWord, isFamilySafe } from './wordDenylist'

export const RACK_SIZE = 7
export const ROUND_MS = 90_000
export const MIN_WORD_LENGTH = 3
export const MATCH_TARGET = 2
export const MIN_SOLUTION_COUNT = 12

const POINTS_BY_LENGTH = { 3: 1, 4: 2, 5: 4, 6: 7, 7: 11 }

export function normalizeWord(word) {
  return String(word ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

function lettersOf(value) {
  if (Array.isArray(value)) return value.map(normalizeWord).join('').split('')
  return normalizeWord(value).split('')
}

function wordSet(words) {
  if (words instanceof Set) return new Set([...words].map(normalizeWord))
  return new Set((words || []).map(normalizeWord).filter(Boolean))
}

export function canBuildWord(word, rack) {
  const target = normalizeWord(word)
  const rackLetters = lettersOf(rack)
  if (!target || target.length > rackLetters.length) return false
  const available = new Map()
  for (const letter of rackLetters) available.set(letter, (available.get(letter) || 0) + 1)
  for (const letter of target) {
    const count = available.get(letter) || 0
    if (!count) return false
    available.set(letter, count - 1)
  }
  return true
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
  return { winner, scoreX, scoreO, wordsX, wordsO }
}

function rackKey(rack) {
  return lettersOf(rack).sort().join('')
}

// Every valid word buildable from the rack. Banned words (slurs, vulgarity)
// are never solutions, even if a stale word list still carries one.
export function getSolutions(rack, validWords) {
  const seen = new Set()
  return [...wordSet(validWords)]
    .filter(word => {
      if (seen.has(word) || word.length < MIN_WORD_LENGTH || word.length > RACK_SIZE) return false
      if (isBannedWord(word)) return false
      if (!canBuildWord(word, rack)) return false
      seen.add(word)
      return true
    })
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
}

// Rack roots are served by the game itself, so they must be family-safe (a
// homograph root would be both shown and the round's bingo).
export function seededRack({ rackWords, validWords, seed, used = [] }) {
  const candidates = [...wordSet(rackWords)].filter(word => word.length === RACK_SIZE)
    .filter(isFamilySafe)
    .filter(word => getSolutions(word, validWords).length >= MIN_SOLUTION_COUNT)
  if (!candidates.length) return []

  const usedKeys = new Set((used || []).map(value => rackKey(value)))
  const ordered = seededShuffle(candidates, hashString(String(seed ?? '')))
  const chosen = ordered.find(word => !usedKeys.has(rackKey(word))) || ordered[0]
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
