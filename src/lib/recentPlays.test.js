import { describe, it, expect, beforeEach } from 'vitest'
import { pushRecent, buildRecentPlays, formatAgo, modeLabel, getRecentPlays, recordRecentPlay, MAX_RECENT } from './recentPlays'

describe('pushRecent', () => {
  it('puts the entry first and drops the older one for the same game', () => {
    const list = [{ type: 'a', mode: 'solo', ts: 1 }, { type: 'b', mode: 'solo', ts: 2 }]
    expect(pushRecent(list, { type: 'b', mode: 'local', ts: 3 })).toEqual([
      { type: 'b', mode: 'local', ts: 3 },
      { type: 'a', mode: 'solo', ts: 1 },
    ])
  })

  it('caps the list', () => {
    const list = Array.from({ length: MAX_RECENT }, (_, i) => ({ type: `t${i}`, mode: 'solo', ts: i }))
    const next = pushRecent(list, { type: 'new', mode: 'solo', ts: 99 })
    expect(next).toHaveLength(MAX_RECENT)
    expect(next[0].type).toBe('new')
  })
})

describe('buildRecentPlays', () => {
  const known = new Set(['a', 'b', 'c', 'd'])

  it('merges solo plays and rooms newest first, one entry per game', () => {
    const out = buildRecentPlays({
      plays: [{ type: 'a', mode: 'solo', ts: 300 }, { type: 'b', mode: 'local', ts: 100 }],
      rooms: [{ id: 'R1', gameType: 'b', ts: 200 }, { id: 'R2', gameType: 'a', ts: 50 }],
      known,
    })
    expect(out).toEqual([
      { type: 'a', mode: 'solo', ts: 300 },
      { type: 'b', mode: 'multi', ts: 200 },
    ])
  })

  it('fills leftover slots from stats and drops unknown types', () => {
    const out = buildRecentPlays({
      plays: [{ type: 'zzz', mode: 'solo', ts: 5 }],
      rooms: [{ gameType: 'c', ts: 1 }],
      statsTypes: ['c', 'd', 'nope'],
      known,
    })
    expect(out.map(e => e.type)).toEqual(['c', 'd'])
    expect(out[1].ts).toBeNull()
  })

  it('respects the limit and ignores malformed entries', () => {
    const out = buildRecentPlays({
      plays: [null, { type: 'a' }, { type: 'b', mode: 'solo', ts: 2 }],
      rooms: [{ gameType: null }, { gameType: 'c', ts: 1 }],
      known,
      limit: 1,
    })
    expect(out.map(e => e.type)).toEqual(['b'])
  })
})

describe('formatAgo', () => {
  const now = 10 * 86_400_000
  it('formats minutes, hours and days', () => {
    expect(formatAgo(now - 20_000, now)).toBe('just now')
    expect(formatAgo(now - 5 * 60_000, now)).toBe('5m ago')
    expect(formatAgo(now - 2 * 3_600_000, now)).toBe('2h ago')
    expect(formatAgo(now - 3 * 86_400_000, now)).toBe('3d ago')
  })

  it('is empty without a timestamp', () => {
    expect(formatAgo(null, now)).toBe('')
  })
})

describe('modeLabel', () => {
  it('names each mode', () => {
    expect(modeLabel('solo')).toBe('vs CPU')
    expect(modeLabel('local')).toBe('same device')
    expect(modeLabel('multi')).toBe('online')
  })
})

describe('recordRecentPlay', () => {
  beforeEach(() => {
    const store = {}
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
    }
  })

  it('stores plays newest first and ignores unknown modes', () => {
    recordRecentPlay('a', 'solo')
    recordRecentPlay('b', 'local')
    recordRecentPlay('c', 'bogus')
    expect(getRecentPlays().map(e => [e.type, e.mode])).toEqual([['b', 'local'], ['a', 'solo']])
  })
})
