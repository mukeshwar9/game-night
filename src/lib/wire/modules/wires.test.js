import { describe, expect, it } from 'vitest'
import wires, { cutsDone, describeWireAction, describeWireCond, isStriped, requiredCuts, resolveWireAction, solveWires, wireCondHolds, wireHas } from './wires'
import { applyWireAction } from '../../wireLogic'
import { makeRng } from '../rng'
import { armedFor, clearModule, soloBomb } from '../testKit'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)

describe('wires module', () => {
  it('tier I deals 3-4 wires that always resolve to a real wire', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('wires', seed)
      const m = bomb.modules[0]
      expect(m.tier).toBe(1)
      expect(m.device.wires.length).toBeGreaterThanOrEqual(3)
      expect(m.device.wires.length).toBeLessThanOrEqual(4)
      const { index } = solveWires(m, bomb)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(m.device.wires.length)
    }
  })

  it('solveNext clears every generated module', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('wires', seed)
      const { wire } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.phase).toBe('over')
      expect(wire.strikes).toBe(0)
    }
  })

  it('strikes on every wrong wire and ignores a repeat or a bad index', () => {
    const bomb = soloBomb('wires', 3)
    const m = bomb.modules[0]
    const right = solveWires(m, bomb).index
    m.device.wires.forEach((_, w) => {
      if (w === right) return
      const res = applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'cut', wire: w }, 2000)
      expect(res.ok).toBe(false)
      expect(res.wire.strikes).toBe(1)
      expect(applyWireAction(res.wire, bomb, { mod: 0, kind: 'cut', wire: w }, 2000)).toBeNull()
    })
    expect(applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'cut', wire: 9 }, 2000)).toBeNull()
    expect(applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'tap' }, 2000)).toBeNull()
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

  it('is deterministic per rng', () => {
    expect(wires.generate(makeRng('d'), 1)).toEqual(wires.generate(makeRng('d'), 1))
  })

  it('writes manual lines in plain words', () => {
    expect(describeWireCond({ kind: 'many', color: 'blue' })).toBe('there is more than one BLUE wire')
    expect(describeWireCond({ kind: 'serialOdd' })).toBe('the serial ends in an odd digit')
    expect(describeWireCond({ kind: 'lit', label: 'FRQ' })).toBe('an indicator marked FRQ is lit')
    expect(describeWireAction({ kind: 'pos', n: 3 })).toBe('cut the third wire')
    expect(describeWireAction({ kind: 'firstOf', color: 'green' })).toBe('cut the first GREEN wire')
  })
})

describe('wires module, tier II', () => {
  it('deals 5-6 plain wires and 4-rule tables, some with AND conditions', () => {
    let ands = 0
    for (const seed of SEEDS) {
      const bomb = soloBomb('wires', seed, 2)
      const m = bomb.modules[0]
      expect(m.tier).toBe(2)
      expect([5, 6]).toContain(m.device.wires.length)
      expect(m.device.wires.some(isStriped)).toBe(false)
      expect(Object.keys(m.manual.tables)).toEqual(['5', '6'])
      for (const t of Object.values(m.manual.tables)) {
        expect(t.rules).toHaveLength(4)
        ands += t.rules.filter(r => r.cond.all).length
        t.rules.filter(r => r.cond.all).forEach(r => expect(r.cond.all).toHaveLength(2))
      }
      expect(requiredCuts(m, bomb)).toHaveLength(1)
    }
    expect(ands).toBeGreaterThan(200)
  })

  it('solveNext clears every module with no strike', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('wires', seed, 2)
      const { wire, steps } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.strikes).toBe(0)
      expect(steps).toBe(1)
    }
  })

  it('every wrong wire is a strike', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const bomb = soloBomb('wires', seed, 2)
      const right = solveWires(bomb.modules[0], bomb).index
      bomb.modules[0].device.wires.forEach((_, w) => {
        if (w === right) return
        const res = applyWireAction(armedFor(bomb), bomb, { mod: 0, kind: 'cut', wire: w }, 2000)
        expect(res.ok).toBe(false)
        expect(res.wire.strikes).toBe(1)
      })
    }
  })

  it('evaluates an AND condition only when both parts hold', () => {
    const bomb = { serial: 'AB12C3', indicators: [{ label: 'SIG', lit: true }, { label: 'NAV', lit: false }] }
    const cond = { all: [{ kind: 'many', color: 'red' }, { kind: 'lit', label: 'SIG' }] }
    const wiresList = ['red', 'blue', 'red', 'white', 'green']
    expect(wireCondHolds(cond, wiresList, bomb)).toBe(true)
    expect(wireCondHolds({ all: [cond.all[0], { kind: 'lit', label: 'NAV' }] }, wiresList, bomb)).toBe(false)
    expect(describeWireCond(cond)).toBe('there is more than one RED wire AND an indicator marked SIG is lit')
  })

  it('is deterministic per rng', () => {
    expect(wires.generate(makeRng('d'), 2)).toEqual(wires.generate(makeRng('d'), 2))
  })
})

