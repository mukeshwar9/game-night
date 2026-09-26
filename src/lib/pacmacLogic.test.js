import { describe, it, expect } from 'vitest'
import {
  createState, step, getWinner, computeAI, advanceMuncher, advanceGhostDeadReckon,
  ghostTarget, nearestMuncher, isOpen, cellIndex, packPellets, unpackPellets,
  MAZE_W, MAZE_H, MAZE_ROWS, START_PELLETS, SPAWN,
  PAC_SPEED, GHOST_SPEED, PELLET_PTS, POWER_PTS, GHOST_PTS, RIVAL_PTS,
  POWER_S, RESPAWN_S, SHIELD_S, ROUND_SECONDS, TURN_GRACE, AI_DIFFICULTIES,
} from './pacmacLogic'

const DT = 1 / 120

function run(state, inputs, seconds) {
  let s = state
  let events = []
  const steps = Math.ceil(seconds / DT)
  for (let i = 0; i < steps; i++) {
    const res = step(s, typeof inputs === 'function' ? inputs(s) : inputs, DT)
    s = res.state
    if (res.events.length) events = events.concat(res.events)
    if (s.ended) break
  }
  return { state: s, events }
}

// A state with the ghosts parked inside the house forever, so a test can
// look at muncher rules without being eaten.
function calm(opts) {
  const s = createState(opts)
  return { ...s, ghosts: s.ghosts.map(g => ({ ...g, x: 7.5, y: 8.5, state: 'house', releaseAt: 1e9 })) }
}

function withPlayer(s, side, patch) {
  return { ...s, players: { ...s.players, [side]: { ...s.players[side], ...patch } } }
}

describe('maze', () => {
  it('is 15×17 and mirrored left↔right', () => {
    expect(MAZE_ROWS).toHaveLength(MAZE_H)
    expect(MAZE_W).toBe(15)
    expect(MAZE_H).toBe(17)
    for (const row of MAZE_ROWS) {
      expect(row).toHaveLength(MAZE_W)
      expect(row).toBe([...row].reverse().join(''))
    }
  })

  it('has no dead ends and every open tile is reachable', () => {
    const open = []
    for (let y = 0; y < MAZE_H; y++) for (let x = 0; x < MAZE_W; x++) if (isOpen(x, y)) open.push([x, y])
    for (const [x, y] of open) {
      const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isOpen(x + dx, y + dy)).length
      expect(exits, `dead end at ${x},${y}`).toBeGreaterThanOrEqual(2)
    }
    const seen = new Set([`${open[0][0]},${open[0][1]}`])
    const stack = [open[0]]
    while (stack.length) {
      const [x, y] = stack.pop()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = (x + dx + MAZE_W) % MAZE_W
        const ny = y + dy
        const k = `${nx},${ny}`
        if (isOpen(nx, ny) && !seen.has(k)) { seen.add(k); stack.push([nx, ny]) }
      }
    }
    expect(seen.size).toBe(open.length)
  })

  it('keeps the house and door closed to munchers and wraps the tunnel', () => {
    expect(isOpen(7, 8)).toBe(false)   // house
    expect(isOpen(7, 7)).toBe(false)   // door
    expect(isOpen(0, 0)).toBe(false)
    expect(isOpen(-1, 8)).toBe(true)
    expect(isOpen(MAZE_W, 8)).toBe(true)
  })

  it('spawns the two munchers on mirrored tiles', () => {
    expect(SPAWN.X.y).toBe(SPAWN.O.y)
    expect(SPAWN.X.x + SPAWN.O.x).toBe(MAZE_W)
    const s = createState()
    let n = 0
    for (const v of s.pellets) if (v) n++
    expect(n).toBe(START_PELLETS)
    expect(s.pelletsLeft).toBe(START_PELLETS)
    expect(s.pellets[cellIndex(1.5, 1.5)]).toBe(2)
  })
})

