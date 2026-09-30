import { describe, expect, it } from 'vitest'
import {
  bombCondHolds, describeBombCond, isLit, makeShell, serialLastDigit,
} from './shell'
import { makeRng } from './rng'

describe('bomb shell', () => {
  it('has a serial ending in a digit with a letter and no I or O, and two distinct indicators', () => {
    for (let s = 0; s < 100; s++) {
      const { serial, indicators, ruleset } = makeShell(makeRng(`shell-${s}`))
      expect(serial).toMatch(/^[A-Z0-9]{5}[0-9]$/)
      expect(serial).toMatch(/[A-Z]/)
      expect(serial).not.toMatch(/[IO]/)
      expect(indicators).toHaveLength(2)
      expect(indicators[0].label).not.toBe(indicators[1].label)
      expect(ruleset).toMatch(/^[A-Z]-[1-9]$/)
    }
  })

  it('evaluates and words bomb conditions', () => {
    const bomb = { serial: 'AB12C3', indicators: [{ label: 'SIG', lit: true }, { label: 'NAV', lit: false }] }
    expect(serialLastDigit(bomb.serial)).toBe(3)
    expect(isLit(bomb, 'SIG')).toBe(true)
    expect(isLit(bomb, 'NAV')).toBe(false)
    expect(bombCondHolds({ kind: 'serialOdd' }, bomb)).toBe(true)
    expect(bombCondHolds({ kind: 'serialEven' }, bomb)).toBe(false)
    expect(bombCondHolds({ kind: 'lit', label: 'NAV' }, bomb)).toBe(false)
    expect(describeBombCond({ kind: 'lit', label: 'SIG' })).toBe('an indicator marked SIG is lit')
  })
})
