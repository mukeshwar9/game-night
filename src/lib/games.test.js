import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'

// games.js pulls in board components that touch `localStorage` at module
// load time (src/lib/sounds.js) — stub it before the dynamic import since
// this suite runs outside a DOM environment. See gameSearch.test.js.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let isNewGame, usesFirstMover, resolveGoesFirst, firstMoverUpdates, withFirstMover, GAME_TYPES, freshGameState, supportsLocalPlay
let lobbySwitchOverrides, buildChallengeRoom

beforeAll(async () => {
  ;({
    isNewGame, usesFirstMover, resolveGoesFirst, firstMoverUpdates, withFirstMover, GAME_TYPES, freshGameState, supportsLocalPlay,
    lobbySwitchOverrides, buildChallengeRoom,
  } = await import('./games'))
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

  it('folds nested first-mover paths into the fresh state (regression: NEW MATCH failed with "ancestor of another path")', () => {
    const hw = withFirstMover(freshGameState('hangwoman'), 'hangwoman', 'O')
    expect(hw.round.setter).toBe('O')
    expect(Object.keys(hw).some(k => k.startsWith('round/'))).toBe(false)
    const bluff = withFirstMover(freshGameState('bluff'), 'bluff', 'O')
    expect(bluff.bluffRound.turn).toBe('O')
    expect(Object.keys(bluff).some(k => k.includes('/'))).toBe(false)
    expect(withFirstMover(freshGameState('tictactoe'), 'tictactoe', 'O').currentTurn).toBe('O')
    expect(withFirstMover({ round: null }, 'hangwoman', 'X').round).toEqual({ setter: 'X' })
  })

  it('writes the right Firebase patch for each family', () => {
    expect(firstMoverUpdates('tictactoe', 'O')).toEqual({ currentTurn: 'O' })
    expect(firstMoverUpdates('hangwoman', 'O')).toEqual({ 'round/setter': 'O' })
    expect(firstMoverUpdates('twotruths', 'X')).toEqual({})
    expect(firstMoverUpdates('bluff', 'O')).toEqual({ 'bluffRound/turn': 'O' })
    expect(firstMoverUpdates('pong', 'O')).toEqual({})
  })
})

