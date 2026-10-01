import { describe, expect, it } from 'vitest'
import { monetizationActive } from './monetization'
import { bypassActive } from './premium'

describe('monetizationActive', () => {
  it('is off by default and on only for an explicit flag', () => {
    expect(monetizationActive({})).toBe(false)
    expect(monetizationActive({ flag: false })).toBe(false)
    expect(monetizationActive({ flag: true })).toBe(true)
  })

  it('lets a dev server or the emulators flip it with the stored override', () => {
    expect(monetizationActive({ flag: false, devLike: true, override: 'on' })).toBe(true)
    expect(monetizationActive({ flag: true, devLike: true, override: 'off' })).toBe(false)
    expect(monetizationActive({ flag: true, devLike: true, override: 'junk' })).toBe(true)
  })

  it('ignores the override in a production build', () => {
    expect(monetizationActive({ flag: false, devLike: false, override: 'on' })).toBe(false)
    expect(monetizationActive({ flag: true, devLike: false, override: 'off' })).toBe(true)
  })
})

describe('bypass with the switch off', () => {
  it('unlocks everything for everyone, production included', () => {
    expect(bypassActive({ monetization: false })).toBe(true)
    expect(bypassActive({ monetization: false, override: 'off' })).toBe(true)
  })

  it('with the switch on, only dev and emulators bypass', () => {
    expect(bypassActive({ monetization: true })).toBe(false)
    expect(bypassActive({ monetization: true, dev: true })).toBe(true)
    expect(bypassActive({ monetization: true, dev: true, override: 'off' })).toBe(false)
  })

  it('is always off inside the native shell', () => {
    expect(monetizationActive({ flag: true, native: true })).toBe(false)
    expect(monetizationActive({ flag: true, devLike: true, override: 'on', native: true })).toBe(false)
  })
})
