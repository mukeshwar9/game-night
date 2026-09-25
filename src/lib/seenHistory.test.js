import { describe, it, expect } from 'vitest'
import { normalizeSeen, markSeen, seenPatch, avoidList, pickFresh } from './seenHistory'

// Deterministic rng stub that cycles through the given values.
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length] }

describe('normalizeSeen', () => {
  it('returns {} for absent or non-object input', () => {
    expect(normalizeSeen(undefined)).toEqual({})
    expect(normalizeSeen(null)).toEqual({})
    expect(normalizeSeen('x')).toEqual({})
  })

  it('reads a numeric-keyed map by key', () => {
    expect(normalizeSeen({ 3: 1, 10: 2 })).toEqual({ 3: 1, 10: 2 })
  })

  it('reads the sparse-array shape Firebase returns without shifting indices', () => {
    const raw = []
    raw[0] = 4
    raw[2] = 5
    expect(normalizeSeen(raw)).toEqual({ 0: 4, 2: 5 })
  })

  it('drops junk keys and values', () => {
    expect(normalizeSeen({ a: 1, '-1': 2, 1.5: 3, 4: 'x', 5: null, 6: 7 })).toEqual({ 6: 7 })
  })
})

describe('markSeen', () => {
  it('appends with increasing recency and never mutates the input', () => {
    const before = { 1: 1 }
    const after = markSeen(before, [4, 2])
    expect(after).toEqual({ 1: 1, 4: 2, 2: 3 })
    expect(before).toEqual({ 1: 1 })
  })

  it('re-seeing a card bumps its recency instead of adding an entry', () => {
    expect(markSeen({ 1: 1, 2: 2 }, [1])).toEqual({ 1: 3, 2: 2 })
  })
})

describe('seenPatch', () => {
  it('builds per-key update paths continuing the counter', () => {
    expect(seenPatch('spyfair', { 0: 7 }, [5])).toEqual({ 'seen/spyfair/5': 8 })
  })
})

describe('avoidList', () => {
  it('avoids every seen card while fresh ones remain', () => {
    expect(avoidList(5, { 0: 1, 3: 2 })).toEqual([0, 3])
  })

  it('ignores history for indices beyond the deck', () => {
    expect(avoidList(3, { 1: 1, 9: 2 })).toEqual([1])
  })

  it('falls back to the newest half once the deck is exhausted', () => {
    // seq: 2 oldest, then 0, 3, 1 newest
    const seen = { 2: 1, 0: 2, 3: 3, 1: 4 }
    expect(avoidList(4, seen)).toEqual([1, 3])
  })

  it('counts excluded cards as unavailable when deciding exhaustion', () => {
    // Only index 2 is unseen, and it is excluded -> exhausted -> newest half.
    const seen = { 0: 1, 1: 2, 3: 3 }
    expect(avoidList(4, seen, 1, [2])).toEqual([3])
  })

  it('honours minFresh', () => {
    const seen = { 0: 1, 1: 2 }
    expect(avoidList(4, seen, 2)).toEqual([0, 1])
    expect(avoidList(4, seen, 3)).toEqual([1])
  })
})

describe('pickFresh', () => {
  it('returns null for an empty deck', () => {
    expect(pickFresh(0, {})).toBeNull()
  })

  it('never repeats a card until the whole deck has been seen', () => {
    let seen = {}
    const picked = new Set()
    for (let n = 0; n < 10; n++) {
      const i = pickFresh(10, seen, Math.random)
      expect(picked.has(i)).toBe(false)
      picked.add(i)
      seen = markSeen(seen, [i])
    }
    expect(picked.size).toBe(10)
  })

  it('after exhaustion picks from the least recently seen half', () => {
    let seen = {}
    for (const i of [0, 1, 2, 3, 4, 5]) seen = markSeen(seen, [i])
    for (let t = 0; t < 50; t++) {
      expect([0, 1, 2]).toContain(pickFresh(6, seen, Math.random))
    }
  })

  it('respects exclude, and only breaks it when nothing else is left', () => {
    expect(pickFresh(3, {}, seq(0), [0, 1])).toBe(2)
    expect(pickFresh(2, {}, seq(0.99), [0, 1])).toBe(1)
  })

  it('is deterministic for a given rng', () => {
    const seen = { 0: 1, 4: 2 }
    expect(pickFresh(8, seen, seq(0.5))).toBe(pickFresh(8, seen, seq(0.5)))
  })

  it('treats cards appended to the deck later as unseen', () => {
    const seen = { 0: 1, 1: 2, 2: 3 }
    expect(pickFresh(4, seen, seq(0))).toBe(3)
  })
})
