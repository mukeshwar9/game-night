import { describe, expect, it } from 'vitest'
import gauge, {
  GAUGE_FILL_MS, gaugeBurstAt, gaugeFillMs, gaugeIndex, gaugePressure, gaugeValve, gaugeZone, normalizeGauge,
} from './gauge'
import { MODES, POOLS } from '../modes'
import {
  MAX_STRIKES, applyGaugeBurst, applyWireAction, armWire, generateBomb, isSolved,
} from '../../wireLogic'
import { makeRng } from '../rng'
import { makeShell } from '../shell'
import { clearModule } from '../testKit'

// (mode, level) -> Gauge tier, from the mode table: medium 3 = I, hard 2 = II, hard 3 = III.
const PLUS_G = [['medium', 3, 1], ['hard', 2, 2], ['hard', 3, 3]]
const TIER_LEVEL = { 1: ['medium', 3], 2: ['hard', 2], 3: ['hard', 3] }
const T0 = 1000

const dealt = (seed, tier) => generateBomb(seed, TIER_LEVEL[tier][1], TIER_LEVEL[tier][0])
const readyWire = (bomb) => ({ seed: bomb.seed, level: bomb.level, mode: bomb.mode, run: { booms: 0, ms: 0 }, tech: 'X', phase: 'ready', strikes: 0 })
const arm = (bomb, { now = T0, durationMs = 600_000, timerScale = 1 } = {}) => armWire(readyWire(bomb), now, durationMs, bomb, timerScale)
const vent = (bomb, valve) => ({ mod: gaugeIndex(bomb), kind: 'vent', valve })

describe('gauge dealing', () => {
  it('appends exactly one Gauge, last, with the table tier, only on "+G" levels', () => {
    for (const mode of Object.keys(MODES)) {
      MODES[mode].levels.forEach((spec, i) => {
        for (let seed = 0; seed < 30; seed++) {
          const bomb = generateBomb(seed, i + 1, mode)
          const gauges = bomb.modules.filter(m => m.type === 'gauge')
          expect(gauges).toHaveLength(spec.gauge ? 1 : 0)
          if (spec.gauge) {
            expect(gaugeIndex(bomb)).toBe(bomb.modules.length - 1)
            expect(gauges[0].tier).toBe(spec.gauge)
            expect(gauges[0].fillMs).toBe(GAUGE_FILL_MS[spec.gauge])
          } else {
            expect(gaugeIndex(bomb)).toBe(-1)
          }
        }
      })
    }
    for (const [mode, level, tier] of PLUS_G) expect(MODES[mode].levels[level - 1].gauge).toBe(tier)
  })

  it('is never drawn into a slot pool', () => {
    for (const pool of Object.values(POOLS)) expect(pool).not.toContain('gauge')
  })

  it('fills in 60 / 45 / 35 seconds', () => {
    expect(GAUGE_FILL_MS).toEqual({ 1: 60_000, 2: 45_000, 3: 35_000 })
  })

  it('keeps the Gauge on the last Handbook tab when the pages scramble', () => {
    let scrambled = 0
    for (let seed = 0; seed < 60; seed++) {
      const bomb = generateBomb(seed, 3, 'medium')
      if (!bomb.modifiers.includes('scrambled')) continue
      scrambled++
      expect(bomb.pageOrder).toHaveLength(bomb.modules.length)
      expect(bomb.pageOrder[bomb.pageOrder.length - 1]).toBe(bomb.modules.length - 1)
      expect([...bomb.pageOrder].sort()).toEqual(bomb.modules.map((_, i) => i))
    }
    expect(scrambled).toBeGreaterThan(10)
  })

  it('writes a manual rule per zone: tier I serial vowel, tier II+ an indicator on this bomb', () => {
    for (let seed = 0; seed < 100; seed++) {
      const b1 = dealt(seed, 1)
      const g1 = b1.modules.at(-1)
      if (b1.errata?.mod === gaugeIndex(b1)) continue // an Errata slip rewrites the printed rule
      expect(g1.manual.amber).toEqual({ cond: { kind: 'serialVowel' }, yes: 'A', no: 'C' })
      expect(g1.manual.rotates).toBe(false)
      for (const tier of [2, 3]) {
        const bomb = dealt(seed, tier)
        const g = bomb.modules.at(-1)
        if (bomb.errata?.mod === gaugeIndex(bomb)) continue
        expect(g.manual.amber.cond.kind).toBe('lit')
        expect(bomb.indicators.map(i => i.label)).toContain(g.manual.amber.cond.label)
        expect(g.manual.amber.yes).not.toBe(g.manual.amber.no)
        expect(g.manual.red.yes).not.toBe(g.manual.red.no)
        expect(g.manual.rotates).toBe(tier === 3)
      }
    }
  })

  it('deals with a default ctx', () => {
    const rng = makeRng('g')
    makeShell(rng)
    expect(gauge.generate(rng, 2).manual.amber.cond.kind).toBe('lit')
    expect(gauge.generate(rng, 9).tier).toBe(1)
  })
})

