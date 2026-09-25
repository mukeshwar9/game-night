import { describe, expect, it } from 'vitest'
import { COMMON_WORDS, isCommonWord, rankByFamiliarity, topFamiliar } from './commonWords'
import { isFamilySafe } from './wordDenylist'

describe('COMMON_WORDS', () => {
  it('is lowercase 3–4 or 6–7 letter words with no duplicates', () => {
    for (const word of COMMON_WORDS) {
      expect(word, word).toMatch(/^[a-z]+$/)
      expect([3, 4, 6, 7], word).toContain(word.length)
    }
    expect(new Set(COMMON_WORDS).size).toBe(COMMON_WORDS.length)
  })

  it('is family-safe', () => {
    expect(COMMON_WORDS.filter(word => !isFamilySafe(word))).toEqual([])
  })
})

describe('isCommonWord', () => {
  it('knows everyday words of every length', () => {
    for (const word of ['cat', 'nest', 'plane', 'planet', 'teacher', 'CATS']) expect(isCommonWord(word), word).toBe(true)
  })

  it('does not count obscure dictionary words', () => {
    for (const word of ['eta', 'tae', 'ern', 'nae', 'platen', 'latens', 'recheat', '']) expect(isCommonWord(word), word).toBe(false)
  })
})

describe('rankByFamiliarity', () => {
  it('puts common words first, then by score, length and A–Z', () => {
    expect(rankByFamiliarity(['platen', 'eta', 'net', 'planet', 'plane'])).toEqual(['planet', 'plane', 'net', 'platen', 'eta'])
  })

  it('uses the given score before length', () => {
    const score = w => ({ net: 5, planet: 1 })[w] ?? 0
    expect(rankByFamiliarity(['planet', 'net'], { score })).toEqual(['net', 'planet'])
  })
})

describe('topFamiliar', () => {
  it('regression: obscure high scorers no longer lead the missed list', () => {
    const missed = ['platens', 'latens', 'palets', 'plates', 'panel', 'aspen', 'nest']
    expect(topFamiliar(missed, { limit: 3 })).toEqual(['plates', 'aspen', 'panel'])
  })

  it('never shows a word that is not family-safe, and dedupes', () => {
    expect(topFamiliar(['tits', 'ass', 'rape', 'cat', 'CAT'])).toEqual(['cat'])
  })

  it('caps the list at the limit (default 10)', () => {
    expect(topFamiliar(COMMON_WORDS)).toHaveLength(10)
    expect(topFamiliar([])).toEqual([])
  })
})
