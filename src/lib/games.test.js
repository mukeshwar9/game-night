import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { OFF_SHELF } from '../pages/demos/partyBlurbs'

// games.js pulls in board components that touch `localStorage` at module
// load time (src/lib/sounds.js) — stub it before the dynamic import since
// this suite runs outside a DOM environment. See gameSearch.test.js.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let isNewGame, getNewGames, usesFirstMover, resolveGoesFirst, firstMoverUpdates, withFirstMover, GAME_TYPES, freshGameState, supportsLocalPlay
let lobbySwitchOverrides, buildChallengeRoom, isQuietRoom, getGameConfig, resultMarginFor

beforeAll(async () => {
  ;({
    isNewGame, getNewGames, usesFirstMover, resolveGoesFirst, firstMoverUpdates, withFirstMover, GAME_TYPES, freshGameState, supportsLocalPlay,
    lobbySwitchOverrides, buildChallengeRoom, isQuietRoom, getGameConfig, resultMarginFor,
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

describe('getNewGames', () => {
  const now = new Date('2026-07-11')
  it('keeps base entries inside the window, newest first, registry order on ties', () => {
    const entries = [
      { type: 'a', addedAt: '2026-07-04' },
      { type: 'b' },
      { type: 'c', addedAt: '2026-07-10' },
      { type: 'd', addedAt: '2026-07-04' },
      { type: 'e', addedAt: '2026-06-01' },
      { type: 'v', addedAt: '2026-07-10', variantOf: 'c' },
    ]
    expect(getNewGames(entries, now).map(e => e.type)).toEqual(['c', 'a', 'd'])
  })

  it('is empty when nothing is new', () => {
    expect(getNewGames([{ type: 'x', addedAt: '2026-01-01' }], now)).toEqual([])
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

  it('a rematch or a switch drops the arrival countdown stamp and the "someone opened your link" signals', () => {
    for (const type of ['tictactoe', 'connectfour', 'hangwoman']) {
      const fresh = freshGameState(type)
      expect(fresh).toHaveProperty('startsAt', null)
      expect(fresh).toHaveProperty('arriving', null)
    }
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
    'animalstack', // custom, but ships its own 2-4P LocalPage
    'stickyfingers', // real-time duel online; its LocalPage seats 2-4 on one phone
    'bamboozle', // 2-8P race, but ships its own 2-4P one-phone LocalPage
    'archery', // custom range with its own same-device LocalPage
    'tictactoe', 'ultimatettt', 'tictactoe4', 'connectfour', 'connectfour5', 'connectfourpop',
    'dotsandboxes', 'dotsandboxes4', 'sos', 'gomoku', 'gomokuswap', 'reversi', 'chainreaction', 'chainreaction6',
    'blockade', 'orderchaos', 'hex', 'mancala', 'simon', 'pairs', 'pairs4', 'dice', 'dice-big',
    'sim', 'chomp', 'breakthrough', 'ataxx', 'kamisado',
    'onitama', 'quarto', 'santorini', 'loa', 'yavalath',
    // custom, but ships its own offline page (registry LocalPage)
    'minigolf', 'darts', 'lazysusan',
    // realtime online duel whose LocalPage seats 2-4 people on one phone
    'fenderbender',
    // custom online duel that keeps its turn-based board for pass-and-play (localBoard)
    'visualmemory',
  ]

  it('is true for all 42 eligible games (33 registry boards + eight custom LocalPages + one localBoard)', () => {
    expect(LOCAL_TYPES).toHaveLength(42)
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

  it('is true for a custom nPlayer game with its own LocalPage', () => {
    expect(supportsLocalPlay('minigolf')).toBe(true)
  })

  it('is false for an unknown type', () => {
    expect(supportsLocalPlay('nonexistent')).toBe(false)
  })

  it('matches the exact registry predicate', () => {
    const derived = GAME_TYPES.filter(t => supportsLocalPlay(t.type)).map(t => t.type).sort()
    expect(derived).toEqual([...LOCAL_TYPES].sort())
  })
})

describe('freshGameState: Arrows difficulty', () => {
  it('carries the host difficulty into the next round and leaves new rooms unset', () => {
    expect(freshGameState('arrows').arrowsDifficulty).toBeNull()
    const next = freshGameState('arrows', { gameType: 'arrows', arrowsRound: 0, arrowsDifficulty: 'hard', scores: { X: 1, O: 0 } })
    expect(next).toMatchObject({ arrowsRound: 1, arrowsDifficulty: 'hard', arrowsStartedAt: null })
  })

  it('a switch from another game starts at round 0 with no difficulty', () => {
    const fresh = freshGameState('arrows', { gameType: 'pong', arrowsRound: 1, arrowsDifficulty: 'hard', scores: {} })
    expect(fresh).toMatchObject({ arrowsRound: 0, arrowsDifficulty: null })
  })

  it('switching away clears the difficulty', () => {
    expect(freshGameState('tictactoe').arrowsDifficulty).toBeNull()
  })
})

describe('freshGameState board sizes', () => {
  it('initializes both Archery room modes and party seats', () => {
    const duel = freshGameState('archery')
    expect(duel).toMatchObject({ currentTurn: 'X', archeryFormat: 'standard', archeryPhase: 'main' })
    expect(typeof duel.archerySeed).toBe('number')
    const party = freshGameState('archery4')
    expect(party).toMatchObject({ currentTurn: null, archeryFormat: 'standard' })
    expect(GAME_TYPES.find(type => type.type === 'archery').waitForStart).toBe(true)
    expect(GAME_TYPES.find(type => type.type === 'archery4').startRound({
      alice: { playerId: 'alice', joinedAt: 1 }, bob: { playerId: 'bob', joinedAt: 2 },
    }, { archeryFormat: 'quick' })).toMatchObject({
      currentTurn: 'X', archerySeatUids: { X: 'alice', O: 'bob' }, archeryFormat: 'quick', archeryPhase: 'main',
    })
  })
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

  it('removes chatLog, emote and emotes keys entirely (not nulled)', () => {
    const out = lobbySwitchOverrides({ gameType: 'connectfour', status: 'playing', chatLog: null, emote: null, emotes: null })
    expect('chatLog' in out).toBe(false)
    expect('emote' in out).toBe(false)
    expect('emotes' in out).toBe(false)
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

  // The other direction (word games audit X5): a solo-shelf tile for a game
  // the registry calls solo: false was either a dead party tile (TWO TRUTHS
  // 2+ PLAYERS) or a demo the Games sheet would not offer (PASS WORD).
  it('every solo-shelf tile is a solo:true game', () => {
    const demo = readFileSync(new URL('../pages/Demo.jsx', import.meta.url), 'utf8')
    const block = demo.slice(demo.indexOf('const DEMOS = ['))
    const demoTypes = [...block.slice(0, block.indexOf('\n]')).matchAll(/type: '([^']+)'/g)].map(m => m[1])
    const onShelfButNotSolo = demoTypes
      .filter(type => !OFF_SHELF.has(type))
      .filter(type => GAME_TYPES.find(t => t.type === type)?.solo !== true)
    expect(onShelfButNotSolo).toEqual([])
  })
})

describe('isQuietRoom', () => {
  it('reads a flag or a function of the room', () => {
    expect(isQuietRoom(getGameConfig('hunch'), {})).toBe(true)
    expect(isQuietRoom(getGameConfig('tictactoe'), {})).toBe(false)
  })

  it('hides Converge chat only while words are written (audit: chat-agreed words farmed stars)', () => {
    const cfg = getGameConfig('converge')
    expect(isQuietRoom(cfg, { status: 'playing', round: { phase: 'write' } })).toBe(true)
    expect(isQuietRoom(cfg, { status: 'playing', round: { phase: 'chainEnd' } })).toBe(false)
    expect(isQuietRoom(cfg, { status: 'waiting' })).toBe(false)
  })

  it('hides Just One chat from the clues to the guess (audit X8)', () => {
    const cfg = getGameConfig('justone')
    for (const phase of ['clues', 'compare', 'guess', 'judging']) {
      expect(isQuietRoom(cfg, { status: 'playing', round: { phase } }), phase).toBe(true)
    }
    for (const phase of ['dealing', 'result', 'over']) {
      expect(isQuietRoom(cfg, { status: 'playing', round: { phase } }), phase).toBe(false)
    }
  })
})

describe('isKnownGameType', () => {
  it('knows every registry type and nothing else', async () => {
    const { isKnownGameType } = await import('./games')
    for (const t of GAME_TYPES) expect(isKnownGameType(t.type), t.type).toBe(true)
    expect(isKnownGameType('nope')).toBe(false)
    expect(isKnownGameType('')).toBe(false)
    expect(isKnownGameType(undefined)).toBe(false)
  })

  it('getGameConfig still falls back, which is why the room shell checks first', async () => {
    const { getGameConfig } = await import('./games')
    expect(getGameConfig('nope').type).toBe(GAME_TYPES[0].type)
  })
})

describe('party lobby', () => {
  it('resolves through getGameConfig and isKnownGameType, outside the catalogue', async () => {
    const { getGameConfig, isKnownGameType, PARTY_LOBBY } = await import('./games')
    expect(getGameConfig('party')).toBe(PARTY_LOBBY)
    expect(PARTY_LOBBY).toMatchObject({ nPlayer: true, minPlayers: 1, maxPlayers: 4 })
    expect(isKnownGameType('party')).toBe(true)
    expect(GAME_TYPES.some(t => t.type === 'party')).toBe(false)
  })

  it('buildPartyRoom: the creator alone in the lobby, hosting, capped at 4', async () => {
    const { buildPartyRoom } = await import('./games')
    const room = buildPartyRoom({ name: 'Ann', avatar: 'K1x', playerId: 'a', now: 5 })
    expect(room).toMatchObject({
      gameType: 'party', status: 'waiting', partyRoom: true, partyCap: 4, hostUid: 'a', lobby: true,
      players: { a: { name: 'Ann', playerId: 'a', joinedAt: 5, online: true, avatar: 'K1x' } },
    })
    expect(Object.keys(room.players)).toEqual(['a'])
  })
})

describe('resultMarginFor (registry resultMargin hook)', () => {
  it('reads Dots & Boxes boxes from the viewer\'s seat, on both board sizes', () => {
    const boxes = Array(36).fill('')
    for (let i = 0; i < 19; i++) boxes[i] = 'X'
    for (let i = 19; i < 36; i++) boxes[i] = 'O'
    expect(resultMarginFor({ gameType: 'dotsandboxes', boxes }, 'O')).toEqual({ mine: 17, theirs: 19, total: 36, unit: ['box', 'boxes'] })
    const small = Array(16).fill('')
    for (let i = 0; i < 9; i++) small[i] = 'X'
    expect(resultMarginFor({ gameType: 'dotsandboxes4', boxes: small }, 'O')).toEqual({ mine: 0, theirs: 9, total: 16, unit: ['box', 'boxes'] })
  })

  it('reads SOS sequences', () => {
    const sosLines = [{ cells: [0, 1, 2], by: 'X' }, { cells: [7, 8, 9], by: 'X' }, { cells: [14, 15, 16], by: 'O' }]
    expect(resultMarginFor({ gameType: 'sos', sosLines }, 'O')).toMatchObject({ mine: 1, theirs: 2 })
  })

  it('is null when the game has no hook, the viewer is a spectator, or there is no game', () => {
    expect(resultMarginFor({ gameType: 'tictactoe' }, 'X')).toBeNull()
    expect(resultMarginFor({ gameType: 'sos', sosLines: [] }, null)).toBeNull()
    expect(resultMarginFor(null, 'X')).toBeNull()
  })
})
