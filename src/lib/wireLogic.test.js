import { describe, expect, it } from 'vitest'
import {
  acceptMode, applyTimeout, applyWireAction, armWire, bombMsForLevel, cancelMode, clockText,
  formatClock, generateBomb, isLegacyWire, moduleCountForLevel, normalizeWireStats, proposeMode,
  solveWires, BOMB_MS, BOMB_MS_HARD, MAX_STRIKES, MODULES, STRIKE_PENALTY_MS,
} from './wireLogic'
import { nextWireBomb } from './wireMatchLogic'

const SEEDS = Array.from({ length: 60 }, (_, i) => `seed-${i}`)
const ready = (over = {}) => ({
  seed: 's1', level: 1, bombNo: 1, tech: 'X', phase: 'ready', strikes: 0, mode: 'easy', run: { booms: 0, ms: 0 }, ...over,
})
const armed = (over = {}, now = 1000, ms = BOMB_MS) => armWire(ready(over), now, ms)

// Drive every module of `bomb` to solved with solveNext.
function solveAll(bomb, wire, now = 2000) {
  let cur = wire
  while (cur.phase === 'armed') {
    const i = bomb.modules.findIndex((_, m) => !cur.solved?.[m])
    const module = bomb.modules[i]
    const action = MODULES[module.type].solveNext(module, bomb, cur, i, now)
    const res = applyWireAction(cur, bomb, action, now, cur.tech ?? 'X')
    expect(res.ok).toBe(true)
    cur = res.wire
  }
  return cur
}

// A bomb whose modules include `type`, scanning seeds deterministically.
function bombWith(type, mode = 'easy', level = 1) {
  for (const seed of SEEDS) {
    const bomb = generateBomb(seed, level, mode)
    const i = bomb.modules.findIndex(m => m.type === type)
    if (i >= 0) return { bomb, i, seed }
  }
  throw new Error(`no ${type} module in test seeds`)
}

describe('generateBomb without a mode (legacy)', () => {
  it('derives the same bomb from the same seed and level', () => {
    expect(generateBomb('k7', 2)).toEqual(generateBomb('k7', 2))
    expect(generateBomb('k7', 2)).not.toEqual(generateBomb('k8', 2))
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
      expect(hard.modules.map(m => m.type).sort()).toEqual(['keypad', 'lever', 'maze', 'wires'])
      expect(new Set(easy.modules.map(m => m.type)).size).toBe(3)
    }
  })

  it('treats a bad level as level 1', () => {
    expect(generateBomb('x', 0).level).toBe(1)
    expect(generateBomb('x', 'hard').level).toBe(1)
  })

  it('still plays: a legacy bomb is armable, solvable and uses the base penalty', () => {
    const bomb = generateBomb('s1', 4)
    const legacy = { seed: 's1', level: 4, tech: 'X', phase: 'ready', strikes: 0 }
    expect(isLegacyWire(legacy)).toBe(true)
    const wire = solveAll(bomb, armWire(legacy, 1000, BOMB_MS))
    expect(wire.result).toMatchObject({ outcome: 'defused', reason: 'solved', cleared: false })
    expect(wire.run).toBeUndefined()
  })
})

