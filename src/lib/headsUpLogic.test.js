import { describe, it, expect } from 'vitest'
import {
  seatOrder, turnsPerPlayer, totalTurns, guesserForTurn, nextTurnNo, pickDealer,
  normalizeCategory, categoryLabel, categoryIndices, dealHand, packHand, unpackHand, promptText,
  normalizeResults, applyCardResult, countGot, handExhausted, scoreTurn, matchWinners,
  HU_MIXED, HU_GOT, HU_PASS, HU_TURN_CARDS,
} from './headsUpLogic'
import { HEADSUP_PROMPTS, HEADSUP_CATEGORIES } from './decks/headsup'

// Deterministic rng for shuffles.
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const players = {
  c: { playerId: 'c', joinedAt: 3, online: true },
  a: { playerId: 'a', joinedAt: 1, online: true },
  b: { playerId: 'b', joinedAt: 2, online: true },
}

describe('seatOrder', () => {
  it('sorts by joinedAt then id, skipping malformed seats', () => {
    expect(seatOrder({ ...players, x: null, y: { name: 'no id' } })).toEqual(['a', 'b', 'c'])
    expect(seatOrder({ z: { playerId: 'z', joinedAt: 1 }, y: { playerId: 'y', joinedAt: 1 } })).toEqual(['y', 'z'])
    expect(seatOrder(null)).toEqual([])
  })
})

describe('turn schedule', () => {
  it('small groups guess twice, bigger groups once', () => {
    expect(turnsPerPlayer(3)).toBe(2)
    expect(turnsPerPlayer(4)).toBe(2)
    expect(turnsPerPlayer(5)).toBe(1)
    expect(totalTurns(3)).toBe(6)
    expect(totalTurns(8)).toBe(8)
  })

  it('rotates the guesser through the seat order', () => {
    const order = ['a', 'b', 'c']
    expect([0, 1, 2, 3, 4, 5].map(t => guesserForTurn(order, t))).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
    expect(guesserForTurn([], 0)).toBeNull()
  })

  it('skips offline guessers and ends when turns run out', () => {
    const order = ['a', 'b', 'c']
    const online = id => id !== 'b'
    expect(nextTurnNo(order, 0, 6, online)).toBe(0)
    expect(nextTurnNo(order, 1, 6, online)).toBe(2)
    expect(nextTurnNo(order, 4, 6, online)).toBe(5)
    expect(nextTurnNo(order, 6, 6, online)).toBeNull()
    expect(nextTurnNo(order, 0, 6, () => false)).toBeNull()
  })
})

describe('pickDealer', () => {
  it('never picks the guesser', () => {
    expect(pickDealer(['a', 'b', 'c'], 'a', players)).toBe('b')
    expect(pickDealer(['a', 'b', 'c'], 'b', players)).toBe('a')
  })

  it('hands off to the next online seat when the first choice is offline', () => {
    const p = { ...players, b: { ...players.b, online: false } }
    expect(pickDealer(['a', 'b', 'c'], 'a', p)).toBe('c')
  })

  it('follows seat (join) order, not id order', () => {
    expect(pickDealer(['c', 'b', 'a'], 'a', players)).toBe('c')
  })

  it('returns null with nobody but the guesser', () => {
    expect(pickDealer(['a'], 'a', players)).toBeNull()
  })
})

describe('categories', () => {
  it('normalizes unknown categories to MIXED', () => {
    expect(normalizeCategory('animals')).toBe('animals')
    expect(normalizeCategory('nope')).toBe(HU_MIXED)
    expect(normalizeCategory(undefined)).toBe(HU_MIXED)
    expect(categoryLabel('animals')).toBe('ANIMALS')
    expect(categoryLabel(HU_MIXED)).toBe('MIXED')
  })

  it('category indices cover exactly that category; MIXED covers the deck', () => {
    for (const { id } of HEADSUP_CATEGORIES) {
      const idx = categoryIndices(id)
      expect(idx.length).toBeGreaterThan(0)
      for (const i of idx) expect(HEADSUP_PROMPTS[i].cat).toBe(id)
    }
    expect(categoryIndices(HU_MIXED)).toHaveLength(HEADSUP_PROMPTS.length)
  })
})

