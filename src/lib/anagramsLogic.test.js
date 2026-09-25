import { describe, expect, it } from 'vitest'
import {
  MATCH_TARGET, MIN_SOLUTION_COUNT, ROUND_MS,
  applyFoundWord, canBuildWord, compareRound, getMatchWinner,
  getSolutions, normalizeWord, scoreFound, scoreWord, seededRack, shouldReveal,
} from './anagramsLogic'
import { ANAGRAM_RACK_WORDS, ANAGRAM_VALID_WORDS } from './decks/anagrams'
import { isBannedWord, isFamilySafe } from './wordDenylist'

describe('anagramsLogic', () => {
  it('normalizes to lowercase ASCII letters', () => {
    expect(normalizeWord('  Café-TEA! ')).toBe('caftea')
  })

  it('validates letter counts, including duplicate letters', () => {
    expect(canBuildWord('letter', ['L', 'E', 'T', 'T', 'E', 'R', 'S'])).toBe(true)
    expect(canBuildWord('letter', ['L', 'E', 'T', 'E', 'R', 'S', 'A'])).toBe(false)
    expect(canBuildWord('letters', ['L', 'E', 'T', 'T', 'E', 'R', 'S'])).toBe(true)
  })

  it('uses the exact score table and bingo bonus', () => {
    expect(scoreWord('cat')).toBe(1)
    expect(scoreWord('plan')).toBe(2)
    expect(scoreWord('planet')).toBe(7)
    expect(scoreWord('planets')).toBe(16)
    expect(scoreFound({ cat: { points: 1 }, planets: { points: 16 } })).toBe(17)
  })

  it('rejects duplicate words and invalid dictionary entries', () => {
    const first = applyFoundWord({}, 'PLANETS', ['P', 'L', 'A', 'N', 'E', 'T', 'S'], ANAGRAM_VALID_WORDS, 10)
    expect(first.planets).toEqual({ at: 10, points: 16 })
    expect(applyFoundWord(first, 'planets', ['P', 'L', 'A', 'N', 'E', 'T', 'S'], ANAGRAM_VALID_WORDS, 11)).toBe(null)
    expect(applyFoundWord(first, 'zzzz', ['P', 'L', 'A', 'N', 'E', 'T', 'S'], ANAGRAM_VALID_WORDS, 11)).toBe(null)
  })

  it('accepts every buildable dictionary word (no false wrong-word)', () => {
    // Previously-rejected real words per rack.
    const cases = [
      ['PLANETS', 'plates', ['P', 'L', 'A', 'N', 'E', 'T', 'S']],
      ['PLANETS', 'tapes', ['P', 'L', 'A', 'N', 'E', 'T', 'S']],
      ['PLANETS', 'nest', ['P', 'L', 'A', 'N', 'E', 'T', 'S']],
      ['TEACHER', 'aether', ['T', 'E', 'A', 'C', 'H', 'E', 'R']],
      ['TEACHER', 'reheat', ['T', 'E', 'A', 'C', 'H', 'E', 'R']],
      ['REACTOR', 'orate', ['R', 'E', 'A', 'C', 'T', 'O', 'R']],
      ['REACTOR', 'carter', ['R', 'E', 'A', 'C', 'T', 'O', 'R']],
    ]
    for (const [, word, rack] of cases) {
      expect(applyFoundWord({}, word, rack, ANAGRAM_VALID_WORDS, 10), word).not.toBeNull()
    }
    // Nonsense still rejected.
    expect(applyFoundWord({}, 'zzzz', ['P', 'L', 'A', 'N', 'E', 'T', 'S'], ANAGRAM_VALID_WORDS, 11)).toBe(null)
  })

  it('compares score first, then word count, then draw', () => {
    expect(compareRound({ planets: {} }, { plane: {}, plate: {}, slate: {} })).toMatchObject({ winner: 'X', scoreX: 16 })
    expect(compareRound({ plane: {}, plate: {} }, { slate: {}, least: {} }).winner).toBe('draw')
    expect(compareRound({ pet: {} }, { pet2: {}, net: {}, pan: {} }).winner).toBe('O')
  })

  it('creates deterministic quality racks and skips used racks', () => {
    const args = { rackWords: ANAGRAM_RACK_WORDS, validWords: ANAGRAM_VALID_WORDS, seed: 'match-a' }
    const first = seededRack(args)
    expect(first).toHaveLength(7)
    expect(getSolutions(first, ANAGRAM_VALID_WORDS).length).toBeGreaterThanOrEqual(MIN_SOLUTION_COUNT)
    expect(seededRack(args)).toEqual(first)
    const second = seededRack({ ...args, used: [first] })
    expect(second).not.toEqual(first)
    expect(seededRack({ ...args, seed: 'match-b' })).toEqual(seededRack({ ...args, seed: 'match-b' }))
  })

  it('reveals at deadline or when both players finish', () => {
    const round = { phase: 'playing', endsAt: 1000, doneX: false, doneO: false }
    expect(shouldReveal(round, 999)).toBe(false)
    expect(shouldReveal(round, 1000)).toBe(true)
    expect(shouldReveal({ ...round, doneX: true, doneO: true }, 10)).toBe(true)
    expect(shouldReveal({ phase: 'reveal', endsAt: 0 }, 1000)).toBe(false)
  })

  it('exports round and match constants', () => {
    expect(ROUND_MS).toBe(90_000)
    expect(MATCH_TARGET).toBe(2)
  })

  it('keeps every curated rack above the solution floor', () => {
    for (const rack of ANAGRAM_RACK_WORDS) {
      expect(getSolutions(rack, ANAGRAM_VALID_WORDS).length, rack).toBeGreaterThanOrEqual(MIN_SOLUTION_COUNT)
    }
    expect(getMatchWinner({ X: 2, O: 0 })).toBe('X')
    expect(getMatchWinner({ X: 1, O: 1 })).toBe(null)
  })

  it('never accepts or serves a banned word, even from a stale word list', () => {
    const rack = ['A', 'R', 'S', 'E', 'T', 'N', 'O']
    const stale = [...ANAGRAM_VALID_WORDS, 'arse', 'arses']
    expect(applyFoundWord({}, 'arse', rack, stale, 1)).toBe(null)
    expect(getSolutions(rack, stale)).not.toContain('arse')
    expect(ANAGRAM_VALID_WORDS.filter(isBannedWord)).toEqual([])
  })

  it('only serves family-safe rack roots', () => {
    expect(ANAGRAM_RACK_WORDS.filter(word => !isFamilySafe(word))).toEqual([])
    const unsafeOnly = seededRack({ rackWords: ['rapists'], validWords: ['rapists', 'pits', 'tips'], seed: 'x' })
    expect(unsafeOnly).toEqual([])
  })
})