describe('supportsLocalPlay', () => {
  const LOCAL_TYPES = [
    'tictactoe', 'ultimatettt', 'tictactoe4', 'connectfour', 'connectfour5', 'connectfourpop',
    'dotsandboxes', 'dotsandboxes4', 'sos', 'gomoku', 'reversi', 'chainreaction', 'chainreaction6',
    'blockade', 'orderchaos', 'hex', 'mancala', 'simon', 'visualmemory', 'pairs', 'dice', 'dice-big',
    'sim', 'chomp', 'breakthrough', 'ataxx', 'kamisado',
    'onitama', 'quarto', 'santorini', 'loa', 'yavalath',
  ]

  it('is true for all 32 eligible registry-driven turn-based games', () => {
    expect(LOCAL_TYPES).toHaveLength(32)
    for (const type of LOCAL_TYPES) {
      expect(supportsLocalPlay(type), type).toBe(true)
    }
  })

  it('is false for custom (hidden-info/bespoke-state) games', () => {
    expect(supportsLocalPlay('checkers')).toBe(false)
    expect(supportsLocalPlay('hangwoman')).toBe(false)
    expect(supportsLocalPlay('battleship')).toBe(false)
  })

  it('is false for realtime games', () => {
    expect(supportsLocalPlay('pong')).toBe(false)
  })

  it('is false for simultaneous games', () => {
    expect(supportsLocalPlay('reaction')).toBe(false)
  })

  it('is false for nPlayer games', () => {
    expect(supportsLocalPlay('herd')).toBe(false)
  })

  it('is false for an unknown type', () => {
    expect(supportsLocalPlay('nonexistent')).toBe(false)
  })

  it('matches the exact 22-type registry predicate', () => {
    const derived = GAME_TYPES.filter(t => supportsLocalPlay(t.type)).map(t => t.type).sort()
    expect(derived).toEqual([...LOCAL_TYPES].sort())
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

describe('lobbySwitchOverrides', () => {
  it('forces status to waiting', () => {
    const out = lobbySwitchOverrides({ gameType: 'connectfour', status: 'playing' })
    expect(out.status).toBe('waiting')
  })

  it('removes chatLog and emote keys entirely (not nulled)', () => {
    const out = lobbySwitchOverrides({ gameType: 'connectfour', status: 'playing', chatLog: null, emote: null })
    expect('chatLog' in out).toBe(false)
    expect('emote' in out).toBe(false)
  })

  it('preserves other keys untouched', () => {
    const out = lobbySwitchOverrides({ gameType: 'connectfour', board: ['', ''], currentTurn: 'X', winner: null })
    expect(out.gameType).toBe('connectfour')
    expect(out.board).toEqual(['', ''])
    expect(out.currentTurn).toBe('X')
    expect(out.winner).toBe(null)
  })

  it('does not mutate its input', () => {
    const input = { status: 'playing', chatLog: null }
    const inputCopy = { ...input }
    lobbySwitchOverrides(input)
    expect(input).toEqual(inputCopy)
  })

  it('regression: a 2-seat switch-updates patch stays waiting, not playing', () => {
    // Mirrors what Game.jsx's buildSwitchUpdates produces once both seats are
    // filled (status: 'playing') — the bug this hook fixes is a waiting-room
    // switch with 2 seats insta-starting the round.
    const switchUpdates = {
      gameType: 'connectfour',
      ...freshGameState('connectfour'),
      winner: null,
      winningLine: null,
      proposal: null,
      lastActivityAt: Date.now(),
      players: { X: { name: 'A' }, O: { name: 'B' } },
      scores: { X: 0, O: 0 },
      status: 'playing',
    }
    const out = lobbySwitchOverrides(switchUpdates)
    expect(out.status).toBe('waiting')
  })
})

describe('buildChallengeRoom', () => {
  it('defaults to tictactoe', () => {
    const room = buildChallengeRoom({ name: 'A', avatar: 'a1', playerId: 'p1' })
    expect(room.gameType).toBe('tictactoe')
  })

  it('sets lobby:true and status:waiting', () => {
    const room = buildChallengeRoom({ name: 'A', avatar: 'a1', playerId: 'p1' })
    expect(room.lobby).toBe(true)
    expect(room.status).toBe('waiting')
  })

  it('builds players.X from the given identity', () => {
    const room = buildChallengeRoom({ name: 'A', avatar: 'a1', playerId: 'p1', now: 123 })
    expect(room.players).toEqual({ X: { name: 'A', joinedAt: 123, playerId: 'p1', avatar: 'a1' } })
  })

  it('scores start at zero-zero', () => {
    const room = buildChallengeRoom({ name: 'A', avatar: 'a1', playerId: 'p1' })
    expect(room.scores).toEqual({ X: 0, O: 0 })
  })

  it('spreads freshGameState fields for the chosen gameType', () => {
    const room = buildChallengeRoom({ name: 'A', avatar: 'a1', playerId: 'p1', gameType: 'connectfour' })
    const fresh = freshGameState('connectfour')
    expect(room.board).toEqual(fresh.board)
    expect(room.currentTurn).toEqual(fresh.currentTurn)
  })

  it('honors a gameType override', () => {
    const room = buildChallengeRoom({ name: 'A', avatar: 'a1', playerId: 'p1', gameType: 'sos' })
    expect(room.gameType).toBe('sos')
  })
})

describe('solo flag honesty', () => {
  // The VS AI / VS CPU row opens /solo/<type>; a registry type that claims
  // solo without a DEMOS entry dead-ends on "NO SOLO DEMO" (review rank 9).
  it('every solo:true game has a solo demo entry', () => {
    const demo = readFileSync(new URL('../pages/Demo.jsx', import.meta.url), 'utf8')
    const block = demo.slice(demo.indexOf('const DEMOS = ['))
    const demoTypes = new Set([...block.slice(0, block.indexOf('\n]')).matchAll(/type: '([^']+)'/g)].map(m => m[1]))
    const missing = GAME_TYPES.filter(t => t.solo === true && !demoTypes.has(t.type)).map(t => t.type)
    expect(missing).toEqual([])
  })
})