describe('arming', () => {
  it('starts the Gauge at 10% with the scaled fill time, and not on other levels', () => {
    for (const tier of [1, 2, 3]) {
      const bomb = dealt(1, tier)
      expect(arm(bomb).gauge).toEqual({ base: 10, at: T0, vents: 0, fillMs: GAUGE_FILL_MS[tier] })
      expect(arm(bomb, { timerScale: 2 }).gauge.fillMs).toBe(GAUGE_FILL_MS[tier] * 2)
    }
    expect(arm(generateBomb(1, 1, 'easy')).gauge).toBeUndefined()
    expect(armWire(readyWire(dealt(1, 1)), T0, 1000).gauge).toBeUndefined()
  })

  it('still runs at the base rate with timers off', () => {
    const bomb = dealt(2, 2)
    const wire = arm(bomb, { durationMs: null, timerScale: 0 })
    expect(wire.endsAt).toBeNull()
    expect(wire.gauge.fillMs).toBe(45_000)
    expect(gaugeFillMs(bomb, 0)).toBe(45_000)
    expect(gaugePressure(wire, bomb, T0 + 45_000)).toBe(100)
    const burst = applyGaugeBurst(wire, bomb, T0 + 45_000)
    expect(burst.strikes).toBe(1)
    expect(burst.endsAt).toBeNull()
  })
})

describe('pressure and zones', () => {
  it('rises 90 points over fillMs from base 10, clamped to 0-100, per tier', () => {
    for (const tier of [1, 2, 3]) {
      const bomb = dealt(3, tier)
      const wire = arm(bomb)
      const fill = GAUGE_FILL_MS[tier]
      expect(gaugePressure(wire, bomb, T0)).toBe(10)
      expect(gaugePressure(wire, bomb, T0 - 5000)).toBe(10)
      expect(gaugePressure(wire, bomb, T0 + fill / 2)).toBeCloseTo(55, 6)
      expect(gaugePressure(wire, bomb, T0 + fill)).toBe(100)
      expect(gaugePressure(wire, bomb, T0 + fill * 3)).toBe(100)
      expect(gaugeBurstAt(wire, bomb)).toBe(T0 + fill)
    }
  })

  it('reaches 100 exactly at the burst moment for any base', () => {
    const bomb = dealt(4, 3)
    const wire = { ...arm(bomb), gauge: { base: 40, at: 5000, vents: 1, fillMs: 35_000 } }
    const at = gaugeBurstAt(wire, bomb)
    expect(at).toBe(Math.ceil(5000 + (60 / 90) * 35_000))
    expect(gaugePressure(wire, bomb, at)).toBe(100)
    expect(gaugePressure(wire, bomb, at - 1)).toBeLessThan(100)
  })

  it('zones: GREEN below 50, AMBER 50-79, RED from 80', () => {
    expect(gaugeZone(0)).toBe('green')
    expect(gaugeZone(49.99)).toBe('green')
    expect(gaugeZone(50)).toBe('amber')
    expect(gaugeZone(79.99)).toBe('amber')
    expect(gaugeZone(80)).toBe('red')
    expect(gaugeZone(100)).toBe('red')
  })

  it('has no pressure without an armed Gauge', () => {
    const bomb = dealt(5, 1)
    expect(gaugePressure(null, bomb, T0)).toBe(0)
    expect(gaugePressure({ phase: 'armed' }, bomb, T0)).toBe(0)
    expect(gaugePressure(arm(bomb), generateBomb(1, 1, 'easy'), T0)).toBe(0)
    expect(gaugeBurstAt({ phase: 'armed' }, bomb)).toBeNull()
  })

  it('reads Firebase-shaped state: strings, missing vents and fillMs, junk', () => {
    const bomb = dealt(6, 2)
    expect(normalizeGauge({ gauge: { base: '10', at: '1000', vents: '2', fillMs: '45000' } }))
      .toEqual({ base: 10, at: 1000, vents: 2, fillMs: 45_000 })
    expect(normalizeGauge({ gauge: { base: 10, at: 1000 } })).toEqual({ base: 10, at: 1000, vents: 0 })
    expect(normalizeGauge({ gauge: { base: 10, at: 1000, vents: -3, fillMs: 'x' } })).toEqual({ base: 10, at: 1000, vents: 0 })
    expect(normalizeGauge({ gauge: { base: 'x', at: 1 } })).toBeNull()
    expect(normalizeGauge({ gauge: 'no' })).toBeNull()
    expect(normalizeGauge({})).toBeNull()
    // a missing fillMs falls back to the module's unscaled time
    const wire = { phase: 'armed', gauge: { base: 10, at: T0, vents: 0 } }
    expect(gaugePressure(wire, bomb, T0 + 22_500)).toBeCloseTo(55, 6)
  })
})

