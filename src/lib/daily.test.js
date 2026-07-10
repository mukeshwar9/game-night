import { describe, it, expect, beforeEach } from 'vitest'
import { dateKeyFor, getDailyNumber, getStreak, bumpStreak } from './daily'

// daily.js touches localStorage directly (no DOM needed) — stub a minimal
// in-memory implementation per test, mirroring the gameSearch.test.js pattern.
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
})

describe('dateKeyFor', () => {
  it('formats as local yyyy-mm-dd', () => {
    expect(dateKeyFor(new Date(2026, 5, 20))).toBe('2026-06-20')
  })

  it('pads single-digit months and days', () => {
    expect(dateKeyFor(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('getDailyNumber', () => {
  it('is 1 on the epoch date', () => {
    expect(getDailyNumber('2026-06-20')).toBe(1)
  })

  it('increments by one per day', () => {
    expect(getDailyNumber('2026-06-21')).toBe(2)
    expect(getDailyNumber('2026-06-22')).toBe(3)
  })

  it('handles a month boundary', () => {
    expect(getDailyNumber('2026-07-01')).toBe(12)
  })
})

describe('getStreak', () => {
  it('is zero with nothing stored', () => {
    expect(getStreak(new Date(2026, 5, 20))).toEqual({ count: 0, lastDate: null })
  })

  it('reports the stored count when last played today', () => {
    bumpStreak(new Date(2026, 5, 20))
    expect(getStreak(new Date(2026, 5, 20))).toEqual({ count: 1, lastDate: '2026-06-20' })
  })

  it('reports the stored count when last played yesterday (streak still alive)', () => {
    bumpStreak(new Date(2026, 5, 20))
    expect(getStreak(new Date(2026, 5, 21))).toEqual({ count: 1, lastDate: '2026-06-20' })
  })

  it('reports zero once more than a day has passed (streak lapsed)', () => {
    bumpStreak(new Date(2026, 5, 20))
    expect(getStreak(new Date(2026, 5, 22))).toEqual({ count: 0, lastDate: '2026-06-20' })
  })
})

describe('bumpStreak', () => {
  it('starts a fresh streak at 1', () => {
    expect(bumpStreak(new Date(2026, 5, 20))).toEqual({ count: 1, lastDate: '2026-06-20' })
  })

  it('is idempotent for repeat completions the same day', () => {
    bumpStreak(new Date(2026, 5, 20))
    const second = bumpStreak(new Date(2026, 5, 20, 23, 59))
    expect(second).toEqual({ count: 1, lastDate: '2026-06-20' })
  })

  it('increments on consecutive days', () => {
    bumpStreak(new Date(2026, 5, 20))
    bumpStreak(new Date(2026, 5, 21))
    const third = bumpStreak(new Date(2026, 5, 22))
    expect(third).toEqual({ count: 3, lastDate: '2026-06-22' })
  })

  it('resets to 1 after a gap day', () => {
    bumpStreak(new Date(2026, 5, 20))
    bumpStreak(new Date(2026, 5, 21))
    const afterGap = bumpStreak(new Date(2026, 5, 23))
    expect(afterGap).toEqual({ count: 1, lastDate: '2026-06-23' })
  })

  it('crosses a month/year boundary (Jan 1 after Dec 31)', () => {
    bumpStreak(new Date(2026, 11, 31))
    const newYear = bumpStreak(new Date(2027, 0, 1))
    expect(newYear).toEqual({ count: 2, lastDate: '2027-01-01' })
  })
})
