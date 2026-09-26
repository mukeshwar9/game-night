import { describe, it, expect } from 'vitest'
import { normalizeTimerScale, timersOff, scaledMs, TIMER_SCALE_DEFAULT } from './timerScale'

describe('normalizeTimerScale', () => {
  it('defaults to 1 when absent or invalid', () => {
    for (const raw of [undefined, null, '', 'abc', -1, NaN, Infinity, true, false, {}]) {
      expect(normalizeTimerScale(raw)).toBe(TIMER_SCALE_DEFAULT)
    }
  })

  it('keeps 0, 1 and 2 (and numeric strings)', () => {
    expect(normalizeTimerScale(0)).toBe(0)
    expect(normalizeTimerScale(1)).toBe(1)
    expect(normalizeTimerScale(2)).toBe(2)
    expect(normalizeTimerScale('2')).toBe(2)
  })
})

describe('timersOff', () => {
  it('is true only for an explicit 0', () => {
    expect(timersOff(0)).toBe(true)
    expect(timersOff(undefined)).toBe(false)
    expect(timersOff(2)).toBe(false)
  })
})

describe('scaledMs', () => {
  it('leaves the base duration unchanged by default', () => {
    expect(scaledMs(90000, undefined)).toBe(90000)
    expect(scaledMs(90000, 1)).toBe(90000)
  })

  it('doubles for relaxed', () => {
    expect(scaledMs(60000, 2)).toBe(120000)
  })

  it('returns null when timers are off', () => {
    expect(scaledMs(60000, 0)).toBeNull()
  })
})
