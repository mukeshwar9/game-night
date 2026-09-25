import { describe, it, expect, beforeAll } from 'vitest'

// roomUpdates imports games.js, whose board components touch localStorage at
// module load (src/lib/sounds.js) — stub it before the dynamic import.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let playersToSeatList, buildSwitchUpdates, nextStarter

beforeAll(async () => {
  ;({ playersToSeatList, buildSwitchUpdates, nextStarter } = await import('./roomUpdates'))
})

describe('nextStarter', () => {
  it('hands the next round to the loser', () => {
    expect(nextStarter({ winner: 'X', starter: 'X' })).toBe('O')
    expect(nextStarter({ winner: 'O', starter: 'X' })).toBe('X')
  })

  it('alternates from the previous starter on a draw', () => {
    expect(nextStarter({ winner: 'draw', starter: 'X' })).toBe('O')
    expect(nextStarter({ winner: 'draw', starter: 'O' })).toBe('X')
    expect(nextStarter({ winner: 'draw' })).toBe('O')
  })
})

describe('playersToSeatList', () => {
  it('orders by joinedAt, then uid, and skips entries without a playerId', () => {
    const list = playersToSeatList({
      X: { name: 'B', playerId: 'uid-b', joinedAt: 5 },
      O: { name: 'A', playerId: 'uid-a', joinedAt: 5 },
      junk: { name: 'nobody' },
      first: { name: 'C', playerId: 'uid-c', joinedAt: 1, avatar: 'cat' },
    })
    expect(list.map(s => s.playerId)).toEqual(['uid-c', 'uid-a', 'uid-b'])
    expect(list[0].avatar).toBe('cat')
    expect(list[1].avatar).toBeNull()
  })

  it('handles a missing players node', () => {
    expect(playersToSeatList(undefined)).toEqual([])
  })
})

describe('buildSwitchUpdates', () => {
  const room = {
    gameType: 'tictactoe',
    status: 'finished',
    players: {
      X: { name: 'HOST', playerId: 'u1', joinedAt: 1 },
      O: { name: 'GUEST', playerId: 'u2', joinedAt: 2, avatar: 'fox' },
    },
  }

  it('reseats X/O in join order and starts a 2P game when both are present', () => {
    const u = buildSwitchUpdates(room, 'connectfour')
    expect(u.gameType).toBe('connectfour')
    expect(u.status).toBe('playing')
    expect(u.scores).toEqual({ X: 0, O: 0 })
    expect(u.players.X).toEqual({ name: 'HOST', playerId: 'u1', joinedAt: 1, avatar: null })
    expect(u.players.O.avatar).toBe('fox')
    expect(u.winner).toBeNull()
    expect(u.proposal).toBeNull()
    expect(u.board).toHaveLength(42)
  })

  it('waits for a second seat when only one player remains', () => {
    const u = buildSwitchUpdates({ ...room, players: { X: room.players.X } }, 'connectfour')
    expect(u.status).toBe('waiting')
    expect(u.players.O).toBeUndefined()
  })

  it('rekeys players by uid for a party game and returns to the lobby', () => {
    const u = buildSwitchUpdates(room, 'trivia')
    expect(u.status).toBe('waiting')
    expect(u.scores).toEqual({})
    expect(Object.keys(u.players)).toEqual(['u1', 'u2'])
    expect(u.players.u2).toEqual({ name: 'GUEST', playerId: 'u2', joinedAt: 2, online: true, avatar: 'fox' })
  })
})
