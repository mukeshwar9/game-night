import { describe, it, expect } from 'vitest'
import {
  seatOrder, getCard, pickCardIndex, dealChameleon, payloadFor, parsePayload, readDeal,
  clueOrder, normalizeClues, normalizeVotes, currentClueGiver, cluesDone, validateClue,
  tallyVotes, resolveAccused, allOnlineVoted, outcomeOf, scoreRound, matchWinners,
  PAYLOAD_CHAMELEON, CHAMELEON_GRID, CHAMELEON_MATCH_POINTS, CLUE_MAX_LEN,
  POINTS_ESCAPED, POINTS_STOLEN, POINTS_CAUGHT,
} from './chameleonLogic'
import { CHAMELEON_CARDS } from './decks/chameleon'

function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

describe('seatOrder / getCard', () => {
  it('sorts by joinedAt then id', () => {
    expect(seatOrder({ b: { playerId: 'b', joinedAt: 2 }, a: { playerId: 'a', joinedAt: 2 }, c: { playerId: 'c', joinedAt: 1 } }))
      .toEqual(['c', 'a', 'b'])
  })

  it('looks up cards by index', () => {
    expect(getCard(0)).toBe(CHAMELEON_CARDS[0])
    expect(getCard(-1)).toBeNull()
  })
})

describe('pickCardIndex', () => {
  it('never repeats the previous card', () => {
    const rng = seeded(4)
    for (let i = 0; i < 50; i++) expect(pickCardIndex({}, 3, rng)).not.toBe(3)
  })

  it('avoids seen cards while fresh ones remain', () => {
    const seen = {}
    for (let i = 0; i < CHAMELEON_CARDS.length - 1; i++) seen[i] = i + 1
    expect(pickCardIndex(seen, null, seeded(2))).toBe(CHAMELEON_CARDS.length - 1)
  })

  it('still picks something once every card has been seen', () => {
    const seen = {}
    CHAMELEON_CARDS.forEach((_, i) => { seen[i] = i + 1 })
    const idx = pickCardIndex(seen, 0, seeded(9))
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(CHAMELEON_CARDS.length)
    expect(idx).not.toBe(0)
  })
})

describe('dealing and payloads', () => {
  it('deals exactly one Chameleon among the ids and a secret slot on the grid', () => {
    const rng = seeded(11)
    const counts = { a: 0, b: 0, c: 0, d: 0 }
    for (let i = 0; i < 400; i++) {
      const { chameleonId, secretIndex } = dealChameleon(['a', 'b', 'c', 'd'], rng)
      counts[chameleonId]++
      expect(secretIndex).toBeGreaterThanOrEqual(0)
      expect(secretIndex).toBeLessThan(CHAMELEON_GRID)
    }
    // Every seat can be the Chameleon.
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(40)
  })

  it('handles an empty seat list', () => {
    expect(dealChameleon([])).toEqual({ chameleonId: null, secretIndex: null })
  })

  it('the Chameleon gets no word; everyone else gets the same secret', () => {
    const deal = { chameleonId: 'b', secretIndex: 7 }
    expect(payloadFor('b', deal)).toBe(PAYLOAD_CHAMELEON)
    expect(parsePayload(payloadFor('a', deal))).toEqual({ chameleon: false, secretIndex: 7 })
    expect(parsePayload(payloadFor('b', deal))).toEqual({ chameleon: true })
  })

  it('rejects malformed payloads', () => {
    expect(parsePayload('WORD:16')).toBeNull()
    expect(parsePayload('WORD:x')).toBeNull()
    expect(parsePayload(null)).toBeNull()
  })

  it('readDeal finds the Chameleon and secret and flags contradictions', () => {
    expect(readDeal({ a: { chameleon: false, secretIndex: 2 }, b: { chameleon: true }, c: null }))
      .toEqual({ chameleonId: 'b', secretIndex: 2, consistent: true })
    expect(readDeal({ a: { chameleon: true }, b: { chameleon: true } }).consistent).toBe(false)
    expect(readDeal({ a: { chameleon: false, secretIndex: 1 }, b: { chameleon: false, secretIndex: 2 } }).consistent).toBe(false)
    expect(readDeal({})).toEqual({ chameleonId: null, secretIndex: null, consistent: true })
  })
})

