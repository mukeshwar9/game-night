import { describe, it, expect } from 'vitest'
import {
  GRID_W, GRID_H, CELL_COUNT, BASE_SPEED, ENEMY_SLOW_MULT, MATCH_SECONDS, WARNING_AT,
  AI_DIFFICULTIES,
  createState, step, counts, getWinner, cellIndex,
  packGrid, unpackGrid, bytesToBase64, base64ToBytes,
  computeAI,
} from './paintLogic'

const DIRS = ['up', 'down', 'left', 'right']

function buildGrid(entries = {}) {
  const grid = new Uint8Array(CELL_COUNT)
  for (const [idx, v] of Object.entries(entries)) grid[idx] = v
  return grid
}

// Custom hand-built state (not via createState) so tests can place players
// at arbitrary positions/grid contents.
function baseState({ gridEntries, players, timeLeft, warned, ended } = {}) {
  return {
    grid: buildGrid(gridEntries),
    players: {
      X: { x: 2.5, y: 2.5, dir: 'right', speedCap: 1, ...(players?.X || {}) },
      O: { x: 17.5, y: 17.5, dir: 'left', speedCap: 1, ...(players?.O || {}) },
    },
    timeLeft: timeLeft ?? MATCH_SECONDS,
    warned: warned ?? false,
    ended: ended ?? false,
  }
}

function snapshotState(s) {
  return {
    grid: Array.from(s.grid),
    players: JSON.parse(JSON.stringify(s.players)),
    timeLeft: s.timeLeft,
    warned: s.warned,
    ended: s.ended,
  }
}

describe('createState', () => {
  it('seeds an all-neutral grid except the two pre-painted spawn cells', () => {
    const s = createState()
    const xSpawn = cellIndex(0.5, 0.5)
    const oSpawn = cellIndex(GRID_W - 0.5, GRID_H - 0.5)
    for (let i = 0; i < CELL_COUNT; i++) {
      if (i === xSpawn) expect(s.grid[i]).toBe(1)
      else if (i === oSpawn) expect(s.grid[i]).toBe(2)
      else expect(s.grid[i]).toBe(0)
    }
  })

  it('spawns players in opposite corners facing each other', () => {
    const s = createState()
    expect(s.players.X).toMatchObject({ x: 0.5, y: 0.5, dir: 'right' })
    expect(s.players.O).toMatchObject({ x: GRID_W - 0.5, y: GRID_H - 0.5, dir: 'left' })
  })

  it('starts the clock fresh', () => {
    const s = createState()
    expect(s.timeLeft).toBe(MATCH_SECONDS)
    expect(s.warned).toBe(false)
    expect(s.ended).toBe(false)
  })

  it('honors opts.speedCaps, defaulting to 1 for both sides', () => {
    const s = createState()
    expect(s.players.X.speedCap).toBe(1)
    expect(s.players.O.speedCap).toBe(1)
    const capped = createState({ speedCaps: { O: 0.8 } })
    expect(capped.players.O.speedCap).toBe(0.8)
    expect(capped.players.X.speedCap).toBe(1)
  })
})

