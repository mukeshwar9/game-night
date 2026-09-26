import { describe, it, expect } from 'vitest'
import { CHAMELEON_CARDS } from './chameleon'
import { isDenied } from '../moderationDenylist'

describe('CHAMELEON deck', () => {
  it('has at least 40 topic cards', () => {
    expect(CHAMELEON_CARDS.length).toBeGreaterThanOrEqual(40)
  })

  it('every card has a unique uppercase topic and exactly 16 words', () => {
    const topics = new Set()
    for (const card of CHAMELEON_CARDS) {
      expect(card.topic, card.topic).toBe(card.topic.toUpperCase())
      expect(card.topic.length, card.topic).toBeLessThanOrEqual(16)
      expect(topics.has(card.topic), `duplicate topic ${card.topic}`).toBe(false)
      topics.add(card.topic)
      expect(card.words, card.topic).toHaveLength(16)
    }
  })

  it('words are uppercase, trimmed, short enough for the 4×4 grid and unique per card', () => {
    for (const card of CHAMELEON_CARDS) {
      expect(new Set(card.words).size, card.topic).toBe(16)
      for (const w of card.words) {
        expect(w, `${card.topic}: ${w}`).toMatch(/^[A-Z][A-Z' -]*[A-Z]$/)
        expect(w.length, `${card.topic}: ${w}`).toBeLessThanOrEqual(12)
      }
    }
  })

  it('no word or topic is on the moderation denylist', () => {
    for (const card of CHAMELEON_CARDS) {
      for (const text of [card.topic, ...card.words]) {
        for (const word of text.split(/[^A-Z]+/).filter(Boolean)) {
          expect(isDenied(word), `${card.topic}: ${text}`).toBe(false)
        }
      }
    }
  })
})
