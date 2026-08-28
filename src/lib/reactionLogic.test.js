import { describe, it, expect } from 'vitest'
import {
  normalizeReactionTimes,
  avgReactionTime,
  fastestReactionTime,
  getReactionWinner,
  formatMs,
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