describe('clue order', () => {
  it('rotates the lead player each round', () => {
    expect(clueOrder(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
    expect(clueOrder(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a'])
    expect(clueOrder(['a', 'b', 'c'], 5)).toEqual(['c', 'a', 'b'])
    expect(clueOrder([], 2)).toEqual([])
  })

  it('normalizes sparse clue/vote maps', () => {
    expect(normalizeClues({ a: 'RED', b: '', c: null, d: 3 })).toEqual({ a: 'RED' })
    expect(normalizeVotes(undefined)).toEqual({})
  })

  it('the next clue-giver is the first online player without a clue', () => {
    const order = ['a', 'b', 'c']
    expect(currentClueGiver(order, {})).toBe('a')
    expect(currentClueGiver(order, { a: 'X' })).toBe('b')
    expect(currentClueGiver(order, { a: 'X' }, id => id !== 'b')).toBe('c')
    expect(currentClueGiver(order, { a: 'X', b: 'Y', c: 'Z' })).toBeNull()
  })

  it('clues are done when nobody online owes one', () => {
    const order = ['a', 'b', 'c']
    expect(cluesDone(order, {})).toBe(false)
    expect(cluesDone(order, { a: 'X', b: 'Y' })).toBe(false)
    expect(cluesDone(order, { a: 'X', b: 'Y' }, id => id !== 'c')).toBe(true)
    // Everyone offline and no clues yet: not "done".
    expect(cluesDone(order, {}, () => false)).toBe(false)
  })
})

describe('validateClue', () => {
  it('accepts and tidies a normal clue', () => {
    expect(validateClue('  crunchy   snack ')).toEqual({ ok: true, clue: 'crunchy snack' })
    expect(validateClue("rock 'n' roll")).toEqual({ ok: true, clue: "rock 'n' roll" })
    expect(validateClue('café')).toEqual({ ok: true, clue: 'café' })
  })

  it('rejects empty, overlong and symbol-laden clues', () => {
    expect(validateClue('   ').ok).toBe(false)
    expect(validateClue('a'.repeat(CLUE_MAX_LEN + 1)).ok).toBe(false)
    expect(validateClue('hi!').ok).toBe(false)
  })

  it('rejects denylisted words', () => {
    expect(validateClue('shit').ok).toBe(false)
    expect(validateClue('big shit')).toEqual({ ok: false, error: 'PICK A FRIENDLIER CLUE' })
  })

  it('stops a player who knows the secret from saying it', () => {
    expect(validateClue('pizza', 'PIZZA')).toEqual({ ok: false, error: "DON'T SAY THE SECRET WORD" })
    expect(validateClue('ice-cream', 'ICE CREAM').ok).toBe(false)
    expect(validateClue('hot pizza', 'PIZZA').ok).toBe(false)
    expect(validateClue('pizzeria', 'PIZZA').ok).toBe(true)
    // The Chameleon doesn't know the secret: no check.
    expect(validateClue('pizza', null).ok).toBe(true)
  })
})

describe('voting', () => {
  it('tallies a plurality and detects ties', () => {
    expect(tallyVotes({ a: 'b', c: 'b', b: 'a' })).toEqual({ top: 'b', topCount: 2, tied: false })
    expect(tallyVotes({ a: 'b', b: 'a' }).tied).toBe(true)
    expect(resolveAccused({ a: 'b', c: 'b', b: 'a' })).toBe('b')
    expect(resolveAccused({ a: 'b', b: 'a' })).toBeNull()
    expect(resolveAccused({})).toBeNull()
  })

  it('waits for every online participant and at least two votes', () => {
    const players = { a: { online: true }, b: { online: true }, c: { online: false } }
    expect(allOnlineVoted(['a', 'b', 'c'], players, { a: 'b' })).toBe(false)
    expect(allOnlineVoted(['a', 'b', 'c'], players, { a: 'b', b: 'a' })).toBe(true)
    expect(allOnlineVoted(['a'], { a: { online: true } }, { a: 'x' })).toBe(false)
  })
})

describe('outcome and scoring', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('classifies the three outcomes', () => {
    expect(outcomeOf({ accused: null, chameleonId: 'b' })).toBe('escaped')
    expect(outcomeOf({ accused: 'a', chameleonId: 'b' })).toBe('escaped')
    expect(outcomeOf({ accused: 'b', chameleonId: 'b', guessIndex: 4, secretIndex: 4 })).toBe('stolen')
    expect(outcomeOf({ accused: 'b', chameleonId: 'b', guessIndex: 3, secretIndex: 4 })).toBe('caught')
    expect(outcomeOf({ accused: 'b', chameleonId: 'b', guessIndex: null, secretIndex: 4 })).toBe('caught')
  })

  it('scores each outcome', () => {
    expect(scoreRound({}, ids, 'b', 'escaped')).toEqual({ b: POINTS_ESCAPED })
    expect(scoreRound({ b: 1 }, ids, 'b', 'stolen')).toEqual({ b: 1 + POINTS_STOLEN })
    expect(scoreRound({ a: 1 }, ids, 'b', 'caught')).toEqual({ a: 1 + POINTS_CAUGHT, c: POINTS_CAUGHT, d: POINTS_CAUGHT })
    expect(scoreRound({ a: 1 }, ids, null, 'escaped')).toEqual({ a: 1 })
  })

  it('match winners are everyone at the target, shared', () => {
    const P = CHAMELEON_MATCH_POINTS
    expect(matchWinners(ids, { a: P, b: P - 1, c: P + 1 })).toEqual(['a', 'c'])
    expect(matchWinners(ids, {})).toEqual([])
  })
})