describe('step — purity & movement', () => {
  it('does not mutate the input state', () => {
    const s = createState()
    const before = snapshotState(s)
    step(s, { X: 'up', O: 'down' }, 0.05)
    expect(snapshotState(s)).toEqual(before)
  })

  it('fires no events for a step that does not cross a cell boundary', () => {
    const s = baseState({ players: { X: { x: 2.5, y: 2.5, dir: 'right' } } })
    const { events } = step(s, {}, 0.001)
    expect(events).toEqual([])
  })

  it('crossing into a fresh neutral cell paints it, with no steal', () => {
    const s = baseState({ players: { X: { x: 2.9, y: 2.5, dir: 'right' }, O: { speedCap: 0 } } })
    const oldIdx = cellIndex(2.9, 2.5)
    const { state, events } = step(s, {}, 1)
    expect(state.grid[oldIdx]).toBe(1)
    expect(events).toEqual([{ type: 'cellPainted', by: 'X', index: oldIdx }])
  })

  it('crossing into the other player\'s paint fires cellPainted + cellStolen', () => {
    const oldIdx = cellIndex(2.9, 2.5)
    const s = baseState({
      gridEntries: { [oldIdx]: 2 },
      players: { X: { x: 2.9, y: 2.5, dir: 'right' }, O: { speedCap: 0 } },
    })
    const { state, events } = step(s, {}, 1)
    expect(state.grid[oldIdx]).toBe(1)
    expect(events).toEqual([
      { type: 'cellPainted', by: 'X', index: oldIdx },
      { type: 'cellStolen', by: 'X', index: oldIdx, from: 'O' },
    ])
  })

  it('crossing back into a cell the mover already owns fires nothing', () => {
    const oldIdx = cellIndex(2.9, 2.5)
    const s = baseState({
      gridEntries: { [oldIdx]: 1 },
      players: { X: { x: 2.9, y: 2.5, dir: 'right' }, O: { speedCap: 0 } },
    })
    const { events } = step(s, {}, 1)
    expect(events).toEqual([])
  })

  it('accepts a 180° reversal with no special handling', () => {
    const s = baseState({ players: { X: { x: 2.5, y: 2.5, dir: 'right' } } })
    const { state } = step(s, { X: 'left' }, 0.1)
    expect(state.players.X.dir).toBe('left')
    expect(state.players.X.x).toBeLessThan(2.5)
  })

  it('processes X before O within a step — deterministic contested-cell outcome', () => {
    // Both players start inside the SAME cell (legal — there's no collision).
    const shared = cellIndex(5.1, 5.1)
    expect(cellIndex(5.9, 5.9)).toBe(shared)
    const s = baseState({
      players: {
        X: { x: 5.1, y: 5.1, dir: 'right' },
        O: { x: 5.9, y: 5.9, dir: 'down' },
      },
    })
    const { state, events } = step(s, {}, 1)

    // X is processed first and paints the shared cell...
    expect(events[0]).toEqual({ type: 'cellPainted', by: 'X', index: shared })
    // ...then O, reading the ALREADY-repainted grid, is slowed leaving it,
    // and its own exit overwrites the cell back to O (host-order steal).
    expect(events).toContainEqual({ type: 'cellStolen', by: 'O', index: shared, from: 'X' })
    expect(state.grid[shared]).toBe(2)

    // O only covered ENEMY_SLOW_MULT × the distance X covered this step,
    // proving O's speed check saw the grid AFTER X's mutation.
    const xDist = state.players.X.x - 5.1
    const oDist = state.players.O.y - 5.9
    expect(oDist).toBeCloseTo(xDist * ENEMY_SLOW_MULT)
  })
})

describe('step — speed modifier', () => {
  it('slows a mover standing on unvacated enemy paint to ENEMY_SLOW_MULT', () => {
    const start = { x: 5.1, y: 5.1 }
    const idx = cellIndex(start.x, start.y)
    const slow = step(baseState({ gridEntries: { [idx]: 2 }, players: { X: { ...start, dir: 'right' } } }), {}, 0.1).state
    const fast = step(baseState({ players: { X: { ...start, dir: 'right' } } }), {}, 0.1).state
    const slowDist = slow.players.X.x - start.x
    const fastDist = fast.players.X.x - start.x
    expect(slowDist).toBeCloseTo(fastDist * ENEMY_SLOW_MULT)
  })

  it('uses the pre-crossing (fast) multiplier on the step that first enters a fresh enemy cell', () => {
    const idx = cellIndex(2.99, 2.5)
    const nextIdx = cellIndex(3.01, 2.5)
    expect(nextIdx).not.toBe(idx)
    const s = baseState({ gridEntries: { [nextIdx]: 2 }, players: { X: { x: 2.99, y: 2.5, dir: 'right' } } })
    const { state } = step(s, {}, 0.02)
    // Moved the FULL (unslowed) distance even though it ends inside enemy territory.
    expect(state.players.X.x - 2.99).toBeCloseTo(BASE_SPEED * 0.02)
  })

  it('multiplies speedCap on top of the slow-zone multiplier', () => {
    const start = { x: 5.1, y: 5.1 }
    const idx = cellIndex(start.x, start.y)
    const s = baseState({ gridEntries: { [idx]: 2 }, players: { X: { ...start, dir: 'right', speedCap: 0.5 } } })
    const { state } = step(s, {}, 0.1)
    const dist = state.players.X.x - start.x
    expect(dist).toBeCloseTo(BASE_SPEED * ENEMY_SLOW_MULT * 0.5 * 0.1)
  })
})

