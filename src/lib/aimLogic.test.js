import { describe, it, expect } from 'vitest'
import {
  AIM_MARGIN, AIM_MIN_JUMP,
  targetAt, normalizeAimStats, applyHit, applyMiss, currentTargetIndex, aimRaceEntry, aimRow,
} from './aimLogic'

describe('targetAt', () => {
  it('is the same sequence for every racer with the same seed', () => {
    const a = Array.from({ length: 20 }, (_, k) => targetAt(123, k))
    const b = Array.from({ length: 20 }, (_, k) => targetAt(123, k))
    expect(a).toEqual(b)
    expect(targetAt(124, 0)).not.toEqual(targetAt(123, 0))
  })

  it('keeps every target inside the arena margins', () => {
    for (let k = 0; k < 100; k++) {
      const { xPct, yPct } = targetAt(987, k)
      expect(xPct).toBeGreaterThanOrEqual(AIM_MARGIN)
      expect(xPct).toBeLessThanOrEqual(1 - AIM_MARGIN)
      expect(yPct).toBeGreaterThanOrEqual(AIM_MARGIN)
      expect(yPct).toBeLessThanOrEqual(1 - AIM_MARGIN)
    }
  })

  it('jumps away from the previous target', () => {
    let far = 0
    for (let k = 1; k < 100; k++) {
      const p = targetAt(55, k - 1)
      const q = targetAt(55, k)
      if (Math.hypot(p.xPct - q.xPct, p.yPct - q.yPct) >= AIM_MIN_JUMP) far++
    }
    expect(far).toBeGreaterThanOrEqual(97)
  })

  it('clamps a negative/fractional index', () => {
    expect(targetAt(1, -3)).toEqual(targetAt(1, 0))
    expect(targetAt(1, 2.7)).toEqual(targetAt(1, 2))
  })
})

describe('scoring', () => {
  it('hit = +1 and next target, miss = −1 same target', () => {
    let s = normalizeAimStats(null)
    expect(s).toEqual({ hits: 0, misses: 0, score: 0 })
    s = applyHit(s)
    s = applyHit(s)
    s = applyMiss(s)
    expect(s).toEqual({ hits: 2, misses: 1, score: 1 })
    expect(currentTargetIndex(s)).toBe(2)
  })

  it('score can go negative (misses outweigh hits)', () => {
    expect(applyMiss(applyMiss(null)).score).toBe(-2)
  })

  it('recomputes score from counts (never trusts a stored score)', () => {
    expect(normalizeAimStats({ hits: 3, misses: 1, score: 99 }).score).toBe(2)
    expect(normalizeAimStats({ hits: '4', misses: -2 })).toEqual({ hits: 4, misses: 0, score: 4 })
  })
})

describe('race hooks', () => {
  it('ranks by net score then hits; no stats = DNF', () => {
    expect(aimRaceEntry(null)).toEqual({ sortKey: null, score: null })
    expect(aimRaceEntry({ hits: 5, misses: 1 })).toEqual({ sortKey: [-4, -5], score: 4 })
  })

  it('row shows points and hit/miss', () => {
    expect(aimRow({ hits: 5, misses: 2 })).toMatchObject({ primary: '3 PTS', secondary: '5 HIT · 2 MISS', status: 'racing' })
    expect(aimRow(null).status).toBe('idle')
  })
})
