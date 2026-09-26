import { describe, it, expect } from 'vitest'
import { HEADSUP_PROMPTS, HEADSUP_CATEGORIES } from './headsup'
import { isDenied } from '../moderationDenylist'

describe('HEADS UP deck', () => {
  it('has at least 300 prompts across at least 6 categories', () => {
    expect(HEADSUP_PROMPTS.length).toBeGreaterThanOrEqual(300)
    expect(HEADSUP_CATEGORIES.length).toBeGreaterThanOrEqual(6)
  })

  it('every category is used and holds a full turn’s worth of prompts', () => {
    for (const { id } of HEADSUP_CATEGORIES) {
      const n = HEADSUP_PROMPTS.filter(p => p.cat === id).length
      expect(n, id).toBeGreaterThanOrEqual(40)
    }
  })

  it('every prompt belongs to a known category', () => {
    const ids = new Set(HEADSUP_CATEGORIES.map(c => c.id))
    for (const p of HEADSUP_PROMPTS) expect(ids.has(p.cat), p.text).toBe(true)
  })

  it('category ids and labels are unique', () => {
    expect(new Set(HEADSUP_CATEGORIES.map(c => c.id)).size).toBe(HEADSUP_CATEGORIES.length)
    expect(new Set(HEADSUP_CATEGORIES.map(c => c.label)).size).toBe(HEADSUP_CATEGORIES.length)
  })

  it('prompts are unique (case-insensitive), trimmed and short enough for the card', () => {
    const seen = new Set()
    for (const { text } of HEADSUP_PROMPTS) {
      expect(text, text).toBe(text.trim())
      expect(text.length, text).toBeGreaterThan(0)
      expect(text.length, text).toBeLessThanOrEqual(24)
      const key = text.toLowerCase()
      expect(seen.has(key), `duplicate: ${text}`).toBe(false)
      seen.add(key)
    }
  })

  it('no prompt word is on the moderation denylist', () => {
    for (const { text } of HEADSUP_PROMPTS) {
      for (const word of text.split(/[^A-Za-zÀ-ÿ]+/).filter(Boolean)) {
        expect(isDenied(word), `${text} → ${word}`).toBe(false)
      }
      expect(isDenied(text), text).toBe(false)
    }
  })
})