describe('applyWireAction', () => {
  it('refuses actions before arming and after the end', () => {
    const bomb = generateBomb('s1', 1, 'easy')
    expect(applyWireAction({ phase: 'ready' }, bomb, { mod: 0, kind: 'tap' }, 1)).toBeNull()
    expect(applyWireAction({ phase: 'over' }, bomb, { mod: 0, kind: 'tap' }, 1)).toBeNull()
  })

  it('defuses when every module is solved, counting the bomb in the tally', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const bomb = generateBomb(seed, 1, 'medium')
      const wire = solveAll(bomb, armed({ seed, level: 1, mode: 'medium', stats: { defused: 2, booms: 1 } }))
      expect(wire.phase).toBe('over')
      expect(wire.result).toMatchObject({ outcome: 'defused', reason: 'solved', cleared: false })
      expect(wire.strikes).toBe(0)
      expect(normalizeWireStats(wire.stats)).toMatchObject({ defused: 3, booms: 1 })
    }
  })

  it('strikes and costs the base 15 s on a wrong cut', () => {
    const { bomb, i, seed } = bombWith('wires')
    const right = solveWires(bomb.modules[i], bomb).index
    const wrong = right === 0 ? 1 : 0
    const start = armed({ seed })
    const res = applyWireAction(start, bomb, { mod: i, kind: 'cut', wire: wrong }, 2000, 'X')
    expect(res.ok).toBe(false)
    expect(res.wire.strikes).toBe(1)
    expect(res.wire.endsAt).toBe(start.endsAt - STRIKE_PENALTY_MS)
    expect(res.wire.last).toMatchObject({ by: 'X', ok: false, text: `CUT WIRE ${wrong + 1}` })
  })

  it('costs 25 s per strike with Short Fuse', () => {
    const seed = SEEDS.find(s => generateBomb(s, 3, 'medium').modifiers.includes('shortFuse') && generateBomb(s, 3, 'medium').modules.some(m => m.type === 'wires'))
    const bomb = generateBomb(seed, 3, 'medium')
    expect(bomb.strikePenaltyMs).toBe(25_000)
    const i = bomb.modules.findIndex(m => m.type === 'wires')
    const right = solveWires(bomb.modules[i], bomb).index
    const start = armed({ seed, level: 3, mode: 'medium' })
    const res = applyWireAction(start, bomb, { mod: i, kind: 'cut', wire: right === 0 ? 1 : 0 }, 2000)
    expect(res.wire.endsAt).toBe(start.endsAt - 25_000)
  })

  it('booms on the third strike', () => {
    const { bomb, i, seed } = bombWith('wires')
    const right = solveWires(bomb.modules[i], bomb).index
    const wrongs = bomb.modules[i].device.wires.map((_, w) => w).filter(w => w !== right)
    const wire = { ...armed({ seed }), strikes: MAX_STRIKES - 1 }
    const res = applyWireAction(wire, bomb, { mod: i, kind: 'cut', wire: wrongs[0] }, 2000)
    expect(res.wire.phase).toBe('over')
    expect(res.wire.result).toMatchObject({ outcome: 'boom', reason: 'strikes', cleared: false })
    expect(res.wire.stats.booms).toBe(1)
    expect(applyWireAction(res.wire, bomb, { mod: i, kind: 'cut', wire: right }, 2000)).toBeNull()
  })

  it('booms when a strike penalty eats the last seconds', () => {
    const { bomb, i, seed } = bombWith('wires')
    const right = solveWires(bomb.modules[i], bomb).index
    const wire = { ...armed({ seed }, 0), endsAt: 10_000 }
    const res = applyWireAction(wire, bomb, { mod: i, kind: 'cut', wire: right === 0 ? 1 : 0 }, 5_000)
    expect(res.wire.result).toMatchObject({ outcome: 'boom', reason: 'time' })
  })

  it('turns a late action into the timeout boom', () => {
    const bomb = generateBomb('s1', 1, 'easy')
    const res = applyWireAction(armed({}, 0), bomb, { mod: 0, kind: 'tap' }, BOMB_MS + 1)
    expect(res.ok).toBeNull()
    expect(res.wire.result).toMatchObject({ outcome: 'boom', reason: 'time', left: 0 })
  })
})

