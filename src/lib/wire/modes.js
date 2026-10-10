// WIRE CROSSED modes (docs/prds/wire-crossed-modes.md §3): a mode is a short
// run of levels ending in MODE CLEARED. This is the full mode table; the
// eagerly loaded wireMatchLogic.js keeps only the level counts.
//
// Pure — no DOM, no Firebase, no React.
import { MODULES } from './modules'

export const MODE_IDS = ['easy', 'medium', 'hard']

const CLOCK_2_45 = 165_000
const CLOCK_3_00 = 180_000
const CLOCK_3_15 = 195_000

// tiers: the tier of each module slot (1 = I). gauge: Pressure Gauge tier,
// null for none. modifiers: `count` distinct ids of severity <= `max`.
const level = (tiers, gauge, clockMs, count = 0, max = 'mild') => ({
  modules: tiers.length, tiers, gauge, clockMs, modifiers: { count, max },
})

export const MODES = {
  easy: {
    name: 'EASY',
    levels: [
      level([1, 1], null, CLOCK_3_00),
      level([2, 1], null, CLOCK_2_45, 1, 'mild'),
    ],
  },
  medium: {
    name: 'MEDIUM',
    levels: [
      level([2, 1, 1], null, CLOCK_3_00),
      level([2, 2, 2], null, CLOCK_2_45, 1, 'mild'),
      level([3, 2, 2], 1, CLOCK_2_45, 2, 'medium'),
    ],
  },
  hard: {
    name: 'HARD',
    levels: [
      level([2, 2, 2], null, CLOCK_2_45, 1, 'medium'),
      level([3, 3, 2, 2], 2, CLOCK_3_00, 2, 'medium'),
      level([3, 3, 3, 3, 3], 3, CLOCK_3_15, 3, 'severe'),
    ],
  },
}

/** Full design pools (§3.1). What a bomb can actually draw is `shippedPool`. */
export const POOLS = {
  easy: ['wires', 'keypad', 'lever', 'maze', 'patch'],
  medium: ['wires', 'keypad', 'lever', 'maze', 'patch', 'switch', 'pulse', 'relay', 'callsign'],
  hard: ['wires', 'keypad', 'lever', 'maze', 'patch', 'switch', 'pulse', 'relay', 'callsign'],
}

/**
 * The tier a module type is dealt at: the slot tier, capped by the module's own
 * `maxTier` (a module that has not shipped tier III declares less).
 */
export const tierFor = (type, tier) => Math.min(tier, MODULES[type]?.maxTier ?? 1)

export const isMode = (mode) => Object.prototype.hasOwnProperty.call(MODES, mode)

/** The mode's pool minus modules that have not shipped (not in the registry). */
export const shippedPool = (mode) => POOLS[mode].filter(type => type in MODULES)

/** Levels in a mode (from the table; wireMatchLogic.MODE_LEVELS must agree). */
export const levelCount = (mode) => MODES[mode].levels.length

/**
 * What one level deals: slot tiers (each module caps it with its own `maxTier`
 * when dealt, see tierFor), pool, clock and modifier budget.
 *
 * The slot count is capped at the shipped pool size (6 with Switchboard on Medium and Hard; Hard
 * level 3 deals 5). `gauge` is the Pressure Gauge tier: generateBomb appends
 * one Gauge to the slot modules when it is set (it is in no pool).
 */
export function levelPlan(mode, lvl) {
  const spec = MODES[mode].levels[lvl - 1]
  const pool = shippedPool(mode)
  return {
    pool,
    tiers: spec.tiers.slice(0, pool.length),
    gauge: spec.gauge,
    clockMs: spec.clockMs,
    modifiers: spec.modifiers,
  }
}

export const slotCount = (mode, lvl) => levelPlan(mode, lvl).tiers.length

/**
 * What a mode card shows: level count, modules dealt per level (as actually
 * dealt today) and the first level that carries a modifier (null if none).
 */
export function modeSummary(mode) {
  const levels = MODES[mode].levels
  const first = levels.findIndex(l => l.modifiers.count > 0)
  return {
    name: MODES[mode].name,
    levels: levels.length,
    moduleCounts: levels.map((_, i) => slotCount(mode, i + 1)),
    modifiersFrom: first < 0 ? null : first + 1,
  }
}
