import { describe, it, expect } from 'vitest'
import {
  COURT_W, COURT_H, PUCK_R, WALL_Y, WALL_HALF, GAP_HALF_W, PUCKS_EACH, MAX_FLING_SPEED, BOT_LEVELS,
  createState, step, getWinner, countSides, sideOf, clampHold, flingVelocity, computeAI,
} from './puckrushLogic'

const DT = 1 / 120
const run = (state, inputs, ticks) => {
  let s = state
  const events = []
  for (let i = 0; i < ticks; i++) {
    const r = step(s, typeof inputs === 'function' ? inputs(i, s) : inputs, DT)
    s = r.state
    events.push(...r.events)
  }
  return { state: s, events }
}
// One puck alone on the table, so a test controls every collision.
const lone = (puck) => ({ pucks: [{ vx: 0, vy: 0, ...puck }], held: { X: null, O: null }, seq: { X: 0, O: 0 }, tick: 0 })

describe('createState', () => {
  it('deals five pucks to each half, none overlapping', () => {
    const s = createState()
    expect(s.pucks).toHaveLength(PUCKS_EACH * 2)
    expect(countSides(s)).toEqual({ X: PUCKS_EACH, O: PUCKS_EACH })
    for (let i = 0; i < s.pucks.length; i++) {
      for (let j = i + 1; j < s.pucks.length; j++) {
        const d = Math.hypot(s.pucks[i].x - s.pucks[j].x, s.pucks[i].y - s.pucks[j].y)
        expect(d).toBeGreaterThan(2 * PUCK_R)
      }
    }
    expect(getWinner(s)).toBe(null)
  })
})

describe('the wall and the gap', () => {
  it('lets a puck through the gap and reports who it left', () => {
    const s = lone({ x: COURT_W / 2, y: WALL_Y + 0.2, vy: -2.5 })
    const r = run(s, null, 60)
    expect(sideOf(r.state.pucks[0].y)).toBe('O')
    expect(r.events.filter((e) => e.type === 'cross')).toEqual([{ type: 'cross', by: 'X' }])
  })

  it('bounces a puck off the solid wall back into its own half', () => {
    const s = lone({ x: 0.15, y: WALL_Y + 0.2, vy: -2.5 })
    const r = run(s, null, 60)
    const p = r.state.pucks[0]
    expect(sideOf(p.y)).toBe('X')
    expect(p.y).toBeGreaterThanOrEqual(WALL_Y + PUCK_R + WALL_HALF - 1e-9)
    expect(r.events.some((e) => e.type === 'cross')).toBe(false)
    expect(r.events.some((e) => e.type === 'wall')).toBe(true)
  })

  it('never lets the fastest fling tunnel through the wall', () => {
    for (const x of [PUCK_R, 0.2, COURT_W / 2 - GAP_HALF_W - 0.03, COURT_W / 2 + GAP_HALF_W + 0.03, 0.9]) {
      const s = lone({ x, y: COURT_H - PUCK_R, vy: -MAX_FLING_SPEED })
      const r = run(s, null, 240)
      expect(r.events.some((e) => e.type === 'cross')).toBe(false)
    }
  })

  it('deflects a puck that clips a gap post instead of passing through it', () => {
    const s = lone({ x: COURT_W / 2 - GAP_HALF_W + 0.01, y: WALL_Y + 0.2, vy: -2 })
    const r = run(s, null, 90)
    const p = r.state.pucks[0]
    const d = Math.hypot(p.x - (COURT_W / 2 - GAP_HALF_W), p.y - WALL_Y)
    expect(d).toBeGreaterThanOrEqual(PUCK_R + WALL_HALF - 1e-6)
  })

  it('keeps every puck on the table', () => {
    let s = createState()
    let seed = 7
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    let q = 0
    const r = run(s, (i, cur) => {
      if (i % 40 !== 0) return null
      const fx = computeAI(cur, 'X', 'hard', rng)
      const fo = computeAI(cur, 'O', 'hard', rng)
      q += 1
      return { X: { hold: null, f: fx ? [{ ...fx, q }] : [] }, O: { hold: null, f: fo ? [{ ...fo, q }] : [] } }
    }, 1200)
    s = r.state
    for (const p of s.pucks) {
      expect(p.x).toBeGreaterThanOrEqual(PUCK_R - 1e-9)
      expect(p.x).toBeLessThanOrEqual(COURT_W - PUCK_R + 1e-9)
      expect(p.y).toBeGreaterThanOrEqual(PUCK_R - 1e-9)
      expect(p.y).toBeLessThanOrEqual(COURT_H - PUCK_R + 1e-9)
    }
  })
})

describe('flings', () => {
  it('applies each numbered fling once, however often it is resent', () => {
    const s = createState()
    const f = { q: 1, i: 0, x: s.pucks[0].x, y: s.pucks[0].y, vx: 0, vy: -1 }
    const r = run(s, { X: { hold: null, f: [f] } }, 30)
    expect(r.events.filter((e) => e.type === 'fling')).toHaveLength(1)
    expect(r.state.seq.X).toBe(1)
    expect(r.state.pucks[0].y).toBeLessThan(s.pucks[0].y)
  })

  it('caps the launch speed', () => {
    const s = createState()
    const r = step(s, { X: { hold: null, f: [{ q: 1, i: 0, vx: 0, vy: -50 }] } }, DT)
    expect(Math.hypot(r.state.pucks[0].vx, r.state.pucks[0].vy)).toBeLessThanOrEqual(MAX_FLING_SPEED + 1e-9)
  })

  it('ignores a fling for a puck on the other half', () => {
    const s = createState()
    // Puck 1 starts on O's half.
    const r = step(s, { X: { hold: null, f: [{ q: 1, i: 1, vx: 0, vy: 2 }] } }, DT)
    expect(r.state.pucks[1].vy).toBe(0)
    expect(r.events).toEqual([])
    // The number is still consumed, so the stale fling cannot fire later.
    expect(r.state.seq.X).toBe(1)
  })

  it('turns a pull into a launch the opposite way, with a dead zone', () => {
    expect(flingVelocity({ x: 0.5, y: 1 }, { x: 0.5, y: 1.005 })).toEqual({ vx: 0, vy: 0 })
    const v = flingVelocity({ x: 0.5, y: 1 }, { x: 0.5, y: 1.1 })
    expect(v.vx).toBeCloseTo(0)
    expect(v.vy).toBeLessThan(0)
    const far = flingVelocity({ x: 0.5, y: 0.8 }, { x: 0.5, y: 1.25 })
    expect(Math.hypot(far.vx, far.vy)).toBeCloseTo(MAX_FLING_SPEED)
  })
})