describe('step — timer', () => {
  it('decrements timeLeft by dt each step while running', () => {
    const s = createState()
    const { state } = step(s, {}, 0.5)
    expect(state.timeLeft).toBeCloseTo(MATCH_SECONDS - 0.5)
  })

  it('fires warning10s exactly once, the first step timeLeft crosses <= WARNING_AT', () => {
    const s = { ...createState(), timeLeft: WARNING_AT + 0.05 }
    const r1 = step(s, {}, 0.1)
    expect(r1.events.some(e => e.type === 'warning10s')).toBe(true)
    expect(r1.state.warned).toBe(true)
    const r2 = step(r1.state, {}, 0.1)
    expect(r2.events.some(e => e.type === 'warning10s')).toBe(false)
  })

  it('fires timeUp exactly once; ended freezes timeLeft at 0 on later steps', () => {
    const s = { ...createState(), timeLeft: 0.05 }
    const r1 = step(s, {}, 0.1)
    expect(r1.state.timeLeft).toBe(0)
    expect(r1.state.ended).toBe(true)
    expect(r1.events.some(e => e.type === 'timeUp')).toBe(true)
    const r2 = step(r1.state, {}, 0.1)
    expect(r2.state.timeLeft).toBe(0)
    expect(r2.events.some(e => e.type === 'timeUp')).toBe(false)
  })

  it('freezes grid and players (not just timeLeft) on a step() call after ended', () => {
    // A fixed-timestep accumulator (e.g. useRealtimeHost's `while (acc >=
    // DT)` loop) can invoke step() again in the same frame that crosses
    // timeLeft <= 0 — nothing about the round should move after that.
    const s = baseState({
      timeLeft: 0.05,
      players: { X: { x: 5.5, y: 5.5, dir: 'right' }, O: { x: 15.5, y: 15.5, dir: 'left' } },
    })
    const r1 = step(s, { X: 'right', O: 'left' }, 0.1)
    expect(r1.state.ended).toBe(true)
    const r2 = step(r1.state, { X: 'right', O: 'left' }, 0.1)
    expect(r2.events).toEqual([])
    expect(Array.from(r2.state.grid)).toEqual(Array.from(r1.state.grid))
    expect(r2.state.players).toEqual(r1.state.players)
    expect(r2.state.timeLeft).toBe(r1.state.timeLeft)
  })

  it('force-paints each player\'s un-vacated cell at time-up', () => {
    const idxX = cellIndex(5.5, 5.5)
    const idxO = cellIndex(15.5, 15.5)
    // dt is tiny so movement this step can't cross a cell boundary — both
    // players are still standing in idxX/idxO when the clock hits zero.
    const s = baseState({
      timeLeft: 0.001,
      gridEntries: { [idxO]: 1 }, // O is standing on X's paint, never painted for O
      players: {
        X: { x: 5.5, y: 5.5, dir: 'right' },
        O: { x: 15.5, y: 15.5, dir: 'left' },
      },
    })
    const { state, events } = step(s, {}, 0.001)
    expect(state.ended).toBe(true)
    expect(state.grid[idxX]).toBe(1)
    expect(state.grid[idxO]).toBe(2)
    expect(events).toContainEqual({ type: 'cellPainted', by: 'X', index: idxX })
    expect(events).toContainEqual({ type: 'cellPainted', by: 'O', index: idxO })
    expect(events).toContainEqual({ type: 'cellStolen', by: 'O', index: idxO, from: 'X' })
    expect(events[events.length - 1]).toEqual({ type: 'timeUp' })
  })
})