describe('venting', () => {
  const zoneNow = (wire, bomb, pct) => {
    const g = normalizeGauge(wire)
    return Math.ceil(g.at + ((pct - g.base) / 90) * g.fillMs)
  }

  it('the right valve in AMBER or RED resets to 10% and counts the vent', () => {
    for (const tier of [1, 2, 3]) {
      for (const pct of [55, 85]) {
        const bomb = dealt(7, tier)
        const wire = arm(bomb)
        const now = zoneNow(wire, bomb, pct)
        const zone = gaugeZone(gaugePressure(wire, bomb, now))
        const valve = gaugeValve(bomb.modules.at(-1), bomb, zone, 0)
        const res = applyWireAction(wire, bomb, vent(bomb, valve), now, 'X')
        expect(res.ok).toBe(true)
        expect(res.wire.gauge).toEqual({ base: 10, at: now, vents: 1, fillMs: GAUGE_FILL_MS[tier] })
        expect(res.wire.strikes).toBe(0)
        expect(res.wire.phase).toBe('armed')
        expect(isSolved(res.wire, gaugeIndex(bomb))).toBe(false)
      }
    }
  })

  it('the wrong valve is a strike and leaves the pressure alone', () => {
    const bomb = dealt(8, 1)
    const wire = arm(bomb)
    const now = zoneNow(wire, bomb, 60)
    const right = gaugeValve(bomb.modules.at(-1), bomb, 'amber', 0)
    for (const valve of ['A', 'B', 'C'].filter(v => v !== right)) {
      const res = applyWireAction(wire, bomb, vent(bomb, valve), now, 'X')
      expect(res.ok).toBe(false)
      expect(res.wire.strikes).toBe(1)
      expect(res.wire.gauge).toEqual(wire.gauge)
      expect(res.wire.endsAt).toBe(wire.endsAt - bomb.strikePenaltyMs)
      expect(res.wire.last.text).toMatch(/WRONG VALVE/)
    }
  })

  it('a vent in GREEN is a strike, whatever the valve', () => {
    const bomb = dealt(9, 2)
    const wire = arm(bomb)
    const now = T0 + 5000
    for (const valve of ['A', 'B', 'C']) {
      const res = applyWireAction(wire, bomb, vent(bomb, valve), now, 'X')
      expect(res.ok).toBe(false)
      expect(res.wire.strikes).toBe(1)
      expect(res.wire.gauge).toEqual(wire.gauge)
    }
  })

  it('rejects an unknown valve or kind without a strike', () => {
    const bomb = dealt(10, 1)
    const wire = arm(bomb)
    const now = zoneNow(wire, bomb, 60)
    expect(applyWireAction(wire, bomb, vent(bomb, 'D'), now, 'X')).toBeNull()
    expect(applyWireAction(wire, bomb, { mod: gaugeIndex(bomb), kind: 'flip', valve: 'A' }, now, 'X')).toBeNull()
  })

  it('tier I amber: serial vowel A else C; red: B', () => {
    for (let seed = 0; seed < 100; seed++) {
      const bomb = dealt(seed, 1)
      const g = bomb.modules.at(-1)
      if (bomb.errata?.mod === gaugeIndex(bomb)) continue
      expect(gaugeValve(g, bomb, 'amber')).toBe(/[AEIOU]/.test(bomb.serial) ? 'A' : 'C')
      expect(gaugeValve(g, bomb, 'red')).toBe('B')
      expect(gaugeValve(g, bomb, 'green')).toBeNull()
    }
  })

  it('tier II amber follows the indicator: lit gives the "yes" valve', () => {
    for (let seed = 0; seed < 100; seed++) {
      const bomb = dealt(seed, 2)
      const g = bomb.modules.at(-1)
      const lit = bomb.indicators.some(i => i.lit && i.label === g.manual.amber.cond.label)
      expect(gaugeValve(g, bomb, 'amber')).toBe(lit ? g.manual.amber.yes : g.manual.amber.no)
      expect(gaugeValve(g, bomb, 'amber', 5)).toBe(gaugeValve(g, bomb, 'amber', 0))
    }
  })

  it('tier III rotates the right valve A to B to C to A after each vent', () => {
    for (let seed = 0; seed < 50; seed++) {
      const bomb = dealt(seed, 3)
      const g = bomb.modules.at(-1)
      for (const zone of ['amber', 'red']) {
        const v0 = gaugeValve(g, bomb, zone, 0)
        const order = ['A', 'B', 'C']
        for (let n = 0; n < 7; n++) expect(gaugeValve(g, bomb, zone, n)).toBe(order[(order.indexOf(v0) + n) % 3])
      }
    }
    // end to end: the second vent needs the rotated valve
    const bomb = dealt(11, 3)
    let wire = arm(bomb)
    const g = bomb.modules.at(-1)
    const now1 = zoneNow(wire, bomb, 60)
    wire = applyWireAction(wire, bomb, vent(bomb, gaugeValve(g, bomb, 'amber', 0)), now1, 'X').wire
    const now2 = zoneNow(wire, bomb, 60)
    const stale = gaugeValve(g, bomb, 'amber', 0)
    const bad = applyWireAction(wire, bomb, vent(bomb, stale), now2, 'X')
    expect(bad.ok).toBe(false)
    const good = applyWireAction(wire, bomb, vent(bomb, gaugeValve(g, bomb, 'amber', 1)), now2, 'X')
    expect(good.ok).toBe(true)
    expect(good.wire.gauge.vents).toBe(2)
  })

  it('solveNext waits in GREEN and vents correctly from AMBER', () => {
    for (const tier of [1, 2, 3]) {
      const bomb = dealt(12, tier)
      const wire = arm(bomb)
      const g = bomb.modules.at(-1)
      const i = gaugeIndex(bomb)
      expect(gauge.solveNext(g, bomb, wire, i, T0)).toBeNull()
      expect(gauge.solveNext(g, bomb, wire, i, zoneNow(wire, bomb, 49))).toBeNull()
      for (const pct of [50, 79, 85]) {
        const now = zoneNow(wire, bomb, pct)
        const action = gauge.solveNext(g, bomb, wire, i, now)
        expect(action.kind).toBe('vent')
        expect(applyWireAction(wire, bomb, action, now, 'X').ok).toBe(true)
      }
      expect(gauge.solveNext(g, bomb, { phase: 'armed' }, i, T0)).toBeNull()
    }
  })
})

