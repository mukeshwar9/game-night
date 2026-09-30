import { describe, expect, it } from 'vitest'
import patch, { columnIndex, coveredBy, crossings, patchRouting, patchState } from './patch'
import { applyWireAction, generateBomb } from '../../wireLogic'
import { makeRng } from '../rng'
import { armedFor, clearModule, soloBomb } from '../testKit'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)
const TIERS = [1, 2, 3]

const act = (bomb, wire, action) => applyWireAction(wire, bomb, { mod: 0, ...action }, 2000)

describe('patch module', () => {
  it('deals 3 plugs at tier I and 4 at tiers II-III, in distinct colours, routed by permutations', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const m = soloBomb('patch', seed, tier).modules[0]
        const n = tier === 1 ? 3 : 4
        expect(m.tier).toBe(tier)
        expect(m.device.plugs).toHaveLength(n)
        expect(new Set(m.device.plugs).size).toBe(n)
        expect(m.manual.columns).toHaveLength(tier === 1 ? 1 : 2)
        m.manual.columns.forEach(col => expect([...col].sort()).toEqual(Array.from({ length: n }, (_, k) => k)))
        expect(!!m.manual.rule).toBe(tier >= 2)
        expect(!!m.device.initial).toBe(tier === 3)
      }
    }
  })

  it('tier II+ column rule names an indicator on this bomb and both columns differ', () => {
    for (const tier of [2, 3]) {
      for (const seed of SEEDS) {
        const bomb = soloBomb('patch', seed, tier)
        const m = bomb.modules[0]
        expect(bomb.indicators.map(i => i.label)).toContain(m.manual.rule.label)
        expect(m.manual.columns[0]).not.toEqual(m.manual.columns[1])
      }
    }
  })

  it('picks column A when the named indicator is lit and B otherwise', () => {
    const bomb = soloBomb('patch', 3, 2)
    const m = bomb.modules[0]
    const lit = { ...bomb, indicators: [{ label: m.manual.rule.label, lit: true }] }
    const dark = { ...bomb, indicators: [{ label: m.manual.rule.label, lit: false }] }
    expect(columnIndex(m, lit)).toBe(0)
    expect(patchRouting(m, lit)).toBe(m.manual.columns[0])
    expect(columnIndex(m, dark)).toBe(1)
    expect(patchRouting(m, dark)).toBe(m.manual.columns[1])
  })

  it('solveNext clears every module with no strike, at every tier', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const bomb = soloBomb('patch', seed, tier)
        const { wire } = clearModule(bomb, armedFor(bomb), 0)
        expect(wire.strikes).toBe(0)
        expect(wire.phase).toBe('over')
      }
    }
  })

  it('a wrong socket strikes and stores no cable; a right one is kept', () => {
    for (const tier of [1, 2]) {
      const bomb = soloBomb('patch', 11, tier)
      const m = bomb.modules[0]
      const routing = patchRouting(m, bomb)
      const wrong = (routing[0] + 1) % routing.length
      const bad = act(bomb, armedFor(bomb), { kind: 'patch', plug: 0, socket: wrong })
      expect(bad.ok).toBe(false)
      expect(bad.wire.strikes).toBe(1)
      expect(patchState(bad.wire, 0, m).links).toEqual({})
      expect(bad.wire.last.text).toMatch(/SPRANG OUT/)
      const good = act(bomb, armedFor(bomb), { kind: 'patch', plug: 0, socket: routing[0] })
      expect(good.ok).toBe(true)
      expect(patchState(good.wire, 0, m)).toEqual({ links: { 0: routing[0] }, stack: [0] })
    }
  })

  it('returns null for an occupied socket, a patched plug, an unpatched unplug and bad payloads', () => {
    const bomb = soloBomb('patch', 5, 1)
    const routing = patchRouting(bomb.modules[0], bomb)
    const one = act(bomb, armedFor(bomb), { kind: 'patch', plug: 0, socket: routing[0] }).wire
    expect(act(bomb, one, { kind: 'patch', plug: 1, socket: routing[0] })).toBeNull()
    expect(act(bomb, one, { kind: 'patch', plug: 0, socket: routing[1] })).toBeNull()
    expect(act(bomb, one, { kind: 'unplug', plug: 1 })).toBeNull()
    expect(act(bomb, one, { kind: 'patch', plug: 9, socket: 0 })).toBeNull()
    expect(act(bomb, one, { kind: 'patch', plug: 1, socket: 9 })).toBeNull()
    expect(act(bomb, one, { kind: 'patch', plug: 1.5, socket: 0 })).toBeNull()
    expect(act(bomb, one, { kind: 'wiggle', plug: 0 })).toBeNull()
  })

  it('unplugging is free below tier III, even under a crossing cable', () => {
    const bomb = soloBomb('patch', 2, 2)
    const m = bomb.modules[0]
    const routing = patchRouting(m, bomb)
    const wire = clearPartial(bomb, routing)
    const res = act(bomb, wire, { kind: 'unplug', plug: 0 })
    expect(res.ok).toBe(true)
    expect(patchState(res.wire, 0, m).links[0]).toBeUndefined()
  })

  it('tier III: unplugging a cable that has a crossing cable on top strikes and changes nothing', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const bomb = soloBomb('patch', seed, 3)
      const m = bomb.modules[0]
      const { links, stack } = patchState(armedFor(bomb), 0, m)
      const under = stack.find(p => coveredBy(links, stack, p).length)
      if (under === undefined) continue
      const res = act(bomb, armedFor(bomb), { kind: 'unplug', plug: under })
      expect(res.ok).toBe(false)
      expect(res.wire.strikes).toBe(1)
      expect(patchState(res.wire, 0, m)).toEqual({ links, stack })
      expect(res.wire.last.text).toMatch(/LIES ON TOP/)
      return
    }
    throw new Error('no covered cable found')
  })

  it('is deterministic per rng', () => {
    for (const tier of TIERS) {
      const ctx = { indicators: [{ label: 'SIG', lit: true }] }
      expect(patch.generate(makeRng('d'), tier, ctx)).toEqual(patch.generate(makeRng('d'), tier, ctx))
    }
  })

  it('reads numeric-keyed objects and arrays from Firebase by explicit key', () => {
    const m = soloBomb('patch', 1, 2).modules[0]
    const asObject = { mods: { 0: { touched: true, links: { 1: 2, 3: 0 }, stack: { 0: 3, 1: 1 } } } }
    expect(patchState(asObject, 0, m)).toEqual({ links: { 1: 2, 3: 0 }, stack: [3, 1] })
    const sparse = { mods: { 0: { touched: true, links: [null, 2, null, 0], stack: [3, 1] } } }
    expect(patchState(sparse, 0, m)).toEqual({ links: { 1: 2, 3: 0 }, stack: [3, 1] })
  })

  it('an emptied node stays empty once touched instead of reverting to the tangle', () => {
    const m = soloBomb('patch', 4, 3).modules[0]
    expect(Object.keys(patchState({ mods: {} }, 0, m).links)).toHaveLength(3)
    expect(patchState({ mods: { 0: { touched: true } } }, 0, m)).toEqual({ links: {}, stack: [] })
  })
})