describe('counts / invariants', () => {
  it('sums to exactly CELL_COUNT for a hand-built mixed grid', () => {
    const grid = buildGrid({ 0: 1, 1: 1, 2: 2, 3: 2, 4: 2 })
    const c = counts(grid)
    expect(c.X + c.O + c.neutral).toBe(CELL_COUNT)
    expect(c).toEqual({ X: 2, O: 3, neutral: CELL_COUNT - 5 })
  })

  it('accepts a raw grid array directly, same result as a full state object', () => {
    const s = createState()
    expect(counts(s)).toEqual(counts(s.grid))
  })

  it('total painted cells is monotonically non-decreasing and never exceeds CELL_COUNT', () => {
    let s = createState()
    let prevPainted = counts(s).X + counts(s).O
    for (let i = 0; i < 200; i++) {
      const inputs = { X: DIRS[i % 4], O: DIRS[(i + 2) % 4] }
      s = step(s, inputs, 1 / 30).state
      const painted = counts(s).X + counts(s).O
      expect(painted).toBeGreaterThanOrEqual(prevPainted)
      expect(painted).toBeLessThanOrEqual(CELL_COUNT)
      prevPainted = painted
    }
  })
})

describe('getWinner', () => {
  it('is null while the round has not ended, regardless of current counts', () => {
    const s = { ...createState(), grid: buildGrid({ 0: 1, 1: 1, 2: 1 }) }
    expect(getWinner(s)).toBeNull()
  })

  it('returns the side with strictly more painted cells once ended', () => {
    expect(getWinner({ grid: buildGrid({ 0: 1, 1: 1, 2: 2 }), ended: true })).toBe('X')
    expect(getWinner({ grid: buildGrid({ 0: 1, 1: 2, 2: 2 }), ended: true })).toBe('O')
  })

  it('draws on an exact tie', () => {
    expect(getWinner({ grid: buildGrid({ 0: 1, 1: 2 }), ended: true })).toBe('draw')
  })
})

describe('determinism', () => {
  it('replays bit-identical grids/positions from an identical input script', () => {
    const script = []
    for (let i = 0; i < 300; i++) {
      script.push({ X: DIRS[(i * 3) % 4], O: DIRS[(i * 5 + 1) % 4] })
    }
    const run = () => {
      let s = createState()
      for (const inputs of script) s = step(s, inputs, 1 / 45).state
      return s
    }
    const a = run()
    const b = run()
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid))
    expect(a.players).toEqual(b.players)
    expect(a.timeLeft).toBe(b.timeLeft)
  })
})

describe('packGrid / unpackGrid', () => {
  it('round-trips an all-neutral, all-X, all-O, and random mixed grid', () => {
    const mixed = new Uint8Array(CELL_COUNT)
    for (let i = 0; i < CELL_COUNT; i++) mixed[i] = i % 3
    const cases = [
      new Uint8Array(CELL_COUNT),
      new Uint8Array(CELL_COUNT).fill(1),
      new Uint8Array(CELL_COUNT).fill(2),
      mixed,
    ]
    for (const grid of cases) {
      expect(Array.from(unpackGrid(packGrid(grid)))).toEqual(Array.from(grid))
    }
  })

  it('packs a hand-picked 4-cell pattern to the exact expected byte (regression guard)', () => {
    const grid = new Uint8Array(CELL_COUNT)
    grid[0] = 1; grid[1] = 2; grid[2] = 0; grid[3] = 1
    const packed = packGrid(grid)
    // 1 | (2<<2) | (0<<4) | (1<<6) = 1 | 8 | 0 | 64 = 73
    expect(packed[0]).toBe(73)
  })
})

