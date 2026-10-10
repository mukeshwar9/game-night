import { describe, expect, it } from 'vitest'
import {
  MODES, MODE_IDS, POOLS, levelCount, levelPlan, modeSummary, shippedPool, slotCount, tierFor,
} from './modes'
import { MODE_LEVELS } from '../wireMatchLogic'
import { MODULES } from './modules'
import { MODIFIERS, SEVERITY_RANK, drawModifiers } from './modifiers'
import { makeRng } from './rng'
import { generateBomb } from '../wireLogic'
import { armedFor, clearModule } from './testKit'

const SEEDS = Array.from({ length: 200 }, (_, i) => `mode-${i}`)

describe('MODES table', () => {
  it('matches PRD section 3.1', () => {
    const row = (mode, l) => {
      const spec = MODES[mode].levels[l - 1]
      return [spec.modules, spec.tiers, spec.gauge, spec.clockMs / 1000, spec.modifiers.count, spec.modifiers.count ? spec.modifiers.max : null]
    }
    expect(MODE_IDS).toEqual(['easy', 'medium', 'hard'])
    expect(row('easy', 1)).toEqual([2, [1, 1], null, 180, 0, null])
    expect(row('easy', 2)).toEqual([2, [2, 1], null, 165, 1, 'mild'])
    expect(row('medium', 1)).toEqual([3, [2, 1, 1], null, 180, 0, null])
    expect(row('medium', 2)).toEqual([3, [2, 2, 2], null, 165, 1, 'mild'])
    expect(row('medium', 3)).toEqual([3, [3, 2, 2], 1, 165, 2, 'medium'])
    expect(row('hard', 1)).toEqual([3, [2, 2, 2], null, 165, 1, 'medium'])
    expect(row('hard', 2)).toEqual([4, [3, 3, 2, 2], 2, 180, 2, 'medium'])
    expect(row('hard', 3)).toEqual([5, [3, 3, 3, 3, 3], 3, 195, 3, 'severe'])
  })

  it('keeps MODE_LEVELS in wireMatchLogic equal to the table', () => {
    for (const mode of MODE_IDS) expect(levelCount(mode)).toBe(MODE_LEVELS[mode])
    expect(Object.keys(MODE_LEVELS)).toEqual(MODE_IDS)
  })

  it('has a full design pool at least as big as the largest slot count (§3.1)', () => {
    for (const mode of MODE_IDS) {
      const most = Math.max(...MODES[mode].levels.map(l => l.modules))
      expect(POOLS[mode].length).toBeGreaterThanOrEqual(most)
      expect(new Set(POOLS[mode]).size).toBe(POOLS[mode].length)
      expect(POOLS[mode]).not.toContain('gauge')
    }
    expect(POOLS.easy).toHaveLength(5)
    expect(POOLS.medium).toHaveLength(9)
  })

  it('every level lists one tier per slot, highest first', () => {
    for (const mode of MODE_IDS) {
      for (const spec of MODES[mode].levels) {
        expect(spec.tiers).toHaveLength(spec.modules)
        expect([...spec.tiers].sort((a, b) => b - a)).toEqual(spec.tiers)
      }
    }
  })
})