describe('advanceMuncher', () => {
  const at = (x, y, dir, extra = {}) => ({ x, y, dir, want: dir, power: 0, ...extra })

  it('stops against a wall', () => {
    const moved = advanceMuncher(at(1.5, 1.5, 'up'), 'up', 1)
    expect(moved.x).toBeCloseTo(1.5, 6)
    expect(moved.y).toBeCloseTo(1.5, 6)
  })

  it('reverses immediately', () => {
    const moved = advanceMuncher(at(3.2, 3.5, 'right'), 'left', DT)
    expect(moved.dir).toBe('left')
    expect(moved.x).toBeLessThan(3.2)
  })

  it('queues a turn and takes it at the next junction', () => {
    // Heading right along row 3; column 5 opens upward.
    let p = at(3.6, 3.5, 'right')
    p = advanceMuncher(p, 'up', DT)
    expect(p.dir).toBe('right')
    expect(p.want).toBe('up')
    for (let i = 0; i < 60; i++) p = advanceMuncher(p, undefined, DT)
    expect(p.dir).toBe('up')
    expect(p.x).toBeCloseTo(5.5, 6)
    expect(p.y).toBeLessThan(3.5)
  })

  it('forgives a turn pressed just after the junction', () => {
    const p = advanceMuncher(at(5.5 + TURN_GRACE * 0.8, 3.5, 'right'), 'up', DT)
    expect(p.dir).toBe('up')
    expect(p.x).toBeCloseTo(5.5, 6)
  })

  it('does not forgive a turn pressed too late', () => {
    const p = advanceMuncher(at(5.5 + TURN_GRACE + 0.1, 3.5, 'right'), 'up', DT)
    expect(p.dir).toBe('right')
  })

  it('wraps through the side tunnel', () => {
    let p = at(1.5, 8.5, 'left')
    for (let i = 0; i < 60; i++) p = advanceMuncher(p, 'left', DT)
    expect(p.x).toBeGreaterThan(MAZE_W - 4)
    expect(p.y).toBeCloseTo(8.5, 6)
  })

  it('moves faster while powered', () => {
    const slow = advanceMuncher(at(1.5, 3.5, 'right'), 'right', 0.2)
    const fast = advanceMuncher(at(1.5, 3.5, 'right', { power: 3 }), 'right', 0.2)
    expect(fast.x).toBeGreaterThan(slow.x)
  })
})

describe('ghosts', () => {
  it('are slower than a muncher', () => {
    expect(GHOST_SPEED).toBeLessThan(PAC_SPEED)
  })

  it('leave the house one at a time', () => {
    const s = createState()
    expect(s.ghosts.filter(g => g.state === 'roam')).toHaveLength(1)
    const later = run(s, {}, 3).state
    expect(later.ghosts[1].state).toBe('roam')
    expect(later.ghosts[2].state).not.toBe('roam')
    const all = run(later, {}, 4).state
    expect(all.ghosts.every(g => g.state === 'roam')).toBe(true)
  })

  it('turn at junctions to hunt a muncher instead of only bouncing off walls', () => {
    // Chase phase, chaser ghost heading left along row 3, prey straight below
    // the column-5 junction: it must turn down there, not run on to the wall.
    let s = calm()
    s = { ...s, clock: 6 }
    s = withPlayer(s, 'X', { x: 5.5, y: 5.5, dir: 'left', want: 'left' })
    s = withPlayer(s, 'O', { out: 99 })
    s.ghosts = [{ ...s.ghosts[0], x: 7.5, y: 3.5, dir: 'left', state: 'roam' }]
    let turned = false
    for (let i = 0; i < 60 && !turned; i++) {
      s = withPlayer(step(s, {}, DT).state, 'X', { x: 5.5, y: 5.5 }) // prey holds still
      if (s.ghosts[0].dir === 'down') turned = true
    }
    expect(turned).toBe(true)
    expect(Math.floor(s.ghosts[0].x)).toBe(5)
  })

  it('have distinct chase personalities', () => {
    let s = createState()
    s = { ...s, clock: 6 } // chase phase
    s = withPlayer(s, 'X', { x: 4.5, y: 10.5, dir: 'right' })
    s = withPlayer(s, 'O', { out: 5 })
    const [chaser, ambush, shy] = s.ghosts.map(g => ({ ...g, x: 11.5, y: 3.5, state: 'roam' }))
    expect(ghostTarget(s, chaser)).toEqual({ x: 4.5, y: 10.5 })
    expect(ghostTarget(s, ambush)).toEqual({ x: 8.5, y: 10.5 })
    expect(ghostTarget(s, shy)).toEqual({ x: 4.5, y: 10.5 })
    const shyClose = { ...shy, x: 5.5, y: 10.5 }
    expect(ghostTarget(s, shyClose)).not.toEqual({ x: 4.5, y: 10.5 })
  })

  it('ignore knocked-out munchers and split exact ties with the rng', () => {
    let s = createState({ rng: 5 })
    s = withPlayer(s, 'X', { x: 3.5, y: 3.5 })
    s = withPlayer(s, 'O', { x: 11.5, y: 3.5 })
    let xs = 0
    for (let i = 0; i < 40; i++) if (nearestMuncher(s, 7.5, 3.5) === s.players.X) xs++
    expect(xs).toBeGreaterThan(5)
    expect(xs).toBeLessThan(35)
    s = withPlayer(s, 'X', { out: 1 })
    expect(nearestMuncher(s, 7.5, 3.5)).toBe(s.players.O)
  })

  it('dead-reckons straight along the heading', () => {
    const g = { x: 3.5, y: 3.5, dir: 'right', state: 'roam', fright: 0 }
    const moved = advanceGhostDeadReckon(g, 0.1)
    expect(moved.x).toBeCloseTo(3.5 + GHOST_SPEED * 0.1, 5)
    expect(advanceGhostDeadReckon({ ...g, state: 'house' }, 0.1)).toEqual({ ...g, state: 'house' })
  })
})

