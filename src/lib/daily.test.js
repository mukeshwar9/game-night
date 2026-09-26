import { describe, it, expect, beforeEach } from 'vitest'
import {
  dateKeyFor, getDailyNumber, getStreak, bumpStreak, writeBest, readHistory,
  msUntilNextDaily, formatCountdown, localDateLabel, weekdayInitial,
} from './daily'

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

// Date keys are UTC-derived, so test inputs must be built from UTC instants —
// a local-midnight constructor would land on a different UTC date in any
// timezone ahead of UTC.
const utcDate = (key) => new Date(`${key}T00:00:00Z`)

describe('dateKeyFor', () => {
  it('formats as UTC yyyy-mm-dd', () => {
    expect(dateKeyFor(utcDate('2026-06-20'))).toBe('2026-06-20')
  })

  it('pads single-digit months and days', () => {
    expect(dateKeyFor(utcDate('2026-01-05'))).toBe('2026-01-05')
  })

  it('derives the key from UTC, not the local calendar', () => {
    // 23:30Z is already "tomorrow" for anyone east of UTC — must still key as
    // June 20 so every client gets the same puzzle for the same UTC day.
    expect(dateKeyFor(new Date('2026-06-20T23:30:00Z'))).toBe('2026-06-20')
  })

  it('gives one key per instant regardless of how the offset is written', () => {
    // Same instant expressed at +05:30 vs Z — both parse to identical ms.
    expect(dateKeyFor(new Date('2026-06-21T00:00:00+05:30')))
      .toBe(dateKeyFor(new Date('2026-06-20T18:30:00Z')))
    expect(dateKeyFor(new Date('2026-06-21T00:00:00+05:30'))).toBe('2026-06-20')
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
    expect(getStreak(utcDate('2026-06-20'))).toEqual({ count: 0, lastDate: null })
  })

  it('reports the stored count when last played today', () => {
    bumpStreak(utcDate('2026-06-20'))
    expect(getStreak(utcDate('2026-06-20'))).toEqual({ count: 1, lastDate: '2026-06-20' })
  })

  it('reports the stored count when last played yesterday (streak still alive)', () => {
    bumpStreak(utcDate('2026-06-20'))
    expect(getStreak(utcDate('2026-06-21'))).toEqual({ count: 1, lastDate: '2026-06-20' })
  })

  it('reports zero once more than a day has passed (streak lapsed)', () => {
    bumpStreak(utcDate('2026-06-20'))
    expect(getStreak(utcDate('2026-06-22'))).toEqual({ count: 0, lastDate: '2026-06-20' })
  })
})

describe('bumpStreak', () => {
  it('starts a fresh streak at 1', () => {
    expect(bumpStreak(utcDate('2026-06-20'))).toEqual({ count: 1, lastDate: '2026-06-20' })
  })

  it('is idempotent for repeat completions the same day', () => {
    bumpStreak(utcDate('2026-06-20'))
    const second = bumpStreak(new Date('2026-06-20T23:59:00Z'))
    expect(second).toEqual({ count: 1, lastDate: '2026-06-20' })
  })

  it('increments on consecutive days', () => {
    bumpStreak(utcDate('2026-06-20'))
    bumpStreak(utcDate('2026-06-21'))
    const third = bumpStreak(utcDate('2026-06-22'))
    expect(third).toEqual({ count: 3, lastDate: '2026-06-22' })
  })

  it('resets to 1 after a gap day', () => {
    bumpStreak(utcDate('2026-06-20'))
    bumpStreak(utcDate('2026-06-21'))
    const afterGap = bumpStreak(utcDate('2026-06-23'))
    expect(afterGap).toEqual({ count: 1, lastDate: '2026-06-23' })
  })

  it('crosses a month/year boundary (Jan 1 after Dec 31)', () => {
    bumpStreak(utcDate('2026-12-31'))
    const newYear = bumpStreak(utcDate('2027-01-01'))
    expect(newYear).toEqual({ count: 2, lastDate: '2027-01-01' })
  })
})

describe('readHistory', () => {
  it('is empty with nothing stored', () => {
    expect(readHistory(utcDate('2026-06-20'))).toEqual({})
  })

  it('collects per-day best scores written by writeBest', () => {
    writeBest('2026-06-21', 4)
    writeBest('2026-06-22', 7)
    expect(readHistory(utcDate('2026-06-22'))).toEqual({
      '2026-06-21': 4,
      '2026-06-22': 7,
    })
  })

  it('never scans before the epoch date', () => {
    // getDailyNumber(EPOCH_KEY) === 1, so only "today" itself is scanned.
    writeBest('2026-06-20', 9)
    expect(readHistory(utcDate('2026-06-20'))).toEqual({ '2026-06-20': 9 })
  })
})

describe('msUntilNextDaily', () => {
  it('counts down to the next UTC midnight', () => {
    expect(msUntilNextDaily(new Date('2026-09-25T18:48:00Z'))).toBe((5 * 60 + 12) * 60_000)
  })

  it('is a full day exactly at the rollover', () => {
    expect(msUntilNextDaily(utcDate('2026-09-26'))).toBe(86_400_000)
  })

  it('crosses month and year ends', () => {
    expect(msUntilNextDaily(new Date('2026-12-31T23:59:00Z'))).toBe(60_000)
  })
})

describe('formatCountdown', () => {
  it('shows hours and minutes', () => {
    expect(formatCountdown((5 * 60 + 12) * 60_000 + 30_000)).toBe('5h 12m')
  })

  it('drops hours under an hour', () => {
    expect(formatCountdown(12 * 60_000)).toBe('12m')
  })

  it('floors to <1m under a minute and for negatives', () => {
    expect(formatCountdown(59_000)).toBe('<1m')
    expect(formatCountdown(-5)).toBe('<1m')
  })
})

describe('localDateLabel', () => {
  it('formats weekday, day and month in caps', () => {
    // Midday UTC is the same calendar day in every timezone within ±11h.
    expect(localDateLabel(new Date('2026-09-26T12:00:00Z'), 'en-US')).toBe('SAT 26 SEP')
  })
})

describe('weekdayInitial', () => {
  it('uses the key\'s own day, independent of local timezone', () => {
    expect(weekdayInitial('2026-09-26')).toBe('S')
    expect(weekdayInitial('2026-09-28')).toBe('M')
    expect(weekdayInitial('2026-09-30')).toBe('W')
  })
})