describe('shipped pools (classic four, Patch Bay and Switchboard, tiers I-III)', () => {
  it('draws only registered modules and deals the table tiers, capped per module', () => {
    for (const mode of MODE_IDS) {
      for (const type of shippedPool(mode)) expect(MODULES[type]).toBeDefined()
      expect(shippedPool(mode)).toEqual(mode === 'easy'
        ? ['wires', 'keypad', 'lever', 'maze', 'patch']
        : ['wires', 'keypad', 'lever', 'maze', 'patch', 'switch', 'pulse', 'relay', 'callsign'])
      MODES[mode].levels.forEach((spec, i) => {
        const plan = levelPlan(mode, i + 1)
        expect(plan.tiers).toEqual(spec.tiers.slice(0, plan.pool.length))
        expect(plan.tiers.length).toBeLessThanOrEqual(plan.pool.length)
      })
    }
  })

  it('every shipped module allows tier III, and a lower maxTier caps the slot tier', () => {
    for (const type of shippedPool('hard')) expect(MODULES[type].maxTier).toBe(3)
    expect(tierFor('wires', 3)).toBe(3)
    expect(tierFor('wires', 2)).toBe(2)
    const saved = MODULES.wires.maxTier
    MODULES.wires.maxTier = 2
    expect(tierFor('wires', 3)).toBe(2)
    MODULES.wires.maxTier = saved
  })

  it('deals the slot tiers from the table (shuffled across the dealt modules)', () => {
    for (const mode of MODE_IDS) {
      MODES[mode].levels.forEach((spec, i) => {
        const bomb = generateBomb('tiers', i + 1, mode)
        const slots = bomb.modules.filter(m => m.type !== 'gauge')
        const expected = spec.tiers.slice(0, slots.length)
        expect(slots.map(m => m.tier).sort()).toEqual([...expected].sort())
      })
    }
  })

  it('caps hard level 3 at the pool size (5 slots of a 6-module pool)', () => {
    expect(MODES.hard.levels[2].modules).toBe(5)
    expect(slotCount('hard', 3)).toBe(5)
    expect(slotCount('easy', 1)).toBe(2)
    expect(slotCount('medium', 3)).toBe(3)
  })
})

describe('modeSummary', () => {
  it('describes each mode card', () => {
    expect(modeSummary('easy')).toEqual({ name: 'EASY', levels: 2, moduleCounts: [2, 2], modifiersFrom: 2 })
    expect(modeSummary('medium')).toEqual({ name: 'MEDIUM', levels: 3, moduleCounts: [3, 3, 3], modifiersFrom: 2 })
    expect(modeSummary('hard')).toEqual({ name: 'HARD', levels: 3, moduleCounts: [3, 4, 5], modifiersFrom: 1 })
  })
})