describe('dealHand', () => {
  it('deals distinct in-category prompts, capped by the category size', () => {
    const hand = dealHand('animals', {}, HU_TURN_CARDS, seeded(3))
    const size = categoryIndices('animals').length
    expect(hand).toHaveLength(Math.min(HU_TURN_CARDS, size))
    expect(new Set(hand).size).toBe(hand.length)
    for (const i of hand) expect(HEADSUP_PROMPTS[i].cat).toBe('animals')
  })

  it('puts never-seen prompts first, then the least recently seen', () => {
    const pool = categoryIndices('food')
    const seen = {}
    pool.forEach((i, k) => { if (k >= 5) seen[i] = k }) // only the first 5 are fresh
    const hand = dealHand('food', seen, 8, seeded(7))
    expect(new Set(hand.slice(0, 5))).toEqual(new Set(pool.slice(0, 5)))
    // Next come the oldest seen (lowest seq): pool[5], pool[6], pool[7].
    expect(hand.slice(5)).toEqual([pool[5], pool[6], pool[7]])
  })

  it('handles a zero count', () => {
    expect(dealHand(HU_MIXED, {}, 0)).toEqual([])
  })
})

describe('packHand / unpackHand / promptText', () => {
  it('round-trips a hand and drops out-of-range entries', () => {
    expect(unpackHand(packHand([0, 5, 9]))).toEqual([0, 5, 9])
    expect(unpackHand(JSON.stringify([1, -1, 1.5, 'x', HEADSUP_PROMPTS.length]))).toEqual([1])
    expect(unpackHand('not json')).toBeNull()
    expect(unpackHand('{"a":1}')).toBeNull()
    expect(promptText(0)).toBe(HEADSUP_PROMPTS[0].text)
    expect(promptText(99999)).toBeNull()
  })
})

describe('card results', () => {
  it('normalizes junk to a clean G/P string', () => {
    expect(normalizeResults('GxP P')).toBe('GPP')
    expect(normalizeResults(null)).toBe('')
    expect(normalizeResults(['G'])).toBe('')
  })

  it('applies a result only to the card on screen', () => {
    expect(applyCardResult('', 0, HU_GOT)).toBe('G')
    expect(applyCardResult('G', 1, HU_PASS)).toBe('GP')
    // A second teammate tapping the same card is a stale no-op.
    expect(applyCardResult('GP', 1, HU_GOT)).toBeNull()
    expect(applyCardResult('GP', 3, HU_GOT)).toBeNull()
    expect(applyCardResult('', 0, 'X')).toBeNull()
  })

  it('refuses a tap once the hand is used up', () => {
    expect(applyCardResult('GG', 2, HU_GOT, 2)).toBeNull()
    expect(handExhausted('GG', 2)).toBe(true)
    expect(handExhausted('G', 2)).toBe(false)
  })

  it('counts GOT ITs', () => {
    expect(countGot('GPGGP')).toBe(3)
    expect(countGot('')).toBe(0)
  })
})

describe('scoring', () => {
  it('the guesser banks one point per GOT IT', () => {
    expect(scoreTurn({ a: 2 }, 'a', 'GGP')).toEqual({ a: 4 })
    expect(scoreTurn({}, 'b', 'PP')).toEqual({ b: 0 })
    expect(scoreTurn({ a: 1 }, null, 'GGG')).toEqual({ a: 1 })
  })

  it('does not mutate the input', () => {
    const scores = { a: 1 }
    scoreTurn(scores, 'a', 'G')
    expect(scores).toEqual({ a: 1 })
  })

  it('match winners are the top scorers, ties shared, nobody when all zero', () => {
    expect(matchWinners(['a', 'b', 'c'], { a: 3, b: 5, c: 1 })).toEqual(['b'])
    expect(matchWinners(['a', 'b', 'c'], { a: 5, b: 5, c: 1 })).toEqual(['a', 'b'])
    expect(matchWinners(['a', 'b'], {})).toEqual([])
    // Scores of players who left the seat list don't count.
    expect(matchWinners(['a'], { a: 1, gone: 9 })).toEqual(['a'])
  })
})
