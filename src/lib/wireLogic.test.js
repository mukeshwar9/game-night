import { describe, expect, it } from 'vitest'
import {
  applyTimeout, applyWireAction, armWire, bombMsForLevel, cellName, clockText, describeWireAction,
  describeWireCond, formatClock, generateBomb, isOpen, makeRng, mazeDistances, mazePos,
  moduleCountForLevel, normalizeWireStats, pressedCount, solveLever, solveWires, stepCell,
  BOMB_MS, BOMB_MS_HARD, GLYPH_COUNT, KEYPAD_COLUMNS, KEYPAD_KEYS, MAX_STRIKES, MAZE_CELLS,
  MODULE_TYPES, STRIKE_PENALTY_MS,
} from './wireLogic'

const SEEDS = Array.from({ length: 60 }, (_, i) => `seed-${i}`)
const armed = (seed = 's1', level = 3, now = 1000) =>
  armWire({ seed, level, tech: 'X', phase: 'ready', strikes: 0 }, now, BOMB_MS)

// A bomb whose modules include `type`, scanning seeds deterministically.
function bombWith(type, level = 3) {
  for (const seed of SEEDS) {
    const bomb = generateBomb(seed, level)
    const i = bomb.modules.findIndex(m => m.type === type)
    if (i >= 0) return { bomb, i, seed }
  }
  throw new Error(`no ${type} module in test seeds`)
}

// The correct action for module i.
function solveAction(bomb, i, wire) {
  const m = bomb.modules[i]
  if (m.type === 'wires') return [{ mod: i, kind: 'cut', wire: solveWires(m, bomb).index }]
  if (m.type === 'keypad') return m.solution.map(glyph => ({ mod: i, kind: 'press', glyph }))
  if (m.type === 'lever') {
    const sol = solveLever(m, bomb)
    return [sol.tap ? { mod: i, kind: 'tap' } : { mod: i, kind: 'release', clock: `0:${sol.digit}0` }]
  }
  // maze: walk the shortest path
  const moves = []
  let pos = mazePos(wire, i, m)
  const target = m.device.exit
  while (pos !== target) {
    const dist = mazeDistances(m.manual.open, target)
    const dir = ['N', 'E', 'S', 'W'].find(d => isOpen(m.manual.open, pos, d) && dist[stepCell(pos, d)] === dist[pos] - 1)
    moves.push({ mod: i, kind: 'move', dir })
    pos = stepCell(pos, dir)
  }
  return moves
}

describe('makeRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = makeRng('abc')
    const b = makeRng('abc')
    const c = makeRng('abd')
    const xs = Array.from({ length: 50 }, () => a())
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs)
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(xs)
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true)
  })
})

describe('generateBomb', () => {
  it('derives the same bomb from the same seed and level', () => {
    expect(generateBomb('k7', 2)).toEqual(generateBomb('k7', 2))
    expect(generateBomb('k7', 2)).not.toEqual(generateBomb('k8', 2))
  })

  it('has a serial ending in a digit and two distinct indicators', () => {
    for (const seed of SEEDS) {
      const bomb = generateBomb(seed)
      expect(bomb.serial).toMatch(/^[A-Z0-9]{5}[0-9]$/)
      expect(bomb.serial).toMatch(/[A-Z]/)
      expect(bomb.serial).not.toMatch(/[IO]/)
      expect(bomb.indicators).toHaveLength(2)
      expect(bomb.indicators[0].label).not.toBe(bomb.indicators[1].label)
    }
  })

  it('scales module count and clock with level, one module per type', () => {
    expect(moduleCountForLevel(1)).toBe(3)
    expect(moduleCountForLevel(3)).toBe(4)
    expect(bombMsForLevel(1)).toBe(BOMB_MS)
    expect(bombMsForLevel(5)).toBe(BOMB_MS_HARD)
    for (const seed of SEEDS.slice(0, 20)) {
      const easy = generateBomb(seed, 1)
      const hard = generateBomb(seed, 4)
      expect(easy.modules).toHaveLength(3)
      expect(hard.modules.map(m => m.type).sort()).toEqual([...MODULE_TYPES].sort())
      expect(new Set(easy.modules.map(m => m.type)).size).toBe(3)
    }
  })

  it('treats a bad level as level 1', () => {
    expect(generateBomb('x', 0).level).toBe(1)
    expect(generateBomb('x', 'hard').level).toBe(1)
  })
})