describe('wires module, tier III', () => {
  it('deals 1-3 striped wires, a striped first rule and a rule that matches 2-3 wires', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('wires', seed, 3)
      const m = bomb.modules[0]
      expect(m.tier).toBe(3)
      const list = m.device.wires
      expect([5, 6]).toContain(list.length)
      const striped = list.filter(isStriped)
      expect(striped.length).toBeGreaterThanOrEqual(1)
      expect(striped.length).toBeLessThanOrEqual(3)
      striped.forEach(([a, b]) => expect(a).not.toBe(b))
      for (const t of Object.values(m.manual.tables)) {
        expect(t.rules[0]).toMatchObject({ cond: { kind: 'striped' }, action: { kind: 'allOf' } })
        expect(t.rules).toHaveLength(4)
      }
      const rule = m.manual.tables[list.length].rules[0]
      const matching = list.filter(w => wireHas(w, rule.action.color))
      expect(matching.length).toBeGreaterThanOrEqual(2)
      expect(matching.length).toBeLessThanOrEqual(3)
      expect(requiredCuts(m, bomb)).toEqual(list.map((w, i) => (wireHas(w, rule.action.color) ? i : -1)).filter(i => i >= 0))
    }
  })

  it('counts a striped wire as both colours for every condition', () => {
    const bomb = { serial: 'AB12C3', indicators: [{ label: 'SIG', lit: false }, { label: 'NAV', lit: false }] }
    const list = [['red', 'blue'], 'white', 'green', 'black', ['yellow', 'red']]
    expect(wireCondHolds({ kind: 'many', color: 'red' }, list, bomb)).toBe(true)
    expect(wireCondHolds({ kind: 'firstIs', color: 'blue' }, list, bomb)).toBe(true)
    expect(wireCondHolds({ kind: 'lastIs', color: 'yellow' }, list, bomb)).toBe(true)
    expect(wireCondHolds({ kind: 'exactlyOne', color: 'blue' }, list, bomb)).toBe(true)
    expect(wireCondHolds({ kind: 'none', color: 'yellow' }, list, bomb)).toBe(false)
    expect(resolveWireAction({ kind: 'lastOf', color: 'red' }, list)).toBe(4)
    expect(resolveWireAction({ kind: 'firstOf', color: 'red' }, list)).toBe(0)
  })

  it('solveNext cuts every required wire in order, with no strike', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('wires', seed, 3)
      const need = requiredCuts(bomb.modules[0], bomb)
      const { wire, steps } = clearModule(bomb, armedFor(bomb), 0)
      expect(wire.strikes).toBe(0)
      expect(steps).toBe(need.length)
    }
  })

  it('an out-of-order required cut and a non-required cut are strikes, and neither cuts the wire', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const bomb = soloBomb('wires', seed, 3)
      const m = bomb.modules[0]
      const need = requiredCuts(m, bomb)
      const start = armedFor(bomb)
      const res1 = applyWireAction(start, bomb, { mod: 0, kind: 'cut', wire: need[need.length - 1] }, 2000)
      expect(res1.ok).toBe(false)
      expect(res1.wire.strikes).toBe(1)
      expect(cutsDone(res1.wire, 0)).toBe(0)
      const other = m.device.wires.findIndex((_, w) => !need.includes(w))
      const res2 = applyWireAction(start, bomb, { mod: 0, kind: 'cut', wire: other }, 2000)
      expect(res2.ok).toBe(false)
      expect(res2.wire.strikes).toBe(1)
      // still solvable afterwards, and the first correct cut counts
      const first = applyWireAction(res2.wire, bomb, { mod: 0, kind: 'cut', wire: need[0] }, 2000)
      expect(first.ok).toBe(true)
      expect(cutsDone(first.wire, 0)).toBe(1)
      expect(first.wire.solved?.[0]).toBeUndefined()
    }
  })

  it('is deterministic per rng', () => {
    expect(wires.generate(makeRng('d'), 3)).toEqual(wires.generate(makeRng('d'), 3))
  })
})
