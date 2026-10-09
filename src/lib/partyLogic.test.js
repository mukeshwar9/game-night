import { beforeAll, describe, expect, it } from 'vitest'
import {
  PARTY_CAP, playableAt, groupPickerForParty, partyPresentMembers, effectiveCap, overCapMembers,
  partyFullFor, partyInviteLine,
} from './partyLogic'
import { CHAMELEON_MIN_PLAYERS } from './chameleonLogic'
import { CW_MIN_PLAYERS } from './codeWordsLogic'
import { HU_MIN_PLAYERS } from './headsUpLogic'
import { JO_MIN_PLAYERS } from './justOneLogic'
import { SPYFAIR_MIN_PLAYERS } from './spyfairLogic'
import { WAVELENGTH_MIN_PLAYERS } from './wavelengthLogic'
import { RACE_MIN_PLAYERS } from './raceLogic'

// games.js pulls in board components that touch `localStorage` at module load.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let GAME_TYPES, getGameConfig
beforeAll(async () => { ;({ GAME_TYPES, getGameConfig } = await import('./games')) })

const here = (...uids) => Object.fromEntries(uids.map(u => [u, { k1: { name: u, at: 1 } }]))

describe('playableAt', () => {
  const fib = { nPlayer: true, minPlayers: 3, maxPlayers: 8 }
  const c4 = { nPlayer: false }
  it('party games fit between their minimum and maximum', () => {
    expect(playableAt(fib, 2)).toEqual({ fit: 'short', short: 1 })
    expect(playableAt(fib, 3)).toEqual({ fit: 'all', short: 0 })
    expect(playableAt({ nPlayer: true, minPlayers: 2, maxPlayers: 4 }, 5).fit).toBe('over')
  })
  it('2-player games seat everyone at 2 and take turns above', () => {
    expect(playableAt(c4, 1)).toEqual({ fit: 'short', short: 1 })
    expect(playableAt(c4, 2).fit).toBe('all')
    expect(playableAt(c4, 3).fit).toBe('rotate')
    expect(playableAt(c4, 4).fit).toBe('rotate')
  })
})

describe('groupPickerForParty over the real registry', () => {
  // The size matrix from the party/voice audit (75 catalogue cards), plus the
  // seven 2P memory games, BIRDSEYE, PUCK RUSH and FACE OFF (2-seat, not nPlayer), YACHT (2–4) and CHOP CHOP
  // (2–8 race) added since (87 cards).
  it.each([
    [2, 79, 0, 8],
    [3, 21, 65, 1],
    [4, 22, 65, 0],
  ])('a party of %i: %i everyone-plays, %i take-turns, %i need more', (n, all, rotate, short) => {
    const g = groupPickerForParty(GAME_TYPES, n)
    expect([g.all.length, g.rotate.length, g.short.length]).toEqual([all, rotate, short])
  })

  it('names the shortfall, smallest first', () => {
    const g = groupPickerForParty(GAME_TYPES, 3)
    expect(g.short.map(s => [s.cfg.type, s.short])).toEqual([['codewords', 1]])
    expect(groupPickerForParty(GAME_TYPES, 2).short.at(-1)).toMatchObject({ short: 2 })
  })

  it('never lists variants on their own', () => {
    const g = groupPickerForParty(GAME_TYPES, 2)
    expect([...g.all, ...g.rotate].some(t => t.variantOf)).toBe(false)
  })
})

describe('registry minimums match the game pages', () => {
  // The picker reads only the registry; the pages gate START on their own
  // constants. If they drift, the picker offers a game that then refuses.
  it.each([
    ['chameleon', CHAMELEON_MIN_PLAYERS],
    ['codewords', CW_MIN_PLAYERS],
    ['headsup', HU_MIN_PLAYERS],
    ['justone', JO_MIN_PLAYERS],
    ['spyfair', SPYFAIR_MIN_PLAYERS],
    ['wavelength', WAVELENGTH_MIN_PLAYERS],
    ['typing', RACE_MIN_PLAYERS],
  ])('%s', (type, min) => {
    expect(getGameConfig(type).minPlayers).toBe(min)
  })
})