describe('run progress and records', () => {
  it('adds every attempt to the run time and clears nothing before the last level', () => {
    const bomb = generateBomb('s1', 1, 'easy')
    const wire = solveAll(bomb, armed({ run: { booms: 1, ms: 5000 } }, 1000))
    expect(wire.result.cleared).toBe(false)
    expect(wire.run).toEqual({ booms: 1, ms: 5000 + 1000 })
    expect(normalizeWireStats(wire.stats).records.easy.clears).toBe(0)
  })

  it('MODE CLEARED on the last level updates the mode records', () => {
    const bomb = generateBomb('s2', 2, 'easy')
    const stats = { defused: 1, booms: 0, records: { easy: { bestMs: 9000, fewestBooms: 2, clears: 1 } } }
    const wire = solveAll(bomb, armed({ seed: 's2', level: 2, run: { booms: 1, ms: 4000 }, stats }, 0))
    expect(wire.result).toMatchObject({ outcome: 'defused', cleared: true })
    expect(wire.run).toEqual({ booms: 1, ms: 4000 + 2000 })
    expect(normalizeWireStats(wire.stats).records.easy).toEqual({ bestMs: 6000, fewestBooms: 1, clears: 2 })
    expect(normalizeWireStats(wire.stats).records.hard).toEqual({ bestMs: null, fewestBooms: null, clears: 0 })
  })

  it('keeps a better old record when the new run is worse', () => {
    const bomb = generateBomb('s2', 2, 'easy')
    const stats = { records: { easy: { bestMs: 500, fewestBooms: 0, clears: 3 } } }
    const wire = solveAll(bomb, armed({ seed: 's2', level: 2, run: { booms: 2, ms: 100_000 }, stats }, 0))
    expect(normalizeWireStats(wire.stats).records.easy).toEqual({ bestMs: 500, fewestBooms: 0, clears: 4 })
  })

  it('a boom on the last level clears nothing', () => {
    const bomb = generateBomb('s2', 2, 'easy')
    const boomed = applyTimeout({ ...armed({ seed: 's2', level: 2 }), endsAt: 5000 }, 6000)
    expect(bomb.level).toBe(2)
    expect(boomed.result).toMatchObject({ outcome: 'boom', cleared: false })
    expect(normalizeWireStats(boomed.stats).records.easy.clears).toBe(0)
  })

  it('normalizes missing and malformed stats', () => {
    const empty = normalizeWireStats(undefined)
    expect(empty).toMatchObject({ defused: 0, booms: 0 })
    expect(empty.records.medium).toEqual({ bestMs: null, fewestBooms: null, clears: 0 })
    expect(normalizeWireStats({ streak: 4, best: 4, defused: 2 })).toMatchObject({ defused: 2, booms: 0 })
    expect(normalizeWireStats({ records: { easy: { bestMs: -3, fewestBooms: 'x', clears: 'y' } } }).records.easy)
      .toEqual({ bestMs: null, fewestBooms: null, clears: 0 })
  })

  it('plays a whole EASY run through nextWireBomb: boom retries, clear resets', () => {
    let w = nextWireBomb(null, 'a')
    expect(w.mode).toBeNull()
    w = acceptMode(proposeMode(w, 'easy', 'X', 1), 'O', 'b')
    expect(w).toMatchObject({ mode: 'easy', level: 1, run: { booms: 0, ms: 0 } })
    // level 1 boom -> retry level 1, booms 1
    let over = applyTimeout({ ...armWire(w, 0, 1000) }, 2000)
    w = nextWireBomb(over, 'c')
    expect(w).toMatchObject({ mode: 'easy', level: 1, run: { booms: 1 } })
    // level 1 defuse -> level 2
    over = solveAll(generateBomb('c', 1, 'easy'), armWire(w, 0, BOMB_MS), 500)
    w = nextWireBomb(over, 'd')
    expect(w).toMatchObject({ level: 2, run: { booms: 1, ms: 2500 } })
    // level 2 defuse -> cleared -> new run at level 1, same mode
    over = solveAll(generateBomb('d', 2, 'easy'), armWire(w, 0, BOMB_MS), 700)
    expect(over.result.cleared).toBe(true)
    w = nextWireBomb(over, 'e')
    expect(w).toMatchObject({ mode: 'easy', level: 1, run: { booms: 0, ms: 0 } })
    expect(normalizeWireStats(w.stats).records.easy).toMatchObject({ bestMs: 3200, fewestBooms: 1, clears: 1 })
  })
})