describe('patch module, tier III tangle', () => {
  it('starts with 3 wrong cables and at least 2 crossings', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('patch', seed, 3)
      const m = bomb.modules[0]
      const { links, stack } = m.device.initial
      expect(Object.keys(links)).toHaveLength(3)
      expect([...stack].sort()).toEqual(Object.keys(links).map(Number).sort())
      expect(new Set(Object.values(links)).size).toBe(3)
      expect(crossings(links).length).toBeGreaterThanOrEqual(2)
      const routing = patchRouting(m, bomb)
      Object.entries(links).forEach(([p, s]) => expect(routing[p]).not.toBe(s))
      expect(patchState(armedFor(bomb), 0, m)).toEqual({ links, stack })
    }
  })

  it('is solvable: unplugging from the top of the stack is always legal', () => {
    for (const seed of SEEDS) {
      const bomb = soloBomb('patch', seed, 3)
      const m = bomb.modules[0]
      let wire = armedFor(bomb)
      for (let k = 0; k < 3; k++) {
        const { stack } = patchState(wire, 0, m)
        const res = act(bomb, wire, { kind: 'unplug', plug: stack[stack.length - 1] })
        expect(res.ok).toBe(true)
        wire = res.wire
      }
      expect(patchState(wire, 0, m)).toEqual({ links: {}, stack: [] })
      expect(wire.strikes).toBe(0)
    }
  })

  it('deals patch in easy, medium and hard bombs', () => {
    const seen = new Set()
    for (const mode of ['easy', 'medium', 'hard']) {
      for (let s = 0; s < 60; s++) generateBomb(`p${s}`, 1, mode).modules.forEach(m => m.type === 'patch' && seen.add(mode))
    }
    expect([...seen].sort()).toEqual(['easy', 'hard', 'medium'])
  })
})

// Patch the first three plugs of a tier II routing, in order.
function clearPartial(bomb, routing) {
  let wire = armedFor(bomb)
  for (const plug of [0, 1, 2]) wire = act(bomb, wire, { kind: 'patch', plug, socket: routing[plug] }).wire
  return wire
}
