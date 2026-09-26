import { describe, it, expect } from 'vitest'
import { normalizeArray, normalizeList } from './normalize'

describe('normalizeArray', () => {
  it('returns an empty array for null/undefined/non-objects', () => {
    expect(normalizeArray(null)).toEqual([])
    expect(normalizeArray(undefined)).toEqual([])
    expect(normalizeArray('abc')).toEqual([])
    expect(normalizeArray(42)).toEqual([])
  })

  it('fills a fixed length when raw is absent', () => {
    expect(normalizeArray(null, 3, '')).toEqual(['', '', ''])
  })

  it('copies a dense array unchanged', () => {
    const raw = ['a', 'b', 'c']
    const out = normalizeArray(raw)
    expect(out).toEqual(['a', 'b', 'c'])
    expect(out).not.toBe(raw)
  })

  it('maps a sparse numeric-keyed object by key, not by Object.values order', () => {
    // A sparse Firebase write: index 1 was never set. Object.values would give
    // ['a', 'c'] and shift 'c' into slot 1.
    const raw = { 0: 'a', 2: 'c' }
    expect(Object.values(raw)).toEqual(['a', 'c'])
    expect(normalizeArray(raw)).toEqual(['a', null, 'c'])
  })

  it('places keys correctly regardless of object key order', () => {
    const raw = { 10: 'k', 2: 'c' }
    const out = normalizeArray(raw)
    expect(out).toHaveLength(11)
    expect(out[2]).toBe('c')
    expect(out[10]).toBe('k')
    expect(out[0]).toBeNull()
  })

  it('pads and truncates to a fixed length', () => {
    expect(normalizeArray({ 1: 'x' }, 4, '')).toEqual(['', 'x', '', ''])
    expect(normalizeArray({ 0: 'a', 5: 'z' }, 3, '')).toEqual(['a', '', ''])
    expect(normalizeArray(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b'])
  })

  it('treats null holes in a real array as missing', () => {
    expect(normalizeArray(['a', null, 'c'], 3, '')).toEqual(['a', '', 'c'])
    // eslint-disable-next-line no-sparse-arrays
    expect(normalizeArray(['a', , 'c'], 3, '')).toEqual(['a', '', 'c'])
  })

  it('ignores non-numeric keys', () => {
    expect(normalizeArray({ 0: 'a', foo: 'bar', '-1': 'neg', 1.5: 'frac' })).toEqual(['a'])
  })

  it('keeps falsy-but-present values (0, false, empty string)', () => {
    expect(normalizeArray({ 0: 0, 1: false, 2: '' }, 3, 'x')).toEqual([0, false, ''])
  })

  it('does not count trailing null entries toward the length', () => {
    expect(normalizeArray({ 0: 'a', 3: null })).toEqual(['a'])
  })
})

describe('normalizeList', () => {
  it('keeps key order and drops gaps', () => {
    expect(normalizeList({ 3: 'd', 0: 'a', 1: 'b' })).toEqual(['a', 'b', 'd'])
  })

  it('handles arrays with null holes and absent values', () => {
    expect(normalizeList([1, null, 3])).toEqual([1, 3])
    expect(normalizeList(null)).toEqual([])
  })

  it('keeps object values intact (bids)', () => {
    const bids = { 1: { qty: 3, face: 4 }, 0: { qty: 2, face: 5 } }
    expect(normalizeList(bids)).toEqual([{ qty: 2, face: 5 }, { qty: 3, face: 4 }])
  })
})
