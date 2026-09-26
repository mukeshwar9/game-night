// WIRE CROSSED: two-screen co-op defusal. The Tech holds the device, the
// Handbook holds a manual generated for this exact bomb, and neither screen
// is any use alone. Everything about a bomb — serial, indicators, modules,
// their solutions and the manual text — is derived from the room's `seed`
// and `level`, so the only synced state is the `wire` node's progress,
// strikes and result (see src/pages/WireCrossedGame.jsx).
//
// Every rule and every manual line here is original to this game.
//
// Pure — no DOM, no Firebase, no React.

// ---------------------------------------------------------------------------
// Constants

export const MAX_STRIKES = 3
export const STRIKE_PENALTY_MS = 15_000
export const BOMB_MS = 180_000
export const BOMB_MS_HARD = 150_000
/** A lever held for less than this counts as a tap. */
export const TAP_MAX_MS = 600

export const WIRE_COLORS = ['red', 'blue', 'yellow', 'white', 'black', 'green']
export const COLOR_NAMES = {
  red: 'RED', blue: 'BLUE', yellow: 'YELLOW', white: 'WHITE', black: 'BLACK', green: 'GREEN',
}
/** Letter tags printed on every wire and strip, so colour is never the only cue. */
export const COLOR_LETTERS = {
  red: 'R', blue: 'B', yellow: 'Y', white: 'W', black: 'K', green: 'G',
}

export const INDICATOR_LABELS = ['SIG', 'CLR', 'BUS', 'FRQ', 'NAV', 'AUX', 'VNT', 'TRN']
export const MODULE_TYPES = ['wires', 'keypad', 'lever', 'maze']
export const MODULE_NAMES = { wires: 'WIRES', keypad: 'GLYPHS', lever: 'LEVER', maze: 'PIPES' }

export const GLYPH_COUNT = 24
export const KEYPAD_COLUMNS = 5
export const KEYPAD_COLUMN_LEN = 6
export const KEYPAD_KEYS = 4

export const LEVER_COLORS = ['red', 'blue', 'yellow', 'white']
export const LEVER_LABELS = ['PULL', 'VENT', 'PRIME', 'LOCK']
export const STRIP_COLORS = ['red', 'blue', 'yellow', 'white', 'green']

export const MAZE_SIZE = 6
export const MAZE_CELLS = MAZE_SIZE * MAZE_SIZE
// Open-side bits for a maze cell.
export const DIRS = {
  N: { bit: 1, dr: -1, dc: 0, opposite: 'S', word: 'UP' },
  E: { bit: 2, dr: 0, dc: 1, opposite: 'W', word: 'RIGHT' },
  S: { bit: 4, dr: 1, dc: 0, opposite: 'N', word: 'DOWN' },
  W: { bit: 8, dr: 0, dc: -1, opposite: 'E', word: 'LEFT' },
}
const DIR_KEYS = ['N', 'E', 'S', 'W']

/** Fixed text-only signals for players without voice. Stored by index. */
export const QUICK_PHRASES = [
  'READ AGAIN', 'SLOWER', 'WHICH MODULE?', 'HOW MANY?', 'GOT IT', 'WAIT…', 'STOP!', 'YES', 'NO', 'DONE ✓',
]

const SERIAL_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O: they read as 1/0

// ---------------------------------------------------------------------------
// Seeded randomness (xmur3 → mulberry32). Both screens must derive the same
// bomb from the same seed; nothing here is secret.

export function makeRng(seed) {
  const s = String(seed)
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  let a = (h ^ (h >>> 16)) >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]
function shuffle(rng, arr) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
const sample = (rng, arr, n) => shuffle(rng, arr).slice(0, n)

// ---------------------------------------------------------------------------
// Bomb shell: serial, indicators, ruleset name