describe('all-solved check', () => {
  it('ignores the Gauge: solving every other module defuses', () => {
    for (let seed = 0; seed < 25; seed++) {
      const bomb = generateBomb(seed, 3, 'medium')
      let wire = arm(bomb)
      const slots = bomb.modules.map((m, i) => (m.type === 'gauge' ? -1 : i)).filter(i => i >= 0)
      for (const i of slots) {
        // vent whenever the needle is in AMBER; the loop runs at a fixed instant so it never bursts
        ;({ wire } = clearModule(bomb, wire, i, T0 + 100))
      }
      expect(wire.phase).toBe('over')
      expect(wire.result.outcome).toBe('defused')
      expect(wire.strikes).toBe(0)
    }
  })
})

describe('applyGaugeBurst', () => {
  it('is null before the burst moment, when unarmed, and on bombs without a Gauge', () => {
    const bomb = dealt(13, 1)
    const wire = arm(bomb)
    const at = gaugeBurstAt(wire, bomb)
    expect(applyGaugeBurst(wire, bomb, at - 1)).toBeNull()
    expect(applyGaugeBurst({ ...wire, phase: 'over' }, bomb, at + 1)).toBeNull()
    expect(applyGaugeBurst(null, bomb, at)).toBeNull()
    expect(applyGaugeBurst(wire, generateBomb(1, 1, 'easy'), at)).toBeNull()
    const noGauge = { ...wire }
    delete noGauge.gauge
    expect(applyGaugeBurst(noGauge, bomb, at + 1)).toBeNull()
  })

  it('strikes at the exact burst moment, restarts at 40% and takes the strike penalty', () => {
    for (const tier of [1, 2, 3]) {
      const bomb = dealt(14, tier)
      const wire = arm(bomb)
      const at = gaugeBurstAt(wire, bomb)
      const next = applyGaugeBurst(wire, bomb, at + 1234)
      expect(next.strikes).toBe(1)
      expect(next.gauge).toEqual({ base: 40, at, vents: 0, fillMs: GAUGE_FILL_MS[tier] })
      expect(next.endsAt).toBe(wire.endsAt - bomb.strikePenaltyMs)
      expect(next.last).toMatchObject({ by: null, mod: gaugeIndex(bomb), ok: false, at, text: 'PRESSURE BURST' })
      expect(next.phase).toBe('armed')
      expect(gaugePressure(next, bomb, at)).toBe(40)
    }
  })

  it('uses the bomb strike penalty (short fuse)', () => {
    let found = 0
    for (let seed = 0; seed < 200 && found < 3; seed++) {
      const bomb = generateBomb(seed, 3, 'medium')
      if (!bomb.modifiers.includes('shortFuse')) continue
      found++
      const wire = arm(bomb)
      const next = applyGaugeBurst(wire, bomb, gaugeBurstAt(wire, bomb))
      expect(next.endsAt).toBe(wire.endsAt - 25_000)
    }
    expect(found).toBeGreaterThan(0)
  })

  it('is idempotent: a second client applying the same burst gets null and no second strike', () => {
    const bomb = dealt(15, 2)
    const wire = arm(bomb)
    const at = gaugeBurstAt(wire, bomb)
    const first = applyGaugeBurst(wire, bomb, at + 50)
    expect(first.strikes).toBe(1)
    expect(applyGaugeBurst(first, bomb, at + 90)).toBeNull()
    expect(applyGaugeBurst(first, bomb, at + 5000)).toBeNull()
  })

  it('bursts again a fill-fraction later (40% to 100% takes 60/90 of fillMs)', () => {
    const bomb = dealt(16, 1)
    let wire = arm(bomb)
    const first = gaugeBurstAt(wire, bomb)
    wire = applyGaugeBurst(wire, bomb, first)
    const second = gaugeBurstAt(wire, bomb)
    expect(second - first).toBe(40_000)
    wire = applyGaugeBurst(wire, bomb, second)
    expect(wire.strikes).toBe(2)
  })

  it('the third burst is a boom by strikes, stamped at the burst moment', () => {
    const bomb = dealt(17, 1)
    let wire = { ...arm(bomb), strikes: MAX_STRIKES - 1 }
    const at = gaugeBurstAt(wire, bomb)
    wire = applyGaugeBurst(wire, bomb, at + 700)
    expect(wire.phase).toBe('over')
    expect(wire.result).toMatchObject({ outcome: 'boom', reason: 'strikes', at })
    expect(wire.strikes).toBe(MAX_STRIKES)
  })

  it('a burst penalty that empties the clock is a boom by time', () => {
    const bomb = dealt(18, 1)
    const base = arm(bomb)
    const at = gaugeBurstAt(base, bomb)
    const wire = { ...base, endsAt: at + 10_000 } // less than one penalty left
    const next = applyGaugeBurst(wire, bomb, at)
    expect(next.phase).toBe('over')
    expect(next.result).toMatchObject({ outcome: 'boom', reason: 'time' })
  })

  it('when the clock ends before the burst, the boom is the timeout', () => {
    const bomb = dealt(19, 1)
    const base = arm(bomb)
    const at = gaugeBurstAt(base, bomb)
    const wire = { ...base, endsAt: at - 5000 }
    const next = applyGaugeBurst(wire, bomb, at)
    expect(next.result).toMatchObject({ outcome: 'boom', reason: 'time' })
    expect(next.strikes).toBe(0)
  })

  it('an action after a due burst becomes the burst (ok null) and does not vent', () => {
    const bomb = dealt(20, 1)
    const wire = arm(bomb)
    const at = gaugeBurstAt(wire, bomb)
    const g = bomb.modules.at(-1)
    const res = applyWireAction(wire, bomb, vent(bomb, gaugeValve(g, bomb, 'red', 0)), at + 10, 'X')
    expect(res.ok).toBeNull()
    expect(res.wire.strikes).toBe(1)
    expect(res.wire.gauge.base).toBe(40)
    expect(res.wire.gauge.vents).toBe(0)
  })

  it('a vent just before the burst moment saves the bomb', () => {
    const bomb = dealt(21, 1)
    const wire = arm(bomb)
    const at = gaugeBurstAt(wire, bomb)
    const g = bomb.modules.at(-1)
    const res = applyWireAction(wire, bomb, vent(bomb, gaugeValve(g, bomb, 'red', 0)), at - 1, 'X')
    expect(res.ok).toBe(true)
    expect(applyGaugeBurst(res.wire, bomb, at + 100)).toBeNull()
  })
})
