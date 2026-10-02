import { describe, it, expect } from 'vitest'
import { dealCups, ballSlotAfter, cupSlotsAfter, cupsForLevel, swapsForLevel, swapMsForLevel } from './cupShuffleLogic'
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
