import { describe, it, expect } from 'vitest'
import { FIBBAGE_FACTS } from './fibbage'

// Case/punctuation-insensitive key, so "Brad's Drink" and "brads drink" collide.
// Pure-symbol strings (e.g. '@', '#') keep themselves so they stay distinct.
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || s.trim()

const isCleanString = s => typeof s === 'string' && s.length > 0 && s === s.trim()

// FibbageGame / FibbageDemo cap typed lies at maxLength={60}; keep deck strings
// within the same budget so the truth and bot lies look like typed answers.
const MAX_ANSWER_CHARS = 60

const BLANK = '___'

describe('FIBBAGE_FACTS — content volume', () => {
  it('has at least 100 facts', () => {
    expect(FIBBAGE_FACTS.length).toBeGreaterThanOrEqual(100)
  })
})

describe('FIBBAGE_FACTS — blank marker', () => {
  // The pages render the prompt via fact.prompt.replace('___', …), which swaps
  // only the FIRST occurrence — so exactly one blank, and no longer underscore
  // runs that would leave stray underscores behind.
  it('every prompt has exactly one ___ blank', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(f.prompt.split(BLANK).length - 1, f.prompt).toBe(1)
      expect(f.prompt.includes('____'), f.prompt).toBe(false)
    }
  })

  it('replacing the blank leaves no underscores behind', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(f.prompt.replace(BLANK, f.answer).includes('_'), f.prompt).toBe(false)
    }
  })
})

describe('FIBBAGE_FACTS — schema', () => {
  it('prompts and answers are clean, non-empty strings', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(isCleanString(f.prompt), f.prompt).toBe(true)
      expect(isCleanString(f.answer), f.prompt).toBe(true)
    }
  })

  it('answers are short: 1-3 words and within the lie length cap', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(f.answer.split(/\s+/).length, f.answer).toBeLessThanOrEqual(3)
      expect(f.answer.length, f.answer).toBeLessThanOrEqual(MAX_ANSWER_CHARS)
    }
  })

  it('has 2-3 clean decoys per fact, within the lie length cap', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(Array.isArray(f.decoys), f.prompt).toBe(true)
      expect(f.decoys.length, f.prompt).toBeGreaterThanOrEqual(2)
      expect(f.decoys.length, f.prompt).toBeLessThanOrEqual(3)
      for (const d of f.decoys) {
        expect(isCleanString(d), `${f.prompt} → "${d}"`).toBe(true)
        expect(d.length, d).toBeLessThanOrEqual(MAX_ANSWER_CHARS)
      }
    }
  })

  it('no decoy matches the answer (case/punctuation-insensitive)', () => {
    for (const f of FIBBAGE_FACTS) {
      for (const d of f.decoys) expect(norm(d), f.prompt).not.toBe(norm(f.answer))
    }
  })

  it('decoys are distinct within a fact (case/punctuation-insensitive)', () => {
    for (const f of FIBBAGE_FACTS) {
      const keys = f.decoys.map(norm)
      expect(new Set(keys).size, f.prompt).toBe(keys.length)
    }
  })

  it('has no extra or missing keys', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(Object.keys(f).sort(), f.prompt).toEqual(['answer', 'decoys', 'prompt'])
    }
  })
})

describe('FIBBAGE_FACTS — uniqueness', () => {
  it('has no duplicate prompts (case/punctuation-insensitive)', () => {
    const seen = new Map()
    for (const f of FIBBAGE_FACTS) {
      const key = norm(f.prompt)
      expect(seen.has(key), `duplicate: "${f.prompt}" vs "${seen.get(key)}"`).toBe(false)
      seen.set(key, f.prompt)
    }
  })
})
