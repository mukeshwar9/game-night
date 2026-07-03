import { describe, it, expect } from 'vitest'
import {
  validateWord,
  wordStructure,
  applyGuess,
  isWordGuessed,
  countWrong,
  verifyRoundConsistency,
  deriveRoundResult,
  MAX_WRONG,
} from './hangmanLogic'

describe('validateWord', () => {
  it('accepts 3–12 uppercase letters', () => {
    expect(validateWord('CAT')).toBe('CAT')
    expect(validateWord('PROGRAMMING')).toBe('PROGRAMMING')
    expect(validateWord('cat')).toBe('CAT')
  })

  it('rejects words with fewer than 3 letters (no spaces)', () => {
    expect(validateWord('AB')).toBeNull()
    expect(validateWord('')).toBeNull()
    expect(validateWord(null)).toBeNull()
  })

  it('rejects non-alpha characters (digits, punctuation)', () => {
    expect(validateWord('H3LLO')).toBeNull()
    expect(validateWord('CAFÉ')).toBeNull()
  })

  it('accepts multi-word phrases', () => {
    expect(validateWord('ice cream')).toBe('ICE CREAM')
    expect(validateWord('ICE CREAM')).toBe('ICE CREAM')
  })

  it('collapses multiple and edge spaces in phrases', () => {
    expect(validateWord('  ice   cream ')).toBe('ICE CREAM')
  })

  it('rejects phrases whose letter count exceeds 30', () => {
    // 31 letters total
    expect(validateWord('ABCDEFGHIJ ABCDEFGHIJ ABCDEFGHIJK')).toBeNull()
  })

  it('rejects strings with digits or punctuation even in phrases', () => {
    expect(validateWord('ICE 2 CREAM')).toBeNull()
    expect(validateWord('ICE-CREAM')).toBeNull()
  })
})

describe('wordStructure', () => {
  it('returns word lengths for a single word', () => {
    expect(wordStructure('BANANA')).toEqual([6])
  })

  it('returns per-word lengths for a phrase', () => {
    expect(wordStructure('ICE CREAM')).toEqual([3, 5])
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

  it('returns full-string indices (including the space) for a phrase', () => {
    // 'ICE CREAM' indices: I=0,C=1,E=2, =3,C=4,R=5,E=6,A=7,M=8
    expect(applyGuess('ICE CREAM', 'C')).toEqual([1, 4])
    expect(applyGuess('ICE CREAM', 'E')).toEqual([2, 6])
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

  it('ignores spaces when checking phrase completeness', () => {
    // 'ICE CREAM' — distinct letters: I,C,E,R,A,M (space ignored)
    const guesses = { I: [0], C: [1, 4], E: [2, 7], R: [5], A: [6], M: [8] }
    expect(isWordGuessed('ICE CREAM', guesses)).toBe(true)
  })

  it('returns false for a phrase when any letter (across words) is missing', () => {
    // Missing 'M'
    const guesses = { I: [0], C: [1, 4], E: [2, 7], R: [5], A: [6] }
    expect(isWordGuessed('ICE CREAM', guesses)).toBe(false)
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

  it('stays consistent for a phrase using full-string indices', () => {
    // 'ICE CREAM': C at indices 1,4; space is at index 3 (not a letter)
    const guesses = { C: [1, 4], E: [2, 6], I: [0], R: [5], A: [7], M: [8] }
    expect(verifyRoundConsistency('ICE CREAM', guesses)).toBe(true)
  })
})

describe('deriveRoundResult', () => {
  it("returns 'guessed' when every distinct letter was hit", () => {
    const guesses = { B: [0], A: [1, 3, 5], N: [2, 4], Z: false }
    expect(deriveRoundResult('BANANA', guesses)).toBe('guessed')
  })

  it("returns 'hanged' when wrong guesses reach MAX_WRONG", () => {
    const guesses = { Q: false, W: false, Z: false, J: false, K: false, V: false, B: [0] }
    expect(deriveRoundResult('BANANA', guesses)).toBe('hanged')
  })

  it('returns null when the round is not actually over', () => {
    const guesses = { B: [0], A: [1, 3, 5], Z: false }
    expect(deriveRoundResult('BANANA', guesses)).toBeNull()
  })

  it('returns null when a required letter is still pending', () => {
    const guesses = { B: [0], A: [1, 3, 5], N: 'pending' }
    expect(deriveRoundResult('BANANA', guesses)).toBeNull()
  })

  it("prioritizes 'guessed' when the word is complete even at MAX_WRONG misses", () => {
    const guesses = {
      C: [0], A: [1], T: [2],
      Q: false, W: false, Z: false, J: false, K: false, V: false,
    }
    expect(deriveRoundResult('CAT', guesses)).toBe('guessed')
  })

  it('accepts firebase object form for positions', () => {
    // Firebase returns { '0': 1, '1': 3, '2': 5 } instead of [1,3,5]
    const guesses = { B: [0], A: { 0: 1, 1: 3, 2: 5 }, N: { 0: 2, 1: 4 } }
    expect(deriveRoundResult('BANANA', guesses)).toBe('guessed')
  })

  it('ignores spaces when deriving a phrase result', () => {
    const guesses = { I: [0], C: [1, 4], E: [2, 6], R: [5], A: [7], M: [8] }
    expect(deriveRoundResult('ICE CREAM', guesses)).toBe('guessed')
  })

  it('returns null for empty guesses', () => {
    expect(deriveRoundResult('BANANA', {})).toBeNull()
    expect(deriveRoundResult('BANANA', null)).toBeNull()
  })
})