describe('step', () => {
  it('scores pellets and keeps the pellet array when nothing is eaten', () => {
    const s = calm()
    const first = step(s, { X: 'right' }, DT).state
    expect(first.scoreX).toBe(PELLET_PTS) // spawn tile holds a pellet
    expect(first.pelletsLeft).toBe(START_PELLETS - 2) // O ate its spawn pellet too
    const second = step(first, {}, DT).state
    expect(second.pellets).toBe(first.pellets)
  })

  it('splits a same-tick contested pellet fairly', () => {
    let xWins = 0
    for (let seed = 1; seed <= 60; seed++) {
      let s = calm({ rng: seed * 7919 })
      s = withPlayer(s, 'X', { x: 4.5, y: 3.5, dir: 'right', want: 'right' })
      s = withPlayer(s, 'O', { x: 4.5, y: 3.5, dir: 'left', want: 'left' })
      const next = step(s, {}, DT).state
      expect(next.scoreX + next.scoreO).toBe(PELLET_PTS)
      if (next.scoreX) xWins++
    }
    expect(xWins).toBeGreaterThan(15)
    expect(xWins).toBeLessThan(45)
  })

  it('a power pellet frightens ghosts and powers its eater', () => {
    let s = createState()
    s = withPlayer(s, 'X', { x: 1.5, y: 2.5, dir: 'up', want: 'up' })
    const { state, events } = run(s, { X: 'up' }, 0.3)
    expect(events.some(e => e.type === 'power' && e.by === 'X')).toBe(true)
    expect(state.scoreX).toBeGreaterThanOrEqual(POWER_PTS)
    expect(state.players.X.power).toBeGreaterThan(POWER_S - 0.5)
    expect(state.ghosts.every(g => g.fright > 0)).toBe(true)
  })

  it('eating frightened ghosts climbs the combo', () => {
    let s = calm()
    s = withPlayer(s, 'X', { x: 3.5, y: 3.5, dir: 'right', power: 5 })
    s.ghosts = [
      { ...s.ghosts[0], x: 3.5, y: 3.5, state: 'roam', fright: 4 },
      { ...s.ghosts[1], x: 3.5, y: 3.5, state: 'roam', fright: 4 },
    ]
    const { state, events } = step(s, {}, DT)
    expect(events.filter(e => e.type === 'eatGhost')).toHaveLength(2)
    expect(state.scoreX).toBe(GHOST_PTS[0] + GHOST_PTS[1] + PELLET_PTS)
    expect(state.ghosts.every(g => g.state === 'eaten')).toBe(true)
  })

  it('a hunting ghost knocks a muncher out, then it respawns shielded', () => {
    let s = calm()
    s = withPlayer(s, 'X', { x: 3.5, y: 3.5, dir: 'right' })
    s.ghosts = [{ ...s.ghosts[0], x: 3.8, y: 3.5, state: 'roam', dir: 'left', fright: 0 }]
    let res = step(s, {}, DT)
    expect(res.events.some(e => e.type === 'die' && e.by === 'X')).toBe(true)
    expect(res.state.players.X.out).toBeCloseTo(RESPAWN_S, 5)
    expect(res.state.players.X.life).toBe(1)
    const back = run(res.state, {}, RESPAWN_S + 0.05).state
    expect(back.players.X.out).toBe(0)
    expect(Math.abs(back.players.X.x - SPAWN.X.x)).toBeLessThan(0.5)
    expect(back.players.X.y).toBe(SPAWN.X.y)
    expect(back.players.X.shield).toBeGreaterThan(SHIELD_S - 0.2)
  })

  it('a shielded muncher walks through ghosts', () => {
    let s = calm()
    s = withPlayer(s, 'X', { x: 3.5, y: 3.5, dir: 'right', shield: 1 })
    s.ghosts = [{ ...s.ghosts[0], x: 3.6, y: 3.5, state: 'roam', dir: 'left', fright: 0 }]
    expect(step(s, {}, DT).state.players.X.out).toBe(0)
  })

  it('a powered muncher gobbles its rival', () => {
    let s = calm()
    s = withPlayer(s, 'X', { x: 5.5, y: 3.5, dir: 'right', power: 3 })
    s = withPlayer(s, 'O', { x: 5.8, y: 3.5, dir: 'left' })
    const { state, events } = step(s, {}, DT)
    expect(events.some(e => e.type === 'eatRival' && e.by === 'X')).toBe(true)
    expect(state.scoreX).toBeGreaterThanOrEqual(RIVAL_PTS)
    expect(state.players.O.out).toBeGreaterThan(0)
  })

  it('two powered munchers bounce off each other harmlessly', () => {
    let s = calm()
    s = withPlayer(s, 'X', { x: 5.5, y: 3.5, dir: 'right', power: 3 })
    s = withPlayer(s, 'O', { x: 5.8, y: 3.5, dir: 'left', power: 3 })
    const { state } = step(s, {}, DT)
    expect(state.players.X.out).toBe(0)
    expect(state.players.O.out).toBe(0)
  })

  it('never mutates the input state', () => {
    const s = createState()
    const snapshot = JSON.stringify({ ...s, pellets: [...s.pellets] })
    step(s, { X: 'up', O: 'up' }, DT)
    expect(JSON.stringify({ ...s, pellets: [...s.pellets] })).toBe(snapshot)
  })

  it('ends when the clock runs out', () => {
    const s = { ...calm(), timeLeft: 0.02 }
    const { state, events } = run(s, {}, 0.1)
    expect(state.ended).toBe(true)
    expect(events.some(e => e.type === 'end')).toBe(true)
  })

  it('ends when the last pellet is eaten', () => {
    let s = calm()
    const pellets = new Uint8Array(s.pellets.length)
    pellets[cellIndex(3.5, 3.5)] = 1
    s = { ...s, pellets, pelletsLeft: 1 }
    s = withPlayer(s, 'X', { x: 2.5, y: 3.5, dir: 'right', want: 'right' })
    const { state } = run(s, {}, 0.5)
    expect(state.ended).toBe(true)
    expect(getWinner(state)).toBe('X')
  })

  it('getWinner is null mid-round and handles draws', () => {
    const s = createState()
    expect(getWinner(s)).toBeNull()
    expect(getWinner({ ...s, ended: true })).toBe('draw')
    expect(getWinner({ ...s, ended: true, scoreO: 10 })).toBe('O')
  })
})

