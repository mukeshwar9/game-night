import { describe, it, expect } from 'vitest'
import {
  createState, step, getWinner, computeAI, advanceActor,
  isWall, cellIndex, packPellets, unpackPellets,
  MAZE_W, MAZE_H, MAZE_ROWS, SPEED, PELLET_PTS, POWER_PTS,
  START_PELLETS, HIT_DIST,
} from './pacmacLogic'

const DT = 1 / 120

function run(state, inputs, seconds) {
  let s = state
  let events = []
  const steps = Math.ceil(seconds / DT)
  for (let i = 0; i < steps; i++) {
    const res = step(s, inputs, DT)
    s = res.state
    if (res.events.length) events = events.concat(res.events)
    if (s.ended) break
  }
  return { state: s, events }
}

describe('maze', () => {
  it('is 19×19 with matching row widths', () => {
    expect(MAZE_ROWS).toHaveLength(MAZE_H)
    expect(MAZE_W).toBe(19)
    expect(MAZE_H).toBe(19)
    for (const row of MAZE_ROWS) expect(row).toHaveLength(MAZE_W)
  })

  it('blocks walls and lets players walk corridors', () => {
    expect(isWall(0, 0, false)).toBe(true)
    expect(isWall(1, 1, false)).toBe(false)
    expect(isWall(9, 9, false)).toBe(true)   // house
    expect(isWall(9, 9, true)).toBe(false)
  })

  it('wraps the tunnel on x', () => {
    expect(isWall(-1, 9, false)).toBe(false)
    expect(isWall(19, 9, false)).toBe(false)
  })

  it('starts with pellets on dots and power pellets', () => {
    const s = createState()
    expect(START_PELLETS).toBeGreaterThan(40)
    let n = 0
    for (let i = 0; i < s.pellets.length; i++) if (s.pellets[i]) n++
    expect(n).toBe(START_PELLETS)
    expect(s.pellets[cellIndex(1.5, 1.5)]).toBe(2)
  })
})

describe('advanceActor', () => {
  it('does not walk into a wall', () => {
    const start = { x: 1.5, y: 1.5, dir: 'up', want: 'up' }
    const moved = advanceActor(start, 'up', SPEED, 1, false)
    expect(moved.y).toBeCloseTo(1.5, 5)
    expect(moved.x).toBeCloseTo(1.5, 5)
  })

  it('reverses immediately', () => {
    const start = { x: 5.5, y: 3.5, dir: 'right', want: 'right' }
    const moved = advanceActor(start, 'left', SPEED, DT, false)
    expect(moved.dir).toBe('left')
  })

  it('turns at an intersection into an open tile', () => {
    const start = { x: 1.5, y: 5.5, dir: 'right', want: 'up' }
    const moved = advanceActor(start, 'up', SPEED, 0.3, false)
    expect(moved.dir).toBe('up')
    expect(moved.y).toBeLessThan(5.5)
  })
})