describe('wires module', () => {
  it('always resolves to a real wire', () => {
    for (const seed of SEEDS) {
      for (const level of [1, 2, 3]) {
        const bomb = generateBomb(seed, level)
        bomb.modules.filter(m => m.type === 'wires').forEach(m => {
          const n = m.device.wires.length
          expect(n).toBeGreaterThanOrEqual(3)
          expect(n).toBeLessThanOrEqual(level <= 1 ? 4 : level === 2 ? 5 : 6)
          const { index } = solveWires(m, bomb)
          expect(index).toBeGreaterThanOrEqual(0)
          expect(index).toBeLessThan(n)
        })
      }
    }
  })

  it('applies the first matching rule, top to bottom', () => {
    const bomb = { serial: 'AB12C3', indicators: [{ label: 'SIG', lit: true }, { label: 'NAV', lit: false }] }
    const m = {
      type: 'wires',
      device: { wires: ['red', 'blue', 'red'] },
      manual: {
        tables: {
          3: {
            rules: [
              { cond: { kind: 'none', color: 'red' }, action: { kind: 'pos', n: 1 } },
              { cond: { kind: 'lit', label: 'SIG' }, action: { kind: 'lastOf', color: 'red' } },
              { cond: { kind: 'serialOdd' }, action: { kind: 'pos', n: 2 } },
            ],
            otherwise: { kind: 'last' },
          },
        },
      },
    }
    expect(solveWires(m, bomb)).toEqual({ index: 2, rule: 2 })
    m.manual.tables[3].rules[1].cond = { kind: 'lit', label: 'NAV' }
    expect(solveWires(m, bomb)).toEqual({ index: 1, rule: 3 })
    m.manual.tables[3].rules[2].cond = { kind: 'serialEven' }
    expect(solveWires(m, bomb)).toEqual({ index: 2, rule: 0 })
  })

  it('writes manual lines in plain words', () => {
    expect(describeWireCond({ kind: 'many', color: 'blue' })).toBe('there is more than one BLUE wire')
    expect(describeWireCond({ kind: 'serialOdd' })).toBe('the serial ends in an odd digit')
    expect(describeWireCond({ kind: 'lit', label: 'FRQ' })).toBe('an indicator marked FRQ is lit')
    expect(describeWireAction({ kind: 'pos', n: 3 })).toBe('cut the third wire')
    expect(describeWireAction({ kind: 'firstOf', color: 'green' })).toBe('cut the first GREEN wire')
  })
})

describe('glyph keypad module', () => {
  it('shows four glyphs from exactly one manual column', () => {
    for (const seed of SEEDS) {
      const bomb = generateBomb(seed, 4)
      const m = bomb.modules.find(x => x.type === 'keypad')
      expect(m.manual.columns).toHaveLength(KEYPAD_COLUMNS)
      expect(m.device.keys).toHaveLength(KEYPAD_KEYS)
      expect([...m.device.keys].sort()).toEqual([...m.solution].sort())
      m.manual.columns.flat().forEach(g => expect(g).toBeLessThan(GLYPH_COUNT))
      const holders = m.manual.columns.filter(col => m.solution.every(g => col.includes(g)))
      expect(holders).toHaveLength(1)
      const col = holders[0]
      const order = m.solution.map(g => col.indexOf(g))
      expect(order).toEqual([...order].sort((a, b) => a - b))
    }
  })
})

describe('lever module', () => {
  it('taps on a label match, else holds for the strip digit', () => {
    const bomb = { serial: 'AB12C4', indicators: [{ label: 'SIG', lit: false }, { label: 'NAV', lit: false }] }
    const m = {
      type: 'lever',
      device: { color: 'blue', label: 'VENT', strip: 'yellow' },
      manual: {
        tapRules: [{ label: 'VENT' }, { color: 'red', cond: { kind: 'serialEven' } }],
        stripDigits: { red: 1, blue: 2, yellow: 7, white: 4, green: 5 },
      },
    }
    expect(solveLever(m, bomb)).toMatchObject({ tap: true, rule: 1 })
    m.device.label = 'LOCK'
    expect(solveLever(m, bomb)).toEqual({ tap: false, digit: 7 })
    m.device.color = 'red'
    expect(solveLever(m, bomb)).toMatchObject({ tap: true, rule: 2 })
  })
})

