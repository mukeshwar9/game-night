import { describe, expect, it } from 'vitest'
import { bumpPlan, bumpProgress } from './arrowsMotionLogic'

describe('bumpPlan', () => {
  it('has no distance cap', () => {
    expect(bumpPlan(15).cells).toBeCloseTo(15.3)
    expect(bumpPlan(0).cells).toBeCloseTo(0.3)
  })
  it('treats bad gaps as 0', () => {
    expect(bumpPlan(NaN).cells).toBeCloseTo(0.3)
    expect(bumpPlan(-4).cells).toBeCloseTo(0.3)
  })
  it('keeps short bumps close to the old timing', () => {
    expect(bumpPlan(0).outMs).toBe(90)
    const near = bumpPlan(3) // old: 3.3 * 38 = 125.4 out, 220 back
    expect(near.outMs).toBeGreaterThan(125.4 * 0.8)
    expect(near.outMs).toBeLessThan(125.4 * 1.2)
    expect(near.backMs).toBe(220)
  })
  it('scales with distance but stays bounded', () => {
    let prev = bumpPlan(0)
    for (let g = 1; g <= 80; g += 1) {
      const p = bumpPlan(g)
      expect(p.outMs).toBeGreaterThanOrEqual(prev.outMs)
      expect(p.outMs).toBeLessThanOrEqual(650)
      expect(p.backMs).toBeGreaterThanOrEqual(220)
      expect(p.backMs).toBeLessThanOrEqual(650)
      prev = p
    }
    expect(bumpPlan(15).outMs).toBeGreaterThan(bumpPlan(4).outMs)
    expect(bumpPlan(15).backMs).toBeGreaterThan(220)
  })
})

describe('bumpProgress', () => {
  const plan = bumpPlan(15)
  it('starts at rest', () => {
    expect(bumpProgress(0, plan)).toEqual({ fraction: 0, done: false })
  })
  it('reaches the full distance at outMs', () => {
    expect(bumpProgress(plan.outMs, plan).fraction).toBe(1)
    expect(bumpProgress(plan.outMs - 1, plan).fraction).toBeLessThan(1)
  })
  it('returns to 0 and is done after outMs + backMs', () => {
    expect(bumpProgress(plan.outMs + plan.backMs, plan)).toEqual({ fraction: 0, done: true })
    expect(bumpProgress(plan.outMs + plan.backMs - 1, plan).done).toBe(false)
  })
  it('is monotonic out and back, within 0..1', () => {
    for (const gap of [0, 2, 15, 60]) {
      const p = bumpPlan(gap)
      let prev = 0
      for (let t = 0; t <= p.outMs; t += 4) {
        const f = bumpProgress(t, p).fraction
        expect(f).toBeGreaterThanOrEqual(prev)
        expect(f).toBeLessThanOrEqual(1)
        prev = f
      }
      prev = 1
      for (let t = p.outMs; t < p.outMs + p.backMs; t += 4) {
        const f = bumpProgress(t, p).fraction
        expect(f).toBeLessThanOrEqual(prev)
        expect(f).toBeGreaterThanOrEqual(0)
        prev = f
      }
    }
  })
  it('has no jump between consecutive 16 ms frames', () => {
    for (const gap of [0, 3, 15, 60]) {
      const p = bumpPlan(gap)
      let prev = 0
      for (let t = 0; t <= p.outMs + p.backMs + 16; t += 16) {
        const f = bumpProgress(t, p).fraction
        // peak slope is 2x average on the out phase: <= 2 * 16 / 90 of the route
        expect(Math.abs(f - prev)).toBeLessThan(0.4)
        prev = f
      }
    }
  })
})