describe('arming, timeout and clock', () => {
  it('arms only a ready bomb and supports timers off', () => {
    expect(armWire(ready(), 100, 5000)).toMatchObject({ phase: 'armed', armedAt: 100, endsAt: 5100 })
    expect(armWire(ready(), 100, null)).toMatchObject({ phase: 'armed', endsAt: null })
    expect(armWire(ready({ phase: 'armed' }), 100, 5000)).toBeNull()
  })

  it('refuses to arm a modes-era bomb until a mode is set, but not a legacy one', () => {
    expect(armWire(ready({ mode: null }), 100, 5000)).toBeNull()
    expect(armWire(ready({ mode: undefined }), 100, 5000)).toBeNull()
    expect(armWire(ready({ mode: 'bogus' }), 100, 5000)).toBeNull()
    const legacy = { seed: 'a', level: 5, tech: 'X', phase: 'ready', strikes: 0 }
    expect(armWire(legacy, 100, 5000)).toMatchObject({ phase: 'armed' })
  })

  it('times out only an armed bomb past its deadline', () => {
    const wire = armWire(ready(), 0, 1000)
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

describe('mode proposal reducers', () => {
  const picking = () => nextWireBomb(null, 'p1')

  it('lets either seat propose, overwriting an earlier proposal', () => {
    const w1 = proposeMode(picking(), 'hard', 'X', 10)
    expect(w1.modeProposal).toEqual({ by: 'X', mode: 'hard', at: 10 })
    const w2 = proposeMode(w1, 'easy', 'O', 20)
    expect(w2.modeProposal).toEqual({ by: 'O', mode: 'easy', at: 20 })
  })

  it('refuses a bad mode, a bad seat, an armed bomb and the current mode', () => {
    expect(proposeMode(picking(), 'endless', 'X', 1)).toBeNull()
    expect(proposeMode(picking(), 'easy', null, 1)).toBeNull()
    expect(proposeMode(picking(), 'easy', 'Z', 1)).toBeNull()
    expect(proposeMode(ready({ phase: 'armed' }), 'hard', 'X', 1)).toBeNull()
    expect(proposeMode(ready({ mode: 'easy' }), 'easy', 'X', 1)).toBeNull()
    expect(proposeMode(null, 'easy', 'X', 1)).toBeNull()
    expect(proposeMode(ready({ mode: 'easy' }), 'hard', 'X', 1)).not.toBeNull()
  })

  it('accept sets the mode, clears the proposal and restarts at level 1 with a new seed', () => {
    const proposed = proposeMode(picking(), 'medium', 'X', 5)
    expect(acceptMode(proposed, 'X', 'new')).toBeNull() // the proposer cannot accept their own
    const w = acceptMode(proposed, 'O', 'new')
    expect(w).toMatchObject({ seed: 'new', mode: 'medium', level: 1, phase: 'ready', run: { booms: 0, ms: 0 }, bombNo: 1, tech: 'X' })
    expect(w.modeProposal).toBeUndefined()
  })

  it('accepting from a finished bomb drops its state, flips the Tech and keeps the tally', () => {
    const over = { ...ready({ mode: 'easy', level: 2, phase: 'over', bombNo: 3, tech: 'X', stats: { defused: 2, booms: 1 } }), result: { outcome: 'defused' }, solved: { 0: true }, last: { text: 'x' }, ping: { by: 'X', p: 1, at: 1 }, endsAt: 5, armedAt: 1 }
    const w = acceptMode(proposeMode(over, 'hard', 'O', 9), 'X', 'z')
    expect(w).toMatchObject({ mode: 'hard', level: 1, bombNo: 4, tech: 'O', phase: 'ready', stats: { defused: 2, booms: 1 } })
    for (const key of ['result', 'solved', 'last', 'ping', 'endsAt', 'armedAt', 'modeProposal']) expect(w[key]).toBeUndefined()
  })

  it('accept needs a proposal, and not while armed', () => {
    expect(acceptMode(picking(), 'O', 'z')).toBeNull()
    const armedWithProposal = { ...ready({ phase: 'armed' }), modeProposal: { by: 'X', mode: 'easy', at: 1 } }
    expect(acceptMode(armedWithProposal, 'O', 'z')).toBeNull()
  })

  it('either seat can cancel or decline; nothing to cancel is null', () => {
    const proposed = proposeMode(picking(), 'hard', 'X', 1)
    expect(cancelMode(proposed, 'X').modeProposal).toBeUndefined()
    expect(cancelMode(proposed, 'O').modeProposal).toBeUndefined()
    expect(cancelMode(proposed, 'X')).toMatchObject({ seed: 'p1', phase: 'ready' })
    expect(cancelMode(picking(), 'X')).toBeNull()
    expect(cancelMode(proposed, 'Q')).toBeNull()
  })
})

describe('Swap', () => {
  // A Hard level 3 bomb that carries Swap and has a wires module the Tech can strike on.
  const seed = Array.from({ length: 400 }, (_, i) => `swap-${i}`)
    .find(s => { const b = generateBomb(s, 3, 'hard'); return b.modifiers.includes('swap') && b.modules.some(m => m.type === 'wires') })
  const bomb = generateBomb(seed, 3, 'hard')
  // A slow Gauge (timerScale 100) so no burst gets in the way of the actions below.
  const start = () => armWire(ready({ seed, level: 3, mode: 'hard' }), 1000, 200_000, bomb, 100)
  const i = bomb.modules.findIndex(m => m.type === 'wires')
  const cut = (w) => ({ mod: i, kind: 'cut', wire: w })
  const right = () => solveWires(bomb.modules[i], bomb).index

  it('arms with swapAt at half of the base duration, scaled or not', () => {
    expect(start().swapAt).toBe(1000 + 100_000)
    expect(armWire(ready({ seed, level: 3, mode: 'hard' }), 1000, 400_000, bomb, 2).swapAt).toBe(1000 + 200_000)
    // Timers off: no deadline, but the swap still lands at half of the base clock.
    const off = armWire(ready({ seed, level: 3, mode: 'hard' }), 1000, null, bomb, 0)
    expect(off.endsAt).toBeNull()
    expect(off.swapAt).toBe(1000 + bomb.durationMs / 2)
  })

  it('does not set swapAt without the modifier, nor keep an old one', () => {
    const plain = generateBomb('p', 1, 'easy')
    expect(armWire(ready(), 1000, 5000, plain, 1).swapAt).toBeUndefined()
    expect(armWire(ready({ swapAt: 5 }), 1000, 5000, plain, 1).swapAt).toBeUndefined()
  })

  it('accepts actions only from the current Tech: X before the swap, O after', () => {
    const wire = start()
    expect(wire.tech).toBe('X')
    expect(applyWireAction(wire, bomb, cut(right()), 2000, 'O')).toBeNull()
    expect(applyWireAction(wire, bomb, cut(right()), 100_999, 'O')).toBeNull()
    expect(applyWireAction(wire, bomb, cut(right()), 100_999, 'X')).not.toBeNull()
    expect(applyWireAction(wire, bomb, cut(right()), 101_000, 'X')).toBeNull()
    const res = applyWireAction(wire, bomb, cut(right()), 101_000, 'O')
    expect(res.ok).toBe(true)
    expect(res.wire.last.by).toBe('O')
  })

  it('rejects the Handbook seat even on a bomb without Swap, and still takes an unseated caller', () => {
    const plain = generateBomb(SEEDS[0], 1, 'easy')
    const wire = armWire(ready({ seed: SEEDS[0] }), 1000, BOMB_MS, plain, 1)
    const module = plain.modules[0]
    const action = MODULES[module.type].solveNext(module, plain, wire, 0, 2000)
    expect(applyWireAction(wire, plain, action, 2000, 'O')).toBeNull()
    expect(applyWireAction(wire, plain, action, 2000)).not.toBeNull()
  })
})