describe('pipe maze module', () => {
  it('carves a perfect maze with a reachable exit far from the start', () => {
    for (const seed of SEEDS) {
      const m = generateBomb(seed, 4).modules.find(x => x.type === 'maze')
      const dist = mazeDistances(m.manual.open, m.device.start)
      expect(dist.every(d => Number.isFinite(d))).toBe(true)
      expect(dist[m.device.exit]).toBeGreaterThanOrEqual(5)
      // perfect maze: exactly cells - 1 passages
      const passages = m.manual.open.reduce((n, bits) => n + [1, 2, 4, 8].filter(b => bits & b).length, 0) / 2
      expect(passages).toBe(MAZE_CELLS - 1)
    }
  })

  it('names cells by column letter and row number', () => {
    expect(cellName(0)).toBe('A1')
    expect(cellName(35)).toBe('F6')
    expect(stepCell(0, 'N')).toBe(-1)
    expect(stepCell(0, 'E')).toBe(1)
  })
})

describe('applyWireAction', () => {
  it('refuses actions before arming and after the end', () => {
    const bomb = generateBomb('s1', 3)
    expect(applyWireAction({ phase: 'ready' }, bomb, { mod: 0, kind: 'tap' }, 1)).toBeNull()
    expect(applyWireAction({ phase: 'over' }, bomb, { mod: 0, kind: 'tap' }, 1)).toBeNull()
  })

  it('defuses when every module is solved, crediting the streak', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const bomb = generateBomb(seed, 4)
      let wire = { ...armed(seed, 4), stats: { streak: 2, best: 2, defused: 2, booms: 1 } }
      bomb.modules.forEach((_, i) => {
        for (const action of solveAction(bomb, i, wire)) {
          const res = applyWireAction(wire, bomb, action, 2000, 'X')
          expect(res.ok).toBe(true)
          wire = res.wire
        }
      })
      expect(wire.phase).toBe('over')
      expect(wire.result).toMatchObject({ outcome: 'defused', reason: 'solved' })
      expect(wire.strikes).toBe(0)
      expect(normalizeWireStats(wire.stats)).toEqual({ streak: 3, best: 3, defused: 3, booms: 1 })
    }
  })

  it('strikes and costs time on a wrong cut, and never re-cuts a wire', () => {
    const { bomb, i, seed } = bombWith('wires')
    const m = bomb.modules[i]
    const right = solveWires(m, bomb).index
    const wrong = right === 0 ? 1 : 0
    const start = armed(seed)
    const res = applyWireAction(start, bomb, { mod: i, kind: 'cut', wire: wrong }, 2000, 'O')
    expect(res.ok).toBe(false)
    expect(res.wire.strikes).toBe(1)
    expect(res.wire.endsAt).toBe(start.endsAt - STRIKE_PENALTY_MS)
    expect(res.wire.last).toMatchObject({ by: 'O', ok: false, text: `CUT WIRE ${wrong + 1}` })
    expect(applyWireAction(res.wire, bomb, { mod: i, kind: 'cut', wire: wrong }, 2000)).toBeNull()
    expect(applyWireAction(res.wire, bomb, { mod: i, kind: 'cut', wire: 9 }, 2000)).toBeNull()
  })

  it('keeps keypad progress through a wrong press and ignores a repeat', () => {
    const { bomb, i, seed } = bombWith('keypad')
    const sol = bomb.modules[i].solution
    let wire = armed(seed)
    wire = applyWireAction(wire, bomb, { mod: i, kind: 'press', glyph: sol[0] }, 2000).wire
    expect(pressedCount(wire, i)).toBe(1)
    const wrong = applyWireAction(wire, bomb, { mod: i, kind: 'press', glyph: sol[2] }, 2000)
    expect(wrong.ok).toBe(false)
    expect(pressedCount(wrong.wire, i)).toBe(1)
    expect(applyWireAction(wire, bomb, { mod: i, kind: 'press', glyph: sol[0] }, 2000)).toBeNull()
  })

  it('judges the lever by tap versus release digit', () => {
    const { bomb, i, seed } = bombWith('lever')
    const sol = solveLever(bomb.modules[i], bomb)
    const wire = armed(seed)
    const tap = applyWireAction(wire, bomb, { mod: i, kind: 'tap' }, 2000)
    expect(tap.ok).toBe(sol.tap)
    if (!sol.tap) {
      const other = (sol.digit + 1) % 10
      const miss = applyWireAction(wire, bomb, { mod: i, kind: 'release', clock: `${other}:${other}${other}` }, 2000)
      expect(miss.ok).toBe(false)
      expect(applyWireAction(wire, bomb, { mod: i, kind: 'release', clock: `1:${sol.digit}${other}` }, 2000).ok).toBe(true)
    }
  })

  it('bumps into pipe walls without moving', () => {
    const { bomb, i, seed } = bombWith('maze')
    const m = bomb.modules[i]
    const wire = armed(seed)
    const pos = m.device.start
    const blocked = ['N', 'E', 'S', 'W'].find(d => !isOpen(m.manual.open, pos, d))
    const res = applyWireAction(wire, bomb, { mod: i, kind: 'move', dir: blocked }, 2000)
    expect(res.ok).toBe(false)
    expect(mazePos(res.wire, i, m)).toBe(pos)
    expect(res.wire.last.text).toMatch(/PIPE WALL/)
  })

  it('booms on the third strike', () => {
    const { bomb, i, seed } = bombWith('wires')
    const m = bomb.modules[i]
    const right = solveWires(m, bomb).index
    const wrongs = m.device.wires.map((_, w) => w).filter(w => w !== right)
    let wire = { ...armed(seed), strikes: MAX_STRIKES - 1 }
    const res = applyWireAction(wire, bomb, { mod: i, kind: 'cut', wire: wrongs[0] }, 2000)
    expect(res.wire.phase).toBe('over')
    expect(res.wire.result).toMatchObject({ outcome: 'boom', reason: 'strikes' })
    expect(res.wire.stats.streak).toBe(0)
    expect(res.wire.stats.booms).toBe(1)
    wire = res.wire
    expect(applyWireAction(wire, bomb, { mod: i, kind: 'cut', wire: right }, 2000)).toBeNull()
  })

  it('booms when a strike penalty eats the last seconds', () => {
    const { bomb, i, seed } = bombWith('wires')
    const right = solveWires(bomb.modules[i], bomb).index
    const wire = { ...armed(seed, 3, 0), endsAt: 10_000 }
    const res = applyWireAction(wire, bomb, { mod: i, kind: 'cut', wire: right === 0 ? 1 : 0 }, 5_000)
    expect(res.wire.result).toMatchObject({ outcome: 'boom', reason: 'time' })
  })

  it('turns a late action into the timeout boom', () => {
    const bomb = generateBomb('s1', 3)
    const wire = armed('s1', 3, 0)
    const res = applyWireAction(wire, bomb, { mod: 0, kind: 'tap' }, BOMB_MS + 1)
    expect(res.ok).toBeNull()
    expect(res.wire.result).toMatchObject({ outcome: 'boom', reason: 'time', left: 0 })
  })
})

