import { describe, expect, it } from 'vitest'
import relay, { RELAY_LOOKBACK, RELAY_STAGES, RELAY_WORDS, describeRelayRule, relayCorrectPos, relayStages, relayState, relayView } from './relay'
import { makeRng } from '../rng'

const SEEDS = Array.from({ length: 500 }, (_, i) => i)
const TIERS = [1, 2, 3]

// Local harness: relay is not in the registry yet, so drive judge directly.
const makeBomb = (seed, tier) => {
  const module = relay.generate(makeRng(`relay:${seed}`), tier, { level: 1, mode: 'easy', serial: 'AB12C3', indicators: [] })
  return { seed: String(seed), modules: [module] }
}
const fresh = (bomb) => ({ seed: bomb.seed, phase: 'armed', strikes: 0, mods: {}, solved: {} })
const step = (bomb, wire, action) => {
  const verdict = relay.judge(bomb.modules[0], bomb, wire, 0, { mod: 0, ...action })
  if (!verdict) return null
  const next = { ...wire, mods: { ...wire.mods, 0: verdict.progress }, strikes: wire.strikes + (verdict.ok ? 0 : 1) }
  if (verdict.solved) next.solved = { 0: true }
  return { ...verdict, wire: next }
}
const clear = (bomb, wire) => {
  let cur = wire
  for (let n = 0; n < 50 && !cur.solved[0]; n++) cur = step(bomb, cur, relay.solveNext(bomb.modules[0], bomb, cur, 0)).wire
  return cur
}
const wrongKey = (bomb, wire) => (relay.solveNext(bomb.modules[0], bomb, wire, 0).key + 1) % 4

