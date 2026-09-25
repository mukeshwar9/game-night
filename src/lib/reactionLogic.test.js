import { describe, it, expect } from 'vitest'
import {
  normalizeReactionTimes,
  avgReactionTime,
  fastestReactionTime,
  getReactionWinner,
  formatMs,
} from './reactionLogic'
import {
  ROUNDS, MIN_DELAY_MS, MAX_DELAY_MS,
  seededDelayMs, reactionTimesOf, isReactionDone, reactionRaceEntry, reactionLiveKey, reactionRow,
} from './reactionLogic'

describe('normalizeReactionTimes', () => {
  it('returns [] for absent/null data', () => {
    expect(normalizeReactionTimes(null)).toEqual([])
    expect(normalizeReactionTimes(undefined)).toEqual([])
  })

  it('passes through a real array', () => {
    expect(normalizeReactionTimes([300, 250, 400])).toEqual([300, 250, 400])
  })

  it('normalizes a sparse Firebase object by value, coercing to numbers', () => {
    expect(normalizeReactionTimes({ 0: 300, 1: '250' })).toEqual([300, 250])
  })
})

describe('avgReactionTime', () => {
  it('returns null for an empty array (never NaN)', () => {
    expect(avgReactionTime([])).toBeNull()
    expect(avgReactionTime(null)).toBeNull()
  })

  it('rounds the average', () => {
    expect(avgReactionTime([300, 301])).toBe(301) // 300.5 -> 301
    expect(avgReactionTime([200, 300, 400])).toBe(300)
  })
})

describe('fastestReactionTime', () => {
  it('returns null for an empty array (never Infinity)', () => {
    expect(fastestReactionTime([])).toBeNull()
    expect(fastestReactionTime(null)).toBeNull()
  })

  it('returns the minimum', () => {
    expect(fastestReactionTime([400, 200, 300])).toBe(200)
  })
})

describe('getReactionWinner', () => {
  it('returns null when either side has no times yet', () => {
    expect(getReactionWinner([], [300])).toBeNull()
    expect(getReactionWinner([300], [])).toBeNull()
    expect(getReactionWinner([], [])).toBeNull()
  })

  it('picks the lower average as winner', () => {
    expect(getReactionWinner([200, 200], [300, 300])).toBe('X')
    expect(getReactionWinner([300, 300], [200, 200])).toBe('O')
  })

  it('returns draw on equal averages', () => {
    expect(getReactionWinner([200, 300], [250, 250])).toBe('draw')
  })
})

describe('formatMs', () => {
  it('renders an em-dash for null/undefined', () => {
    expect(formatMs(null)).toBe('—')
    expect(formatMs(undefined)).toBe('—')
  })

  it('renders the value with an ms suffix', () => {
    expect(formatMs(250)).toBe('250ms')
    expect(formatMs(0)).toBe('0ms')
  })
})

describe('normalizeReactionTimes (by key)', () => {
  it('keeps key order even when the object is out of order', () => {
    expect(normalizeReactionTimes({ 1: 250, 0: 300 })).toEqual([300, 250])
  })
})

describe('seededDelayMs', () => {
  it('is the same wait for every racer and within bounds', () => {
    for (let i = 0; i < 50; i++) {
      const d = seededDelayMs(777, i)
      expect(d).toBe(seededDelayMs(777, i))
      expect(d).toBeGreaterThanOrEqual(MIN_DELAY_MS)
      expect(d).toBeLessThanOrEqual(MAX_DELAY_MS)
    }
  })

  it('a false-start retry gets a different wait', () => {
    const waits = new Set([0, 1, 2, 3].map(a => seededDelayMs(777, 0, a)))
    expect(waits.size).toBeGreaterThan(1)
  })
})

describe('reaction race hooks', () => {
  const done = { times: [300, 200, 250, 250] }

  it('done after every round; capped at ROUNDS', () => {
    expect(isReactionDone(done)).toBe(true)
    expect(isReactionDone({ times: [1, 2] })).toBe(false)
    expect(reactionTimesOf({ times: [1, 2, 3, 4, 5] })).toHaveLength(ROUNDS)
  })

  it('ranks by lowest average; unfinished DNF', () => {
    expect(reactionRaceEntry(done)).toEqual({ sortKey: [250], score: 250 })
    expect(reactionRaceEntry({ times: [100] })).toEqual({ sortKey: null, score: null })
    expect(reactionRaceEntry(null).sortKey).toBeNull()
  })

  it('live key: finishers first, then by rounds done', () => {
    expect(reactionLiveKey(done)).toEqual([0, 250])
    expect(reactionLiveKey({ times: [100, 100] })).toEqual([1, -2])
    expect(reactionLiveKey(null)).toBeNull()
  })

  it('row shows average, best and progress', () => {
    expect(reactionRow(done)).toMatchObject({ primary: '250ms', secondary: 'BEST 200ms', progress: 1, status: 'done' })
    expect(reactionRow(null)).toMatchObject({ primary: '—', progress: 0, status: 'idle' })
  })
})
