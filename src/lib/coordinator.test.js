import { describe, it, expect } from 'vitest'
import { pickCoordinator, isCoordinator, roomSeats, isRoomCoordinator, roomCoordinator } from './coordinator'

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

describe('pickCoordinator ordered', () => {
  it('keeps the caller\'s order instead of sorting by id', () => {
    expect(pickCoordinator(['z', 'a'], {}, { ordered: true })).toBe('z')
    expect(pickCoordinator(['z', 'a'], { z: false }, { ordered: true })).toBe('a')
  })
})

describe('roomSeats', () => {
  it('lists seat ids in join order, skipping empty entries', () => {
    const players = { u1: { playerId: 'u1', joinedAt: 5 }, u2: { playerId: 'u2', joinedAt: 1 }, u3: null }
    expect(roomSeats(players)).toEqual(['u2', 'u1'])
    expect(roomSeats(null)).toEqual([])
  })

  it('breaks joinedAt ties by id', () => {
    expect(roomSeats({ b: { playerId: 'b', joinedAt: 1 }, a: { playerId: 'a', joinedAt: 1 } })).toEqual(['a', 'b'])
  })

  it('falls back to the key when a seat has no playerId yet', () => {
    expect(roomSeats({ u1: { name: 'A' } })).toEqual(['u1'])
  })
})

describe('isRoomCoordinator', () => {
  it('gives the controls to the room creator (first to join), whatever their uid', () => {
    const players = {
      zz: { playerId: 'zz', joinedAt: 1, online: true }, // creator
      aa: { playerId: 'aa', joinedAt: 2, online: true },
    }
    expect(isRoomCoordinator('zz', players)).toBe(true)
    expect(isRoomCoordinator('aa', players)).toBe(false)
  })

  it('hands START to the next player to have joined when the host has left', () => {
    const players = {
      h: { playerId: 'h', joinedAt: 1, online: false }, // host closed the tab
      c: { playerId: 'c', joinedAt: 3, online: true },
      b: { playerId: 'b', joinedAt: 2, online: true },
    }
    expect(isRoomCoordinator('h', players)).toBe(false)
    expect(isRoomCoordinator('b', players)).toBe(true)
    expect(isRoomCoordinator('c', players)).toBe(false)
  })

  it('hands the controls back when the host returns', () => {
    const players = {
      h: { playerId: 'h', joinedAt: 1, online: true },
      b: { playerId: 'b', joinedAt: 2, online: true },
    }
    expect(isRoomCoordinator('h', players)).toBe(true)
  })

  it('is never true for a spectator (not in players)', () => {
    const players = { a: { playerId: 'a', online: false } }
    expect(isRoomCoordinator('zzz', players)).toBe(false)
    expect(isRoomCoordinator(null, players)).toBe(false)
  })
})

describe('hostUid override (TRANSFER HOST)', () => {
  const players = {
    h: { playerId: 'h', joinedAt: 1, online: true },
    b: { playerId: 'b', joinedAt: 2, online: true },
    c: { playerId: 'c', joinedAt: 3, online: true },
  }

  it('an online, seated transferred host coordinates', () => {
    expect(roomCoordinator(players, 'c')).toBe('c')
    expect(isRoomCoordinator('c', players, 'c')).toBe(true)
    expect(isRoomCoordinator('h', players, 'c')).toBe(false)
  })

  it('falls back to join order when the transferred host is offline or gone', () => {
    expect(roomCoordinator({ ...players, c: { ...players.c, online: false } }, 'c')).toBe('h')
    expect(roomCoordinator(players, 'zz')).toBe('h')
  })

  it('absent hostUid keeps join-order behaviour', () => {
    expect(roomCoordinator(players)).toBe('h')
    expect(roomCoordinator(players, null)).toBe('h')
    expect(roomCoordinator({}, null)).toBeNull()
  })
})
