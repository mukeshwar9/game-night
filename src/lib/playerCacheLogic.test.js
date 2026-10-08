import { describe, it, expect } from 'vitest'
import { decideCacheOwner, isSyncedCacheKey, parsePendingMerge, shouldMergeGuest } from './playerCacheLogic'

describe('decideCacheOwner', () => {
  it('keeps for same uid', () => expect(decideCacheOwner('a', 'a')).toBe('keep'))
  it('adopts when no owner', () => {
    expect(decideCacheOwner(null, 'a')).toBe('adopt')
    expect(decideCacheOwner('', 'a')).toBe('adopt')
  })
  it('resets for a different uid', () => expect(decideCacheOwner('a', 'b')).toBe('reset'))
  it('null without a uid', () => expect(decideCacheOwner('a', null)).toBeNull())
})

describe('isSyncedCacheKey', () => {
  it('matches synced caches only', () => {
    for (const k of ['gn-stats', 'gn-matches', 'arrows-solo-v1', 'memory-solo-best-chimp', 'gn-daily-memory-2026-01-01']) {
      expect(isSyncedCacheKey(k)).toBe(true)
    }
    for (const k of ['gn-cache-owner', 'gn-rooms', 'theme', 'arrows-twists-seen', 'solo-low-golf', 'birdseye-progress']) {
      expect(isSyncedCacheKey(k)).toBe(false)
    }
  })
})

describe('parsePendingMerge', () => {
  it('parses a valid record', () => {
    expect(parsePendingMerge('{"guestUid":"g","guestIdToken":"t"}')).toEqual({ guestUid: 'g', guestIdToken: 't' })
  })
  it('rejects junk', () => {
    for (const r of [null, '', 'x', '{}', '{"guestUid":"g"}', '{"guestUid":1,"guestIdToken":"t"}']) {
      expect(parsePendingMerge(r)).toBeNull()
    }
  })
})

describe('shouldMergeGuest', () => {
  const p = { guestUid: 'g', guestIdToken: 't' }
  it('merges for a different permanent uid', () => expect(shouldMergeGuest(p, 'u', true)).toBe(true))
  it('not for same uid, anonymous, or none', () => {
    expect(shouldMergeGuest(p, 'g', true)).toBe(false)
    expect(shouldMergeGuest(p, 'u', false)).toBe(false)
    expect(shouldMergeGuest(null, 'u', true)).toBe(false)
  })
})
