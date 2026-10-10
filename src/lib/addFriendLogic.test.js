import { describe, it, expect } from 'vitest'
import { friendOffer, parseSent, withSent, coPlayerUid, SENT_TTL_MS } from './addFriendLogic'

const base = { myUid: 'me', otherUid: 'you', friendUids: [], incomingUids: [] }

describe('friendOffer', () => {
  it('offers the button for a co-player who is not a friend', () => {
    expect(friendOffer(base)).toBe('offer')
  })
  it('shows sent once this device sent a request', () => {
    expect(friendOffer({ ...base, sentUids: ['you'] })).toBe('sent')
  })
  it('hides for yourself or a missing co-player', () => {
    expect(friendOffer({ ...base, otherUid: 'me' })).toBe('hidden')
    expect(friendOffer({ ...base, otherUid: null })).toBe('hidden')
    expect(friendOffer({ ...base, myUid: null })).toBe('hidden')
  })
  it('hides for an existing friend and for someone who already asked you', () => {
    expect(friendOffer({ ...base, friendUids: ['you'] })).toBe('hidden')
    expect(friendOffer({ ...base, incomingUids: ['you'] })).toBe('hidden')
    // A friend wins over a stale sent record.
    expect(friendOffer({ ...base, friendUids: ['you'], sentUids: ['you'] })).toBe('hidden')
  })
  it('hides while the friend or request lists have not loaded', () => {
    expect(friendOffer({ ...base, friendUids: null })).toBe('hidden')
    expect(friendOffer({ ...base, incomingUids: null })).toBe('hidden')
  })
  it('hides for a muted or blocked player', () => {
    expect(friendOffer({ ...base, muted: true })).toBe('hidden')
  })
})

describe('sent memory', () => {
  const now = 1_000_000_000_000
  it('round-trips and expires old entries', () => {
    const raw = JSON.stringify(withSent(withSent({}, 'a', now - SENT_TTL_MS - 1), 'b', now - 10))
    expect(parseSent(raw, now)).toEqual({ b: now - 10 })
  })
  it('survives missing, corrupt and wrong-shaped storage', () => {
    expect(parseSent(null, now)).toEqual({})
    expect(parseSent('{nope', now)).toEqual({})
    expect(parseSent('[1,2]', now)).toEqual({})
    expect(parseSent(JSON.stringify({ a: 'x', b: null, c: now + 10 * SENT_TTL_MS }), now)).toEqual({})
  })
  it('keeps only the newest entries', () => {
    let m = {}
    for (let i = 0; i < 60; i++) m = withSent(m, `u${i}`, now + i)
    expect(Object.keys(m)).toHaveLength(40)
    expect(m.u59).toBe(now + 59)
    expect(m.u0).toBeUndefined()
  })
})

describe('coPlayerUid', () => {
  const players = { X: { playerId: 'ax' }, O: { playerId: 'bo' } }
  it('returns the other seat', () => {
    expect(coPlayerUid(players, 'X')).toBe('bo')
    expect(coPlayerUid(players, 'O')).toBe('ax')
  })
  it('is null for spectators, empty seats and missing players', () => {
    expect(coPlayerUid(players, null)).toBeNull()
    expect(coPlayerUid({ X: { playerId: 'ax' } }, 'X')).toBeNull()
    expect(coPlayerUid(null, 'X')).toBeNull()
  })
})
