import { describe, it, expect } from 'vitest'
import { generateNumber, countMatchingPrefix, resolveNumberMemoryRound } from './numberMemoryLogic'

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
