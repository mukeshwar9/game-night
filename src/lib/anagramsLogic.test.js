import { describe, expect, it } from 'vitest'
import {
  MATCH_TARGET, MIN_SOLUTION_COUNT, REVEAL_MS, ROUND_MS,
  applyFoundWord, canBuildWord, compareRound, getMatchWinner,
  getSolutions, normalizeWord, resolveRound, scoreFound, scoreWord, seededRack, shouldReveal,
  validFound,
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

describe('resolveRound', () => {
  const rack = ['P', 'L', 'A', 'N', 'E', 'T', 'S']
  const game = (round, scores = { X: 0, O: 0 }) => ({
    status: 'playing', scores,
    round: { phase: 'playing', rack, endsAt: 1000, doneX: false, doneO: false, foundX: {}, foundO: {}, ...round },
  })

  it('aborts until the round should reveal', () => {
    expect(resolveRound(game({}), 999, ANAGRAM_VALID_WORDS)).toBeUndefined()
    expect(resolveRound(null, 5000, ANAGRAM_VALID_WORDS)).toBeUndefined()
    expect(resolveRound(game({ phase: 'reveal' }), 5000, ANAGRAM_VALID_WORDS)).toBeUndefined()
  })

  it('awards the round, stamps the reveal and keeps the match open below the target', () => {
    const next = resolveRound(game({ foundX: { plane: { at: 1 } }, foundO: { pet: { at: 1 } } }), 1000, ANAGRAM_VALID_WORDS)
    expect(next.round).toMatchObject({ phase: 'reveal', revealEndsAt: 1000 + REVEAL_MS })
    expect(next.round.result).toMatchObject({ winner: 'X', scoreX: 4, scoreO: 1 })
    expect(next.scores).toEqual({ X: 1, O: 0 })
    expect(next).toMatchObject({ status: 'playing', winner: null, proposal: null })
  })

  it('ends the match at MATCH_TARGET', () => {
    const next = resolveRound(game({ foundO: { plane: { at: 1 } } }, { X: 0, O: MATCH_TARGET - 1 }), 1000, ANAGRAM_VALID_WORDS)
    expect(next).toMatchObject({ status: 'finished', winner: 'O' })
    expect(next.scores.O).toBe(MATCH_TARGET)
  })

  it('draws on equal points and equal word counts', () => {
    const next = resolveRound(game({ foundX: { plane: { at: 1 } }, foundO: { plate: { at: 2 } } }), 1000, ANAGRAM_VALID_WORDS)
    expect(next.round.result.winner).toBe('draw')
    expect(next.scores).toEqual({ X: 0, O: 0 })
  })

  it('regression: forged found keys score 0 (zzzzzzz, off-rack, non-words, bad keys)', () => {
    const forged = {
      zzzzzzz: { at: 1, points: 16 },
      planets: { at: 2, points: 16 }, // legal bingo
      quartzy: { at: 3 }, // real word, not on the rack
      plnts: { at: 4 }, // on the rack, not a word
      PLANE: { at: 5 }, // non-canonical key
      ab: { at: 6 }, // too short
      pet: true, // malformed value
    }
    expect(Object.keys(validFound(forged, rack, ANAGRAM_VALID_WORDS))).toEqual(['planets'])
    const next = resolveRound(game({ foundX: forged, foundO: { plane: { at: 1 }, plate: { at: 2 }, slate: { at: 3 }, least: { at: 4 } } }), 1000, ANAGRAM_VALID_WORDS)
    expect(next.round.result).toMatchObject({ scoreX: 16, wordsX: 1, scoreO: 16, wordsO: 4, winner: 'O' })
  })

  it('regression: a round of only forged words loses to one honest word', () => {
    const next = resolveRound(game({ foundX: { zzzzzzz: { at: 1 } }, foundO: { pet: { at: 1 } } }), 1000, ANAGRAM_VALID_WORDS)
    expect(next.round.result).toMatchObject({ winner: 'O', scoreX: 0, scoreO: 1 })
  })

  it('accepts a Set of valid words', () => {
    const next = resolveRound(game({ foundX: { plane: { at: 1 } } }), 1000, new Set(ANAGRAM_VALID_WORDS))
    expect(next.round.result.scoreX).toBe(4)
  })
})