describe('step', () => {
  it('awards pellet points to the muncher who arrives first', () => {
    const s = createState()
    // X spawn (3.5, 17.5) — pellet on that tile
    const { state } = run(s, { X: 'right' }, 0.05)
    expect(state.scoreX).toBeGreaterThanOrEqual(PELLET_PTS)
    expect(state.pellets[cellIndex(3.5, 17.5)]).toBe(0)
  })

  it('does not let the second muncher recook an eaten pellet', () => {
    let s = createState()
    s = { ...s, players: {
      ...s.players,
      X: { ...s.players.X, x: 3.5, y: 1.5, dir: 'right', want: 'right', dead: 0, combo: 0 },
      O: { ...s.players.O, x: 3.5, y: 1.5, dir: 'right', want: 'right', dead: 0, combo: 0 },
    } }
    const idx = cellIndex(3.5, 1.5)
    expect(s.pellets[idx]).toBe(1)
    const a = step(s, {}, DT)
    expect(a.state.pellets[idx]).toBe(0)
    expect(a.state.scoreX + a.state.scoreO).toBe(PELLET_PTS)
  })

  it('power pellet frightens ghosts and scores POWER_PTS', () => {
    let s = createState()
    s = { ...s, players: {
      ...s.players,
      X: { ...s.players.X, x: 1.5, y: 1.5, dir: 'down', want: 'down', dead: 0, combo: 0 },
    } }
    const { state, events } = run(s, { X: 'down' }, 0.05)
    expect(state.scoreX).toBeGreaterThanOrEqual(POWER_PTS)
    expect(events.some(e => e.type === 'power')).toBe(true)
    expect(state.ghosts.every(g => g.mode === 'frightened' || g.mode === 'eaten')).toBe(true)
  })

  it('eating a frightened ghost scores and sends it home', () => {
    let s = createState()
    s = {
      ...s,
      players: {
        ...s.players,
        X: { ...s.players.X, x: 4.5, y: 3.5, dir: 'right', want: 'right', dead: 0, combo: 0 },
      },
      ghosts: s.ghosts.map((g, i) => i === 0
        ? { ...g, x: 4.5, y: 3.5, mode: 'frightened', frightLeft: 5 }
        : g),
    }
    const { state, events } = step(s, {}, DT)
    expect(events.some(e => e.type === 'eatGhost')).toBe(true)
    expect(state.ghosts[0].mode).toBe('eaten')
    expect(state.scoreX).toBeGreaterThan(0)
  })

  it('a hunter ghost stuns the muncher', () => {
    let s = createState()
    s = {
      ...s,
      players: {
        ...s.players,
        X: { ...s.players.X, x: 4.5, y: 3.5, dir: 'right', want: 'right', dead: 0, combo: 0 },
      },
      ghosts: s.ghosts.map((g, i) => i === 0
        ? { ...g, x: 4.5 + HIT_DIST * 0.2, y: 3.5, mode: 'chase', frightLeft: 0 }
        : g),
    }
    const { state, events } = step(s, {}, DT)
    expect(events.some(e => e.type === 'die' && e.by === 'X')).toBe(true)
    expect(state.players.X.dead).toBeGreaterThan(0)
  })

  it('wraps through the side tunnel', () => {
    let s = createState()
    s = {
      ...s,
      players: {
        ...s.players,
        X: { ...s.players.X, x: 0.5, y: 9.5, dir: 'left', want: 'left', dead: 0, combo: 0 },
      },
    }
    const { state } = run(s, { X: 'left' }, 0.4)
    expect(state.players.X.x).toBeGreaterThan(10)
  })

  it('ends on timeout with the higher score winning', () => {
    let s = createState()
    s = { ...s, timeLeft: DT * 2, scoreX: 100, scoreO: 40 }
    const { state } = run(s, {}, 1)
    expect(state.ended).toBe(true)
    expect(getWinner(state)).toBe('X')
  })

  it('draw when scores tie at the buzzer', () => {
    let s = createState()
    s = { ...s, timeLeft: DT, scoreX: 50, scoreO: 50 }
    const { state } = run(s, {}, 1)
    expect(getWinner(state)).toBe('draw')
  })

  it('ends when the maze is cleared', () => {
    let s = createState()
    s.pellets.fill(0)
    s.pellets[cellIndex(3.5, 17.5)] = 1
    const { state } = run(s, { X: 'right' }, 0.2)
    expect(state.ended).toBe(true)
    expect(state.scoreX).toBeGreaterThanOrEqual(PELLET_PTS)
  })

  it('getWinner is null while the round is live', () => {
    expect(getWinner(createState())).toBeNull()
  })

  it('freezes after ended', () => {
    let s = createState()
    s = { ...s, ended: true, scoreX: 10, timeLeft: 50 }
    const { state, events } = step(s, { X: 'up' }, 0.5)
    expect(state.players.X.y).toBe(s.players.X.y)
    expect(events).toHaveLength(0)
  })
})

describe('packPellets', () => {
  it('round-trips', () => {
    const s = createState()
    const packed = packPellets(s.pellets)
    const out = unpackPellets(packed)
    expect(Array.from(out)).toEqual(Array.from(s.pellets))
  })
})

describe('computeAI', () => {
  it('returns a legal direction', () => {
    const s = createState()
    const dir = computeAI(s, 'O')
    expect(['up', 'down', 'left', 'right']).toContain(dir)
  })
})
