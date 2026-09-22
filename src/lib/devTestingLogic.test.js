import { describe, expect, test } from 'vitest'
import {
  DEV_SLOTS, isLoopbackHost, testingModeEnabled,
  isValidDevSlot, resolveDevSlot, namespacedKey,
} from './devTestingLogic'

describe('isLoopbackHost', () => {
  test('accepts loopback hostnames, case-insensitive', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('LOCALHOST')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('[::1]')).toBe(true)
  })
  test('rejects public / LAN hosts and empty input', () => {
    expect(isLoopbackHost('192.168.1.5')).toBe(false)
    expect(isLoopbackHost('example.com')).toBe(false)
    expect(isLoopbackHost('')).toBe(false)
    expect(isLoopbackHost(null)).toBe(false)
  })
})

describe('testingModeEnabled', () => {
  test('needs dev mode AND flag AND loopback host', () => {
    expect(testingModeEnabled({ devMode: true, flag: true, hostname: 'localhost' })).toBe(true)
    expect(testingModeEnabled({ devMode: false, flag: true, hostname: 'localhost' })).toBe(false)
    expect(testingModeEnabled({ devMode: true, flag: false, hostname: 'localhost' })).toBe(false)
    expect(testingModeEnabled({ devMode: true, flag: true, hostname: 'example.com' })).toBe(false)
  })
})

describe('isValidDevSlot', () => {
  test('accepts every declared slot, case-insensitive', () => {
    for (const s of DEV_SLOTS) expect(isValidDevSlot(s)).toBe(true)
    expect(isValidDevSlot('P3')).toBe(true)
  })
  test('rejects unknown slots', () => {
    expect(isValidDevSlot('p9')).toBe(false)
    expect(isValidDevSlot('admin')).toBe(false)
    expect(isValidDevSlot('')).toBe(false)
    expect(isValidDevSlot(null)).toBe(false)
  })
})

describe('resolveDevSlot', () => {
  test('explicit URL param wins over stored slot', () => {
    expect(resolveDevSlot({ param: 'p2', stored: 'p1' })).toBe('p2')
  })
  test('falls back to the stored slot when no param (same-slot navigation)', () => {
    expect(resolveDevSlot({ param: null, stored: 'p1' })).toBe('p1')
  })
  test('invalid param is ignored, stored slot stays authoritative', () => {
    expect(resolveDevSlot({ param: 'p9', stored: 'p4' })).toBe('p4')
  })
  test('no param and no stored slot = null', () => {
    expect(resolveDevSlot({ param: null, stored: null })).toBe(null)
  })
  test('stored garbage = null', () => {
    expect(resolveDevSlot({ param: null, stored: 'xp' })).toBe(null)
  })
})

describe('namespacedKey', () => {
  test('prefixes player-specific keys with the slot', () => {
    expect(namespacedKey('p1', 'gn-stats')).toBe('gn-dev-p1:gn-stats')
    expect(namespacedKey('spectator', 'playerName')).toBe('gn-dev-spectator:playerName')
  })
  test('empty/absent slot keeps the normal key', () => {
    expect(namespacedKey(null, 'gn-stats')).toBe('gn-stats')
    expect(namespacedKey('', 'gn-favs')).toBe('gn-favs')
  })
  test('invalid slot never namespaces (fail-safe, no key corruption)', () => {
    expect(namespacedKey('p9', 'gn-stats')).toBe('gn-stats')
  })
})
