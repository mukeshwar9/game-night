import { describe, it, expect } from 'vitest'
import { addDaysToKey, getCurrentStreak, getBestStreak, getLast7Days } from './dailyStreakLogic'

describe('addDaysToKey', () => {
  it('adds days within a month', () => {
    expect(addDaysToKey('2026-06-20', 1)).toBe('2026-06-21')
    expect(addDaysToKey('2026-06-20', -1)).toBe('2026-06-19')
  })

  it('crosses a month boundary', () => {
    expect(addDaysToKey('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDaysToKey('2026-07-01', -1)).toBe('2026-06-30')
  })

  it('crosses a year boundary', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToKey('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('handles a leap-day February', () => {
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysToKey('2028-02-29', 1)).toBe('2028-03-01')
  })
})

describe('getCurrentStreak', () => {
  it('is 0 for empty history', () => {
    expect(getCurrentStreak({}, '2026-06-20')).toBe(0)
    expect(getCurrentStreak(null, '2026-06-20')).toBe(0)
  })

  it('counts a single day played today', () => {
    expect(getCurrentStreak({ '2026-06-20': 5 }, '2026-06-20')).toBe(1)
  })

  it('stays alive if the last play was yesterday (not yet played today)', () => {
    expect(getCurrentStreak({ '2026-06-19': 5 }, '2026-06-20')).toBe(1)
  })

  it('counts a consecutive run ending today', () => {
    const history = { '2026-06-18': 1, '2026-06-19': 2, '2026-06-20': 3 }
    expect(getCurrentStreak(history, '2026-06-20')).toBe(3)
  })

  it('breaks on a gap day', () => {
    const history = { '2026-06-17': 1, '2026-06-19': 2, '2026-06-20': 3 }
    expect(getCurrentStreak(history, '2026-06-20')).toBe(2)
  })

  it('is 0 once more than a day has been missed', () => {
    expect(getCurrentStreak({ '2026-06-18': 5 }, '2026-06-20')).toBe(0)
  })

  it('treats a score of 0 as a played day', () => {
    expect(getCurrentStreak({ '2026-06-20': 0 }, '2026-06-20')).toBe(1)
  })

  it('is timezone-safe across a month boundary', () => {
    const history = { '2026-06-30': 1, '2026-07-01': 2 }
    expect(getCurrentStreak(history, '2026-07-01')).toBe(2)
  })
})

describe('getBestStreak', () => {
  it('is 0 for empty history', () => {
    expect(getBestStreak({})).toBe(0)
    expect(getBestStreak(null)).toBe(0)
  })

  it('is 1 for a single played day', () => {
    expect(getBestStreak({ '2026-06-20': 5 })).toBe(1)
  })

  it('finds the longest run, not just the most recent', () => {
    const history = {
      '2026-06-01': 1, '2026-06-02': 1, '2026-06-03': 1, '2026-06-04': 1, // run of 4
      '2026-06-10': 1, '2026-06-11': 1, // run of 2
    }
    expect(getBestStreak(history)).toBe(4)
  })

  it('ignores gaps between runs', () => {
    const history = { '2026-06-01': 1, '2026-06-05': 1, '2026-06-06': 1 }
    expect(getBestStreak(history)).toBe(2)
  })

  it('is unaffected by object key insertion order', () => {
    const history = { '2026-06-03': 1, '2026-06-01': 1, '2026-06-02': 1 }
    expect(getBestStreak(history)).toBe(3)
  })
})

describe('getLast7Days', () => {
  it('returns 7 days oldest-to-newest ending today', () => {
    const days = getLast7Days({}, '2026-06-20')
    expect(days).toHaveLength(7)
    expect(days[6].date).toBe('2026-06-20')
    expect(days[0].date).toBe('2026-06-14')
  })

  it('marks unplayed days with played:false and score:null', () => {
    const days = getLast7Days({}, '2026-06-20')
    expect(days.every(d => d.played === false && d.score === null)).toBe(true)
  })

  it('marks played days with their score, including a score of 0', () => {
    const history = { '2026-06-20': 0, '2026-06-19': 7 }
    const days = getLast7Days(history, '2026-06-20')
    expect(days.find(d => d.date === '2026-06-20')).toEqual({ date: '2026-06-20', played: true, score: 0 })
    expect(days.find(d => d.date === '2026-06-19')).toEqual({ date: '2026-06-19', played: true, score: 7 })
  })

  it('handles a history with no data gracefully', () => {
    expect(() => getLast7Days(null, '2026-06-20')).not.toThrow()
  })
})
