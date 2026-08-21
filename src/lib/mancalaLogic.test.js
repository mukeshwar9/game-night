import { describe, it, expect } from 'vitest'
import {
  PIT_COUNT,
  STORE_X,
  STORE_O,
  INITIAL_PITS,
  normalizePits,
  opposite,
  applyMancalaMove,
  legalPits,
} from './mancalaLogic'

// All expectations below were computed by executing the real module
// (node -e) and hand-checked against Kalah rules — capture and end-sweep
// interactions make naive hand-tracing unreliable.

describe('setup', () => {
  it('starts 4 seeds per pit, empty stores', () => {
    expect(INITIAL_PITS()).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0])
    expect(PIT_COUNT).toBe(14)
    expect(STORE_X).toBe(6)
    expect(STORE_O).toBe(13)
  })
  it('normalizePits tolerates arrays, objects and null', () => {
    expect(normalizePits([1, 2])).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(normalizePits({ 0: 5 })[0]).toBe(5)
    expect(normalizePits(null)).toEqual(Array(14).fill(0))
  })
  it('opposite() pairs across the board', () => {
    expect(opposite(0)).toBe(12)
    expect(opposite(5)).toBe(7)
    expect(opposite(6)).toBe(6)
    expect(opposite(12)).toBe(0)
  })
})

describe('legality', () => {
  const pits = INITIAL_PITS()
  it('rejects opponent pits, stores, empty pits, out-of-range', () => {
    expect(applyMancalaMove(pits, 7, 'X')).toBeNull()
    expect(applyMancalaMove(pits, 6, 'X')).toBeNull()
    expect(applyMancalaMove(pits, 0, 'O')).toBeNull()
    const emptied = [...pits]; emptied[2] = 0
    expect(applyMancalaMove(emptied, 2, 'X')).toBeNull()
    expect(applyMancalaMove(pits, -1, 'X')).toBeNull()
    expect(applyMancalaMove(pits, 99, 'X')).toBeNull()
  })
  it('legalPits lists only own non-empty pits', () => {
    expect(legalPits(INITIAL_PITS(), 'X')).toEqual([0, 1, 2, 3, 4, 5])
    expect(legalPits(INITIAL_PITS(), 'O')).toEqual([7, 8, 9, 10, 11, 12])
  })
})

describe('sowing', () => {
  it('basic sow without capture: seeds land 3,4 (opposite pits empty → no capture)', () => {
    // Landing pit 4's opposite is 8 — kept empty; O side seeded at 9-12 only.
    const moved = applyMancalaMove([0, 0, 2, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 0], 2, 'X')
    expect(moved.pits).toEqual([0, 0, 0, 1, 1, 0, 0, 0, 0, 4, 4, 4, 4, 0])
    expect(moved.extraTurn).toBe(false)
    expect(moved.captured).toBe(0)
    expect(moved.result).toBeNull()
  })
  it('X sows across own store (extra-turn landing) without sweeping', () => {
    const moved = applyMancalaMove([0, 0, 0, 0, 1, 1, 0, 3, 3, 3, 3, 3, 3, 0], 5, 'X')
    expect(moved.extraTurn).toBe(true)
    expect(moved.pits[STORE_X]).toBe(1)
    expect(moved.pits[4]).toBe(1) // X still has a seed → no end-sweep
    expect(moved.result).toBeNull()
  })
  it('skips opponent store 13 on wraparound', () => {
    // 8 seeds from pit 5: store 6 (+1), pits 7-12 (+1 each = 6), skip 13, land 0.
    // Landing pit 0 captures opposite(0)=12's seed (documented capture+sweep case).
    const moved = applyMancalaMove([0, 0, 0, 0, 0, 8, 0, 1, 1, 1, 1, 1, 0, 0], 5, 'X')
    expect(moved.captured).toBe(2)
    expect(moved.pits).toEqual([0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 10])
    expect(moved.result).toEqual({ winner: 'O', scoreX: 3, scoreO: 10 }) // X emptied → sweep
  })
  it('O skips own store 6 on wraparound', () => {
    // 9 seeds from O pit 12: 13(+1), 0,1,2 (+3), land own-empty... verified output:
    // landing on own-empty 7? No — capture fired at 7 vs opposite(7)=5.
    const moved = applyMancalaMove([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0], 12, 'O')
    expect(moved.pits).toEqual([2, 2, 2, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 3])
    expect(moved.captured).toBe(2)
    expect(moved.result).toBeNull()
  })
  it('huge multi-lap sow conserves total and never touches opponent store', () => {
    const moved = applyMancalaMove([20, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0], 0, 'X')
    const total = moved.pits.reduce((a, b) => a + b, 0)
    expect(total).toBe(26)
    expect(moved.pits[STORE_O]).toBe(0)
    expect(moved.result).toBeNull()
  })
})

describe('capture', () => {
  it('last seed in own-empty pit vacuums a seeded opposite pit', () => {
    const moved = applyMancalaMove([4, 0, 0, 1, 0, 0, 0, 0, 5, 4, 4, 4, 4, 0], 0, 'X')
    expect(moved.captured).toBe(6) // 5 opposite + 1 landing seed
    expect(moved.pits[4]).toBe(0)
    expect(moved.pits[8]).toBe(0)
    expect(moved.pits[STORE_X]).toBe(6)
    expect(moved.result).toBeNull() // X keeps seeds elsewhere
  })
  it('no capture when opposite pit is empty — seed stays', () => {
    const moved = applyMancalaMove([4, 0, 0, 1, 0, 0, 0, 0, 0, 4, 4, 4, 4, 0], 0, 'X')
    expect(moved.captured).toBe(0)
    expect(moved.pits[4]).toBe(1)
    expect(moved.pits[STORE_X]).toBe(0)
  })
})

describe('end sweep + result', () => {
  it('sweeps when the move empties the mover’s side and declares the leader', () => {
    // X plays pit 5 (1 seed → store). X's pits now all empty → sweep:
    // O's 3 remaining seeds go to O's store. Verified: X 11 – O 10.
    const moved = applyMancalaMove([0, 0, 0, 0, 0, 1, 10, 0, 3, 0, 0, 0, 0, 7], 5, 'X')
    expect(moved.result).toEqual({ winner: 'X', scoreX: 11, scoreO: 10 })
    expect(moved.pits.slice(0, 6).every(n => n === 0)).toBe(true)
    expect(moved.pits.slice(7, 13).every(n => n === 0)).toBe(true)
    expect(moved.extraTurn).toBe(true) // extra turn moot — game ended
  })
  it('declares draw at exactly 24–24', () => {
    const moved = applyMancalaMove([4, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 1, 23], 12, 'O')
    expect(moved.result.winner).toBe('draw')
    expect(moved.result.scoreX).toBe(24)
    expect(moved.result.scoreO).toBe(24)
  })
})