function makeSerial(rng) {
  const chars = []
  for (let i = 0; i < 5; i++) {
    chars.push(rng() < 0.55 ? pick(rng, SERIAL_LETTERS) : String(int(rng, 0, 9)))
  }
  if (!chars.some(c => /[A-Z]/.test(c))) chars[0] = pick(rng, SERIAL_LETTERS)
  chars.push(String(int(rng, 0, 9)))
  return chars.join('')
}

export const serialLastDigit = (serial) => Number(String(serial).slice(-1))

function makeIndicators(rng) {
  return sample(rng, INDICATOR_LABELS, 2).map(label => ({ label, lit: rng() < 0.5 }))
}

export const isLit = (bomb, label) => bomb.indicators.some(i => i.lit && i.label === label)

// ---------------------------------------------------------------------------
// Shared conditions (wires and lever rules)

const COLOR_CONDS = ['none', 'exactlyOne', 'many', 'lastIs', 'firstIs']
// Conditions that guarantee at least one wire of their colour.
const HAS_COLOR = new Set(['exactlyOne', 'many', 'lastIs', 'firstIs'])

function genBombCond(rng) {
  const r = rng()
  if (r < 0.5) return { kind: rng() < 0.5 ? 'serialOdd' : 'serialEven' }
  return { kind: 'lit', label: pick(rng, INDICATOR_LABELS) }
}

function bombCondHolds(cond, bomb) {
  const digit = serialLastDigit(bomb.serial)
  if (cond.kind === 'serialOdd') return digit % 2 === 1
  if (cond.kind === 'serialEven') return digit % 2 === 0
  if (cond.kind === 'lit') return isLit(bomb, cond.label)
  return false
}

function describeBombCond(cond) {
  if (cond.kind === 'serialOdd') return 'the serial ends in an odd digit'
  if (cond.kind === 'serialEven') return 'the serial ends in an even digit'
  if (cond.kind === 'lit') return `an indicator marked ${cond.label} is lit`
  return ''
}

// ---------------------------------------------------------------------------
// Module: WIRES

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

function wireCondHolds(cond, wires, bomb) {
  const count = wires.filter(w => w === cond.color).length
  switch (cond.kind) {
    case 'none': return count === 0
    case 'exactlyOne': return count === 1
    case 'many': return count > 1
    case 'lastIs': return wires[wires.length - 1] === cond.color
    case 'firstIs': return wires[0] === cond.color
    default: return bombCondHolds(cond, bomb)
  }
}

function resolveWireAction(action, wires) {
  if (action.kind === 'pos') return action.n - 1
  if (action.kind === 'last') return wires.length - 1
  if (action.kind === 'firstOf') return wires.indexOf(action.color)
  if (action.kind === 'lastOf') return wires.lastIndexOf(action.color)
  return -1
}

/**
 * Which wire (0-based) the manual says to cut, and the rule that decided it
 * (1-based row, or 0 for the "otherwise" line).
 */
