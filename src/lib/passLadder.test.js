import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LADDER_STEP,
  PASS_LADDER,
  formatRupees,
  ladderEnabled,
  ladderStep,
  perMonthNote,
  priceLine,
} from './passLadder'

describe('pass ladder', () => {
  it('has a monthly, a yearly and a forever step, in rising price order', () => {
    expect(PASS_LADDER.map((s) => s.id)).toEqual(['monthly', 'yearly', 'forever'])
    const prices = PASS_LADDER.map((s) => s.rupees)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
  })

  it('marks exactly one step best value, and it starts selected', () => {
    const best = PASS_LADDER.filter((s) => s.bestValue)
    expect(best).toHaveLength(1)
    expect(best[0].id).toBe(DEFAULT_LADDER_STEP)
  })

  it('makes the yearly step cheaper per month than the monthly one', () => {
    const monthly = ladderStep('monthly').rupees
    const yearly = ladderStep('yearly').rupees
    expect(yearly / 12).toBeLessThan(monthly)
  })

  it('formats rupees with Indian grouping', () => {
    expect(formatRupees(99)).toBe('₹99')
    expect(formatRupees(123456)).toBe('₹1,23,456')
  })

  it('writes the price in plain words', () => {
    expect(priceLine(ladderStep('monthly'))).toBe('₹99 a month')
    expect(priceLine(ladderStep('yearly'))).toBe('₹299 a year')
    expect(priceLine(ladderStep('forever'))).toBe('₹499 once')
  })

  it('gives only the yearly step a per-month note', () => {
    expect(perMonthNote(ladderStep('yearly'))).toBe('about ₹25 a month')
    expect(perMonthNote(ladderStep('monthly'))).toBeNull()
    expect(perMonthNote(ladderStep('forever'))).toBeNull()
  })

  it('falls back to the best-value step for an unknown id', () => {
    expect(ladderStep('nope').id).toBe('yearly')
  })

  it('previews only in a dev build with ?ladder=1', () => {
    expect(ladderEnabled('?ladder=1', true)).toBe(true)
    expect(ladderEnabled('', true)).toBe(false)
    expect(ladderEnabled('?ladder=0', true)).toBe(false)
    expect(ladderEnabled('?ladder=1', false)).toBe(false)
  })
})
