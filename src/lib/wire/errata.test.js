import { describe, expect, it } from 'vitest'
import { MODULES } from './modules'
import { MODES, MODE_IDS } from './modes'
import { makeRng } from './rng'
import { armedFor, clearModule, soloBomb } from './testKit'
import { generateBomb, requiredCuts } from '../wireLogic'
import { solveLever } from './modules/lever'
import { patchRouting } from './modules/patch'
import { switchTarget } from './modules/switch'
import { gaugeValve } from './modules/gauge'

const ELIGIBLE = ['wires', 'lever', 'patch', 'switch', 'gauge']
const SEEDS = 500

/** What the manual tells the Tech to do on this bomb, as a comparable value. */
function answer(module, bomb) {
  switch (module.type) {
    case 'wires': return requiredCuts(module, bomb).join(',')
    case 'lever': return JSON.stringify(solveLever(module, bomb))
    case 'patch': return patchRouting(module, bomb).join(',')
    case 'switch': return String(switchTarget(module))
    case 'gauge': return `${gaugeValve(module, bomb, 'amber')}${gaugeValve(module, bomb, 'red')}`
    default: return ''
  }
}

describe('module errata', () => {
  it('only wires, lever, patch, switch and gauge export the hooks', () => {
    for (const [type, def] of Object.entries(MODULES)) {
      const has = !!def.errataCandidates
      expect(has).toBe(ELIGIBLE.includes(type))
      expect(!!def.applyErrata).toBe(has)
      expect(!!def.describeErrata).toBe(has)
    }
  })

  for (const type of ELIGIBLE) {
    it(`${type}: every patch changes the answer and the manual text, and keeps the module solvable (${SEEDS} seeds)`, () => {
      const def = MODULES[type]
      let patches = 0
      for (let seed = 0; seed < SEEDS; seed++) {
        const tier = (seed % 3) + 1
        const bomb = soloBomb(type, seed, tier)
        const original = bomb.modules[0]
        const before = JSON.stringify(original.manual)
        const candidates = def.errataCandidates(makeRng(`errata-${seed}`), original, bomb)
        // Same rng, same candidates.
        expect(def.errataCandidates(makeRng(`errata-${seed}`), original, bomb)).toEqual(candidates)
        for (const patch of candidates) {
          patches++
          const manual = def.applyErrata(original.manual, patch)
          const patched = { ...original, manual }
          expect(JSON.stringify(original.manual)).toBe(before) // applyErrata does not mutate
          expect(JSON.stringify(manual)).not.toBe(before)
          expect(answer(patched, bomb)).not.toBe(answer(original, bomb))
          const text = def.describeErrata(original, patch)
          expect(text.was).not.toBe(text.now)
          expect(text.where.length).toBeGreaterThan(0)
          if (type === 'gauge') continue // never solved; the valve check above is its solve check
          const solo = { ...bomb, modules: [patched] }
          const { wire } = clearModule(solo, armedFor(solo), 0)
          expect(wire.phase).toBe('over')
          expect(wire.result.outcome).toBe('defused')
          expect(wire.strikes).toBe(0)
        }
      }
      expect(patches).toBeGreaterThan(SEEDS / 2)
    })
  }
})

describe('bomb errata', () => {
  const hard3 = MODES.hard.levels.length
  const withErrata = []
  for (const mode of MODE_IDS) {
    MODES[mode].levels.forEach((_, i) => {
      for (let seed = 0; seed < 80; seed++) {
        const bomb = generateBomb(`err-${seed}`, i + 1, mode)
        if (bomb.errata) withErrata.push({ bomb, mode, level: i + 1, seed: `err-${seed}` })
      }
    })
  }

  it('shows up on bombs and always names an eligible module', () => {
    expect(withErrata.length).toBeGreaterThan(20)
    for (const { bomb } of withErrata) {
      expect(bomb.modifiers).toContain('errata')
      expect(ELIGIBLE).toContain(bomb.modules[bomb.errata.mod].type)
      expect(bomb.errata.patch).toBeTruthy()
      expect(bomb.errata.was).not.toBe(bomb.errata.now)
    }
  })

  it('carries the patched manual that the solver and judge use', () => {
    for (const { bomb } of withErrata.slice(0, 60)) {
      // A second application of the patch would change the manual again (or leave it): the bomb holds one application.
      const { mod, patch } = bomb.errata
      const def = MODULES[bomb.modules[mod].type]
      const twice = { ...bomb.modules[mod], manual: def.applyErrata(bomb.modules[mod].manual, patch) }
      expect(def.describeErrata(twice, patch).now).toBe(bomb.errata.now)
      let wire = armedFor(bomb)
      bomb.modules.forEach((_m, k) => { wire = clearModule(bomb, wire, k).wire })
      expect(wire.result.outcome).toBe('defused')
      expect(wire.strikes).toBe(0)
    }
  })

  it('is deterministic for every modifier a level can deal', () => {
    for (const mode of MODE_IDS) {
      MODES[mode].levels.forEach((_, i) => {
        for (let seed = 0; seed < 60; seed++) {
          const a = generateBomb(`det-${seed}`, i + 1, mode)
          expect(generateBomb(`det-${seed}`, i + 1, mode)).toEqual(a)
        }
      })
    }
    expect(hard3).toBe(3)
  })

  it('leaves bombs without modifiers untouched by the errata draw', () => {
    // A level with no modifier budget never reaches the errata code.
    const a = generateBomb('plain', 1, 'easy')
    expect(a.modifiers).toEqual([])
    expect(a.errata).toBeUndefined()
  })
})
