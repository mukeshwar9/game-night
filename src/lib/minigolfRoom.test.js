import { describe, expect, it } from 'vitest'
import { normalizeGolfOrder, normalizeGolfShots, shotKey, skipCount } from './minigolfRoom'

describe('minigolf room normalizers', () => {
  it('reads golfOrder from an array or a sparse numeric-keyed object', () => {
    expect(normalizeGolfOrder(['a', 'b'])).toEqual(['a', 'b'])
    expect(normalizeGolfOrder({ 1: 'b', 0: 'a', 2: 'c' })).toEqual(['a', 'b', 'c'])
    expect(normalizeGolfOrder({ 0: 'a', 2: 'c' })).toEqual(['a', 'c'])
    expect(normalizeGolfOrder(null)).toEqual([])
    expect(normalizeGolfOrder('x')).toEqual([])
  })

  it('orders strokes by key and drops malformed ones', () => {
    const raw = {
      [shotKey(1)]: { by: 'b', h: 0, a: 2, p: 3, k: 4 },
      [shotKey(0)]: { by: 'a', h: 0, a: 1, p: 2, k: 3 },
      s0002: { by: 'a', h: 0, a: 'x', p: 2, k: 3 },
      junk: { by: 'a', h: 0, a: 1, p: 2, k: 3 },
    }
    expect(normalizeGolfShots(raw)).toEqual([
      { by: 'a', h: 0, a: 1, p: 2, k: 3 },
      { by: 'b', h: 0, a: 2, p: 3, k: 4 },
    ])
    expect(normalizeGolfShots(undefined)).toEqual([])
  })

  it('shotKey pads so keys sort in play order', () => {
    expect(shotKey(0)).toBe('s0000')
    expect(shotKey(12)).toBe('s0012')
    expect([shotKey(10), shotKey(9)].sort()).toEqual(['s0009', 's0010'])
  })

  it('counts pick-ups across holes', () => {
    expect(skipCount({ 0: { a: 'timeout' }, 3: { b: 'away', c: 'away' } })).toBe(3)
    expect(skipCount([{ a: 'timeout' }, null, { b: 'away' }])).toBe(2)
    expect(skipCount(null)).toBe(0)
  })
})
