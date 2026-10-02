import { describe, it, expect } from 'vitest'
import { dailyMemoryGame, dailyMemoryRand, mergeBests, rankDailyEntries, DAILY_MEMORY_GAMES } from './memoryDailyLogic'
import { generateVmPattern } from './visualMemoryLogic'

describe('daily memory', () => {
  it('rotates through the four memory runs, one per day', () => {
    const week = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map(dailyMemoryGame)
    expect(new Set(week)).toEqual(new Set(DAILY_MEMORY_GAMES))
    expect(dailyMemoryGame('2026-10-05')).toBe(dailyMemoryGame('2026-10-01'))
  })
  it('deals the same patterns to everyone on the same day, and different ones the next day', () => {
    const a = dailyMemoryRand('2026-10-02', 'visualmemory')
    const b = dailyMemoryRand('2026-10-02', 'visualmemory')
    const c = dailyMemoryRand('2026-10-03', 'visualmemory')
    const deal = r => [3, 4, 5].map(l => generateVmPattern(l, 16, r).join(','))
    expect(deal(a)).toEqual(deal(b))
    expect(deal(c)).not.toEqual(deal(dailyMemoryRand('2026-10-02', 'visualmemory')))
  })
  it('merges bests upward and drops junk', () => {
    expect(mergeBests({ simon: 5, chimp: 9 }, { simon: 7, numbermemory: 'x', visualmemory: -1 })).toEqual({ simon: 7, chimp: 9 })
    expect(mergeBests(null, undefined)).toEqual({})
  })
  it('ranks by score, then by who finished first', () => {
    const ranked = rankDailyEntries([
      { uid: 'a', score: 5, at: 3 }, { uid: 'b', score: 8, at: 9 }, { uid: 'c', score: 5, at: 1 },
    ], 'a')
    expect(ranked.map(e => e.uid)).toEqual(['b', 'c', 'a'])
    expect(ranked.find(e => e.uid === 'a')).toMatchObject({ rank: 3, me: true })
  })
})