describe('holding a puck', () => {
  it('pins the puck under the finger, inside its own half', () => {
    const s = createState()
    const r = run(s, { X: { hold: { i: 0, x: 0.5, y: 0.1 }, f: [] } }, 5)
    expect(r.state.held.X).toBe(0)
    expect(r.state.pucks[0]).toMatchObject(clampHold('X', 0.5, 0.1))
    expect(sideOf(r.state.pucks[0].y)).toBe('X')
  })

  it('will not let a side grab a puck on the other half', () => {
    const s = createState()
    const r = step(s, { X: { hold: { i: 1, x: 0.5, y: 1 }, f: [] } }, DT)
    expect(r.state.held.X).toBe(null)
    expect(r.state.pucks[1]).toEqual(s.pucks[1])
  })

  it('lets go when the input stops holding', () => {
    const s = createState()
    const a = step(s, { X: { hold: { i: 0, x: 0.5, y: 1 }, f: [] } }, DT).state
    expect(step(a, { X: { hold: null, f: [] } }, DT).state.held.X).toBe(null)
    expect(step(a, null, DT).state.held.X).toBe(null)
  })

  it('a held puck shoves a free one aside without moving itself', () => {
    const s = createState()
    const target = { x: s.pucks[2].x - PUCK_R, y: s.pucks[2].y }
    const r = run(s, { X: { hold: { i: 0, ...target }, f: [] } }, 3)
    expect(r.state.pucks[0]).toMatchObject(clampHold('X', target.x, target.y))
    const d = Math.hypot(r.state.pucks[2].x - r.state.pucks[0].x, r.state.pucks[2].y - r.state.pucks[0].y)
    expect(d).toBeGreaterThanOrEqual(2 * PUCK_R - 1e-9)
  })
})

describe('getWinner', () => {
  it('goes to the side whose half is empty', () => {
    const s = createState()
    s.pucks.forEach((p) => { p.y = 0.2 })
    expect(getWinner(s)).toBe('X')
    s.pucks.forEach((p) => { p.y = COURT_H - 0.2 })
    expect(getWinner(s)).toBe('O')
  })

  it('counts a held puck as still on its half', () => {
    const s = createState()
    s.pucks.forEach((p, i) => { if (i) p.y = 0.2 })
    s.held.X = 0
    expect(countSides(s)).toEqual({ X: 1, O: 9 })
    expect(getWinner(s)).toBe(null)
  })
})

describe('computeAI', () => {
  const fixed = (v) => () => v

  it('flings one of its own resting pucks toward the wall', () => {
    const s = createState()
    const f = computeAI(s, 'O', 'normal', fixed(0.5))
    expect(sideOf(s.pucks[f.i].y)).toBe('O')
    expect(f.vy).toBeGreaterThan(0)
    expect(Math.hypot(f.vx, f.vy)).toBeLessThanOrEqual(MAX_FLING_SPEED + 1e-9)
    const fx = computeAI(s, 'X', 'normal', fixed(0.5))
    expect(sideOf(s.pucks[fx.i].y)).toBe('X')
    expect(fx.vy).toBeLessThan(0)
  })

  it('aims inside the gap on HARD and can miss it on EASY', () => {
    const s = createState()
    const hitX = (f) => s.pucks[f.i].x + (f.vx / f.vy) * (WALL_Y - s.pucks[f.i].y)
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const f = computeAI(s, 'O', 'hard', fixed(r))
      expect(Math.abs(hitX(f) - COURT_W / 2)).toBeLessThan(GAP_HALF_W)
    }
    const wide = computeAI(s, 'O', 'easy', fixed(0.999))
    expect(Math.abs(hitX(wide) - COURT_W / 2)).toBeGreaterThan(GAP_HALF_W)
    expect(BOT_LEVELS.easy.waitMs[0]).toBeGreaterThan(BOT_LEVELS.hard.waitMs[1])
  })

  it('has nothing to do when its half is empty or still moving', () => {
    const s = createState()
    s.pucks.forEach((p) => { p.y = COURT_H - 0.2 })
    expect(computeAI(s, 'O', 'normal', fixed(0.5))).toBe(null)
    const m = createState()
    m.pucks.forEach((p) => { p.vx = 1 })
    expect(computeAI(m, 'O', 'normal', fixed(0.5))).toBe(null)
  })

  it('can clear its half against an idle rival', () => {
    let seed = 11
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    let s = createState()
    let q = 0
    for (let i = 0; i < 120 * 90 && !getWinner(s); i++) {
      let inputs = null
      if (i % 60 === 0) {
        const f = computeAI(s, 'O', 'hard', rng)
        if (f) { q += 1; inputs = { O: { hold: null, f: [{ ...f, q }] } } }
      }
      s = step(s, inputs, DT).state
    }
    expect(getWinner(s)).toBe('O')
  })
})