describe('presence, cap and fullness', () => {
  const lobby = (over = {}) => ({
    gameType: 'party', partyRoom: true, partyCap: 4,
    players: {
      a: { name: 'Ann', playerId: 'a', joinedAt: 1, online: true },
      b: { name: 'Bob', playerId: 'b', joinedAt: 2, online: false },
      c: { name: 'Cy', playerId: 'c', joinedAt: 3, conns: { k: 1 } },
    },
    ...over,
  })

  it('partyPresentMembers counts party seats, 2P seats and queued spectators', () => {
    expect(partyPresentMembers(lobby(), true).map(m => m.uid)).toEqual(['a', 'c'])
    const twoP = {
      partyRoom: true,
      players: { X: { name: 'Ann', playerId: 'a', joinedAt: 1 }, O: { name: 'Bob', playerId: 'b', joinedAt: 2 } },
      presence: { O: { online: false } },
      queue: { c: { name: 'Cy', playerId: 'c', joinedAt: 3, at: 9 }, d: { name: 'Di', playerId: 'd', joinedAt: 4, at: 10 } },
      spectators: here('c'),
    }
    expect(partyPresentMembers(twoP, false).map(m => m.uid)).toEqual(['a', 'c'])
  })

  it('effectiveCap is the game maximum, never above the party cap', () => {
    expect(effectiveCap(lobby(), { nPlayer: true, maxPlayers: 8 })).toBe(4)
    expect(effectiveCap(lobby(), { nPlayer: true, maxPlayers: 3 })).toBe(3)
    expect(effectiveCap(lobby(), { nPlayer: false })).toBe(4)
    expect(effectiveCap({}, { nPlayer: true, maxPlayers: 8 })).toBe(8)
    expect(effectiveCap({ partyRoom: true }, { nPlayer: true, maxPlayers: 6 })).toBe(6)
    expect(PARTY_CAP).toBe(4)
  })

  it('overCapMembers picks the latest joiners past the cap, across seats and queue', () => {
    const g = lobby()
    g.players.d = { name: 'Di', playerId: 'd', joinedAt: 4 }
    g.players.e = { name: 'Ed', playerId: 'e', joinedAt: 5 }
    expect(overCapMembers(g, true, 4)).toEqual(['e'])
    expect(overCapMembers({ ...g, partyRoom: false }, true, 4)).toEqual([])
    const twoP = {
      partyRoom: true,
      players: { X: { name: 'Ann', playerId: 'a', joinedAt: 1 }, O: { name: 'Bob', playerId: 'b', joinedAt: 2 } },
      queue: { c: { at: 3, joinedAt: 3, name: 'C' }, d: { at: 4, joinedAt: 4, name: 'D' }, e: { at: 5, joinedAt: 5, name: 'E' } },
    }
    expect(overCapMembers(twoP, false, 4)).toEqual(['e'])
  })

  it('partyFullFor: newcomers at the cap and over-cap members see PARTY FULL', () => {
    const g = lobby()
    expect(partyFullFor(g, true, 4, 'z')).toBe(false)
    g.players.d = { name: 'Di', playerId: 'd', joinedAt: 4 }
    expect(partyFullFor(g, true, 4, 'z')).toBe(true)
    expect(partyFullFor(g, true, 4, 'd')).toBe(false)
    g.players.e = { name: 'Ed', playerId: 'e', joinedAt: 5 }
    expect(partyFullFor(g, true, 4, 'e')).toBe(true)
    expect(partyFullFor({ ...g, partyRoom: false }, true, 4, 'z')).toBe(false)
  })
})

describe('partyInviteLine', () => {
  it('shows the head-count for party invites and the game for old ones', () => {
    expect(partyInviteLine({ kind: 'party', size: 2, cap: 4 })).toBe('PARTY · 2 / 4')
    expect(partyInviteLine({ kind: 'party' })).toBe('PARTY')
    expect(partyInviteLine({ gameType: 'connectfour' }, () => 'CONNECT FOUR')).toBe('CONNECT FOUR')
    expect(partyInviteLine({ gameType: 'zz' })).toBe('GAME')
    expect(partyInviteLine(null)).toBe('')
  })
})
