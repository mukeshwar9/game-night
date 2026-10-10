// WIRE CROSSED legacy generator: a FROZEN copy of the pre-modes
// generateBomb(seed, level). A `wire` node without a `mode` (a bomb dealt or
// armed before the modes deploy) is still derived from this so both screens
// stay byte-identical mid-deploy. src/lib/wire/legacy.test.js pins 20 seeds x
// 6 levels against hashes captured from the old code. Do not edit the rules
// here; delete this file (and the test) one release after modes ship.
//
// Only the rng and shell primitives are shared; every generator below is a
// copy so later module changes cannot alter a legacy bomb.
//
// Pure — no DOM, no Firebase, no React.
import { int, makeRng, pick, sample, shuffle } from './rng'
import { WIRE_COLORS, genBombCond, makeShell } from './shell'

export const BOMB_MS = 180_000
export const BOMB_MS_HARD = 150_000

const LEGACY_TYPES = ['wires', 'keypad', 'lever', 'maze']
const GLYPH_COUNT = 24
const KEYPAD_COLUMNS = 5
const KEYPAD_COLUMN_LEN = 6
const KEYPAD_KEYS = 4
const LEVER_COLORS = ['red', 'blue', 'yellow', 'white']
const LEVER_LABELS = ['PULL', 'VENT', 'PRIME', 'LOCK']
const STRIP_COLORS = ['red', 'blue', 'yellow', 'white', 'green']
const MAZE_SIZE = 6
const MAZE_CELLS = MAZE_SIZE * MAZE_SIZE
const DIRS = {
  N: { bit: 1, dr: -1, dc: 0, opposite: 'S' },
  E: { bit: 2, dr: 0, dc: 1, opposite: 'W' },
  S: { bit: 4, dr: 1, dc: 0, opposite: 'N' },
  W: { bit: 8, dr: 0, dc: -1, opposite: 'E' },
}
const DIR_KEYS = ['N', 'E', 'S', 'W']

const COLOR_CONDS = ['none', 'exactlyOne', 'many', 'lastIs', 'firstIs']
const HAS_COLOR = new Set(['exactlyOne', 'many', 'lastIs', 'firstIs'])

function genWireCond(rng) {
  if (rng() < 0.7) return { kind: pick(rng, COLOR_CONDS), color: pick(rng, WIRE_COLORS) }
  return genBombCond(rng)
}

function genWireAction(rng, n, cond) {
  if (HAS_COLOR.has(cond.kind) && rng() < 0.5) {
    return { kind: rng() < 0.5 ? 'firstOf' : 'lastOf', color: cond.color }
  }
  if (rng() < 0.2) return { kind: 'last' }
  return { kind: 'pos', n: int(rng, 1, n) }
}

function genWires(rng, level) {
  const maxWires = level <= 1 ? 4 : level === 2 ? 5 : 6
  const tables = {}
  for (let n = 3; n <= 6; n++) {
    const rules = Array.from({ length: 3 }, () => {
      const cond = genWireCond(rng)
      return { cond, action: genWireAction(rng, n, cond) }
    })
    tables[n] = { rules, otherwise: rng() < 0.5 ? { kind: 'last' } : { kind: 'pos', n: int(rng, 1, n) } }
  }
  const count = int(rng, 3, maxWires)
  const wires = Array.from({ length: count }, () => pick(rng, WIRE_COLORS))
  return { type: 'wires', device: { wires }, manual: { tables } }
}

function genKeypad(rng) {
  const all = Array.from({ length: GLYPH_COUNT }, (_, i) => i)
  for (let attempt = 0; attempt < 200; attempt++) {
    const columns = Array.from({ length: KEYPAD_COLUMNS }, () => sample(rng, all, KEYPAD_COLUMN_LEN))
    const col = int(rng, 0, KEYPAD_COLUMNS - 1)
    const positions = sample(rng, [0, 1, 2, 3, 4, 5], KEYPAD_KEYS).sort((a, b) => a - b)
    const solution = positions.map(p => columns[col][p])
    const unique = columns.every((c, i) => i === col || !solution.every(g => c.includes(g)))
    if (!unique) continue
    return {
      type: 'keypad',
      device: { keys: shuffle(rng, solution) },
      manual: { columns },
      solution,
    }
  }
  /* c8 ignore next */
  throw new Error('keypad generation failed')
}

