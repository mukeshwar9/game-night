import { describe, it, expect } from 'vitest'
import {
  generateNumber, countMatchingPrefix, resolveNumberMemoryRound,
  buildNextNumberRound, normalizeNumberRound, showMsForLevel, chunkDigits,
} from './numberMemoryLogic'

describe('generateNumber', () => {
  it('generates a number with the requested digit count', () => {
    expect(generateNumber(1)).toHaveLength(1)
    expect(generateNumber(5)).toHaveLength(5)
  })

  it('never starts with a leading zero', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateNumber(4)[0]).not.toBe('0')
    }
  })

  it('only contains digits', () => {
    expect(generateNumber(6)).toMatch(/^\d+$/)
  })
})

describe('countMatchingPrefix', () => {
  it('counts fully matching prefix', () => expect(countMatchingPrefix('1234', '1234')).toBe(4))
  it('counts partial prefix', () => expect(countMatchingPrefix('1239', '1234')).toBe(3))
  it('counts zero when first digit differs', () => expect(countMatchingPrefix('9234', '1234')).toBe(0))
  it('treats null/undefined answer as empty', () => expect(countMatchingPrefix(null, '1234')).toBe(0))
  it('does not overcount past the shorter string', () => expect(countMatchingPrefix('12', '1234')).toBe(2))
})

describe('resolveNumberMemoryRound', () => {
  it('both correct advances', () => {
    expect(resolveNumberMemoryRound({ answerX: '512', answerO: '512', number: '512' }))
      .toEqual({ type: 'advance' })
  })

  it('only X correct — X wins', () => {
    expect(resolveNumberMemoryRound({ answerX: '512', answerO: '999', number: '512' }))
      .toEqual({ type: 'win', winner: 'X' })
  })

  it('only O correct — O wins', () => {
    expect(resolveNumberMemoryRound({ answerX: '999', answerO: '512', number: '512' }))
      .toEqual({ type: 'win', winner: 'O' })
  })

  it('both wrong, X has a longer correct prefix — X wins', () => {
    expect(resolveNumberMemoryRound({ answerX: '519', answerO: '099', number: '512' }))
      .toEqual({ type: 'win', winner: 'X' })
  })

  it('both wrong, O has a longer correct prefix — O wins', () => {
    expect(resolveNumberMemoryRound({ answerX: '099', answerO: '519', number: '512' }))
      .toEqual({ type: 'win', winner: 'O' })
  })

  it('both wrong with equal-length prefixes — replay (fair tie, not X-favored)', () => {
    expect(resolveNumberMemoryRound({ answerX: '513', answerO: '514', number: '512' }))
      .toEqual({ type: 'replay' })
  })

  it('both wrong and neither matches any digit — replay', () => {
    expect(resolveNumberMemoryRound({ answerX: '999', answerO: '888', number: '512' }))
      .toEqual({ type: 'replay' })
  })
})

describe('buildNextNumberRound', () => {
  const recall = { phase: 'recall', level: 4, number: '1234', answerX: '1234', answerO: '1234', showUntil: 99 }
  const fixed = lvl => '9'.repeat(lvl)

  it('advance replaces the whole round: next level, fresh number, no answers or showUntil', () => {
    expect(buildNextNumberRound(recall, { type: 'advance' }, 4, fixed))
      .toEqual({ phase: 'showing', level: 5, number: '99999' })
  })

  it('replay keeps the level, draws a new number and flags the tie', () => {
    expect(buildNextNumberRound(recall, { type: 'replay' }, 4, fixed))
      .toEqual({ phase: 'showing', level: 4, number: '9999', tie: true })
  })

  it('aborts when another client already moved the round on', () => {
    expect(buildNextNumberRound({ ...recall, phase: 'showing' }, { type: 'advance' }, 4)).toBeNull()
    expect(buildNextNumberRound({ ...recall, level: 5 }, { type: 'replay' }, 4)).toBeNull()
    expect(buildNextNumberRound(null, { type: 'advance' }, 4)).toBeNull()
  })

  it('never builds a round for a win outcome', () => {
    expect(buildNextNumberRound(recall, { type: 'win', winner: 'X' }, 4)).toBeNull()
  })
})

describe('normalizeNumberRound', () => {
  it('fills defaults for a missing round', () => {
    expect(normalizeNumberRound(null)).toMatchObject({ phase: 'showing', level: 1, answerX: null, tie: false })
  })

  it('treats absent answers and showUntil as null', () => {
    expect(normalizeNumberRound({ phase: 'recall', level: 3, number: '123' }))
      .toEqual({ phase: 'recall', level: 3, number: '123', answerX: null, answerO: null, showUntil: null, tie: false })
  })
})

describe('showMsForLevel', () => {
  it('starts at 3s and adds a second per digit', () => {
    expect(showMsForLevel(1)).toBe(3000)
    expect(showMsForLevel(8)).toBe(10000)
  })
})

describe('chunkDigits', () => {
  it('groups digits in threes', () => {
    expect(chunkDigits('12345678')).toEqual(['123', '456', '78'])
    expect(chunkDigits('7')).toEqual(['7'])
    expect(chunkDigits('')).toEqual([])
  })
})
