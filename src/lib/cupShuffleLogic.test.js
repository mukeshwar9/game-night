import { describe, it, expect } from 'vitest'
import { dealCups, ballSlotAfter, cupSlotsAfter, cupsForLevel, swapsForLevel, swapMsForLevel, cupPose, easeSwap } from './cupShuffleLogic'
import { mulberry32 } from './detMath'

describe('cup shuffle', () => {
  it('grows from 3 to 5 cups with more and quicker swaps', () => {
    expect([1, 4, 8].map(cupsForLevel)).toEqual([3, 4, 5])
    expect(swapsForLevel(5)).toBeGreaterThan(swapsForLevel(1))
    expect(swapMsForLevel(30)).toBe(240)
  })
  it('every swap moves two different cups, and the ball follows its cup', () => {
    const deal = dealCups(6, mulberry32(4))
    expect(deal.swaps.every(([a, b]) => a !== b && a < deal.cups && b < deal.cups)).toBe(true)
    const ballCup = deal.ball // cup ids start equal to slots
    expect(cupSlotsAfter(deal, deal.swaps.length)[ballCup]).toBe(ballSlotAfter(deal))
  })
  it('tracks a hand-written shuffle', () => {
    expect(ballSlotAfter({ cups: 3, ball: 0, swaps: [[0, 2], [1, 2], [0, 1]] })).toBe(0)
    expect(ballSlotAfter({ cups: 3, ball: 0, swaps: [[0, 1]] })).toBe(1)
  })
  it('deals the same shuffle for the same seed', () => {
    expect(dealCups(4, mulberry32(8))).toEqual(dealCups(4, mulberry32(8)))
  })
})

describe('cupPose (3D board)', () => {
  const deal = { cups: 3, ball: 0, swaps: [[0, 2], [0, 1]] }
  const MS = 400

  it('eases from 0 to 1', () => {
    expect(easeSwap(0)).toBe(0)
    expect(easeSwap(1)).toBe(1)
    expect(easeSwap(0.5)).toBe(0.5)
    expect(easeSwap(-3)).toBe(0)
    expect(easeSwap(9)).toBe(1)
  })

  it('sits on the dealt slots before the first swap and the final slots after the last', () => {
    for (let cup = 0; cup < 3; cup++) {
      expect(cupPose(deal, cup, 0, MS)).toEqual({ slot: cup, depth: 0, hop: 0 })
      expect(cupPose(deal, cup, -50, MS)).toEqual({ slot: cup, depth: 0, hop: 0 })
      expect(cupPose(deal, cup, 2 * MS, MS)).toEqual({ slot: cupSlotsAfter(deal, 2)[cup], depth: 0, hop: 0 })
      expect(cupPose(deal, cup, 99 * MS, MS).slot).toBe(cupSlotsAfter(deal, 2)[cup])
    }
  })

  it('swings the cup moving right to the front and the one moving left behind, at mid-swap', () => {
    const right = cupPose(deal, 0, MS / 2, MS) // slot 0 → 2
    const left = cupPose(deal, 2, MS / 2, MS)  // slot 2 → 0
    expect(right.slot).toBeCloseTo(1)
    expect(left.slot).toBeCloseTo(1)
    expect(right.depth).toBeCloseTo(1)
    expect(left.depth).toBeCloseTo(-1)
    expect(right.hop).toBeCloseTo(1)
  })

  it('leaves cups outside the swap alone', () => {
    expect(cupPose(deal, 1, MS / 2, MS)).toEqual({ slot: 1, depth: 0, hop: 0 })
  })

  it('never puts two cups at the same depth on the same slot (they can be told apart)', () => {
    for (let ms = 0; ms <= 2 * MS; ms += 20) {
      const poses = [0, 1, 2].map(c => cupPose(deal, c, ms, MS))
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const close = Math.abs(poses[i].slot - poses[j].slot) < 0.2
        if (close) expect(Math.abs(poses[i].depth - poses[j].depth)).toBeGreaterThan(0.2)
      }
    }
  })

  it('ends each cup where cupSlotsAfter says for a real deal', () => {
    const d = dealCups(6, mulberry32(11))
    const ms = swapMsForLevel(6)
    const end = cupSlotsAfter(d, d.swaps.length)
    for (let cup = 0; cup < d.cups; cup++) expect(cupPose(d, cup, d.swaps.length * ms, ms).slot).toBe(end[cup])
  })
})
