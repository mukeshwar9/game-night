import { describe, it, expect, beforeAll } from 'vitest'

// games.js pulls in components that touch localStorage at load (see games.test.js).
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

import { COUNT_OPTIONS, localPlayerRange, parseCount, gamesForCount, countsByTile } from './onePhoneLogic'

describe('localPlayerRange', () => {
  it('is exactly two for a turn-based board', () => {
    expect(localPlayerRange({ type: 'x' })).toEqual({ min: 2, max: 2 })
  })
  it('uses the lobby minimum and localMaxPlayers for a party game', () => {
    expect(localPlayerRange({ nPlayer: true, minPlayers: 2, maxPlayers: 8, localMaxPlayers: 4 })).toEqual({ min: 2, max: 4 })
  })
  it('falls back to maxPlayers when no local cap is set', () => {
    expect(localPlayerRange({ nPlayer: true, minPlayers: 2, maxPlayers: 4 })).toEqual({ min: 2, max: 4 })
  })
  it('never starts below two, and a bigger minimum is kept', () => {
    expect(localPlayerRange({ nPlayer: true, minPlayers: 1, maxPlayers: 4 }).min).toBe(2)
    expect(localPlayerRange({ nPlayer: true, minPlayers: 3, maxPlayers: 8, localMaxPlayers: 6 })).toEqual({ min: 3, max: 6 })
  })
  it('lets a realtime arena with a local cap exceed two', () => {
    expect(localPlayerRange({ realtime: true, localMaxPlayers: 4 })).toEqual({ min: 2, max: 4 })
  })
})

describe('parseCount', () => {
  it('accepts the tile counts only', () => {
    expect(parseCount('2')).toBe(2)
    expect(parseCount('5')).toBe(5)
    expect(parseCount('1')).toBeNull()
    expect(parseCount('9')).toBeNull()
    expect(parseCount(null)).toBeNull()
    expect(parseCount('abc')).toBeNull()
  })
})

describe('gamesForCount', () => {
  const games = [
    { type: 'a' },
    { type: 'b', nPlayer: true, minPlayers: 2, maxPlayers: 4 },
    { type: 'c', nPlayer: true, minPlayers: 3, maxPlayers: 8, localMaxPlayers: 5 },
    { type: 'd', nPlayer: true, minPlayers: 2, maxPlayers: 8 },
  ]
  const canLocal = t => t !== 'd'
  it('keeps order and drops games with no one-phone mode', () => {
    expect(gamesForCount(games, 2, canLocal).map(g => g.type)).toEqual(['a', 'b'])
  })
  it('filters by the head count', () => {
    expect(gamesForCount(games, 3, canLocal).map(g => g.type)).toEqual(['b', 'c'])
    expect(gamesForCount(games, 5, canLocal).map(g => g.type)).toEqual(['c'])
  })
  it('counts every tile', () => {
    expect(countsByTile(games, canLocal)).toEqual({ 2: 2, 3: 2, 4: 2, 5: 1 })
  })
})

describe('against the real registry', () => {
  let GAME_TYPES, supportsLocalPlay
  beforeAll(async () => { ({ GAME_TYPES, supportsLocalPlay } = await import('./games')) })

  it('every one-phone game appears under at least one tile', () => {
    const shown = new Set()
    for (const o of COUNT_OPTIONS) gamesForCount(GAME_TYPES, o.n, supportsLocalPlay).forEach(g => shown.add(g.type))
    const eligible = GAME_TYPES.filter(g => supportsLocalPlay(g.type)).filter(g => localPlayerRange(g).min <= 5)
    for (const g of eligible) expect(shown.has(g.type), g.type).toBe(true)
  })
  it('the 2-player tile lists every eligible two-player game', () => {
    const two = gamesForCount(GAME_TYPES, 2, supportsLocalPlay)
    expect(two.length).toBeGreaterThan(20)
    expect(two.every(g => supportsLocalPlay(g.type))).toBe(true)
  })
})
