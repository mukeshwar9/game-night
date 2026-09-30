import { describe, expect, it } from 'vitest'
import { int, makeRng, pick, sample, shuffle } from './rng'

describe('wire rng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = makeRng('abc')
    const b = makeRng('abc')
    const c = makeRng('abd')
    const xs = Array.from({ length: 50 }, () => a())
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs)
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(xs)
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true)
  })

  it('draws ints inclusive of both ends and picks from the array', () => {
    const rng = makeRng('ints')
    const seen = new Set(Array.from({ length: 300 }, () => int(rng, 2, 5)))
    expect([...seen].sort()).toEqual([2, 3, 4, 5])
    expect(['a', 'b', 'c']).toContain(pick(rng, ['a', 'b', 'c']))
  })

  it('shuffles without changing the input and samples distinct items', () => {
    const src = [1, 2, 3, 4, 5, 6]
    const out = shuffle(makeRng('s'), src)
    expect(src).toEqual([1, 2, 3, 4, 5, 6])
    expect([...out].sort()).toEqual(src)
    const some = sample(makeRng('s'), src, 3)
    expect(some).toHaveLength(3)
    expect(new Set(some).size).toBe(3)
  })
})