describe('generateBomb with a mode', () => {
  it('deals the table slot count, distinct module types and the level clock', () => {
    for (const mode of MODE_IDS) {
      MODES[mode].levels.forEach((spec, i) => {
        for (const seed of SEEDS.slice(0, 40)) {
          const bomb = generateBomb(seed, i + 1, mode)
          expect(bomb.mode).toBe(mode)
          expect(bomb.level).toBe(i + 1)
          expect(bomb.modules.filter(m => m.type !== 'gauge')).toHaveLength(slotCount(mode, i + 1))
          expect(new Set(bomb.modules.map(m => m.type)).size).toBe(bomb.modules.length)
          expect(bomb.durationMs).toBe(spec.clockMs)
          expect(bomb.serial).toMatch(/^[A-Z0-9]{5}[0-9]$/)
        }
      })
    }
  })

  it('is deterministic and differs across seeds and modes', () => {
    expect(generateBomb('k', 2, 'medium')).toEqual(generateBomb('k', 2, 'medium'))
    expect(generateBomb('k', 2, 'medium')).not.toEqual(generateBomb('j', 2, 'medium'))
    expect(generateBomb('k', 1, 'easy')).not.toEqual(generateBomb('k', 1, 'hard'))
  })

  it('clamps a bad or too-high level into the mode', () => {
    expect(generateBomb('k', 0, 'easy').level).toBe(1)
    expect(generateBomb('k', 9, 'easy').level).toBe(2)
    expect(generateBomb('k', 'x', 'hard').level).toBe(1)
  })

  it('deals the modifier budget, distinct, within severity, only from shipped ones', () => {
    for (const mode of MODE_IDS) {
      MODES[mode].levels.forEach((spec, i) => {
        for (const seed of SEEDS.slice(0, 40)) {
          const { modifiers } = generateBomb(seed, i + 1, mode)
          expect(new Set(modifiers).size).toBe(modifiers.length)
          expect(modifiers.length).toBeLessThanOrEqual(spec.modifiers.count)
          for (const id of modifiers) {
            expect(Object.keys(MODIFIERS)).toContain(id)
            expect(SEVERITY_RANK[MODIFIERS[id].severity]).toBeLessThanOrEqual(SEVERITY_RANK[spec.modifiers.max])
          }
        }
      })
    }
    expect(generateBomb('m', 1, 'easy').modifiers).toEqual([])
    // Easy never draws Swap or Blackout (mild cap); Errata falls back to Scrambled when no module can take a slip.
    for (const seed of SEEDS) {
      const { modifiers } = generateBomb(seed, 2, 'easy')
      expect(modifiers).toHaveLength(1)
      expect(['scrambled', 'errata']).toContain(modifiers[0])
    }
    // Swap is severe: only Hard level 3 can draw it.
    const swapLevels = new Set()
    for (const mode of MODE_IDS) {
      MODES[mode].levels.forEach((_, i) => {
        for (const seed of SEEDS) if (generateBomb(seed, i + 1, mode).modifiers.includes('swap')) swapLevels.add(`${mode}${i + 1}`)
      })
    }
    expect([...swapLevels]).toEqual(['hard3'])
  })

  it('hands Errata to a module that can take it, or swaps it for another modifier', () => {
    let errata = 0
    for (const mode of MODE_IDS) {
      MODES[mode].levels.forEach((spec, i) => {
        for (const seed of SEEDS) {
          const bomb = generateBomb(seed, i + 1, mode)
          expect(bomb.modifiers.length).toBe(spec.modifiers.count)
          if (bomb.modifiers.includes('errata')) {
            errata++
            expect(bomb.errata.mod).toBeGreaterThanOrEqual(0)
            expect(['wires', 'lever', 'patch', 'switch', 'gauge']).toContain(bomb.modules[bomb.errata.mod].type)
            expect(bomb.errata.was).not.toBe(bomb.errata.now)
          } else {
            expect(bomb.errata).toBeUndefined()
          }
          if (bomb.modifiers.includes('scrambled')) expect(bomb.pageOrder).toHaveLength(bomb.modules.length)
          else expect(bomb.pageOrder).toBeUndefined()
          expect(bomb.strikePenaltyMs).toBe(bomb.modifiers.includes('shortFuse') ? 25_000 : 15_000)
        }
      })
    }
    expect(errata).toBeGreaterThan(50)
  })

  it('sets the fuse and page order that the modifiers imply', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const bomb = generateBomb(seed, 3, 'medium')
      const short = bomb.modifiers.includes('shortFuse')
      expect(bomb.strikePenaltyMs).toBe(short ? 25_000 : 15_000)
      expect(bomb.urgentMs).toBe(short ? 45_000 : 30_000)
      if (!bomb.modifiers.includes('scrambled')) continue
      expect(bomb.pageOrder).toHaveLength(bomb.modules.length)
      expect([...bomb.pageOrder].sort()).toEqual(bomb.modules.map((_, i) => i))
      expect(bomb.pageOrder).not.toEqual(bomb.modules.map((_, i) => i))
    }
    const plain = generateBomb('p', 1, 'easy')
    expect(plain.strikePenaltyMs).toBe(15_000)
    expect(plain.urgentMs).toBe(30_000)
    expect(plain.pageOrder).toBeUndefined()
  })
})

describe('the full modifier set obeys severity (used once every modifier ships)', () => {
  const ALL = Object.keys(MODIFIERS)
  it('draws distinct ids within the cap from all five', () => {
    for (const mode of MODE_IDS) {
      MODES[mode].levels.forEach((spec) => {
        for (let s = 0; s < 50; s++) {
          const ids = drawModifiers(makeRng(`sev-${s}`), spec.modifiers.count, spec.modifiers.max, ALL)
          expect(ids).toHaveLength(spec.modifiers.count)
          expect(new Set(ids).size).toBe(ids.length)
          ids.forEach(id => expect(SEVERITY_RANK[MODIFIERS[id].severity]).toBeLessThanOrEqual(SEVERITY_RANK[spec.modifiers.max]))
        }
      })
    }
  })
})

describe('every level of every mode is solvable at its tiers', () => {
  it('solveNext defuses each dealt bomb with no strike', () => {
    for (const mode of MODE_IDS) {
      MODES[mode].levels.forEach((_, i) => {
        for (const seed of SEEDS.slice(0, 40)) {
          const bomb = generateBomb(seed, i + 1, mode)
          let wire = armedFor(bomb)
          bomb.modules.forEach((_m, k) => { wire = clearModule(bomb, wire, k).wire })
          expect(wire.phase).toBe('over')
          expect(wire.result.outcome).toBe('defused')
          expect(wire.strikes).toBe(0)
        }
      })
    }
  })
})
