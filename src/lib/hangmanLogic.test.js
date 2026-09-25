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
  PENDING,
  pendingLetters,
  hasPendingGuess,
  canQueueGuess,
  gradePending,
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

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

describe('one pending guess at a time', () => {
  it('pendingLetters lists pending letters in alphabetical (grading) order', () => {
    expect(pendingLetters({ Z: PENDING, A: [0], C: PENDING, B: false })).toEqual(['C', 'Z'])
    expect(pendingLetters(null)).toEqual([])
  })

  it('hasPendingGuess is true only while a guess waits for the word-keeper', () => {
    expect(hasPendingGuess({ A: [0], B: false })).toBe(false)
    expect(hasPendingGuess({ A: [0], B: PENDING })).toBe(true)
  })

  it('canQueueGuess refuses a second pending guess', () => {
    expect(canQueueGuess({}, 'A')).toBe(true)
    expect(canQueueGuess({ A: PENDING }, 'B')).toBe(false)
    expect(canQueueGuess({ A: [0] }, 'B')).toBe(true)
  })

  it('canQueueGuess refuses repeated or non-letter guesses', () => {
    expect(canQueueGuess({ A: false }, 'A')).toBe(false)
    expect(canQueueGuess({ A: [1] }, 'A')).toBe(false)
    expect(canQueueGuess({}, 'a')).toBe(false)
    expect(canQueueGuess({}, '1')).toBe(false)
    expect(canQueueGuess({}, 'AB')).toBe(false)
  })
})

describe('gradePending', () => {
  it('grades a single pending hit and reports it as the last guess', () => {
    const r = gradePending('BANANA', { B: [0], A: PENDING })
    expect(r.guesses).toEqual({ B: [0], A: [1, 3, 5] })
    expect(r.graded).toEqual(['A'])
    expect(r.discarded).toEqual([])
    expect(r.wrongCount).toBe(0)
    expect(r.result).toBeNull()
    expect(r.lastGuess).toEqual({ letter: 'A', hits: 3 })
  })

  it('grades a pending miss as false', () => {
    const r = gradePending('BANANA', { Z: PENDING })
    expect(r.guesses).toEqual({ Z: false })
    expect(r.wrongCount).toBe(1)
    expect(r.lastGuess).toEqual({ letter: 'Z', hits: 0 })
  })

  it('ends the round as guessed when the pending letter completes the word', () => {
    const r = gradePending('BANANA', { B: [0], A: [1, 3, 5], N: PENDING })
    expect(r.result).toBe('guessed')
  })

  it('ends the round as hanged on the sixth miss', () => {
    const r = gradePending('CAT', { Q: false, W: false, Z: false, J: false, K: false, V: PENDING })
    expect(r.result).toBe('hanged')
    expect(r.wrongCount).toBe(MAX_WRONG)
  })

  it('accepts firebase object form for already-graded positions', () => {
    const r = gradePending('BANANA', { A: { 0: 1, 1: 3, 2: 5 }, B: PENDING })
    expect(r.guesses.A).toEqual([1, 3, 5])
    expect(r.guesses.B).toEqual([0])
  })

  it('regression: all 26 letters queued against JAZZ no longer wins after 23 misses', () => {
    // The old setter graded the whole queue in one batch and let "guessed"
    // beat "hanged": JAZZ was scored guessed with 23 wrong.
    const batch = {}
    for (const letter of ALPHABET) {
      const positions = applyGuess('JAZZ', letter)
      batch[letter] = positions.length ? positions : false
    }
    expect(countWrong(batch)).toBe(23)
    expect(deriveRoundResult('JAZZ', batch)).toBe('guessed')

    // Graded in order, the round stops at the sixth miss (G): hanged.
    const queued = Object.fromEntries(ALPHABET.map(letter => [letter, PENDING]))
    const r = gradePending('JAZZ', queued)
    expect(r.result).toBe('hanged')
    expect(r.wrongCount).toBe(MAX_WRONG)
    expect(r.graded).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(r.discarded).toHaveLength(19)
    expect(Object.keys(r.guesses).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    // The guesser's reveal checks agree with the setter's verdict.
    expect(verifyRoundConsistency('JAZZ', r.guesses)).toBe(true)
    expect(deriveRoundResult('JAZZ', r.guesses)).toBe('hanged')
  })

  it('stops grading once the word is complete, discarding later letters', () => {
    const r = gradePending('ABE', { A: PENDING, B: PENDING, E: PENDING, Z: PENDING })
    expect(r.result).toBe('guessed')
    expect(r.graded).toEqual(['A', 'B', 'E'])
    expect(r.discarded).toEqual(['Z'])
    expect(r.wrongCount).toBe(0)
  })

  it('discards every pending letter when the round was already decided', () => {
    const r = gradePending('CAT', { C: [0], A: [1], T: [2], Q: PENDING })
    expect(r.result).toBe('guessed')
    expect(r.graded).toEqual([])
    expect(r.discarded).toEqual(['Q'])
    expect(r.lastGuess).toBeNull()
  })
})
