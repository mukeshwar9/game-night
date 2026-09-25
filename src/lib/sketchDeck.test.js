import { describe, expect, it } from 'vitest'
import { SKETCH_WORDS } from './decks/sketch'
import { matchKey } from './textMatchLogic'

describe('SKETCH_WORDS', () => {
  it('has a larger balanced deck', () => {
    const counts = SKETCH_WORDS.reduce((acc, entry) => {
      acc[entry.tier] = (acc[entry.tier] || 0) + 1
      return acc
    }, {})

    expect(SKETCH_WORDS.length).toBeGreaterThanOrEqual(350)
    expect(counts[1]).toBeGreaterThanOrEqual(120)
    expect(counts[2]).toBeGreaterThanOrEqual(120)
    expect(counts[3]).toBeGreaterThanOrEqual(100)
  })

  it('does not include duplicate words or complicated phrases', () => {
    const normalized = SKETCH_WORDS.map(entry => entry.word.trim().toLowerCase())
    expect(new Set(normalized).size).toBe(normalized.length)

    for (const entry of SKETCH_WORDS) {
      expect(entry.word.trim().split(/\s+/).length, entry.word).toBeLessThanOrEqual(3)
    }
  })

  it('alts are real extra forms: non-empty, distinct from the word and each other', () => {
    for (const entry of SKETCH_WORDS) {
      if (entry.alts == null) continue
      expect(Array.isArray(entry.alts), entry.word).toBe(true)
      const keys = [entry.word, ...entry.alts].map(matchKey)
      expect(keys.every(Boolean), entry.word).toBe(true)
      expect(new Set(keys).size, entry.word).toBe(keys.length)
    }
  })
})
