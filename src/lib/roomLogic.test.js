import { describe, it, expect } from 'vitest'
import {
  activePartySeats, applyPartyJoin, inviteSummary, isMyTurn, openSeat, partyJoinPlan,
  pickRoomHost, roomAnnouncement, seatedIds, spectatorCount,
} from './roomLogic'

const NOW = 10_000_000
const seat = (id, joinedAt, extra = {}) => ({ name: id.toUpperCase(), playerId: id, joinedAt, ...extra })

describe('pickRoomHost', () => {
  it('is the creator (earliest join) while they are online', () => {
    const players = { zed: seat('zed', 1), amy: seat('amy', 2) }
    expect(pickRoomHost(players)).toBe('zed')
  })

  it('hands over to the next player to have joined when the creator is offline', () => {
    const players = { zed: seat('zed', 1, { online: false }), bob: seat('bob', 2), amy: seat('amy', 3) }
    expect(pickRoomHost(players)).toBe('bob')
  })

  it('falls back to the creator when nobody looks online', () => {
    const players = { zed: seat('zed', 1, { online: false }), bob: seat('bob', 2, { online: false }) }
    expect(pickRoomHost(players)).toBe('zed')
  })

  it('keeps the creator while another tab of theirs is still connected', () => {
    const players = { zed: seat('zed', 1, { online: false, conns: { t2: 1 } }), amy: seat('amy', 2) }
    expect(pickRoomHost(players)).toBe('zed')
  })

  it('honours a transferred host while they are seated and online', () => {
    const players = { zed: seat('zed', 1), amy: seat('amy', 2) }
    expect(pickRoomHost(players, 'amy')).toBe('amy')
    expect(pickRoomHost({ ...players, amy: seat('amy', 2, { online: false }) }, 'amy')).toBe('zed')
    expect(pickRoomHost(players, 'gone')).toBe('zed')
  })

  it('returns null for an empty room', () => {
    expect(pickRoomHost({})).toBe(null)
  })
})

describe('partyJoinPlan', () => {
  it('lets a seated player reclaim in any status', () => {
    expect(partyJoinPlan({ players: { me: seat('me', 1) }, myId: 'me', status: 'playing' })).toEqual({ action: 'reclaim' })
  })

  it('seats latecomers only in the lobby', () => {
    const players = { a: seat('a', 1) }
    expect(partyJoinPlan({ players, myId: 'me', status: 'playing', maxPlayers: 8 })).toEqual({ action: 'spectate' })
    expect(partyJoinPlan({ players, myId: 'me', status: 'finished', maxPlayers: 8 })).toEqual({ action: 'spectate' })
    expect(partyJoinPlan({ players, myId: 'me', status: 'waiting', maxPlayers: 8 })).toEqual({ action: 'join' })
  })

  it('spectates a room full of present players', () => {
    const players = { a: seat('a', 1), b: seat('b', 2) }
    expect(partyJoinPlan({ players, myId: 'me', status: 'waiting', maxPlayers: 2, now: NOW })).toEqual({ action: 'spectate' })
  })

  it('does not count a long-gone ghost toward the cap: evicts the oldest one', () => {
    const players = {
      a: seat('a', 1),
      g1: seat('g1', 2, { online: false, offlineAt: NOW - 120_000 }),
      g2: seat('g2', 3, { online: false, offlineAt: NOW - 300_000 }),
    }
    expect(partyJoinPlan({ players, myId: 'me', status: 'waiting', maxPlayers: 3, now: NOW })).toEqual({ action: 'join', evict: 'g2' })
  })

  it('keeps a seat that only just dropped (reload / locked phone)', () => {
    const players = { a: seat('a', 1), b: seat('b', 2, { online: false, offlineAt: NOW - 5_000 }) }
    expect(partyJoinPlan({ players, myId: 'me', status: 'waiting', maxPlayers: 2, now: NOW })).toEqual({ action: 'spectate' })
  })
})

describe('applyPartyJoin', () => {
  it('adds my seat and removes the evicted ghost', () => {
    const players = { a: seat('a', 1), g: seat('g', 2, { online: false }) }
    const mine = seat('me', 9)
    expect(applyPartyJoin(players, { action: 'join', evict: 'g' }, mine)).toEqual({ a: players.a, me: mine })
  })

  it('returns null unless the plan is a join', () => {
    expect(applyPartyJoin({}, { action: 'spectate' }, seat('me', 1))).toBe(null)
  })
})

describe('activePartySeats', () => {
  it('ignores ghosts and malformed entries', () => {
    const players = { a: seat('a', 1), g: seat('g', 2, { online: false }), junk: { online: false } }
    expect(activePartySeats(players, NOW)).toEqual(['a'])
  })
})