describe('remote (guest) position reports', () => {
  it('adopts a valid report and credits pellets along the way', () => {
    let s = calm()
    s = withPlayer(s, 'O', { x: 9.5, y: 3.5, dir: 'right', want: 'right' })
    const { state } = step(s, { O: { x: 11.5, y: 3.5, dir: 'right', want: 'down', life: 0 } }, DT)
    expect(state.players.O.x).toBeGreaterThan(11.4)
    expect(state.players.O.want).toBe('down')
    expect(state.pellets[cellIndex(10.5, 3.5)]).toBe(0)
    expect(state.pellets[cellIndex(11.5, 3.5)]).toBe(0)
    expect(state.scoreO).toBeGreaterThanOrEqual(2 * PELLET_PTS)
  })

  it('rejects stale, off-lane, walled and teleporting reports', () => {
    let s = calm()
    s = withPlayer(s, 'O', { x: 9.5, y: 3.5, dir: 'right', want: 'right', life: 2 })
    const cases = [
      { x: 10.5, y: 3.5, life: 1 },      // previous life
      { x: 10.2, y: 3.2, life: 2 },      // off the lanes
      { x: 10.5, y: 2.5, life: 2 },      // inside a wall
      { x: 1.5, y: 15.5, life: 2 },      // too far away
    ]
    for (const rep of cases) {
      const next = step(s, { O: { dir: 'right', want: 'right', ...rep } }, DT).state
      expect(next.players.O.x).toBeLessThan(9.6)
      expect(next.players.O.y).toBeCloseTo(3.5, 6)
    }
  })

  it('ignores reports while knocked out', () => {
    let s = calm()
    s = withPlayer(s, 'O', { out: 1 })
    const next = step(s, { O: { x: 11.5, y: 3.5, dir: 'right', want: 'right', life: 0 } }, DT).state
    expect(next.players.O.out).toBeGreaterThan(0)
  })
})

