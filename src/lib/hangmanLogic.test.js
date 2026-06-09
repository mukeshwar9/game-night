import { describe, it, expect } from 'vitest'
import {
  validateWord,
  applyGuess,
  isWordGuessed,
  countWrong,
  verifyRoundConsistency,
  MAX_WRONG,
} from './hangmanLogic'

describe('validateWord', () => {
  it('accepts 3–12 uppercase letters', () => {
    expect(validateWord('CAT')).toBe('CAT')
    expect(validateWord('PROGRAMMING')).toBe('PROGRAMMING')
    expect(validateWord('cat')).toBe('CAT')
  })

  it('rejects words outside 3–12 chars', () => {
    expect(validateWord('AB')).toBeNull()
    expect(validateWord('ABCDEFGHIJKLM')).toBeNull()
    expect(validateWord('')).toBeNull()
    expect(validateWord(null)).toBeNull()
  })

  it('rejects non-alpha characters', () => {
    expect(validateWord('HELLO WORLD')).toBeNull()
    expect(validateWord('H3LLO')).toBeNull()
    expect(validateWord('CAFÉ')).toBeNull()
  })
})

describe('applyGuess', () => {
  it('returns all positions of the letter', () => {
    expect(applyGuess('BANANA', 'A')).toEqual([1, 3, 5])
    expect(applyGuess('BANANA', 'B')).toEqual([0])
    expect(applyGuess('BANANA', 'N')).toEqual([2, 4])
  })

  it('returns empty array for a miss', () => {
    expect(applyGuess('BANANA', 'Z')).toEqual([])
    expect(applyGuess('HELLO', 'X')).toEqual([])
  })
})

describe('isWordGuessed', () => {
  it('returns true when all distinct letters are guessed', () => {
    const guesses = { B: [0], A: [1, 3, 5], N: [2, 4] }
    expect(isWordGuessed('BANANA', guesses)).toBe(true)
  })

  it('returns false when a letter is missing', () => {
    const guesses = { B: [0], A: [1, 3, 5] }
    expect(isWordGuessed('BANANA', guesses)).toBe(false)
  })

  it('returns false when a guess is still pending', () => {
    const guesses = { B: [0], A: [1, 3, 5], N: 'pending' }
    expect(isWordGuessed('BANANA', guesses)).toBe(false)
  })

  it('returns false when a required letter was a miss (false)', () => {
    const guesses = { B: [0], A: false, N: [2, 4] }
    expect(isWordGuessed('BANANA', guesses)).toBe(false)
  })

  it('works with repeated letters — one guess covers all occurrences', () => {
    const guesses = { H: [0], E: [1], L: [2, 3], O: [4] }
    expect(isWordGuessed('HELLO', guesses)).toBe(true)
  })
})

describe('countWrong', () => {
  it('counts only false entries', () => {
    const guesses = { A: [0], B: false, C: false, D: [2] }
    expect(countWrong(guesses)).toBe(2)
  })

  it('returns 0 for empty guesses', () => {
    expect(countWrong({})).toBe(0)
    expect(countWrong(null)).toBe(0)
  })
})

describe('MAX_WRONG', () => {
  it('is 6', () => {
    expect(MAX_WRONG).toBe(6)
  })
})

describe('verifyRoundConsistency', () => {
  it('returns true when all guesses match the word', () => {
    const guesses = { B: [0], A: [1, 3, 5], N: [2, 4], Z: false }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(true)
  })

  it('returns false when a hit is recorded as a miss', () => {
    const guesses = { B: false }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(false)
  })

  it('returns false when a miss is recorded as a hit', () => {
    const guesses = { Z: [0] }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(false)
  })

  it('returns false when positions are wrong', () => {
    const guesses = { A: [0, 2, 4] }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(false)
  })

  it('ignores pending entries', () => {
    const guesses = { B: 'pending' }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(true)
  })

  it('accepts firebase object form for positions', () => {
    // Firebase returns { '0': 1, '1': 3, '2': 5 } instead of [1,3,5]
    const guesses = { A: { 0: 1, 1: 3, 2: 5 }, B: [0], N: [2, 4] }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(true)
  })
})
