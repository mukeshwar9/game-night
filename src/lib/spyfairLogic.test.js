import { describe, it, expect } from 'vitest'
import {
  seatOrder, normalizeVotes, tallyVotes, resolveVote, scoreRound, matchWinners,
  allOnlineVoted, pickLocationIndex, assignRoles, privatesFromRoles, findSpy,
  recoverLocationIndex, SPYFAIR_MATCH_WINS,
} from './spyfairLogic'
import { SPYFAIR_LOCATIONS } from './decks/spyfair'
import { markSeen } from './seenHistory'

const rngOf = (...vals) => { let i = 0; return () => vals[i++ % vals.length] }

describe('seatOrder', () => {
  it('sorts by joinedAt then playerId and drops empty seats', () => {
    const players = {
      b: { playerId: 'b', joinedAt: 2 },
      a: { playerId: 'a', joinedAt: 2 },
      c: { playerId: 'c', joinedAt: 1 },
      d: null,
    }
    expect(seatOrder(players).map(p => p.playerId)).toEqual(['c', 'a', 'b'])
  })
})

describe('normalizeVotes', () => {
  it('handles absent votes and drops empty entries', () => {
    expect(normalizeVotes(undefined)).toEqual({})
    expect(normalizeVotes({ a: 'b', c: '' })).toEqual({ a: 'b' })
  })
})

describe('tallyVotes', () => {
  it('finds a clear plurality', () => {
    expect(tallyVotes({ a: 'x', b: 'x', c: 'y' })).toEqual({ top: 'x', topCount: 2, tied: false })
  })

  it('flags a tie for the top spot', () => {
    expect(tallyVotes({ a: 'x', b: 'y' }).tied).toBe(true)
  })

  it('returns no top for no votes', () => {
    expect(tallyVotes({})).toEqual({ top: null, topCount: 0, tied: false })
  })
})

describe('resolveVote', () => {
  it('catches the spy on a clear plurality', () => {
    expect(resolveVote({ a: 's', b: 's', s: 'a' }, 's')).toEqual({ accused: 's', spyCaught: true, spyWon: false })
  })

  it('lets the spy escape on a tie, with nobody accused', () => {
    expect(resolveVote({ a: 's', s: 'a' }, 's')).toEqual({ accused: null, spyCaught: false, spyWon: true })
  })

  it('lets the spy escape when the group picks the wrong player', () => {
    expect(resolveVote({ a: 'b', b: 'a', s: 'a' }, 's')).toMatchObject({ accused: 'a', spyWon: true })
  })
})

describe('scoreRound', () => {
  it('gives the spy one point on escape', () => {
    expect(scoreRound({ s: 1 }, ['a', 'b', 's'], 's', true)).toEqual({ s: 2 })
  })

  it('gives every non-spy one point on a catch', () => {
    expect(scoreRound({}, ['a', 'b', 's'], 's', false)).toEqual({ a: 1, b: 1 })
  })

  it('never mutates the input', () => {
    const scores = { a: 1 }
    scoreRound(scores, ['a', 's'], 's', false)
    expect(scores).toEqual({ a: 1 })
  })
})

describe('matchWinners', () => {
  it('returns every player at the target (shared victory)', () => {
    const w = SPYFAIR_MATCH_WINS
    expect(matchWinners(['a', 'b', 'c'], { a: w, b: w - 1, c: w + 1 })).toEqual(['a', 'c'])
    expect(matchWinners(['a'], {})).toEqual([])
  })
})

describe('allOnlineVoted', () => {
  const seats = [
    { playerId: 'a', online: true },
    { playerId: 'b', online: true },
    { playerId: 'c', online: false },
  ]

  it('waits only for online seats', () => {
    expect(allOnlineVoted(seats, { a: 'b', b: 'a' })).toBe(true)
    expect(allOnlineVoted(seats, { a: 'b' })).toBe(false)
  })

  it('never resolves on fewer than two votes', () => {
    expect(allOnlineVoted([{ playerId: 'a' }], { a: 'x' })).toBe(false)
  })
})

describe('pickLocationIndex', () => {
  it('never repeats the previous location', () => {
    for (let t = 0; t < 50; t++) expect(pickLocationIndex({}, 0)).not.toBe(0)
  })

  it('avoids locations this room has already seen', () => {
    const seen = markSeen({}, SPYFAIR_LOCATIONS.map((_, i) => i).filter(i => i !== 7))
    expect(pickLocationIndex(seen, null, Math.random)).toBe(7)
  })

  it('once the deck is exhausted, still avoids the previous and most recent locations', () => {
    const all = SPYFAIR_LOCATIONS.map((_, i) => i)
    const seen = markSeen({}, all) // last index is the most recent
    const last = all[all.length - 1]
    for (let t = 0; t < 30; t++) {
      const i = pickLocationIndex(seen, last, Math.random)
      expect(i).not.toBe(last)
      expect(i).toBeLessThan(Math.ceil(all.length / 2) + 1)
    }
  })
})

describe('assignRoles / privatesFromRoles / findSpy', () => {
  it('deals exactly one spy and a location role to everyone else', () => {
    const ids = ['a', 'b', 'c', 'd']
    const { spyId, roles } = assignRoles(ids, 0, rngOf(0.3, 0.1, 0.9, 0.5))
    expect(ids).toContain(spyId)
    expect(roles[spyId]).toBeNull()
    for (const id of ids.filter(i => i !== spyId)) {
      expect(SPYFAIR_LOCATIONS[0].roles).toContain(roles[id])
    }
  })

  it('builds the private map the live room writes, and finds the spy in it', () => {
    const privates = privatesFromRoles({ a: 'Pilot', s: null }, 's', 0)
    expect(privates).toEqual({
      a: { role: 'Pilot', location: SPYFAIR_LOCATIONS[0].name },
      s: { role: 'SPY', location: '' },
    })
    expect(findSpy(privates)).toBe('s')
    expect(recoverLocationIndex(privates)).toBe(0)
  })

  it('handles an empty seat list', () => {
    expect(assignRoles([], 0)).toEqual({ spyId: null, roles: {} })
    expect(findSpy({})).toBeNull()
    expect(recoverLocationIndex({})).toBeNull()
  })
})
