import { describe, it, expect } from 'vitest'
import { pickCoordinator, isCoordinator } from './coordinator'

describe('pickCoordinator', () => {
  it('returns null for an empty seat list', () => {
    expect(pickCoordinator([], {})).toBeNull()
    expect(pickCoordinator(null, {})).toBeNull()
  })

  it('picks the lowest-id seat when everyone is online', () => {
    expect(pickCoordinator(['b', 'a', 'c'], { a: { online: true }, b: { online: true }, c: { online: true } }))
      .toBe('a')
  })

  it('treats missing presence entries as online', () => {
    expect(pickCoordinator(['b', 'a'], {})).toBe('a')
  })

  it('skips an offline lowest-id seat in favor of the next online seat', () => {
    expect(pickCoordinator(['a', 'b', 'c'], { a: { online: false }, b: { online: true }, c: { online: true } }))
      .toBe('b')
  })

  it('falls back to the lowest-id seat overall when nobody is online', () => {
    expect(pickCoordinator(['b', 'a'], { a: { online: false }, b: { online: false } })).toBe('a')
  })

  it('accepts a bare boolean presence value, not just { online }', () => {
    expect(pickCoordinator(['a', 'b'], { a: false, b: true })).toBe('b')
  })

  it('is deterministic regardless of seat array order', () => {
    const presence = { a: { online: true }, b: { online: true }, c: { online: false } }
    expect(pickCoordinator(['c', 'b', 'a'], presence)).toBe(pickCoordinator(['a', 'b', 'c'], presence))
  })

  it('re-derives a new coordinator once the old one comes back online, with no persisted state', () => {
    const seats = ['a', 'b']
    // a drops offline -> b becomes coordinator
    expect(pickCoordinator(seats, { a: { online: false }, b: { online: true } })).toBe('b')
    // a reconnects -> a is coordinator again (pure function of current presence)
    expect(pickCoordinator(seats, { a: { online: true }, b: { online: true } })).toBe('a')
  })
})

describe('isCoordinator', () => {
  it('is true only for the picked seat', () => {
    const seats = ['a', 'b', 'c']
    const presence = { a: { online: false }, b: { online: true }, c: { online: true } }
    expect(isCoordinator('b', seats, presence)).toBe(true)
    expect(isCoordinator('c', seats, presence)).toBe(false)
    expect(isCoordinator('a', seats, presence)).toBe(false)
  })

  it('is false for a falsy seat id', () => {
    expect(isCoordinator(null, ['a'], { a: { online: true } })).toBe(false)
    expect(isCoordinator(undefined, ['a'], { a: { online: true } })).toBe(false)
  })
})