describe('inviteSummary', () => {
  it('describes a 2P room with a free seat', () => {
    const game = { status: 'waiting', players: { X: { name: 'Ann', avatar: 'cat', playerId: 'a' } } }
    expect(inviteSummary(game, { nPlayer: false })).toEqual({
      party: false, hostName: 'Ann', hostAvatar: 'cat', playerCount: 1, capacity: 2, seatsLeft: 1, joinsNextRound: false,
    })
  })

  it('reports a full 2P room', () => {
    const game = { status: 'playing', players: { X: { name: 'Ann' }, O: { name: 'Bo' } } }
    expect(inviteSummary(game, {}).seatsLeft).toBe(0)
  })

  it('describes a party room, counting only present seats', () => {
    const game = {
      status: 'playing',
      players: { h: seat('h', 1, { avatar: 'fox' }), b: seat('b', 2), g: seat('g', 3, { online: false }) },
    }
    const s = inviteSummary(game, { nPlayer: true, maxPlayers: 8 })
    expect(s).toMatchObject({ party: true, hostName: 'H', hostAvatar: 'fox', playerCount: 2, capacity: 8, seatsLeft: 6, joinsNextRound: true })
  })
})

describe('spectatorCount', () => {
  it('counts unique uids with a live connection, minus seated players', () => {
    const spectators = { s1: { p1: { name: 'A' }, p2: { name: 'A' } }, s2: { p3: { name: 'B' } }, me: { p4: {} }, empty: {} }
    expect(spectatorCount(spectators, ['me'])).toBe(2)
    expect(spectatorCount(null)).toBe(0)
  })
})

describe('seatedIds', () => {
  it('reads playerIds from either room family', () => {
    expect(seatedIds({ X: { playerId: 'a' }, O: { playerId: 'b' } })).toEqual(['a', 'b'])
    expect(seatedIds({ u1: { playerId: 'u1' }, bogus: { online: false } })).toEqual(['u1'])
  })
})

describe('openSeat', () => {
  it('offers a free 2P seat only in the lobby', () => {
    expect(openSeat({ status: 'waiting', players: { X: {} } })).toBe('O')
    expect(openSeat({ status: 'waiting', players: { O: {} } })).toBe('X')
    expect(openSeat({ status: 'waiting', players: { X: {}, O: {} } })).toBe(null)
    expect(openSeat({ status: 'playing', players: { X: {} } })).toBe(null)
  })
})

describe('isMyTurn', () => {
  it('needs a live round and a matching turn', () => {
    expect(isMyTurn({ status: 'playing', currentTurn: 'X' }, 'X')).toBe(true)
    expect(isMyTurn({ status: 'playing', currentTurn: 'O' }, 'X')).toBe(false)
    expect(isMyTurn({ status: 'finished', currentTurn: 'X' }, 'X')).toBe(false)
    expect(isMyTurn({ status: 'playing', currentTurn: 'X' }, null)).toBe(false)
  })
})

describe('roomAnnouncement', () => {
  const players = { X: { name: 'Ann' }, O: { name: 'Bo' } }
  it('speaks the turn for players and spectators', () => {
    expect(roomAnnouncement({ status: 'playing', currentTurn: 'X', players }, { me: 'X' })).toBe("It's your move.")
    expect(roomAnnouncement({ status: 'playing', currentTurn: 'O', players }, { me: 'X' })).toBe("Waiting for your opponent's move.")
    expect(roomAnnouncement({ status: 'playing', currentTurn: 'O', players }, { me: null })).toBe('Bo to move.')
  })

  it('speaks the result', () => {
    expect(roomAnnouncement({ status: 'finished', winner: 'X', players }, { me: 'X' })).toBe('You won.')
    expect(roomAnnouncement({ status: 'finished', winner: 'X', players }, { me: 'O' })).toBe('Ann won.')
    expect(roomAnnouncement({ status: 'finished', winner: 'draw', players }, { me: 'O' })).toBe("It's a draw.")
  })

  it('never repeats the on-screen status labels verbatim', () => {
    const lines = [
      roomAnnouncement({ status: 'playing', currentTurn: 'X', players }, { me: 'X' }),
      roomAnnouncement({ status: 'playing', currentTurn: 'O', players }, { me: 'X' }),
      roomAnnouncement({ status: 'finished', winner: 'X', players }, { me: 'X' }),
      roomAnnouncement({ status: 'finished', winner: 'draw', players }, { me: 'X' }),
    ].map(l => l.toUpperCase())
    for (const label of ['YOUR TURN', "OPPONENT'S TURN", 'YOU WIN!', 'DRAW!', 'GAME OVER', 'WAITING FOR OPPONENT']) {
      for (const line of lines) expect(line.includes(label)).toBe(false)
    }
  })

  it('is silent while waiting or for turnless real-time rounds', () => {
    expect(roomAnnouncement({ status: 'waiting', players }, { me: 'X' })).toBe(null)
    expect(roomAnnouncement({ status: 'playing', players }, { me: 'X' })).toBe(null)
  })

  it('names party players by uid', () => {
    const party = { u1: { name: 'Cy' } }
    expect(roomAnnouncement({ status: 'playing', currentTurn: 'u1', players: party }, { me: 'u2', party: true })).toBe('Cy to move.')
    expect(roomAnnouncement({ status: 'finished', winner: 'u1', players: party }, { me: 'u2', party: true })).toBe('Cy won.')
    expect(roomAnnouncement({ status: 'finished', players: party }, { me: 'u2', party: true })).toBe('Round over.')
  })
})
