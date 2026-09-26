import { describe, it, expect } from 'vitest'
import {
  MIN_ELAPSED_MS,
  countCorrectChars,
  computeWpm,
  computeAccuracy,
  computeEffWpm,
} from './typingLogic'
import {
  PASSAGES, pickPassageIndex, isTypingDone, typingRaceEntry, typingLiveKey, typingRow,
} from './typingLogic'

describe('countCorrectChars', () => {
  it('counts position-by-position matches', () => {
    expect(countCorrectChars('the cat', 'the cat')).toBe(7)
    expect(countCorrectChars('the bat', 'the cat')).toBe(6)
  })

  it('ignores extra typed length beyond the passage', () => {
    expect(countCorrectChars('the cat!!!', 'the cat')).toBe(7)
  })

  it('returns 0 for an empty typed string', () => {
    expect(countCorrectChars('', 'the cat')).toBe(0)
  })
})

describe('computeWpm', () => {
  it('computes standard WPM from correct chars and elapsed time', () => {
    // 25 chars = 5 words, in 60s = 1 minute -> 5 WPM
    expect(computeWpm(25, 60_000)).toBe(5)
  })

  it('clamps elapsed time to a 1s floor so a same-millisecond finish never divides by ~0', () => {
    const fast = computeWpm(25, 0)
    expect(Number.isFinite(fast)).toBe(true)
    expect(fast).toBe(computeWpm(25, MIN_ELAPSED_MS))
  })

  it('never returns less than 1 WPM', () => {
    expect(computeWpm(0, 60_000)).toBe(1)
    expect(computeWpm(1, 600_000)).toBe(1)
  })

  it('is never negative or Infinity even with a clock-skew-negative elapsed value', () => {
    const wpm = computeWpm(25, -5000)
    expect(Number.isFinite(wpm)).toBe(true)
    expect(wpm).toBeGreaterThanOrEqual(1)
  })
})

describe('computeAccuracy', () => {
  it('computes a percentage', () => {
    expect(computeAccuracy(8, 10)).toBe(80)
    expect(computeAccuracy(10, 10)).toBe(100)
  })

  it('returns 100 for a zero-length passage instead of dividing by zero', () => {
    expect(computeAccuracy(0, 0)).toBe(100)
  })
})

describe('computeEffWpm', () => {
  it('returns null when either input is missing', () => {
    expect(computeEffWpm(null, 100)).toBeNull()
    expect(computeEffWpm(50, null)).toBeNull()
    expect(computeEffWpm(undefined, undefined)).toBeNull()
  })

  it('weights WPM by accuracy', () => {
    expect(computeEffWpm(50, 100)).toBe(50)
    expect(computeEffWpm(50, 80)).toBe(40)
  })
})

describe('passages', () => {
  it('has passages long enough to race', () => {
    expect(PASSAGES.length).toBeGreaterThanOrEqual(12)
    for (const p of PASSAGES) expect(p.length).toBeGreaterThan(100)
  })

  it('picks a passage the room has not seen yet', () => {
    const seen = {}
    for (let i = 0; i < PASSAGES.length - 1; i++) seen[i] = i + 1
    expect(pickPassageIndex(seen, () => 0)).toBe(PASSAGES.length - 1)
    expect(pickPassageIndex({}, () => 0.999)).toBe(PASSAGES.length - 1)
  })
})

describe('typing race hooks', () => {
  it('ranks finishers by eff-WPM; unfinished DNF', () => {
    expect(typingRaceEntry({ done: true, wpm: 80, acc: 90 })).toEqual({ sortKey: [-72], score: 72 })
    expect(typingRaceEntry({ progress: 50 })).toEqual({ sortKey: null, score: null })
    expect(isTypingDone({ done: true })).toBe(false) // done without a wpm is not a result
  })

  it('live key: finishers first, then by progress', () => {
    expect(typingLiveKey({ done: true, wpm: 50, acc: 100 })).toEqual([0, -50])
    expect(typingLiveKey({ progress: 30 })).toEqual([1, -30])
    expect(typingLiveKey(null)).toBeNull()
  })

  it('row shows progress, then result', () => {
    expect(typingRow({ progress: 50 }, 100)).toMatchObject({ primary: '50%', progress: 0.5, status: 'racing' })
    expect(typingRow({ done: true, wpm: 60, acc: 95 }, 100)).toMatchObject({ primary: '57 EFF', progress: 1, status: 'done' })
    expect(typingRow(null, 0)).toMatchObject({ progress: 0, status: 'idle' })
  })
})
