import { describe, it, expect } from 'vitest'
import {
  shellActive, isPartyFamily, parseShellView, toggleShellView, toggleShellMinimised,
  turnUid, shellTiles, tickerLine, DEFAULT_SHELL_VIEW,
} from './partyShellLogic'

const online = { conns: { c1: true } }
const party = (extra = {}) => ({
  partyRoom: true,
  status: 'waiting',
  players: {
    a: { playerId: 'a', name: 'ANA', avatar: 'K1a', joinedAt: 1, ...online },
    b: { playerId: 'b', name: 'BO', avatar: 'K1b', joinedAt: 2, ...online },
    c: { playerId: 'c', name: 'CY', avatar: 'K1c', joinedAt: 3, online: false },
  },
  ...extra,
})

describe('shellActive', () => {
  it('is on only for party rooms', () => {
    expect(shellActive({ partyRoom: true })).toBe(true)
    expect(shellActive({ partyRoom: false })).toBe(false)
    expect(shellActive({})).toBe(false)
    expect(shellActive(null)).toBe(false)
  })
})

describe('isPartyFamily', () => {
  it('tells uid-keyed seats from X/O seats', () => {
    expect(isPartyFamily(party())).toBe(true)
    expect(isPartyFamily({ players: { X: { playerId: 'a' } } })).toBe(false)
  })
})

describe('view', () => {
  it('parses stored values and falls back to big tiles', () => {
    expect(parseShellView('strip')).toBe('strip')
    expect(parseShellView('mini')).toBe('mini')
    expect(parseShellView('weird')).toBe(DEFAULT_SHELL_VIEW)
    expect(parseShellView(null)).toBe('tiles')
  })
  it('toggles between big tiles and strip, never by itself', () => {
    expect(toggleShellView('tiles')).toBe('strip')
    expect(toggleShellView('strip')).toBe('tiles')
    expect(toggleShellView('mini')).toBe('tiles')
  })
  it('minimises from the strip and opens back to it', () => {
    expect(toggleShellMinimised('strip')).toBe('mini')
    expect(toggleShellMinimised('mini')).toBe('strip')
  })
})

describe('turnUid', () => {
  it('maps a 2P symbol to the seated uid', () => {
    const g = { status: 'playing', currentTurn: 'O', players: { X: { playerId: 'a' }, O: { playerId: 'b' } } }
    expect(turnUid(g)).toBe('b')
  })
  it('reads a uid turn in party games and is null when not playing', () => {
    expect(turnUid({ status: 'playing', currentTurn: 'a', players: { a: {} } })).toBe('a')
    expect(turnUid({ status: 'playing', currentTurn: 'zz', players: { a: {} } })).toBe(null)
    expect(turnUid({ status: 'waiting', currentTurn: 'X', players: { X: { playerId: 'a' } } })).toBe(null)
    expect(turnUid({ status: 'finished', currentTurn: 'a', players: { a: {} } })).toBe(null)
  })
})

describe('shellTiles', () => {
  it('numbers seats in join order, marks the host and presence', () => {
    const tiles = shellTiles(party(), { hostUid: 'a' })
    expect(tiles.map(t => [t.seat, t.uid])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']])
    expect(tiles[0].isHost).toBe(true)
    expect(tiles[1].isHost).toBe(false)
    expect(tiles.map(t => t.online)).toEqual([true, true, false])
  })
  it('adds invite tiles for empty seats in the lobby only', () => {
    expect(shellTiles(party(), { inLobby: true }).map(t => t.invite)).toEqual([false, false, false, true])
    expect(shellTiles(party(), { inLobby: false })).toHaveLength(3)
  })
  it('never shows more than four', () => {
    const g = party()
    g.players.d = { playerId: 'd', name: 'DI', joinedAt: 4 }
    g.players.e = { playerId: 'e', name: 'EV', joinedAt: 5 }
    expect(shellTiles(g, { inLobby: true })).toHaveLength(4)
  })
  it('keeps queued players as watching in a 2P game', () => {
    const g = {
      partyRoom: true, status: 'playing', currentTurn: 'X',
      players: { X: { playerId: 'a', name: 'ANA', joinedAt: 1 }, O: { playerId: 'b', name: 'BO', joinedAt: 2 } },
      presence: { X: online, O: online },
      queue: { c: { playerId: 'c', name: 'CY', joinedAt: 3, at: 3 } },
    }
    const tiles = shellTiles(g)
    expect(tiles.map(t => t.seatState)).toEqual(['playing', 'playing', 'watching'])
    expect(tiles[0].turn).toBe(true)
  })
})

describe('tickerLine', () => {
  const log = {
    m1: { by: 'a', name: 'ANA', text: 'hi', ts: 1 },
    m2: { by: 'b', name: 'BO', text: 'rude', ts: 2, hidden: true },
    m3: { by: 'c', name: 'CY', text: 'blocked one', ts: 3 },
  }
  it('is null for an empty room', () => {
    expect(tickerLine(undefined)).toBe(null)
  })
  it('takes the newest line, skipping hidden and blocked senders', () => {
    expect(tickerLine(log, { muted: { c: true } })?.text).toBe('hi')
    expect(tickerLine(log)?.text).toBe('blocked one')
  })
  it('flags sticker lines', () => {
    const img = `data:image/png;base64,${'A'.repeat(20)}`
    expect(tickerLine({ s: { by: 'a', text: '', img, ts: 5 } })?.img).toBe(true)
  })
})