describe('bytesToBase64 / base64ToBytes', () => {
  it('round-trips a 100-byte packed grid; base64 length matches the padded formula', () => {
    const packed = packGrid(createState().grid)
    expect(packed.length).toBe(100)
    const b64 = bytesToBase64(packed)
    expect(b64.length).toBe(136) // 4 * ceil(100/3)
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(packed))
  })
})

describe('computeAI', () => {
  it('always returns a valid direction, including degenerate boards', () => {
    const neutral = createState()
    const allOwn = { ...createState(), grid: new Uint8Array(CELL_COUNT).fill(2) }
    const allEnemy = { ...createState(), grid: new Uint8Array(CELL_COUNT).fill(1) }
    const split = (() => {
      const grid = new Uint8Array(CELL_COUNT)
      for (let i = 0; i < CELL_COUNT; i++) grid[i] = i < CELL_COUNT / 2 ? 1 : 2
      return { ...createState(), grid }
    })()
    for (const s of [neutral, allOwn, allEnemy, split]) {
      const d = computeAI(s, 'O')
      expect(DIRS).toContain(d)
    }
  })

  it('falls back to "normal" for an unrecognized difficulty without throwing', () => {
    const s = createState()
    expect(() => computeAI(s, 'O', 'bogus')).not.toThrow()
    expect(DIRS).toContain(computeAI(s, 'O', 'bogus'))
  })

  it('never drives the bot off-grid or to NaN over 1000 steps', () => {
    let s = createState()
    for (let i = 0; i < 1000; i++) {
      const dir = computeAI(s, 'O')
      expect(DIRS).toContain(dir)
      s = step(s, { O: dir }, 1 / 30).state
      expect(Number.isNaN(s.players.O.x)).toBe(false)
      expect(Number.isNaN(s.players.O.y)).toBe(false)
      expect(s.players.O.x).toBeGreaterThanOrEqual(0)
      expect(s.players.O.x).toBeLessThan(GRID_W)
      expect(s.players.O.y).toBeGreaterThanOrEqual(0)
      expect(s.players.O.y).toBeLessThan(GRID_H)
    }
  })

  it('final-10s steal mode routes toward the largest contiguous enemy region, not the nearest scrap', () => {
    const grid = new Uint8Array(CELL_COUNT)
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) grid[cellIndex(x, y)] = 1 // big 6x6 X block, top-left
    }
    grid[cellIndex(19, 0)] = 1 // a lone scrap far to the right of O
    const s = {
      grid,
      players: { X: { x: 0.5, y: 0.5, dir: 'right', speedCap: 1 }, O: { x: 10.5, y: 0.5, dir: 'left', speedCap: 1 } },
      timeLeft: 5, warned: true, ended: false,
    }
    expect(computeAI(s, 'O')).toBe('left')
  })
})

describe('cellIndex', () => {
  it('maps boundary coordinates correctly', () => {
    expect(cellIndex(0, 0)).toBe(0)
    expect(cellIndex(GRID_W - 1e-6, 0)).toBe(GRID_W - 1)
    expect(cellIndex(0, GRID_H - 1e-6)).toBe((GRID_H - 1) * GRID_W)
  })

  it('clamps out-of-range/negative inputs into a valid index', () => {
    expect(cellIndex(-5, -5)).toBe(0)
    expect(cellIndex(GRID_W + 10, GRID_H + 10)).toBe((GRID_H - 1) * GRID_W + (GRID_W - 1))
  })
})

describe('AI_DIFFICULTIES', () => {
  it('escalates reaction speed and speed cap from easy to hard', () => {
    expect(AI_DIFFICULTIES.easy.replanMs).toBeGreaterThan(AI_DIFFICULTIES.normal.replanMs)
    expect(AI_DIFFICULTIES.normal.replanMs).toBeGreaterThan(AI_DIFFICULTIES.hard.replanMs)
    expect(AI_DIFFICULTIES.easy.speedCap).toBeLessThan(AI_DIFFICULTIES.hard.speedCap)
  })
})
