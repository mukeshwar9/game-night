// WIRE CROSSED module: PIPES. The Tech steers a dot through a hidden maze
// toward a flag; the manual shows the walls. Tier I is a 6x6 grid with the
// exit at least 5 steps from the start. Tiers II-III are 8x8 with the exit at
// least 12 steps away; from tier II the Tech is not shown the flag. Tier III
// adds 2-4 one-way valves (`manual.valves`, { from, to }: the edge can only be
// crossed from `from` to `to`) and a fuel limit of shortest path + 4
// (`device.fuel`, `mods[i].moves`): running dry is a strike and the Tech goes
// back to the start. `device.size` (absent on legacy bombs) is the grid width.
//
// Pure — no DOM, no Firebase, no React.
import { int, pick, sample } from '../rng'

export const MAZE_SIZE = 6
export const MAZE_CELLS = MAZE_SIZE * MAZE_SIZE
// Open-side bits for a maze cell.
export const DIRS = {
  N: { bit: 1, dr: -1, dc: 0, opposite: 'S', word: 'UP' },
  E: { bit: 2, dr: 0, dc: 1, opposite: 'W', word: 'RIGHT' },
  S: { bit: 4, dr: 1, dc: 0, opposite: 'N', word: 'DOWN' },
  W: { bit: 8, dr: 0, dc: -1, opposite: 'E', word: 'LEFT' },
}
export const DIR_KEYS = ['N', 'E', 'S', 'W']

export const cellRC = (cell, size = MAZE_SIZE) => ({ r: Math.floor(cell / size), c: cell % size })
export const cellName = (cell, size = MAZE_SIZE) => {
  const { r, c } = cellRC(cell, size)
  return `${'ABCDEFGH'[c]}${r + 1}`
}

/** The neighbouring cell in `dir`, or -1 off the grid. */
export function stepCell(cell, dir, size = MAZE_SIZE) {
  const { r, c } = cellRC(cell, size)
  const d = DIRS[dir]
  const nr = r + d.dr
  const nc = c + d.dc
  if (nr < 0 || nc < 0 || nr >= size || nc >= size) return -1
  return nr * size + nc
}

export const isOpen = (open, cell, dir) => ((open[cell] || 0) & DIRS[dir].bit) !== 0

function carveMaze(rng, size) {
  const cells = size * size
  const open = Array(cells).fill(0)
  const seen = Array(cells).fill(false)
  const stack = [int(rng, 0, cells - 1)]
  seen[stack[0]] = true
  while (stack.length) {
    const cell = stack[stack.length - 1]
    const options = DIR_KEYS.filter(d => {
      const n = stepCell(cell, d, size)
      return n >= 0 && !seen[n]
    })
    if (!options.length) { stack.pop(); continue }
    const dir = pick(rng, options)
    const next = stepCell(cell, dir, size)
    open[cell] |= DIRS[dir].bit
    open[next] |= DIRS[DIRS[dir].opposite].bit
    seen[next] = true
    stack.push(next)
  }
  return open
}

/** Path length between cells through open sides (Infinity when unreachable). */
export function mazeDistances(open, from, size = MAZE_SIZE) {
  const dist = Array(size * size).fill(Infinity)
  dist[from] = 0
  const queue = [from]
  while (queue.length) {
    const cell = queue.shift()
    for (const d of DIR_KEYS) {
      if (!isOpen(open, cell, d)) continue
      const n = stepCell(cell, d, size)
      if (n >= 0 && dist[n] === Infinity) {
        dist[n] = dist[cell] + 1
        queue.push(n)
      }
    }
  }
  return dist
}

/** Grid width of a maze module (6 on legacy bombs, which carry no size). */
export const mazeSize = (module) => module?.device?.size ?? MAZE_SIZE

/** Maze: the Tech's current cell. */
export function mazePos(wire, i, module) {
  const p = Number(wire?.mods?.[i]?.pos)
  const cells = mazeSize(module) ** 2
  return Number.isInteger(p) && p >= 0 && p < cells ? p : module.device.start
}

/** True when a valve forbids stepping from `pos` to `next` (it points the other way). */
export const valveBlocks = (valves, pos, next) => !!valves?.some(v => v.from === next && v.to === pos)

/** Successful moves the Tech has made (tier III fuel). */
export const mazeMoves = (wire, i) => {
  const n = Number(wire?.mods?.[i]?.moves)
  return Number.isInteger(n) && n > 0 ? n : 0
}

/** First step of a shortest route from `pos` to the exit that honours valves, or null. */
export function nextStepDir(module, pos) {
  const size = mazeSize(module)
  const { open, valves } = module.manual
  const { exit } = module.device
  const first = new Map([[pos, null]])
  const queue = [pos]
  while (queue.length) {
    const cell = queue.shift()
    if (cell === exit) return first.get(cell)
    for (const d of DIR_KEYS) {
      if (!isOpen(open, cell, d)) continue
      const n = stepCell(cell, d, size)
      if (n < 0 || first.has(n) || valveBlocks(valves, cell, n)) continue
      first.set(n, first.get(cell) ?? d)
      queue.push(n)
    }
  }
  return null
}