export function solveWires(module, bomb) {
  const { wires } = module.device
  const table = module.manual.tables[wires.length]
  for (let i = 0; i < table.rules.length; i++) {
    const { cond, action } = table.rules[i]
    if (wireCondHolds(cond, wires, bomb)) return { index: resolveWireAction(action, wires), rule: i + 1 }
  }
  return { index: resolveWireAction(table.otherwise, wires), rule: 0 }
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

export function describeWireCond(cond) {
  const c = COLOR_NAMES[cond.color]
  switch (cond.kind) {
    case 'none': return `there are no ${c} wires`
    case 'exactlyOne': return `there is exactly one ${c} wire`
    case 'many': return `there is more than one ${c} wire`
    case 'lastIs': return `the last wire is ${c}`
    case 'firstIs': return `the first wire is ${c}`
    default: return describeBombCond(cond)
  }
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']

export function describeWireAction(action) {
  if (action.kind === 'pos') return `cut the ${ORDINALS[action.n - 1]} wire`
  if (action.kind === 'last') return 'cut the last wire'
  if (action.kind === 'firstOf') return `cut the first ${COLOR_NAMES[action.color]} wire`
  if (action.kind === 'lastOf') return `cut the last ${COLOR_NAMES[action.color]} wire`
  return ''
}

// ---------------------------------------------------------------------------
// Module: GLYPHS (keypad)

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

// ---------------------------------------------------------------------------
// Module: LEVER

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

/** { tap: true } or { tap: false, digit } for this lever on this bomb. */
export function solveLever(module, bomb) {
  const { device, manual } = module
  const [byLabel, byColor] = manual.tapRules
  if (device.label === byLabel.label) return { tap: true, rule: 1 }
  if (device.color === byColor.color && bombCondHolds(byColor.cond, bomb)) return { tap: true, rule: 2 }
  return { tap: false, digit: manual.stripDigits[device.strip] }
}

export function describeLeverRule(rule, i) {
  if (i === 0) return `the lever reads ${rule.label}`
  return `the lever is ${COLOR_NAMES[rule.color]} and ${describeBombCond(rule.cond)}`
}

// ---------------------------------------------------------------------------
// Module: PIPES (maze)

export const cellRC = (cell) => ({ r: Math.floor(cell / MAZE_SIZE), c: cell % MAZE_SIZE })
export const cellName = (cell) => {
  const { r, c } = cellRC(cell)
  return `${'ABCDEF'[c]}${r + 1}`
}

/** The neighbouring cell in `dir`, or -1 off the grid. */
export function stepCell(cell, dir) {
  const { r, c } = cellRC(cell)
  const d = DIRS[dir]
  const nr = r + d.dr
  const nc = c + d.dc
  if (nr < 0 || nc < 0 || nr >= MAZE_SIZE || nc >= MAZE_SIZE) return -1
  return nr * MAZE_SIZE + nc
}

export const isOpen = (open, cell, dir) => ((open[cell] || 0) & DIRS[dir].bit) !== 0

function carveMaze(rng) {
  const open = Array(MAZE_CELLS).fill(0)
  const seen = Array(MAZE_CELLS).fill(false)
  const stack = [int(rng, 0, MAZE_CELLS - 1)]
  seen[stack[0]] = true
  while (stack.length) {
    const cell = stack[stack.length - 1]
    const options = DIR_KEYS.filter(d => {
      const n = stepCell(cell, d)
      return n >= 0 && !seen[n]
    })
    if (!options.length) { stack.pop(); continue }
    const dir = pick(rng, options)
    const next = stepCell(cell, dir)
    open[cell] |= DIRS[dir].bit
    open[next] |= DIRS[DIRS[dir].opposite].bit
    seen[next] = true
    stack.push(next)
  }
  return open
}

/** Path length between cells through open sides (Infinity when unreachable). */
export function mazeDistances(open, from) {
  const dist = Array(MAZE_CELLS).fill(Infinity)
  dist[from] = 0
  const queue = [from]
  while (queue.length) {
    const cell = queue.shift()
    for (const d of DIR_KEYS) {
      if (!isOpen(open, cell, d)) continue
      const n = stepCell(cell, d)
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
  const dist = mazeDistances(open, start)
  const minSteps = level <= 1 ? 5 : 7
  let far = dist.map((d, i) => (d >= minSteps ? i : -1)).filter(i => i >= 0)
  if (!far.length) {
    const max = Math.max(...dist)
    far = dist.map((d, i) => (d === max ? i : -1)).filter(i => i >= 0)
  }
  const exit = pick(rng, far)
  return { type: 'maze', device: { start, exit }, manual: { open } }
}

// ---------------------------------------------------------------------------
// Whole bomb

const GENERATORS = { wires: genWires, keypad: genKeypad, lever: genLever, maze: genMaze }

export const moduleCountForLevel = (level) => (level <= 2 ? 3 : 4)
export const bombMsForLevel = (level) => (level >= 5 ? BOMB_MS_HARD : BOMB_MS)

/**
 * Derive the whole bomb — device and manual — from the room seed and level.
 * Deterministic: both screens call this and must agree.
 */
export function generateBomb(seed, level = 1) {
  const lvl = Number.isInteger(level) && level >= 1 ? level : 1
  const rng = makeRng(`wirecrossed:${seed}`)
  const serial = makeSerial(rng)
  const indicators = makeIndicators(rng)
  const ruleset = `${pick(rng, SERIAL_LETTERS)}-${int(rng, 1, 9)}`
  const types = sample(rng, MODULE_TYPES, moduleCountForLevel(lvl))
  const modules = types.map(type => GENERATORS[type](rng, lvl))
  return { seed: String(seed), level: lvl, serial, indicators, ruleset, modules, durationMs: bombMsForLevel(lvl) }
}

// ---------------------------------------------------------------------------
// Clock text

/** "m:ss", seconds rounded up so the display hits 0:00 only at the boom. */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * What the bomb's clock shows at `now`: time left when the bomb has a
 * deadline, time elapsed when the room's timers are off.
 */
export function clockText(wire, now) {
  if (!Number.isFinite(wire?.armedAt)) return formatClock(0)
  if (wire.endsAt) return formatClock(wire.endsAt - now)
  return formatClock(now - wire.armedAt)
}

// ---------------------------------------------------------------------------
// Synced state (`games/{id}/wire`) — reducers

export const isSolved = (wire, i) => !!wire?.solved?.[i]
export const modProgress = (wire, i) => wire?.mods?.[i] || {}

export function strikesOf(wire) {
  const n = Number(wire?.strikes)
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_STRIKES, n) : 0
}

export function normalizeWireStats(raw) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0)
  return {
    streak: num(raw?.streak),
    best: num(raw?.best),
    defused: num(raw?.defused),
    booms: num(raw?.booms),
  }
}

/** Keypad: how many glyphs are already pressed, in order. */
export const pressedCount = (wire, i) => {
  const n = Number(modProgress(wire, i).pressed)
  return Number.isInteger(n) && n > 0 ? Math.min(KEYPAD_KEYS, n) : 0
}

/** Maze: the Tech's current cell. */
export function mazePos(wire, i, module) {
  const p = Number(modProgress(wire, i).pos)
  return Number.isInteger(p) && p >= 0 && p < MAZE_CELLS ? p : module.device.start
}

export const isCut = (wire, i, w) => !!modProgress(wire, i).cut?.[w]

/**
 * Tech arms the bomb. `durationMs` null means the room's timers are off: no
 * deadline, the clock counts up instead.
 */
export function armWire(wire, now, durationMs) {
  if (!wire || wire.phase !== 'ready') return null
  return {
    ...wire,
    phase: 'armed',
    armedAt: now,
    endsAt: durationMs == null ? null : now + durationMs,
    strikes: 0,
    solved: null,
    mods: null,
    last: null,
    result: null,
  }
}

function finish(wire, outcome, reason, now) {
  const stats = normalizeWireStats(wire.stats)
  const streak = outcome === 'defused' ? stats.streak + 1 : 0
  return {
    ...wire,
    phase: 'over',
    result: {
      outcome,
      reason,
      at: now,
      left: wire.endsAt ? Math.max(0, wire.endsAt - now) : null,
      took: Number.isFinite(wire.armedAt) ? Math.max(0, now - wire.armedAt) : null,
    },
    stats: {
      streak,
      best: Math.max(stats.best, streak),
      defused: stats.defused + (outcome === 'defused' ? 1 : 0),
      booms: stats.booms + (outcome === 'boom' ? 1 : 0),
    },
  }
}

/** The clock ran out: boom. Null when there is nothing to do. */
export function applyTimeout(wire, now) {
  if (!wire || wire.phase !== 'armed' || !wire.endsAt || now < wire.endsAt) return null
  return finish(wire, 'boom', 'time', now)
}

function judge(module, bomb, wire, i, action) {
  const progress = modProgress(wire, i)
  switch (module.type) {
    case 'wires': {
      if (action.kind !== 'cut') return null
      const w = action.wire
      if (!Number.isInteger(w) || w < 0 || w >= module.device.wires.length || progress.cut?.[w]) return null
      const ok = w === solveWires(module, bomb).index
      return {
        ok,
        solved: ok,
        progress: { ...progress, cut: { ...(progress.cut || {}), [w]: true } },
        text: `CUT WIRE ${w + 1}`,
      }
    }
    case 'keypad': {
      if (action.kind !== 'press') return null
      const done = pressedCount(wire, i)
      const g = action.glyph
      if (!module.solution.includes(g) || module.solution.indexOf(g) < done) return null
      const ok = module.solution[done] === g
      const pressed = ok ? done + 1 : done
      return {
        ok,
        solved: pressed === KEYPAD_KEYS,
        progress: { ...progress, pressed },
        text: `PRESSED GLYPH ${module.device.keys.indexOf(g) + 1}`,
      }
    }
    case 'lever': {
      if (action.kind !== 'tap' && action.kind !== 'release') return null
      const sol = solveLever(module, bomb)
      const shown = String(action.clock ?? '')
      const ok = action.kind === 'tap' ? sol.tap : !sol.tap && shown.includes(String(sol.digit))
      return {
        ok,
        solved: ok,
        progress,
        text: action.kind === 'tap' ? 'TAPPED THE LEVER' : `RELEASED AT ${shown || '?'}`,
      }
    }
    case 'maze': {
      if (action.kind !== 'move' || !DIRS[action.dir]) return null
      const pos = mazePos(wire, i, module)
      const next = stepCell(pos, action.dir)
      const ok = next >= 0 && isOpen(module.manual.open, pos, action.dir)
      const at = ok ? next : pos
      return {
        ok,
        solved: ok && at === module.device.exit,
        progress: { ...progress, pos: at },
        text: `MOVED ${DIRS[action.dir].word}${ok ? '' : ' — PIPE WALL'}`,
      }
    }
    default:
      return null
  }
}

/**
 * Apply one Tech action to the synced `wire` node.
 *
 * @param {any} wire - live `wire` node
 * @param {ReturnType<typeof generateBomb>} bomb
 * @param {{ mod: number, kind: string, wire?: number, glyph?: number, clock?: string, dir?: string }} action
 * @param {number} now - server time
 * @param {'X'|'O'} [by]
 * @returns {{ wire: any, ok: boolean | null } | null} null when the action is
 *   not allowed (not armed, already solved/cut, bad index); `ok` null when
 *   the clock had already run out and the action turned into the boom.
 */
export function applyWireAction(wire, bomb, action, now, by) {
  if (!wire || wire.phase !== 'armed' || !action) return null
  const timedOut = applyTimeout(wire, now)
  if (timedOut) return { wire: timedOut, ok: null }
  const i = action.mod
  const module = bomb.modules[i]
  if (!module || isSolved(wire, i)) return null
  const verdict = judge(module, bomb, wire, i, action)
  if (!verdict) return null

  let next = {
    ...wire,
    mods: { ...(wire.mods || {}), [i]: verdict.progress },
    last: { by: by || null, mod: i, text: verdict.text, ok: verdict.ok, at: now },
  }
  if (verdict.solved) next.solved = { ...(wire.solved || {}), [i]: true }
  if (!verdict.ok) {
    const strikes = strikesOf(wire) + 1
    next.strikes = strikes
    if (next.endsAt) next.endsAt = next.endsAt - STRIKE_PENALTY_MS
    if (strikes >= MAX_STRIKES) return { wire: finish(next, 'boom', 'strikes', now), ok: false }
    if (next.endsAt && now >= next.endsAt) return { wire: finish(next, 'boom', 'time', now), ok: false }
  }
  if (bomb.modules.every((_, m) => isSolved(next, m))) {
    return { wire: finish(next, 'defused', 'solved', now), ok: verdict.ok }
  }
  return { wire: next, ok: verdict.ok }
}
