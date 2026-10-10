import { describe, expect, it } from 'vitest'
import {
  STORE_URLS,
  compareVersions,
  isBelowMinimum,
  isUpdateRequired,
  minVersionFor,
  parseVersion,
  storeUrlFor,
} from './versionGateLogic'

describe('parseVersion', () => {
  it('reads dotted numbers', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('10.0')).toEqual([10, 0])
    expect(parseVersion('7')).toEqual([7])
    expect(parseVersion('1.2.3.4')).toEqual([1, 2, 3, 4])
  })

  it('ignores a v prefix, whitespace, pre-release and build suffixes', () => {
    expect(parseVersion(' v1.2.3 ')).toEqual([1, 2, 3])
    expect(parseVersion('1.2.0-beta.1')).toEqual([1, 2, 0])
    expect(parseVersion('1.2.0+45')).toEqual([1, 2, 0])
  })

  it('returns null for junk', () => {
    for (const v of [undefined, null, 12, {}, '', ' ', 'abc', '1.x', '1..2', '.1', '1.', '-1.2', '1.2.3.4.5', 'latest', '1,2,3', '99999999999.0']) {
      expect(parseVersion(v), String(v)).toBeNull()
    }
  })
})

describe('compareVersions', () => {
  it('orders numerically, not as strings', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1)
  })

  it('treats missing parts as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1', '1.0.0.0')).toBe(0)
    expect(compareVersions('1.2', '1.2.1')).toBe(-1)
    expect(compareVersions('1.2.1', '1.2')).toBe(1)
  })

  it('is equal for equal versions and ignores suffixes', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2.3-beta', '1.2.3')).toBe(0)
  })

  it('returns null when either side is junk', () => {
    expect(compareVersions('abc', '1.0.0')).toBeNull()
    expect(compareVersions('1.0.0', undefined)).toBeNull()
    expect(compareVersions('', '')).toBeNull()
  })
})

describe('isBelowMinimum', () => {
  it('is true only when strictly older', () => {
    expect(isBelowMinimum('1.1.9', '1.2.0')).toBe(true)
    expect(isBelowMinimum('1.2.0', '1.2.0')).toBe(false)
    expect(isBelowMinimum('1.2.1', '1.2.0')).toBe(false)
    expect(isBelowMinimum('0.9', '1')).toBe(true)
  })

  it('never gates on junk', () => {
    expect(isBelowMinimum('', '1.2.0')).toBe(false)
    expect(isBelowMinimum('1.0.0', 'soon')).toBe(false)
    expect(isBelowMinimum(undefined, undefined)).toBe(false)
    expect(isBelowMinimum('1.0.0', null)).toBe(false)
  })
})

describe('minVersionFor', () => {
  it('picks the platform entry', () => {
    const cfg = { ios: '1.2.0', android: '1.3.0' }
    expect(minVersionFor(cfg, 'ios')).toBe('1.2.0')
    expect(minVersionFor(cfg, 'android')).toBe('1.3.0')
  })

  it('treats a missing, malformed or non-string entry as no gate', () => {
    expect(minVersionFor({ ios: '1.2.0' }, 'android')).toBeNull()
    expect(minVersionFor({ ios: 'oops' }, 'ios')).toBeNull()
    expect(minVersionFor({ ios: 120 }, 'ios')).toBeNull()
    expect(minVersionFor({ ios: true }, 'ios')).toBeNull()
  })

  it('treats a bad node or platform as no gate', () => {
    for (const cfg of [null, undefined, 'x', 5]) expect(minVersionFor(cfg, 'ios')).toBeNull()
    expect(minVersionFor({ ios: '1.0.0' }, 'web')).toBeNull()
    expect(minVersionFor({ ios: '1.0.0' }, null)).toBeNull()
  })
})

describe('isUpdateRequired', () => {
  const config = { ios: '1.2.0', android: '1.4.0' }

  it('gates each platform against its own minimum', () => {
    expect(isUpdateRequired({ current: '1.1.0', config, platform: 'ios' })).toBe(true)
    expect(isUpdateRequired({ current: '1.3.0', config, platform: 'ios' })).toBe(false)
    expect(isUpdateRequired({ current: '1.3.0', config, platform: 'android' })).toBe(true)
  })

  it('does not gate without a config, a platform entry, or a readable version', () => {
    expect(isUpdateRequired({ current: '1.0.0', config: null, platform: 'ios' })).toBe(false)
    expect(isUpdateRequired({ current: '1.0.0', config: { android: '2.0.0' }, platform: 'ios' })).toBe(false)
    expect(isUpdateRequired({ current: '', config, platform: 'ios' })).toBe(false)
    expect(isUpdateRequired({ current: '1.0.0', config, platform: null })).toBe(false)
  })
})

describe('store urls', () => {
  it('maps a platform to its listing and anything else to null', () => {
    expect(storeUrlFor('ios')).toBe(STORE_URLS.ios)
    expect(storeUrlFor('android')).toBe(STORE_URLS.android)
    expect(storeUrlFor(null)).toBeNull()
    expect(storeUrlFor('web')).toBeNull()
  })

  it('opens https store pages only', () => {
    expect(STORE_URLS.ios).toMatch(/^https:\/\/apps\.apple\.com\/app\/id/)
    expect(STORE_URLS.android).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=app\.gamenight$/)
  })
})
