import { describe, it, expect } from 'vitest'
import { pad2, formatClock, formatClockSecs, secondsLeft } from './format'

describe('pad2', () => {
  it('pads single digits only', () => {
    expect(pad2(0)).toBe('00')
    expect(pad2(7)).toBe('07')
    expect(pad2(42)).toBe('42')
    expect(pad2(123)).toBe('123')
  })
})

describe('formatClockSecs', () => {
  it('formats m:ss', () => {
    expect(formatClockSecs(0)).toBe('0:00')
    expect(formatClockSecs(5)).toBe('0:05')
    expect(formatClockSecs(65)).toBe('1:05')
    expect(formatClockSecs(600)).toBe('10:00')
  })
  it('floors fractions and clamps negatives', () => {
    expect(formatClockSecs(59.9)).toBe('0:59')
    expect(formatClockSecs(-3)).toBe('0:00')
  })
  it('pads minutes on request', () => {
    expect(formatClockSecs(65, { padMinutes: true })).toBe('01:05')
  })
  it('treats non-numbers as zero', () => {
    expect(formatClockSecs(NaN)).toBe('0:00')
    expect(formatClockSecs(undefined)).toBe('0:00')
  })
})

describe('formatClock', () => {
  it('rounds up by default so a countdown never shows 0:00 early', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(999)).toBe('0:01')
    expect(formatClock(1000)).toBe('0:01')
    expect(formatClock(1001)).toBe('0:02')
    expect(formatClock(90_000)).toBe('1:30')
  })
  it('floors for elapsed-time displays', () => {
    expect(formatClock(1999, { round: 'floor' })).toBe('0:01')
    expect(formatClock(61_500, { round: 'floor', padMinutes: true })).toBe('01:01')
  })
  it('clamps negatives and non-numbers to 0:00', () => {
    expect(formatClock(-500)).toBe('0:00')
    expect(formatClock(null)).toBe('0:00')
  })
})

describe('secondsLeft', () => {
  it('rounds up and never goes negative', () => {
    expect(secondsLeft(0)).toBe(0)
    expect(secondsLeft(1)).toBe(1)
    expect(secondsLeft(14_001)).toBe(15)
    expect(secondsLeft(-10)).toBe(0)
    expect(secondsLeft(NaN)).toBe(0)
  })
})
