import { describe, it, expect, beforeAll, vi } from 'vitest'

// The registry fields the room page (Game.jsx + these hooks) relies on.
// games.js pulls in modules that touch localStorage at load time
// (src/lib/sounds.js) — stub it before the dynamic import.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

const LAZY = Symbol.for('react.lazy')
let GAME_TYPES, getGameConfig, runPigSeedProtocol

beforeAll(async () => {
  ;({ GAME_TYPES, getGameConfig } = await import('../../lib/games'))
  ;({ runPigSeedProtocol } = await import('./pigSeedProtocol'))
})

describe('registry components are code-split', () => {
  it('gives every custom game a lazy Page', () => {
    for (const cfg of GAME_TYPES.filter(c => c.custom)) {
      expect(cfg.Page?.$$typeof, cfg.type).toBe(LAZY)
    }
  })

  it('gives every registry-board game a lazy BoardComponent', () => {
    for (const cfg of GAME_TYPES.filter(c => !c.custom)) {
      expect(cfg.BoardComponent?.$$typeof, cfg.type).toBe(LAZY)
    }
  })
})

describe('per-game room fields', () => {
  it('seeds rolls for both Pig variants only', () => {
    const seeded = GAME_TYPES.filter(c => c.rollFace).map(c => c.type).sort()
    expect(seeded).toEqual(['dice', 'dice-big'])
    for (const t of seeded) expect(getGameConfig(t).roomEffect).toBe(runPigSeedProtocol)
  })

  it('tracks Blockade moves by counter and tightens Chain Reaction', () => {
    expect(getGameConfig('blockade').moveCountKey).toBe('blockadeMoves')
    expect(GAME_TYPES.filter(c => c.compactLayout).map(c => c.type)).toEqual(['chainreaction'])
  })
})

describe('runPigSeedProtocol', () => {
  it('runs commit, contribute, reveal and derive in turn', async () => {
    const memoX = {}
    const memoO = {}
    const room = { status: 'playing', players: { X: {}, O: {} } }
    const writes = []
    const write = (patch) => { writes.push(patch); Object.assign(room, patch); return Promise.resolve() }

    runPigSeedProtocol({ game: { ...room }, gameId: 'G', mySymbol: 'X', memo: memoX, write })
    await vi.waitFor(() => expect(room.diceSeedCommitX).toBeTruthy())
    runPigSeedProtocol({ game: { ...room }, gameId: 'G', mySymbol: 'O', memo: memoO, write })
    await vi.waitFor(() => expect(room.diceSeedB).toBeTruthy())
    runPigSeedProtocol({ game: { ...room }, gameId: 'G', mySymbol: 'X', memo: memoX, write })
    await vi.waitFor(() => expect(room.diceSeedRevealX).toBe(memoX.seedA))
    runPigSeedProtocol({ game: { ...room }, gameId: 'G', mySymbol: 'X', memo: memoX, write })
    await vi.waitFor(() => expect(room.diceSeed).toBeTruthy())
    expect(writes.map(w => Object.keys(w)[0]))
      .toEqual(['diceSeedCommitX', 'diceSeedB', 'diceSeedRevealX', 'diceSeed'])
  })

  it('does nothing outside a live round or for spectators', () => {
    const write = vi.fn(() => Promise.resolve())
    runPigSeedProtocol({ game: { status: 'finished', players: { O: {} } }, gameId: 'G', mySymbol: 'X', memo: {}, write })
    runPigSeedProtocol({ game: { status: 'playing', players: { O: {} } }, gameId: 'G', mySymbol: null, memo: {}, write })
    expect(write).not.toHaveBeenCalled()
  })

  it('re-arms the coin flip once a reset clears the seed state', async () => {
    const memo = { coinFlipStarted: true }
    const write = vi.fn(() => Promise.resolve())
    runPigSeedProtocol({ game: { status: 'playing', players: { O: {} } }, gameId: 'G', mySymbol: 'X', memo, write })
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    expect(Object.keys(write.mock.calls[0][0])).toEqual(['diceSeedCommitX'])
  })
})
