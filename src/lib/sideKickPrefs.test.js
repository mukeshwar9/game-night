import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS, PREFS_KEY, getPrefs, normalizePrefs, readPrefs, resetPrefsCache, setPrefs, subscribePrefs, writePrefs } from './sideKickPrefs'

const memory = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, removeItem: (k) => { m.delete(k) } }
}

describe('SIDE KICK prefs', () => {
  it('defaults to the chase camera, tilt steering and one self-aiming KICK button', () => {
    expect(DEFAULT_PREFS).toEqual({ cam: 'chase', steer: 'tilt', kick: 'auto' })
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(normalizePrefs('x')).toEqual(DEFAULT_PREFS)
  })
  it('keeps what is valid and drops what is not', () => {
    expect(normalizePrefs({ cam: 'first', steer: 'touch', kick: 'two' })).toEqual({ cam: 'first', steer: 'touch', kick: 'two' })
    expect(normalizePrefs({ cam: 'drone', steer: 5, kick: 'three' })).toEqual(DEFAULT_PREFS)
    expect(normalizePrefs({ cam: 'first' })).toEqual({ cam: 'first', steer: 'tilt', kick: 'auto' })
  })
  it('reads a choice saved before the kick setting existed, keeping it and defaulting the kick', () => {
    const s = memory()
    s.setItem(PREFS_KEY, JSON.stringify({ cam: 'first', steer: 'touch' }))
    expect(readPrefs(s)).toEqual({ cam: 'first', steer: 'touch', kick: 'auto' })
  })
  it('round-trips through storage and survives garbage or a missing store', () => {
    const s = memory()
    writePrefs({ cam: 'first', steer: 'touch', kick: 'two' }, s)
    expect(readPrefs(s)).toEqual({ cam: 'first', steer: 'touch', kick: 'two' })
    s.setItem(PREFS_KEY, '{nope')
    expect(readPrefs(s)).toEqual(DEFAULT_PREFS)
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS)
    expect(() => writePrefs({ cam: 'first' }, { setItem() { throw new Error('full') } })).not.toThrow()
  })
  describe('the shared store', () => {
    beforeEach(() => {
      resetPrefsCache()
      vi.stubGlobal('localStorage', memory())
    })
    it('remembers a choice, tells listeners once, and ignores a no-op', () => {
      const seen = vi.fn()
      const off = subscribePrefs(seen)
      expect(getPrefs().cam).toBe('chase')
      setPrefs({ cam: 'first' })
      setPrefs({ cam: 'first' })
      expect(seen).toHaveBeenCalledTimes(1)
      expect(getPrefs().cam).toBe('first')
      expect(JSON.parse(localStorage.getItem(PREFS_KEY))).toEqual({ cam: 'first', steer: 'tilt', kick: 'auto' })
      off()
      setPrefs({ steer: 'touch' })
      expect(seen).toHaveBeenCalledTimes(1)
      resetPrefsCache()
      expect(getPrefs()).toEqual({ cam: 'first', steer: 'touch', kick: 'auto' })
    })
    it('tells listeners when only the kick mode changes', () => {
      const seen = vi.fn()
      subscribePrefs(seen)
      setPrefs({ kick: 'two' })
      setPrefs({ kick: 'two' })
      expect(seen).toHaveBeenCalledTimes(1)
      expect(getPrefs().kick).toBe('two')
    })
  })
})
