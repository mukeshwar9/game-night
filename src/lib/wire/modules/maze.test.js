import { describe, expect, it } from 'vitest'
import maze, { MAZE_CELLS, cellName, isOpen, mazeDistances, mazeMoves, mazePos, stepCell, valveBlocks } from './maze'
import { applyWireAction } from '../../wireLogic'
import { makeRng } from '../rng'
import { armedFor, clearModule, soloBomb } from '../testKit'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)

describe('maze module', () => {
  it('tier I carves a perfect 6x6 maze with a reachable exit at least 5 steps away', () => {
    for (const seed of SEEDS) {
      const m = soloBomb('maze', seed).modules[0]
      expect(m.tier).toBe(1)
      expect(m.device.size).toBe(6)
      const dist = mazeDistances(m.manual.open, m.device.start)
      expect(dist.every(d => Number.isFinite(d))).toBe(true)
      expect(dist[m.device.exit]).toBeGreaterThanOrEqual(5)
      const passages = m.manual.open.reduce((n, bits) => n + [1, 2, 4, 8].filter(b => bits & b).length, 0) / 2
      expect(passages).toBe(MAZE_CELLS - 1)
    }
  })

  it('solveNext walks the shortest path and clears every module', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('maze', seed)
      const m = bomb.modules[0]
      const dist = mazeDistances(m.manual.open, m.device.exit)
      const { wire, steps } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.strikes).toBe(0)
      expect(steps).toBe(dist[m.device.start])
    }
  })

  it('bumps into pipe walls without moving, as a strike', () => {
    const bomb = soloBomb('maze', 4)
    const m = bomb.modules[0]
    const pos = m.device.start
    const blocked = ['N', 'E', 'S', 'W'].find(d => !isOpen(m.manual.open, pos, d))
    const res = applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'move', dir: blocked }, 2000)
    expect(res.ok).toBe(false)
    expect(res.wire.strikes).toBe(1)
    expect(mazePos(res.wire, 0, m)).toBe(pos)
    expect(res.wire.last.text).toMatch(/PIPE WALL/)
    expect(applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'move', dir: 'Q' }, 2000)).toBeNull()
  })

  it('names cells by column letter and row number, with a size argument', () => {
    expect(cellName(0)).toBe('A1')
    expect(cellName(35)).toBe('F6')
    expect(cellName(63, 8)).toBe('H8')
    expect(stepCell(0, 'N')).toBe(-1)
    expect(stepCell(0, 'E')).toBe(1)
    expect(stepCell(7, 'E', 8)).toBe(-1)
  })

  it('is deterministic per rng', () => {
    expect(maze.generate(makeRng('d'), 1)).toEqual(maze.generate(makeRng('d'), 1))
  })
})

const DIR_OF = { '-1': 'W', 1: 'E' }
const dirBetween = (from, to, size) => {
  const d = to - from
  if (d === size) return 'S'
  if (d === -size) return 'N'
  return DIR_OF[d]
}
const isPerfect = (m, size) => {
  const passages = m.manual.open.reduce((n, bits) => n + [1, 2, 4, 8].filter(b => bits & b).length, 0) / 2
  return passages === size * size - 1
}
const pathCells = (m, size) => {
  const dist = mazeDistances(m.manual.open, m.device.exit, size)
  const path = [m.device.start]
  while (path[path.length - 1] !== m.device.exit) {
    const cell = path[path.length - 1]
    path.push(['N', 'E', 'S', 'W'].map(d => stepCell(cell, d, size)).find((n, k) => n >= 0 && isOpen(m.manual.open, cell, 'NESW'[k]) && dist[n] === dist[cell] - 1))
  }
  return path
}

describe('maze module, tier II', () => {
  it('deals a perfect 8x8 maze, the exit at least 12 steps away, no valves and no fuel', () => {
    for (const seed of SEEDS) {
      const m = soloBomb('maze', seed, 2).modules[0]
      expect(m.tier).toBe(2)
      expect(m.device.size).toBe(8)
      const dist = mazeDistances(m.manual.open, m.device.start, 8)
      expect(dist.every(d => Number.isFinite(d))).toBe(true)
      expect(dist[m.device.exit]).toBeGreaterThanOrEqual(12)
      expect(isPerfect(m, 8)).toBe(true)
      expect(m.manual.valves).toBeUndefined()
      expect(m.device.fuel).toBeUndefined()
    }
  })

  it('solveNext walks the shortest path and clears every module', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('maze', seed, 2)
      const m = bomb.modules[0]
      const { wire, steps } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.strikes).toBe(0)
      expect(steps).toBe(mazeDistances(m.manual.open, m.device.exit, 8)[m.device.start])
    }
  })

  it('every blocked direction is a strike and the Tech stays put', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const bomb = soloBomb('maze', seed, 2)
      const m = bomb.modules[0]
      const pos = m.device.start
      for (const d of ['N', 'E', 'S', 'W']) {
        if (isOpen(m.manual.open, pos, d) && stepCell(pos, d, 8) >= 0) continue
        const res = applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'move', dir: d }, 2000)
        expect(res.ok).toBe(false)
        expect(res.wire.strikes).toBe(1)
        expect(mazePos(res.wire, 0, m)).toBe(pos)
      }
    }
  })

  it('is deterministic per rng', () => {
    expect(maze.generate(makeRng('d'), 2)).toEqual(maze.generate(makeRng('d'), 2))
  })
})