describe('relay module', () => {
  it('deals 3, 4 and 5 stages with one rule per word, looking back only within the tier limit', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const m = makeBomb(seed, tier).modules[0]
        expect(m.tier).toBe(tier)
        expect(m.manual.stages).toHaveLength(RELAY_STAGES[tier])
        m.manual.stages.forEach((block, s) => {
          expect(Object.keys(block).sort()).toEqual([...RELAY_WORDS].sort())
          const back = Object.values(block).filter(r => r.kind === 'samePositionAs' || r.kind === 'sameLabelAs')
          if (s === 0) expect(back).toHaveLength(0)
          else expect(back.length).toBeGreaterThanOrEqual(1)
          back.forEach(r => {
            expect(r.stage).toBeLessThan(s)
            expect(s - r.stage).toBeLessThanOrEqual(RELAY_LOOKBACK[tier])
            expect(r.stage).toBeGreaterThanOrEqual(0)
          })
          Object.values(block).filter(r => r.kind === 'position').forEach(r => expect([0, 1, 2, 3]).toContain(r.n))
        })
      }
    }
  })

  it('tier I never looks back 2 stages; tiers II and III do somewhere', () => {
    const two = { 1: false, 2: false, 3: false }
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        makeBomb(seed, tier).modules[0].manual.stages.forEach((block, s) => {
          Object.values(block).forEach(r => { if (r.stage != null && s - r.stage === 2) two[tier] = true })
        })
      }
    }
    expect(two).toEqual({ 1: false, 2: true, 3: true })
  })

  it('every stage display is a valid word, a digit 1-4 and a permutation of the labels', () => {
    for (const seed of SEEDS) {
      relayStages(seed, 0, 0, 5).forEach(st => {
        expect(RELAY_WORDS).toContain(st.word)
        expect(st.digit).toBeGreaterThanOrEqual(1)
        expect(st.digit).toBeLessThanOrEqual(4)
        expect([...st.labels].sort()).toEqual([1, 2, 3, 4])
      })
    }
  })

  it('solveNext clears every module with no strike, at every tier', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS) {
        const bomb = makeBomb(seed, tier)
        const wire = clear(bomb, fresh(bomb))
        expect(wire.strikes).toBe(0)
        expect(wire.solved[0]).toBe(true)
        expect(relayState(wire, 0).presses).toHaveLength(RELAY_STAGES[tier])
      }
    }
  })

  it('the correct key is defined for every stage and every display word', () => {
    for (const tier of TIERS) {
      for (const seed of SEEDS.slice(0, 100)) {
        const bomb = makeBomb(seed, tier)
        const m = bomb.modules[0]
        const stages = relayStages(bomb.seed, 0, 0, m.manual.stages.length)
        m.manual.stages.forEach((block, s) => {
          const presses = Array.from({ length: s }, (_, k) => ({ pos: k % 4, label: stages[k].labels[k % 4] }))
          RELAY_WORDS.forEach(word => {
            const fake = stages.map((st, k) => (k === s ? { ...st, word } : st))
            expect([0, 1, 2, 3]).toContain(relayCorrectPos(m, fake, presses, s))
          })
        })
      }
    }
  })

  it('a wrong press strikes; tiers I and II stay on the stage and keep the log', () => {
    for (const tier of [1, 2]) {
      const bomb = makeBomb(11, tier)
      const first = step(bomb, fresh(bomb), relay.solveNext(bomb.modules[0], bomb, fresh(bomb), 0))
      const bad = step(bomb, first.wire, { kind: 'press', key: wrongKey(bomb, first.wire) })
      expect(bad.ok).toBe(false)
      expect(bad.wire.strikes).toBe(1)
      expect(relayState(bad.wire, 0)).toEqual(relayState(first.wire, 0))
      expect(relayState(bad.wire, 0).presses).toHaveLength(1)
      expect(bad.text).toMatch(/STAGE 2/)
    }
  })

  it('a right press is kept with its position and label', () => {
    const bomb = makeBomb(5, 1)
    const w = fresh(bomb)
    const key = relay.solveNext(bomb.modules[0], bomb, w, 0).key
    const good = step(bomb, w, { kind: 'press', key })
    expect(good.ok).toBe(true)
    expect(relayState(good.wire, 0).presses).toEqual([{ pos: key, label: relayStages(bomb.seed, 0, 0, 3)[0].labels[key] }])
  })

  it('tier III: a wrong press clears the log, bumps resets and re-rolls the displays deterministically', () => {
    let differed = 0
    for (const seed of SEEDS) {
      const bomb = makeBomb(seed, 3)
      let wire = fresh(bomb)
      for (let k = 0; k < 2; k++) wire = step(bomb, wire, relay.solveNext(bomb.modules[0], bomb, wire, 0)).wire
      const bad = step(bomb, wire, { kind: 'press', key: wrongKey(bomb, wire) })
      expect(bad.ok).toBe(false)
      expect(bad.wire.strikes).toBe(1)
      expect(relayState(bad.wire, 0)).toEqual({ presses: [], resets: 1 })
      expect(bad.text).toMatch(/BACK TO STAGE 1/)
      // Both screens derive the same fresh displays from the same progress.
      const m = bomb.modules[0]
      expect(relayView(m, bad.wire, 0).stages).toEqual(relayView(m, { ...bad.wire }, 0).stages)
      expect(relayView(m, bad.wire, 0).stages).toEqual(relayStages(bomb.seed, 0, 1, 5))
      if (JSON.stringify(relayStages(bomb.seed, 0, 1, 5)) !== JSON.stringify(relayStages(bomb.seed, 0, 0, 5))) differed++
      // The re-rolled attempt is still clearable with no further strike.
      const done = clear(bomb, bad.wire)
      expect(done.strikes).toBe(1)
      expect(done.solved[0]).toBe(true)
    }
    expect(differed).toBeGreaterThan(490)
  })

  it('displays depend on seed, module index and resets', () => {
    expect(relayStages('a', 0, 0, 5)).toEqual(relayStages('a', 0, 0, 5))
    expect(relayStages('a', 0, 0, 5)).not.toEqual(relayStages('a', 1, 0, 5))
    expect(relayStages('a', 0, 0, 5)).not.toEqual(relayStages('b', 0, 0, 5))
  })

  it('uses the module index it is given', () => {
    const bomb = makeBomb(3, 1)
    const m = bomb.modules[0]
    const w = { seed: bomb.seed, mods: {} }
    const a = relay.solveNext(m, bomb, w, 0)
    const b = relay.solveNext(m, bomb, w, 4)
    expect(a.mod).toBe(0)
    expect(b.mod).toBe(4)
    expect(relay.judge(m, bomb, w, 4, { kind: 'press', key: b.key }).ok).toBe(true)
  })

  it('returns null for bad payloads and for a finished module', () => {
    const bomb = makeBomb(2, 1)
    const w = fresh(bomb)
    expect(step(bomb, w, { kind: 'press', key: 4 })).toBeNull()
    expect(step(bomb, w, { kind: 'press', key: -1 })).toBeNull()
    expect(step(bomb, w, { kind: 'press', key: 1.5 })).toBeNull()
    expect(step(bomb, w, { kind: 'press' })).toBeNull()
    expect(step(bomb, w, { kind: 'flip', key: 0 })).toBeNull()
    expect(step(bomb, clear(bomb, w), { kind: 'press', key: 0 })).toBeNull()
  })

  it('is deterministic per rng', () => {
    for (const tier of TIERS) {
      expect(relay.generate(makeRng('d'), tier, {})).toEqual(relay.generate(makeRng('d'), tier, {}))
    }
  })

  it('reads Firebase-shaped progress: numeric-keyed objects, sparse arrays, missing fields', () => {
    expect(relayState({}, 0)).toEqual({ presses: [], resets: 0 })
    expect(relayState({ mods: { 0: { resets: 2 } } }, 0)).toEqual({ presses: [], resets: 2 })
    const asObject = { mods: { 0: { presses: { 0: { pos: 2, label: 1 }, 1: { pos: 0, label: 4 } } } } }
    expect(relayState(asObject, 0)).toEqual({ presses: [{ pos: 2, label: 1 }, { pos: 0, label: 4 }], resets: 0 })
    const sparse = { mods: { 0: { presses: [{ pos: 3, label: 2 }, null, { pos: 1, label: 1 }], resets: 1 } } }
    expect(relayState(sparse, 0)).toEqual({ presses: [{ pos: 3, label: 2 }], resets: 1 })
    expect(relayState({ mods: { 0: { presses: { 0: { pos: 9, label: 1 } } } } }, 0).presses).toEqual([])
  })

  it('judges the same from object-shaped progress', () => {
    const bomb = makeBomb(9, 2)
    const w = fresh(bomb)
    const a = step(bomb, w, relay.solveNext(bomb.modules[0], bomb, w, 0))
    const asObject = { ...a.wire, mods: { 0: { presses: { ...a.wire.mods[0].presses }, resets: 0 } } }
    expect(relay.solveNext(bomb.modules[0], bomb, asObject, 0)).toEqual(relay.solveNext(bomb.modules[0], bomb, a.wire, 0))
  })

  it('describes every rule kind', () => {
    const rules = [{ kind: 'labelIsDisplay' }, { kind: 'position', n: 1 }, { kind: 'samePositionAs', stage: 0 }, { kind: 'sameLabelAs', stage: 1 }, { kind: 'leftmost' }, { kind: 'rightmost' }]
    rules.forEach(r => expect(describeRelayRule(r)).toMatch(/^press the/))
    expect(describeRelayRule(rules[2])).toMatch(/stage 1/)
  })
})