function genLever(rng) {
  const tapRules = [
    { label: pick(rng, LEVER_LABELS) },
    { color: pick(rng, LEVER_COLORS), cond: genBombCond(rng) },
  ]
  const digits = sample(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], STRIP_COLORS.length)
  const stripDigits = Object.fromEntries(STRIP_COLORS.map((c, i) => [c, digits[i]]))
  const device = {
    color: pick(rng, LEVER_COLORS),
    label: pick(rng, LEVER_LABELS),
    strip: pick(rng, STRIP_COLORS),
  }
  return { type: 'lever', device, manual: { tapRules, stripDigits } }
}

function step(cell, dir) {
  const r = Math.floor(cell / MAZE_SIZE)
  const c = cell % MAZE_SIZE
  const d = DIRS[dir]
  const nr = r + d.dr
  const nc = c + d.dc
  if (nr < 0 || nc < 0 || nr >= MAZE_SIZE || nc >= MAZE_SIZE) return -1
  return nr * MAZE_SIZE + nc
}

const isOpen = (open, cell, dir) => ((open[cell] || 0) & DIRS[dir].bit) !== 0

function carveMaze(rng) {
  const open = Array(MAZE_CELLS).fill(0)
  const seen = Array(MAZE_CELLS).fill(false)
  const stack = [int(rng, 0, MAZE_CELLS - 1)]
  seen[stack[0]] = true
  while (stack.length) {
    const cell = stack[stack.length - 1]
    const options = DIR_KEYS.filter(d => {
      const n = step(cell, d)
      return n >= 0 && !seen[n]
    })
    if (!options.length) { stack.pop(); continue }
    const dir = pick(rng, options)
    const next = step(cell, dir)
    open[cell] |= DIRS[dir].bit
    open[next] |= DIRS[DIRS[dir].opposite].bit
    seen[next] = true
    stack.push(next)
  }
  return open
}

function distances(open, from) {
  const dist = Array(MAZE_CELLS).fill(Infinity)
  dist[from] = 0
  const queue = [from]
  while (queue.length) {
    const cell = queue.shift()
    for (const d of DIR_KEYS) {
      if (!isOpen(open, cell, d)) continue
      const n = step(cell, d)
      if (n >= 0 && dist[n] === Infinity) {
        dist[n] = dist[cell] + 1
        queue.push(n)
      }
    }
  }
  return dist
}

function genMaze(rng, level) {
  const open = carveMaze(rng)
  const start = int(rng, 0, MAZE_CELLS - 1)
  const dist = distances(open, start)
  const minSteps = level <= 1 ? 5 : 7
  let far = dist.map((d, i) => (d >= minSteps ? i : -1)).filter(i => i >= 0)
  if (!far.length) {
    const max = Math.max(...dist)
    far = dist.map((d, i) => (d === max ? i : -1)).filter(i => i >= 0)
  }
  const exit = pick(rng, far)
  return { type: 'maze', device: { start, exit }, manual: { open } }
}

const GENERATORS = { wires: genWires, keypad: genKeypad, lever: genLever, maze: genMaze }

export const moduleCountForLevel = (level) => (level <= 2 ? 3 : 4)
export const bombMsForLevel = (level) => (level >= 5 ? BOMB_MS_HARD : BOMB_MS)

/** The pre-modes bomb for `seed` and (uncapped, 1-6+) `level`. */
export function generateLegacyBomb(seed, level = 1) {
  const lvl = Number.isInteger(level) && level >= 1 ? level : 1
  const rng = makeRng(`wirecrossed:${seed}`)
  const { serial, indicators, ruleset } = makeShell(rng)
  const types = sample(rng, LEGACY_TYPES, moduleCountForLevel(lvl))
  const modules = types.map(type => GENERATORS[type](rng, lvl))
  return { seed: String(seed), level: lvl, serial, indicators, ruleset, modules, durationMs: bombMsForLevel(lvl) }
}
