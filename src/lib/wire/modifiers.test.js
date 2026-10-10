import { describe, expect, it } from 'vitest'
import {
  BLACKOUT_EVERY_MS, BLACKOUT_MS, MODIFIERS, SHIPPED_MODIFIERS, SWAP_BANNER_MS, isBlackout, isSwapBanner, isSwapped, roleOf, SHORT_FUSE_PENALTY_MS, SHORT_FUSE_URGENT_MS, STRIKE_PENALTY_MS, URGENT_MS,
  drawModifiers, eligibleModifiers, fuseFor, makePageOrder, pageOrderOf, strikePenaltyOf, urgentMsOf,
} from './modifiers'
import { makeRng } from './rng'

describe('modifiers', () => {
  it('ships all five modifiers', () => {
    expect([...SHIPPED_MODIFIERS].sort()).toEqual(Object.keys(MODIFIERS).sort())
  })

  it('filters by severity, keeping declaration order', () => {
    expect(eligibleModifiers('mild')).toEqual(['scrambled', 'errata'])
    expect(eligibleModifiers('medium')).toEqual(['scrambled', 'errata', 'shortFuse', 'blackout'])
    expect(eligibleModifiers('severe')).toEqual(['scrambled', 'errata', 'shortFuse', 'blackout', 'swap'])
    expect(eligibleModifiers('mild', ['scrambled', 'shortFuse'])).toEqual(['scrambled'])
    expect(eligibleModifiers('bogus')).toEqual([])
  })

  it('draws no more than are eligible, never repeating', () => {
    expect(drawModifiers(makeRng('a'), 0, 'severe')).toEqual([])
    expect(drawModifiers(makeRng('a'), 9, 'severe')).toHaveLength(5)
    expect(drawModifiers(makeRng('a'), 9, 'mild')).toHaveLength(2)
    expect(new Set(drawModifiers(makeRng('a'), 2, 'medium')).size).toBe(2)
  })

  it('makes a page order that is a real permutation, never the identity', () => {
    for (let s = 0; s < 200; s++) {
      for (const n of [2, 3, 4, 5]) {
        const order = makePageOrder(makeRng(`po-${s}`), n)
        expect([...order].sort()).toEqual(Array.from({ length: n }, (_, i) => i))
        expect(order).not.toEqual(Array.from({ length: n }, (_, i) => i))
      }
    }
  })

  it('costs 25 s and turns urgent at 45 s with Short Fuse, else 15 s and 30 s', () => {
    expect(fuseFor(['shortFuse'])).toEqual({ strikePenaltyMs: SHORT_FUSE_PENALTY_MS, urgentMs: SHORT_FUSE_URGENT_MS })
    expect(fuseFor(['scrambled'])).toEqual({ strikePenaltyMs: STRIKE_PENALTY_MS, urgentMs: URGENT_MS })
    expect(fuseFor(undefined)).toEqual({ strikePenaltyMs: 15_000, urgentMs: 30_000 })
    expect(SHORT_FUSE_PENALTY_MS).toBe(25_000)
    expect(SHORT_FUSE_URGENT_MS).toBe(45_000)
  })

  it('reads the fuse from a bomb, defaulting for legacy bombs', () => {
    expect(strikePenaltyOf({})).toBe(15_000)
    expect(urgentMsOf({})).toBe(30_000)
    expect(strikePenaltyOf({ strikePenaltyMs: 25_000 })).toBe(25_000)
    expect(urgentMsOf({ urgentMs: 45_000 })).toBe(45_000)
  })

  it('maps Handbook tabs to modules through the page order', () => {
    const modules = [{}, {}, {}]
    expect(pageOrderOf({ modules })).toEqual([0, 1, 2])
    expect(pageOrderOf({ modules, pageOrder: [2, 0, 1] })).toEqual([2, 0, 1])
    expect(pageOrderOf({ modules, pageOrder: [1, 0] })).toEqual([0, 1, 2])
  })
})

describe('isBlackout', () => {
  const wire = { phase: 'armed', armedAt: 10_000 }
  it('is dark for 3 s starting 25 s after arming, then every 25 s', () => {
    expect(BLACKOUT_EVERY_MS).toBe(25_000)
    expect(BLACKOUT_MS).toBe(3_000)
    const at = (elapsed) => isBlackout(wire, wire.armedAt + elapsed)
    expect(at(0)).toBe(false)
    expect(at(24_999)).toBe(false)
    expect(at(25_000)).toBe(true)
    expect(at(27_999)).toBe(true)
    expect(at(28_000)).toBe(false)
    expect(at(49_999)).toBe(false)
    expect(at(50_000)).toBe(true)
    expect(at(52_999)).toBe(true)
    expect(at(53_000)).toBe(false)
    expect(at(75_500)).toBe(true)
  })
  it('is never dark before arming, after the bomb ends, or on bad input', () => {
    expect(isBlackout({ phase: 'ready' }, 40_000)).toBe(false)
    expect(isBlackout({ ...wire, phase: 'over' }, 36_000)).toBe(false)
    expect(isBlackout({ phase: 'armed' }, 40_000)).toBe(false)
    expect(isBlackout(null, 40_000)).toBe(false)
    expect(isBlackout(wire, NaN)).toBe(false)
  })
})

describe('roleOf and the swap', () => {
  const wire = { phase: 'armed', tech: 'X', armedAt: 1000, swapAt: 91_000 }
  it('follows the Tech seat before swapAt', () => {
    expect(roleOf(wire, 'X', 90_999)).toBe('tech')
    expect(roleOf(wire, 'O', 90_999)).toBe('handbook')
    expect(roleOf({ ...wire, tech: 'O' }, 'O', 5000)).toBe('tech')
  })
  it('trades the roles once now reaches swapAt', () => {
    expect(roleOf(wire, 'X', 91_000)).toBe('handbook')
    expect(roleOf(wire, 'O', 91_000)).toBe('tech')
    expect(roleOf(wire, 'O', 500_000)).toBe('tech')
    expect(isSwapped(wire, 90_999)).toBe(false)
    expect(isSwapped(wire, 91_000)).toBe(true)
  })
  it('never swaps without swapAt, or once the bomb is over or not armed', () => {
    const plain = { phase: 'armed', tech: 'X' }
    expect(roleOf(plain, 'X', 1e9)).toBe('tech')
    expect(roleOf({ ...wire, phase: 'over' }, 'X', 1e9)).toBe('tech')
    expect(roleOf({ ...wire, phase: 'ready' }, 'X', 1e9)).toBe('tech')
  })
  it('keeps spectators out and defaults the Tech to X', () => {
    expect(roleOf(wire, null, 1e9)).toBe('spectator')
    expect(roleOf(wire, undefined, 0)).toBe('spectator')
    expect(roleOf({ phase: 'armed' }, 'X', 0)).toBe('tech')
    expect(roleOf(null, 'O', 0)).toBe('handbook')
  })
  it('shows the SWAP! banner for 3 s after swapAt', () => {
    expect(SWAP_BANNER_MS).toBe(3000)
    expect(isSwapBanner(wire, 90_999)).toBe(false)
    expect(isSwapBanner(wire, 91_000)).toBe(true)
    expect(isSwapBanner(wire, 93_999)).toBe(true)
    expect(isSwapBanner(wire, 94_000)).toBe(false)
  })
})
