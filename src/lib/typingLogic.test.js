import { describe, it, expect } from 'vitest'
import {
  MIN_ELAPSED_MS,
  countCorrectChars,
  computeWpm,
  computeAccuracy,
  computeEffWpm,
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