// Tier -> grid width and fewest steps from start to exit.
const SIZES = { 1: MAZE_SIZE, 2: 8, 3: 8 }
const MIN_STEPS = { 1: 5, 2: 12, 3: 12 }
const FUEL_SLACK = 4

/** Tier III: 1-2 forward valves on the start-exit path, 1-2 on side branches. */
function genValves(rng, open, size, start, exit) {
  const dist = mazeDistances(open, exit, size)
  const path = [start]
  while (path[path.length - 1] !== exit) {
    const cell = path[path.length - 1]
    const d = DIR_KEYS.find(k => isOpen(open, cell, k) && dist[stepCell(cell, k, size)] === dist[cell] - 1)
    path.push(stepCell(cell, d, size))
  }
  const pathEdges = path.slice(1).map((to, k) => ({ from: path[k], to }))
  const onPath = new Set(pathEdges.flatMap(e => [`${e.from}:${e.to}`, `${e.to}:${e.from}`]))
  const side = []
  for (let cell = 0; cell < size * size; cell++) {
    for (const d of ['E', 'S']) {
      if (!isOpen(open, cell, d)) continue
      const to = stepCell(cell, d, size)
      if (!onPath.has(`${cell}:${to}`)) side.push({ from: cell, to })
    }
  }
  const forward = sample(rng, pathEdges, int(rng, 1, 2))
  const branch = sample(rng, side, int(rng, 1, 2)).map(e => (rng() < 0.5 ? e : { from: e.to, to: e.from }))
  return [...forward, ...branch].sort((a, b) => a.from - b.from || a.to - b.to)
}

export default {
  type: 'maze',
  name: 'PIPES',
  maxTier: 3,

  generate(rng, tier = 1) {
    const size = SIZES[tier] ?? MAZE_SIZE
    const cells = size * size
    if (tier >= 2) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const open = carveMaze(rng, size)
        const start = int(rng, 0, cells - 1)
        const dist = mazeDistances(open, start, size)
        const far = dist.map((d, i) => (d >= MIN_STEPS[tier] ? i : -1)).filter(i => i >= 0)
        if (!far.length) continue
        const exit = pick(rng, far)
        const device = { size, start, exit }
        const manual = { open }
        if (tier >= 3) {
          device.fuel = dist[exit] + FUEL_SLACK
          manual.valves = genValves(rng, open, size, start, exit)
        }
        return { type: 'maze', tier, device, manual }
      }
      /* c8 ignore next */
      throw new Error('maze generation failed')
    }
    const open = carveMaze(rng, size)
    const start = int(rng, 0, cells - 1)
    const dist = mazeDistances(open, start, size)
    const minSteps = MIN_STEPS[tier] ?? MIN_STEPS[1]
    let far = dist.map((d, i) => (d >= minSteps ? i : -1)).filter(i => i >= 0)
    if (!far.length) {
      const max = Math.max(...dist)
      far = dist.map((d, i) => (d === max ? i : -1)).filter(i => i >= 0)
    }
    const exit = pick(rng, far)
    return { type: 'maze', tier, device: { size, start, exit }, manual: { open } }
  },

  judge(module, bomb, wire, i, action) {
    if (action.kind !== 'move' || !DIRS[action.dir]) return null
    const progress = wire?.mods?.[i] || {}
    const size = mazeSize(module)
    const pos = mazePos(wire, i, module)
    const next = stepCell(pos, action.dir, size)
    const walled = !(next >= 0 && isOpen(module.manual.open, pos, action.dir))
    const valved = !walled && valveBlocks(module.manual.valves, pos, next)
    const word = DIRS[action.dir].word
    if (walled || valved) {
      return {
        ok: false,
        solved: false,
        progress: { ...progress, pos },
        text: `MOVED ${word} — ${valved ? 'ONE-WAY VALVE' : 'PIPE WALL'}`,
      }
    }
    const solved = next === module.device.exit
    const fuel = module.device.fuel
    if (fuel == null) return { ok: true, solved, progress: { ...progress, pos: next }, text: `MOVED ${word}` }
    // Tier III: every successful move burns fuel; running dry off the exit resets the Tech.
    const moves = mazeMoves(wire, i) + 1
    if (!solved && moves >= fuel) {
      return {
        ok: false,
        solved: false,
        progress: { ...progress, pos: module.device.start, moves: 0 },
        text: `MOVED ${word} — OUT OF FUEL, BACK TO START`,
      }
    }
    return { ok: true, solved, progress: { ...progress, pos: next, moves }, text: `MOVED ${word}` }
  },

  solveNext(module, bomb, wire, i) {
    return { mod: i, kind: 'move', dir: nextStepDir(module, mazePos(wire, i, module)) }
  },
}
