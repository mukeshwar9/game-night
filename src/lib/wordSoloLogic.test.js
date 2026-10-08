import { describe, expect, it } from 'vitest'
import {
  SET_WORDS, SPRINT_MS, WORD_SOLO_MODES, isWordSoloMode, maxScore, pickSoloWord, runOver, runScore, scoreUnit, setPoints,
} from './wordSoloLogic'
import { MAX_GUESSES } from './wordduelLogic'

const solved = (guesses, word = 'crane') => ({ word, solved: true, guesses })
const missed = (word = 'crane') => ({ word, solved: false, guesses: MAX_GUESSES })

describe('setPoints', () => {
  it('pays more for fewer guesses and nothing for a miss', () => {
    expect(setPoints(solved(1))).toBe(MAX_GUESSES)
    expect(setPoints(solved(MAX_GUESSES))).toBe(1)
    expect(setPoints(missed())).toBe(0)
  })
})

describe('runScore', () => {
  it('SPRINT and STREAK count solved words', () => {
    const results = [solved(3), missed(), solved(5)]
    expect(runScore('wordrace', results)).toBe(2)
    expect(runScore('wordcoop', results)).toBe(2)
  })
  it('SET adds up the points', () => {
    expect(runScore('wordduel', [solved(1), solved(4), missed()])).toBe(6 + 3)
    expect(runScore('wordduel', [])).toBe(0)
  })
})

describe('runOver', () => {
  it('SPRINT ends on the clock, not on a miss', () => {
    expect(runOver('wordrace', { results: [missed()], elapsedMs: SPRINT_MS - 1 })).toBe(false)
    expect(runOver('wordrace', { results: [], elapsedMs: SPRINT_MS })).toBe(true)
  })
  it('SET ends after its fifth word', () => {
    expect(runOver('wordduel', { results: Array(SET_WORDS - 1).fill(solved(2)) })).toBe(false)
    expect(runOver('wordduel', { results: Array(SET_WORDS).fill(solved(2)) })).toBe(true)
  })
  it('STREAK ends on the first miss', () => {
    expect(runOver('wordcoop', { results: [] })).toBe(false)
    expect(runOver('wordcoop', { results: [solved(2), solved(6)] })).toBe(false)
    expect(runOver('wordcoop', { results: [solved(2), missed()] })).toBe(true)
  })
})

describe('maxScore', () => {
  it('is fixed for the SET only', () => {
    expect(maxScore('wordduel')).toBe(SET_WORDS * MAX_GUESSES)
    expect(maxScore('wordrace')).toBeNull()
  })
})

describe('pickSoloWord', () => {
  const list = ['aaaaa', 'bbbbb', 'ccccc']
  it('skips words already served', () => {
    for (let i = 0; i < 20; i++) expect(pickSoloWord(list, ['aaaaa', 'ccccc'])).toBe('bbbbb')
  })
  it('starts over when every word was used, and copes with an empty list', () => {
    expect(list).toContain(pickSoloWord(list, list))
    expect(pickSoloWord([], [])).toBe('')
  })
  it('honours the injected random source', () => {
    expect(pickSoloWord(list, [], () => 0)).toBe('aaaaa')
    expect(pickSoloWord(list, [], () => 0.999)).toBe('ccccc')
  })
})

describe('modes', () => {
  it('has copy and units for each mode and nothing about a CPU', () => {
    for (const [mode, m] of Object.entries(WORD_SOLO_MODES)) {
      expect(isWordSoloMode(mode)).toBe(true)
      expect(m.how.join(' ')).not.toMatch(/cpu|\bai\b|opponent/i)
    }
    expect(isWordSoloMode('anagrams')).toBe(false)
    expect(scoreUnit('wordcoop', 1)).toBe('WORD')
    expect(scoreUnit('wordcoop', 3)).toBe('WORDS')
  })
})
