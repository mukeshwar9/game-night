import { describe, it, expect } from 'vitest'
import { TRIVIA_DECK } from './trivia'
import { MATCH_QUESTIONS } from '../triviaLogic'

// Case/punctuation-insensitive key, so "What's X?" and "whats x" collide.
// Pure-symbol strings (e.g. '@', '#') keep themselves so they stay distinct.
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || s.trim()

const isCleanString = s => typeof s === 'string' && s.length > 0 && s === s.trim()

describe('TRIVIA_DECK — content volume', () => {
  it('has at least 200 questions', () => {
    expect(TRIVIA_DECK.length).toBeGreaterThanOrEqual(200)
  })

  it('spans at least 10 categories with at least 10 questions each', () => {
    const counts = {}
    for (const item of TRIVIA_DECK) counts[item.cat] = (counts[item.cat] || 0) + 1
    const cats = Object.keys(counts)
    expect(cats.length).toBeGreaterThanOrEqual(10)
    for (const cat of cats) expect(counts[cat], cat).toBeGreaterThanOrEqual(10)
  })

  it('has enough of every difficulty tier to fill a match', () => {
    for (const diff of [1, 2, 3]) {
      const n = TRIVIA_DECK.filter(q => q.diff === diff).length
      expect(n, `diff ${diff}`).toBeGreaterThanOrEqual(MATCH_QUESTIONS)
    }
  })
})

describe('TRIVIA_DECK — schema', () => {
  it('every question is a clean, non-empty string', () => {
    for (const item of TRIVIA_DECK) expect(isCleanString(item.q), item.q).toBe(true)
  })

  it('every entry has exactly 4 clean, non-empty options', () => {
    for (const item of TRIVIA_DECK) {
      expect(item.options, item.q).toHaveLength(4)
      for (const opt of item.options) expect(isCleanString(opt), `${item.q} → "${opt}"`).toBe(true)
    }
  })

  it('answer is an integer index 0-3', () => {
    for (const item of TRIVIA_DECK) {
      expect(Number.isInteger(item.answer), item.q).toBe(true)
      expect(item.answer, item.q).toBeGreaterThanOrEqual(0)
      expect(item.answer, item.q).toBeLessThanOrEqual(3)
    }
  })

  it('the correct answer text appears exactly once among the options', () => {
    for (const item of TRIVIA_DECK) {
      const correct = norm(item.options[item.answer])
      const hits = item.options.filter(o => norm(o) === correct).length
      expect(hits, item.q).toBe(1)
    }
  })

  it('options are distinct within a question (case/punctuation-insensitive)', () => {
    for (const item of TRIVIA_DECK) {
      const keys = item.options.map(norm)
      expect(new Set(keys).size, item.q).toBe(keys.length)
    }
  })

  it('diff is 1, 2 or 3 and cat is a non-empty lowercase label', () => {
    for (const item of TRIVIA_DECK) {
      expect([1, 2, 3], item.q).toContain(item.diff)
      expect(isCleanString(item.cat), item.q).toBe(true)
      expect(item.cat, item.q).toBe(item.cat.toLowerCase())
    }
  })

  it('has no extra or missing keys', () => {
    for (const item of TRIVIA_DECK) {
      expect(Object.keys(item).sort(), item.q).toEqual(['answer', 'cat', 'diff', 'options', 'q'])
    }
  })
})

describe('TRIVIA_DECK — uniqueness and balance', () => {
  it('has no duplicate questions (case/punctuation-insensitive)', () => {
    const seen = new Map()
    for (const item of TRIVIA_DECK) {
      const key = norm(item.q)
      expect(seen.has(key), `duplicate: "${item.q}" vs "${seen.get(key)}"`).toBe(false)
      seen.set(key, item.q)
    }
  })

  it('no answer position holds more than 35% of correct answers', () => {
    const counts = [0, 0, 0, 0]
    for (const item of TRIVIA_DECK) counts[item.answer]++
    for (const c of counts) expect(c / TRIVIA_DECK.length).toBeLessThanOrEqual(0.35)
  })
})
