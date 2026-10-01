import { describe, it, expect, vi, afterEach } from 'vitest'
import { impactStyle, haptic } from './haptics'

afterEach(() => { delete globalThis.Capacitor })

describe('impactStyle', () => {
  it('maps durations to impact weights', () => {
    expect(impactStyle(6)).toBe('LIGHT')
    expect(impactStyle(35)).toBe('MEDIUM')
    expect(impactStyle(160)).toBe('HEAVY')
    expect(impactStyle([0, 40, 30, 70])).toBe('HEAVY')
  })
  it('ignores zero and missing patterns', () => {
    expect(impactStyle(0)).toBeNull()
    expect(impactStyle(undefined)).toBeNull()
  })
})

describe('haptic', () => {
  it('is silent in a plain browser', () => {
    expect(() => haptic(20)).not.toThrow()
  })
  it('drives the native plugin when present', () => {
    const impact = vi.fn(() => Promise.resolve())
    globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Haptics: { impact } } }
    haptic(9)
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' })
  })
})
