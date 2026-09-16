import { describe, it, expect } from 'vitest'
import {
  COURT_W, COURT_H, PUCK_R, MALLET_R, GOAL_HALF_W, WIN_SCORE, MAX_MALLET_SPEED,
  createState, step, computeAI, getWinner,
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

describe('createState', () => {
  it('centers the puck and seats the mallets in their own halves', () => {
    const s = createState()
    expect(s.puck).toEqual({ x: COURT_W / 2, y: COURT_H / 2, vx: 0, vy: 0 })
    expect(s.mallets.X.y).toBeGreaterThan(COURT_H / 2) // X defends the bottom goal
    expect(s.mallets.O.y).toBeLessThan(COURT_H / 2)    // O defends the top goal
    expect(s.score).toEqual({ X: 0, O: 0 })
    expect(s.serveTimer).toBeGreaterThan(0)
  })
})

describe('step — serve delay', () => {
  it('holds the puck still and only tracks mallets while serveTimer > 0', () => {
    const s0 = createState()
    const { state } = step(s0, {
      X: { x: s0.mallets.X.x + 0.02, y: s0.mallets.X.y },
      O: { x: s0.mallets.O.x, y: s0.mallets.O.y },
    }, 1 / 120)
    expect(state.puck).toEqual(s0.puck)
    expect(state.mallets.X.x).toBeCloseTo(s0.mallets.X.x + 0.02)
    expect(state.serveTimer).toBeLessThan(s0.serveTimer)
  })

  it('tolerates null guest input (host loop before first {t:i})', () => {
    const s0 = createState()
    const { state } = step(s0, {
      X: { x: s0.mallets.X.x, y: s0.mallets.X.y },
      O: null,
    }, 1 / 120)
    expect(state.mallets.O).toEqual(s0.mallets.O)
    expect(state.serveTimer).toBeLessThan(s0.serveTimer)
  })
})

describe('step determinism', () => {
  it('identical inputs produce identical states', () => {
    const a = run(createState(), IDLE, 240).state
    const b = run(createState(), IDLE, 240).state
    expect(a.puck).toEqual(b.puck)
    expect(a.score).toEqual(b.score)
  })

  it('never mutates the passed-in state', () => {
    const s0 = { ...createState(), serveTimer: 0, puck: { x: 0.5, y: 0.5, vx: 0.3, vy: 0.2 } }
    const snapshot = JSON.parse(JSON.stringify(s0))
    step(s0, IDLE(), 1 / 120)
    expect(s0).toEqual(snapshot)
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
    s.puck = { x: 0.02, y: PUCK_R + 0.2, vx: 0, vy: -2.2 }
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
    const inputs = i => {
      if (i < 20) return { X: { x: 0.5, y: COURT_H / 2 - 0.12 }, O: IDLE().O }
      return { X: { x: 0.5, y: COURT_H - 0.25 }, O: IDLE().O }
    }
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

// M-9: a touch/network position jump shouldn't be able to inject an
// unrealistic instantaneous "flick" into the puck via the mallet's derived
// velocity — trackVelocity() must clamp it.
describe('step — mallet velocity clamp (M-9)', () => {
  it('clamps the mallet velocity derived from a large one-tick position jump', () => {
    const s0 = { ...createState(), serveTimer: 0 }
    const { state } = step(s0, {
      X: { x: s0.mallets.X.x + 1, y: s0.mallets.X.y }, // huge jump — e.g. a coalesced touch event
      O: { x: s0.mallets.O.x, y: s0.mallets.O.y },
    }, 1 / 120)
    const sp = Math.hypot(state.velocities.X.vx, state.velocities.X.vy)
    expect(sp).toBeLessThanOrEqual(MAX_MALLET_SPEED + 1e-9)
  })

  it('does not clamp an ordinary, physically plausible drag', () => {
    const s0 = { ...createState(), serveTimer: 0 }
    const dt = 1 / 120
    const smallStep = s0.mallets.X.x + 0.01
    const { state } = step(s0, {
      X: { x: smallStep, y: s0.mallets.X.y },
      O: { x: s0.mallets.O.x, y: s0.mallets.O.y },
    }, dt)
    expect(state.velocities.X.vx).toBeCloseTo(0.01 / dt)
  })
})

// M-8: both mallets can overlap the puck at once (a "pinch"). Positional
// correction is applied unconditionally and sequentially per mallet, so
// whichever symbol resolves first determines where the puck ends up.
// Resolving X then O on every tick would bias every pinch toward X;
// alternating by tick parity should flip the outcome instead.
describe('step — mallet-puck pinch order fairness (M-8)', () => {
  const pinchState = (tick) => ({
    ...createState(),
    serveTimer: 0,
    tick,
    puck: { x: COURT_W / 2, y: COURT_H / 2, vx: 0, vy: 0 },
    mallets: {
      X: { x: COURT_W / 2, y: COURT_H / 2 + 0.01 },
      O: { x: COURT_W / 2, y: COURT_H / 2 - 0.01 },
    },
  })
  const stay = (m) => ({ X: { x: m.X.x, y: m.X.y }, O: { x: m.O.x, y: m.O.y } })

  it('resolves the same symmetric pinch differently depending on tick parity', () => {
    const even = pinchState(0)
    const odd = pinchState(1)
    const rEven = step(even, stay(even.mallets), 1 / 120)
    const rOdd = step(odd, stay(odd.mallets), 1 / 120)
    expect(rEven.state.puck.y).not.toBeCloseTo(rOdd.state.puck.y, 6)
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

describe('computeAI', () => {
  it('returns a target within the O mallet half of the court', () => {
    const s = createState()
    const t = computeAI(s, 'normal')
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.x).toBeLessThanOrEqual(COURT_W)
    expect(t.y).toBeGreaterThanOrEqual(MALLET_R - 1e-9)
    expect(t.y).toBeLessThanOrEqual(COURT_H / 2 + 1e-9)
  })

  // M-10: the AI's step must scale by dt, or calling it once per physics
  // substep would multiply its effective speed by the substep count instead
  // of respecting the difficulty's `speed` factor.
  it('scales its per-call step by dt (M-10)', () => {
    const s = { ...createState(), puck: { x: 0.9, y: 0.2, vx: 0, vy: 0 } }
    const half = computeAI(s, 'hard', 1 / 120)
    const full = computeAI(s, 'hard', 1 / 60)
    const halfDist = Math.hypot(half.x - s.mallets.O.x, half.y - s.mallets.O.y)
    const fullDist = Math.hypot(full.x - s.mallets.O.x, full.y - s.mallets.O.y)
    expect(fullDist).toBeCloseTo(halfDist * 2, 5)
  })

  it('moves faster on hard than on easy for the same setup', () => {
    const s = { ...createState(), puck: { x: 0.9, y: 0.2, vx: 0, vy: 0 } }
    const easy = computeAI(s, 'easy')
    const hard = computeAI(s, 'hard')
    const easyDist = Math.hypot(easy.x - s.mallets.O.x, easy.y - s.mallets.O.y)
    const hardDist = Math.hypot(hard.x - s.mallets.O.x, hard.y - s.mallets.O.y)
    expect(hardDist).toBeGreaterThanOrEqual(easyDist)
  })
})
