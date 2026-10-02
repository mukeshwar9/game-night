import { describe, it, expect } from 'vitest'
import { dealSplit, splitTap, splitCleared, splitTiles } from './splitSignalLogic'
import { mulberry32 } from './detMath'

describe('split signal', () => {
  it('splits one pattern into two disjoint halves', () => {
    const d = dealSplit(3, mulberry32(4))
    expect(d.X.length + d.O.length).toBe(splitTiles(3))
    expect(d.X.filter(c => d.O.includes(c))).toEqual([])
    expect(Math.abs(d.X.length - d.O.length)).toBeLessThanOrEqual(1)
  })
  it("only your own tiles count; the partner's and blank ones are wrong", () => {
    const d = { side: 4, X: [1, 2], O: [5] }
    expect(splitTap(d, {}, 'X', 1)).toBe('found')
    expect(splitTap(d, {}, 'X', 5)).toBe('wrong')
    expect(splitTap(d, {}, 'O', 9)).toBe('wrong')
    expect(splitTap(d, { 1: 'X' }, 'X', 1)).toBe('repeat')
    expect(splitCleared(d, { 1: 'X', 2: 'X' })).toBe(false)
    expect(splitCleared(d, { 1: 'X', 2: 'X', 5: 'O' })).toBe(true)
  })
})