describe('computeAI', () => {
  it('steps toward the nearest pellet', () => {
    let s = calm()
    const pellets = new Uint8Array(s.pellets.length)
    pellets[cellIndex(1.5, 5.5)] = 1
    s = { ...s, pellets }
    s = withPlayer(s, 'O', { x: 3.5, y: 5.5, dir: 'right' })
    expect(computeAI(s, 'O')).toBe('left')
  })

  it('backs away from a hunting ghost', () => {
    let s = calm()
    s = withPlayer(s, 'O', { x: 3.5, y: 3.5, dir: 'right' })
    s.ghosts = [{ ...s.ghosts[0], x: 5.5, y: 3.5, state: 'roam', fright: 0 }]
    expect(computeAI(s, 'O')).not.toBe('right')
  })

  it('hunts a frightened ghost', () => {
    let s = calm()
    s = withPlayer(s, 'O', { x: 3.5, y: 3.5, dir: 'left' })
    s.ghosts = [{ ...s.ghosts[0], x: 6.5, y: 3.5, state: 'roam', fright: 4 }]
    expect(computeAI(s, 'O')).toBe('right')
  })

  it('bot vs bot plays a whole round to a result', () => {
    let s = createState({ rng: 42 })
    const cfg = AI_DIFFICULTIES.normal
    let dirs = { X: 'right', O: 'left' }
    let since = 0
    let deaths = 0
    for (let i = 0; i < (ROUND_SECONDS + 1) / DT && !s.ended; i++) {
      since += DT * 1000
      if (since >= cfg.replanMs) {
        since = 0
        dirs = { X: computeAI(s, 'X'), O: computeAI(s, 'O') }
      }
      const res = step(s, dirs, DT)
      deaths += res.events.filter(e => e.type === 'die').length
      s = res.state
    }
    expect(s.ended).toBe(true)
    expect(s.scoreX).toBeGreaterThan(100)
    expect(s.scoreO).toBeGreaterThan(100)
    expect(['X', 'O', 'draw']).toContain(getWinner(s))
    expect(deaths).toBeLessThan(20)
  })
})

describe('pellet packing', () => {
  it('round-trips through the 2-bit pack', () => {
    const s = createState()
    const out = unpackPellets(packPellets(s.pellets))
    expect([...out]).toEqual([...s.pellets])
  })
})
