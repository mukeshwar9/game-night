import { describe, it, expect } from 'vitest'
import {
  DICE_PER_PLAYER,
  FACES,
  countFace,
  isBidHigher,
  rollDice,
  resolveChallenge,
} from './bluffLogic'

// ---------------------------------------------------------------------------
// countFace
// ---------------------------------------------------------------------------
describe('countFace', () => {
  it('counts exact matches with no wild', () => {
    expect(countFace([2, 2, 3, 4, 2], 2, false)).toBe(3)
  })

  it('counts wild ones toward a non-one face', () => {
    // three 2s + two 1s (wild) = 5
    expect(countFace([2, 2, 2, 1, 1], 2, true)).toBe(5)
  })

  it('does NOT count ones as wild when wild disabled', () => {
    expect(countFace([2, 2, 2, 1, 1], 2, false)).toBe(3)
  })

  it('counts literal ones (never doubled) when querying face 1', () => {
    expect(countFace([1, 1, 1, 5, 6], 1, true)).toBe(3)
  })

  it('querying face 1 ignores other faces even with wild on', () => {
    expect(countFace([2, 3, 4, 5, 6], 1, true)).toBe(0)
  })

  it('returns 0 across empty cup', () => {
    expect(countFace([], 4, true)).toBe(0)
  })

  it('counts across a combined cup of ten dice', () => {
    const all = [3, 3, 1, 6, 2, 3, 1, 4, 5, 3] // four 3s + two wild 1s = 6
    expect(countFace(all, 3, true)).toBe(6)
    expect(countFace(all, 3, false)).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// isBidHigher
// ---------------------------------------------------------------------------
describe('isBidHigher', () => {
  it('any q>=1 bid is legal as the opening bid', () => {
    expect(isBidHigher(null, { qty: 1, face: 2 })).toBe(true)
    expect(isBidHigher(null, { qty: 5, face: 6 })).toBe(true)
  })

  it('rejects opening bid of qty 0', () => {
    expect(isBidHigher(null, { qty: 0, face: 3 })).toBe(false)
  })

  it('higher quantity is legal regardless of face', () => {
    expect(isBidHigher({ qty: 3, face: 5 }, { qty: 4, face: 2 })).toBe(true)
  })

  it('same quantity, higher face is legal', () => {
    expect(isBidHigher({ qty: 3, face: 4 }, { qty: 3, face: 6 })).toBe(true)
  })

  it('same quantity, same face is NOT legal', () => {
    expect(isBidHigher({ qty: 3, face: 4 }, { qty: 3, face: 4 })).toBe(false)
  })

  it('same quantity, lower face is NOT legal', () => {
    expect(isBidHigher({ qty: 3, face: 5 }, { qty: 3, face: 2 })).toBe(false)
  })

  it('lower quantity is NOT legal', () => {
    expect(isBidHigher({ qty: 4, face: 2 }, { qty: 3, face: 6 })).toBe(false)
  })

  it('rejects out-of-range faces', () => {
    expect(isBidHigher({ qty: 1, face: 1 }, { qty: 2, face: 7 })).toBe(false)
    expect(isBidHigher({ qty: 1, face: 1 }, { qty: 2, face: 0 })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// rollDice
// ---------------------------------------------------------------------------
describe('rollDice', () => {
  it('rolls the default count', () => {
    expect(rollDice()).toHaveLength(DICE_PER_PLAYER)
  })

  it('rolls a requested count', () => {
    expect(rollDice(3)).toHaveLength(3)
  })

  it('every die is within 1..FACES', () => {
    for (let trial = 0; trial < 200; trial++) {
      for (const d of rollDice()) {
        expect(d).toBeGreaterThanOrEqual(1)
        expect(d).toBeLessThanOrEqual(FACES)
        expect(Number.isInteger(d)).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// resolveChallenge
// ---------------------------------------------------------------------------
describe('resolveChallenge', () => {
  it('bid met → caller loses', () => {
    // bid: three 4s. Cups: X=[4,4,1] (=> two 4s + one wild = 3), O=[2,3,5]
    const r = resolveChallenge({
      bid: { qty: 3, face: 4 },
      diceX: [4, 4, 1], diceO: [2, 3, 5],
      caller: 'O', bidder: 'X',
    })
    expect(r.actual).toBe(3)
    expect(r.bidMet).toBe(true)
    expect(r.loser).toBe('O')
  })

  it('bid NOT met → bidder loses', () => {
    const r = resolveChallenge({
      bid: { qty: 4, face: 4 },
      diceX: [4, 2, 3], diceO: [5, 6, 2],
      caller: 'O', bidder: 'X',
    })
    expect(r.actual).toBe(1)
    expect(r.bidMet).toBe(false)
    expect(r.loser).toBe('X')
  })

  it('exact match counts as met (>=)', () => {
    const r = resolveChallenge({
      bid: { qty: 2, face: 6 },
      diceX: [6, 1], diceO: [3, 4],
      caller: 'X', bidder: 'O',
    })
    expect(r.actual).toBe(2) // one 6 + one wild 1
    expect(r.bidMet).toBe(true)
    expect(r.loser).toBe('X')
  })

  it('wild ones do not apply when the bid face is 1', () => {
    const r = resolveChallenge({
      bid: { qty: 3, face: 1 },
      diceX: [1, 1, 6], diceO: [1, 2, 3],
      caller: 'O', bidder: 'X',
    })
    expect(r.actual).toBe(3) // exactly the three literal 1s
    expect(r.bidMet).toBe(true)
    expect(r.loser).toBe('O')
  })

  it('respects onesWild=false', () => {
    const r = resolveChallenge({
      bid: { qty: 3, face: 4 },
      diceX: [4, 4, 1], diceO: [2, 3, 5],
      caller: 'O', bidder: 'X',
      onesWild: false,
    })
    expect(r.actual).toBe(2)
    expect(r.bidMet).toBe(false)
    expect(r.loser).toBe('X')
  })
})