describe('maze module, tier III', () => {
  it('deals 2-4 valves on real edges: forward on the path, on side branches either way', () => {
    for (const seed of SEEDS) {
      const m = soloBomb('maze', seed, 3).modules[0]
      expect(m.tier).toBe(3)
      expect(m.device.size).toBe(8)
      expect(isPerfect(m, 8)).toBe(true)
      const { valves } = m.manual
      expect(valves.length).toBeGreaterThanOrEqual(2)
      expect(valves.length).toBeLessThanOrEqual(4)
      const path = pathCells(m, 8)
      const forward = new Set(path.slice(1).map((c, k) => `${path[k]}:${c}`))
      const backward = new Set(path.slice(1).map((c, k) => `${c}:${path[k]}`))
      const onPath = valves.filter(v => forward.has(`${v.from}:${v.to}`) || backward.has(`${v.from}:${v.to}`))
      expect(onPath.length).toBeGreaterThanOrEqual(1)
      expect(onPath.length).toBeLessThanOrEqual(2)
      onPath.forEach(v => expect(forward.has(`${v.from}:${v.to}`)).toBe(true))
      expect(valves.length - onPath.length).toBeGreaterThanOrEqual(1)
      expect(valves.length - onPath.length).toBeLessThanOrEqual(2)
      for (const v of valves) {
        const dir = dirBetween(v.from, v.to, 8)
        expect(stepCell(v.from, dir, 8)).toBe(v.to)
        expect(isOpen(m.manual.open, v.from, dir)).toBe(true)
      }
      expect(new Set(valves.map(v => [v.from, v.to].sort().join(':'))).size).toBe(valves.length)
    }
  })

  it('fuel is the shortest path plus 4, and solveNext clears every module within it', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('maze', seed, 3)
      const m = bomb.modules[0]
      const shortest = mazeDistances(m.manual.open, m.device.exit, 8)[m.device.start]
      expect(m.device.fuel).toBe(shortest + 4)
      const { wire, steps } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.strikes).toBe(0)
      expect(steps).toBe(shortest)
      expect(steps).toBeLessThan(m.device.fuel)
    }
  })

  it('a move against a valve is a strike and the Tech stays put and keeps its fuel', () => {
    let tested = 0
    for (const seed of SEEDS) {
      const bomb = soloBomb('maze', seed, 3)
      const m = bomb.modules[0]
      const v = m.manual.valves[0]
      // stand on the valve's `to` side and try to walk back through it
      const wire = { ...armedFor(bomb), mods: { 0: { pos: v.to, moves: 3 } } }
      const res = applyWireAction(wire, bomb, { mod: 0, kind: 'move', dir: dirBetween(v.to, v.from, 8) }, 2000)
      expect(res.ok).toBe(false)
      expect(res.wire.strikes).toBe(1)
      expect(res.wire.mods[0]).toEqual({ pos: v.to, moves: 3 })
      expect(res.wire.last.text).toMatch(/ONE-WAY VALVE/)
      // and forward through it is fine
      const fwd = applyWireAction({ ...armedFor(bomb), mods: { 0: { pos: v.from, moves: 3 } } }, bomb, { mod: 0, kind: 'move', dir: dirBetween(v.from, v.to, 8) }, 2000)
      expect(fwd.ok).toBe(true)
      expect(fwd.wire.mods[0]).toEqual({ pos: v.to, moves: 4 })
      tested++
    }
    expect(tested).toBe(SEEDS.length)
  })

  it('running out of fuel off the exit is a strike and sends the Tech back to the start', () => {
    let tested = 0
    for (const seed of SEEDS.slice(0, 100)) {
      const bomb = soloBomb('maze', seed, 3)
      const m = bomb.modules[0]
      const { start } = m.device
      const dir = ['N', 'E', 'S', 'W'].find(d => {
        if (!isOpen(m.manual.open, start, d)) return false
        const n = stepCell(start, d, 8)
        return n !== m.device.exit && !valveBlocks(m.manual.valves, start, n) && !valveBlocks(m.manual.valves, n, start)
      })
      if (!dir) continue
      const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[dir]
      let cur = armedFor(bomb)
      for (let k = 0; k < m.device.fuel - 1; k++) {
        const res = applyWireAction(cur, bomb, { mod: 0, kind: 'move', dir: k % 2 === 0 ? dir : back }, 2000)
        expect(res.ok).toBe(true)
        cur = res.wire
      }
      expect(mazeMoves(cur, 0)).toBe(m.device.fuel - 1)
      const dry = applyWireAction(cur, bomb, { mod: 0, kind: 'move', dir: (m.device.fuel - 1) % 2 === 0 ? dir : back }, 2000)
      expect(dry.ok).toBe(false)
      expect(dry.wire.strikes).toBe(1)
      expect(mazePos(dry.wire, 0, m)).toBe(start)
      expect(mazeMoves(dry.wire, 0)).toBe(0)
      expect(dry.wire.last.text).toMatch(/OUT OF FUEL/)
      tested++
    }
    expect(tested).toBeGreaterThan(50)
  })

  it('names cells with the module size and steps with valve-free tiers unchanged', () => {
    expect(cellName(9, 8)).toBe('B2')
    expect(cellName(9)).toBe('D2')
  })

  it('is deterministic per rng', () => {
    expect(maze.generate(makeRng('d'), 3)).toEqual(maze.generate(makeRng('d'), 3))
  })
})
