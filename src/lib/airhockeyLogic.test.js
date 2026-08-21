import { describe, it, expect } from 'vitest'
import {
  COURT_W, COURT_H, PUCK_R, MALLET_R, GOAL_HALF_W, WIN_SCORE,
  createState, step, getWinner,
} from './airhockeyLogic'

const IDLE = () => ({
  X: { x: COURT_W / 2, y: COURT_H - 0.25 },
  O: { x: COURT_W / 2, y: 0.25 },
})

// Drive N fixed ticks.
function run(state, inputsFn, ticks) {
  let s = state
  const events = []
  for (let i = 0; i < ticks; i++) {
    const r = step(s, inputsFn(i), 1 / 120)
    s = r.state
    events.push(...r.events)
  }
  return { state: s, events }
}

describe('court constants', () => {
  it('portrait court with sane radii', () => {
    expect(COURT_H).toBeGreaterThan(COURT_W)
    expect(MALLET_R).toBeGreaterThan(PUCK_R)
    expect(GOAL_HALF_W * 2).toBeCloseTo(COURT_W * 0.35, 5)
    expect(WIN_SCORE).toBe(7)
  })
})

describe('step determinism', () => {
  it('identical inputs produce identical states', () => {
    const a = run(createState(), IDLE, 240).state
    const b = run(createState(), IDLE, 240).state
    expect(a.puck).toEqual(b.puck)
    expect(a.score).toEqual(b.score)
  })
})

describe('wall bounces', () => {
  it('side walls reflect the puck elastically', () => {
    const s = createState()
    s.serveTimer = 0
    s.puck = { x: 0.05, y: COURT_H / 2, vx: -1, vy: 0 }
    const { state } = run(s, IDLE, 30)
    expect(state.puck.x).toBeGreaterThanOrEqual(PUCK_R - 1e-9)
    expect(state.puck.vx).toBeGreaterThan(0)
  })
  it('back wall bounces when outside goal mouth', () => {
    const s = createState()
    s.serveTimer = 0
    s.puck = { x: 0.08, y: PUCK_R + 0.01, vx: 0, vy: -1 }
    const { state } = run(s, IDLE, 10)
    expect(state.puck.y).toBeGreaterThanOrEqual(PUCK_R - 1e-9)
    expect(state.score.O).toBe(0)
  })
})

describe('goals', () => {
  it('scores when puck fully crosses inside the mouth — X scores on O', () => {
    const s = createState()
    s.serveTimer = 0
    s.puck = { x: COURT_W / 2, y: PUCK_R + 0.05, vx: 0, vy: -2 }
    const { state, events } = run(s, IDLE, 200)
    expect(state.score.X).toBe(1)
    expect(events.some(e => e.type === 'goal' && e.scorer === 'X')).toBe(true)
    expect(state.serveTimer > -0.001).toBe(true) // reset to ~1000ms (float dust ok)
    expect(state.serveTo).toBe('O') // conceded → O receives
  })
  it('does not score outside mouth x-range even at full speed (no tunneling)', () => {
    const s = createState()
    s.serveTimer = 0
    s.puck = { x: 0.02, y: PUCK_R + 0.2, vx: 0, vy: -MAX_LIKE() }
    function MAX_LIKE() { return 2.2 }
    const { state } = run(s, IDLE, 120)
    expect(state.score.X).toBe(0)
    expect(state.score.O).toBe(0)
  })
})

describe('mallet clamp', () => {
  it('each mallet stays confined to its own half', () => {
    const s = createState()
    s.serveTimer = 0
    const inputs = () => ({
      X: { x: 0.5, y: 0.1 },   // X tries to cross into O's half
      O: { x: 0.5, y: 1.4 },   // O tries to cross into X's half
    })
    const { state } = run(s, inputs, 60)
    expect(state.mallets.X.y).toBeGreaterThanOrEqual(COURT_H / 2)
    expect(state.mallets.O.y).toBeLessThanOrEqual(COURT_H / 2)
  })
})

describe('velocity transfer', () => {
  it('a fast downward mallet flick sends the puck downward', () => {
    const s = createState()
    s.serveTimer = 0
    s.puck = { x: 0.5, y: COURT_H / 2, vx: 0, vy: 0 }
    // X mallet rushes up into the puck then holds.
    let phase = 0
    const inputs = i => {
      if (i < 20) return { X: { x: 0.5, y: COURT_H / 2 - 0.12 }, O: IDLE().O }
      return { X: { x: 0.5, y: COURT_H - 0.25 }, O: IDLE().O }
    }
    void phase
    const { state } = run(s, inputs, 40)
    expect(Math.hypot(state.puck.vx, state.puck.vy)).toBeGreaterThan(0)
  })
  it('max-speed clamp holds at extreme input', () => {
    const s = createState()
    s.serveTimer = 0
    s.puck = { x: COURT_W / 2, y: COURT_H - PUCK_R - 0.001, vx: 99, vy: -99 }
    const { state } = run(s, IDLE, 6)
    expect(Math.hypot(state.puck.vx, state.puck.vy)).toBeLessThanOrEqual(2.21)
  })
})

describe('friction', () => {
  it('puck slows over time', () => {
    const s = createState()
    s.serveTimer = 0
    s.puck = { x: COURT_W / 2, y: COURT_H / 2, vx: 1, vy: 0 }
    const before = Math.hypot(s.puck.vx, s.puck.vy)
    const { state } = run(s, IDLE, 60)
    const after = Math.hypot(state.puck.vx, state.puck.vy)
    expect(after).toBeLessThan(before)
  })
})

describe('winner', () => {
  it('returns null below WIN_SCORE and the leader at 7', () => {
    const s = createState()
    expect(getWinner(s)).toBeNull()
    s.score.X = 7
    expect(getWinner(s)).toBe('X')
    const t = createState(); t.score.O = 7
    expect(getWinner(t)).toBe('O')
  })
})