describe('arming, timeout and clock', () => {
  it('arms only a ready bomb and supports timers off', () => {
    const ready = { seed: 'a', level: 1, tech: 'X', phase: 'ready', strikes: 0 }
    expect(armWire(ready, 100, 5000)).toMatchObject({ phase: 'armed', armedAt: 100, endsAt: 5100 })
    expect(armWire(ready, 100, null)).toMatchObject({ phase: 'armed', endsAt: null })
    expect(armWire({ ...ready, phase: 'armed' }, 100, 5000)).toBeNull()
  })

  it('times out only an armed bomb past its deadline', () => {
    const wire = armWire({ phase: 'ready' }, 0, 1000)
    expect(applyTimeout(wire, 999)).toBeNull()
    expect(applyTimeout(wire, 1000).result.outcome).toBe('boom')
    expect(applyTimeout({ ...wire, endsAt: null }, 1e9)).toBeNull()
  })

  it('formats the clock counting down, or up with timers off', () => {
    expect(formatClock(180_000)).toBe('3:00')
    expect(formatClock(59_001)).toBe('1:00')
    expect(formatClock(-5)).toBe('0:00')
    expect(clockText({ armedAt: 0, endsAt: 65_000 }, 0)).toBe('1:05')
    expect(clockText({ armedAt: 0, endsAt: null }, 7_000)).toBe('0:07')
  })
})
