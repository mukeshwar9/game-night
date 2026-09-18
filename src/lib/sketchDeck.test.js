import { describe, expect, it } from 'vitest'
import { SKETCH_WORDS } from './decks/sketch'

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
})
