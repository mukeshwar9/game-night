import { describe, it, expect, beforeAll } from 'vitest'

// games.js pulls in board components that touch `localStorage` at module
// load time (src/lib/sounds.js) — stub it before the dynamic import since
// this suite runs outside a DOM environment. See gameSearch.test.js.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let isNewGame, usesFirstMover, resolveGoesFirst, firstMoverUpdates, GAME_TYPES, freshGameState

beforeAll(async () => {
  ;({ isNewGame, usesFirstMover, resolveGoesFirst, firstMoverUpdates, GAME_TYPES, freshGameState } = await import('./games'))
})

describe('isNewGame', () => {
  it('is false when addedAt is absent', () => {
    expect(isNewGame({})).toBe(false)
  })

  it('is true within the 14-day window', () => {
    const now = new Date('2026-07-11')
    expect(isNewGame({ addedAt: '2026-07-04' }, now)).toBe(true)
  })

  it('is false once past the 14-day window', () => {
    const now = new Date('2026-07-11')
    expect(isNewGame({ addedAt: '2026-06-20' }, now)).toBe(false)
  })
})

describe('first mover', () => {
  it('covers every 2P turn-based game and skips the rest', () => {
    for (const t of GAME_TYPES) {
      const expected = !t.nPlayer && !t.realtime && !t.simultaneous
      expect(usesFirstMover(t.type), t.type).toBe(expected)
    }
  })

  it('skips simultaneous, realtime, and party games', () => {
    expect(usesFirstMover('pong')).toBe(false)
    expect(usesFirstMover('pacmac')).toBe(false)
    expect(usesFirstMover('reaction')).toBe(false)
    expect(usesFirstMover('wordduel')).toBe(false)
    expect(usesFirstMover('wavelength')).toBe(false)
  })

  it('resolves X, O, and random to a seat', () => {
    expect(resolveGoesFirst('X')).toBe('X')
    expect(resolveGoesFirst('O')).toBe('O')
    expect(resolveGoesFirst(undefined)).toBe('X')
    expect(['X', 'O']).toContain(resolveGoesFirst('random'))
  })

  it('writes the right Firebase patch for each family', () => {
    expect(firstMoverUpdates('tictactoe', 'O')).toEqual({ currentTurn: 'O' })
    expect(firstMoverUpdates('hangwoman', 'O')).toEqual({ 'round/setter': 'O' })
    expect(firstMoverUpdates('twotruths', 'X')).toEqual({ 'round/setter': 'X' })
    expect(firstMoverUpdates('bluff', 'O')).toEqual({ 'bluffRound/turn': 'O' })
    expect(firstMoverUpdates('pong', 'O')).toEqual({})
  })
})

describe('freshGameState board sizes', () => {
  it('dots and boxes 6×6 vs 4×4', () => {
    const large = freshGameState('dotsandboxes')
    const compact = freshGameState('dotsandboxes4')
    expect(large.board).toHaveLength(84)
    expect(large.boxes).toHaveLength(36)
    expect(compact.board).toHaveLength(40)
    expect(compact.boxes).toHaveLength(16)
  })

  it('chain reaction 8×10 vs 6×8', () => {
    expect(freshGameState('chainreaction').board).toHaveLength(80)
    expect(freshGameState('chainreaction6').board).toHaveLength(48)
  })
})
