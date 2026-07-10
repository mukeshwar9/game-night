import { describe, it, expect } from 'vitest'
import {
  createState, step, computeAI, getWinner,
  WIN_SCORE, BALL_R, PADDLE_H, BALL_MAX_SPEED, X_FACE, O_FACE,
  SERVE_DELAY, SERVE_SPEED, SPIN_TRANSFER, OFFSET_SPIN, SPIN_DECAY_RATE,
  PICKUP_FIRST_AT,
  EFFECT_GROW, EFFECT_SLOW,
  SLOW_MULT,
} from './pongLogic'

const speed = ({ vx, vy }) => Math.hypot(vx, vy)

describe('createState', () => {
  it('centres the ball and paddles with a zeroed score', () => {
    const s = createState()
    expect(s.ball.x).toBeCloseTo(0.5)
    expect(s.ball.y).toBeCloseTo(0.5)
    expect(s.paddles).toEqual({ X: 0.5, O: 0.5 })
    expect(s.score).toEqual({ X: 0, O: 0 })
  })

  it('serves toward the requested side (vx sign)', () => {
    expect(createState({ serveTo: 'X' }).ball.vx).toBeLessThan(0)
    expect(createState({ serveTo: 'O' }).ball.vx).toBeGreaterThan(0)
  })

  it('launches at SERVE_SPEED (slower than the rally base)', () => {
    const s = createState({ serveTo: 'O' })
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeCloseTo(SERVE_SPEED)
  })

  it('carries an initial score through', () => {
    expect(createState({ score: { X: 2, O: 1 } }).score).toEqual({ X: 2, O: 1 })
  })
})

describe('step — free flight', () => {
  it('advances the ball by velocity × dt when nothing is hit', () => {
    const s = { ball: { x: 0.5, y: 0.5, vx: 0.4, vy: 0.2 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const { state, events } = step(s, {}, 0.1)
    expect(state.ball.x).toBeCloseTo(0.54)
    expect(state.ball.y).toBeCloseTo(0.52)
    expect(events).toEqual([])
  })

  it('is pure — does not mutate the input state', () => {
    const s = createState()
    const snapshot = JSON.parse(JSON.stringify(s))
    step(s, { X: 1, O: -1 }, 0.1)
    expect(s).toEqual(snapshot)
  })

  it('moves paddles and clamps them inside the court', () => {
    const s = createState()
    const down = step(s, { X: 1 }, 0.1).state
    expect(down.paddles.X).toBeGreaterThan(0.5)
    // Hold "up" far longer than the court is tall — must clamp, not escape.
    let st = createState()
    for (let i = 0; i < 200; i++) st = step(st, { X: -1 }, 0.05).state
    expect(st.paddles.X).toBeGreaterThanOrEqual(PADDLE_H / 2 - 1e-9)
  })
})

describe('step — walls', () => {
  it('bounces off the top wall and flips vy', () => {
    const s = { ball: { x: 0.5, y: BALL_R + 0.001, vx: 0.1, vy: -0.5 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const { state, events } = step(s, {}, 0.1)
    expect(state.ball.vy).toBeGreaterThan(0)
    expect(state.ball.y).toBeGreaterThanOrEqual(BALL_R)
    expect(events.some(e => e.type === 'wall')).toBe(true)
  })

  it('bounces off the bottom wall', () => {
    const s = { ball: { x: 0.5, y: 1 - BALL_R - 0.001, vx: 0.1, vy: 0.5 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const { state } = step(s, {}, 0.1)
    expect(state.ball.vy).toBeLessThan(0)
    expect(state.ball.y).toBeLessThanOrEqual(1 - BALL_R)
  })
})

describe('step — paddle returns', () => {
  it('returns a ball that reaches the X paddle aligned with it', () => {
    const s = { ball: { x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const { state, events } = step(s, {}, 0.05)
    expect(state.ball.vx).toBeGreaterThan(0)               // sent back rightward
    expect(events.some(e => e.type === 'paddle' && e.side === 'X')).toBe(true)
  })

  it('returns a ball off the O paddle', () => {
    const s = { ball: { x: O_FACE - 0.005, y: 0.5, vx: 0.6, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const { state } = step(s, {}, 0.05)
    expect(state.ball.vx).toBeLessThan(0)
  })

  it('speeds the ball up on a hit but never past the cap', () => {
    const before = { x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0 }
    const after = step({ ball: before, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }, {}, 0.05).state.ball
    expect(speed(after)).toBeGreaterThan(speed(before))

    let fast = { ball: { x: X_FACE + 0.005, y: 0.5, vx: -3, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const out = step(fast, {}, 0.02).state.ball
    expect(speed(out)).toBeLessThanOrEqual(BALL_MAX_SPEED + 1e-9)
  })

  it('angles the return by where the ball hits the paddle', () => {
    // Ball strikes above the paddle centre → should fly upward (negative vy).
    const s = { ball: { x: X_FACE + 0.005, y: 0.5 - PADDLE_H / 3, vx: -0.6, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const { state } = step(s, {}, 0.05)
    expect(state.ball.vy).toBeLessThan(0)
  })
})

describe('step — spin', () => {
  it('imparts spin from paddle motion on a hit', () => {
    // Stationary paddle hitting a centred ball → spin from offset only (offset ≈ 0 with small dt).
    const s0 = { ball: { x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0, spin: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const r0 = step(s0, { X: 0 }, 1 / 120)
    expect(r0.state.ball.spin).toBeCloseTo(0, 1) // centred hit, no motion → ~0

    // Moving paddle downward (input = 1) → spin is positive (motion + small offset from paddle drift).
    const s1 = { ball: { x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0, spin: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const r1 = step(s1, { X: 1 }, 1 / 120)
    expect(r1.state.ball.spin).toBeGreaterThan(0.2) // SPIN_TRANSFER dominates
    // Verify the value: paddle moves to 0.5 + 1*1.25/120, ball stays at y=0.5
    const paddleYAfter = 0.5 + 1 * 1.25 * (1 / 120)
    const offset = (0.5 - paddleYAfter) / (PADDLE_H / 2)
    const expectedSpin = 1 * 1.25 * SPIN_TRANSFER + offset * OFFSET_SPIN
    expect(r1.state.ball.spin).toBeCloseTo(expectedSpin, 4)
  })

  it('imparts spin from edge-hit offset', () => {
    // Ball hits above paddle centre with a stationary paddle → negative offset → negative spin.
    const s = { ball: { x: X_FACE + 0.005, y: 0.5 - PADDLE_H / 3, vx: -0.6, vy: 0, spin: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const r = step(s, { X: 0 }, 0.05)
    expect(r.state.ball.spin).toBeLessThan(0) // above centre → negative spin
  })

  it('curves the trajectory while spin is non-zero', () => {
    // Ball in free flight with positive spin → vy should increase over time.
    let s = { ball: { x: 0.5, y: 0.5, vx: 0.6, vy: 0, spin: 1.0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const vy0 = s.ball.vy
    for (let i = 0; i < 60; i++) s = step(s, {}, 1 / 120).state  // 0.5s
    expect(s.ball.vy).toBeGreaterThan(vy0)  // spin pushed vy positive
  })

  it('decays spin exponentially over time', () => {
    let s = { ball: { x: 0.5, y: 0.5, vx: 0, vy: 0, spin: 1.0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    for (let i = 0; i < 120; i++) s = step(s, {}, 1 / 120).state  // 1s
    // After 1s: spin ≈ 1.0 * exp(-SPIN_DECAY_RATE * 1)
    expect(s.ball.spin).toBeCloseTo(Math.exp(-SPIN_DECAY_RATE), 1)
  })

  it('zero-spin trajectory matches pre-spin behaviour (regression)', () => {
    const s = { ball: { x: 0.5, y: 0.5, vx: 0.4, vy: 0.2, spin: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    const { state } = step(s, {}, 0.1)
    expect(state.ball.x).toBeCloseTo(0.54)
    expect(state.ball.y).toBeCloseTo(0.52)
    expect(state.ball.spin).toBe(0)
  })

  it('resets spin to zero on a score', () => {
    let s = { ball: { x: X_FACE + 0.005, y: 0.9, vx: -0.8, vy: 0, spin: 0.5 }, paddles: { X: 0.1, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    for (let i = 0; i < 50; i++) {
      const r = step(s, {}, 0.02)
      s = r.state
      if (r.events.some(e => e.type === 'score')) break
    }
    expect(s.ball.spin).toBe(0)
  })
})

describe('step — scoring', () => {
  it('awards O a point and holds the ball at centre for the serve delay', () => {
    // Ball heading left, paddle parked far away → miss.
    let s = { ball: { x: X_FACE + 0.005, y: 0.9, vx: -0.8, vy: 0 }, paddles: { X: 0.1, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    let scored = null
    for (let i = 0; i < 50 && !scored; i++) {
      const r = step(s, {}, 0.02)
      s = r.state
      const e = r.events.find(ev => ev.type === 'score')
      if (e) scored = e
    }
    expect(scored).toEqual({ type: 'score', by: 'O' })
    expect(s.score).toEqual({ X: 0, O: 1 })
    expect(s.ball.x).toBeCloseTo(0.5)                       // held at centre
    expect(s.ball.vx).toBe(0)                                // zero velocity during delay
    expect(s.serveTo).toBe('X')                              // will serve toward the loser
    expect(s.serveIn).toBeGreaterThan(0)                     // delay active
  })

  it('launches toward the loser after the serve delay elapses', () => {
    // Start from a state that just scored on X (ball held, serveTo='X').
    let s = { ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 1 }, serveCount: 1, serveTo: 'X', serveIn: SERVE_DELAY }
    // Step through the entire delay.
    const ticks = Math.ceil(SERVE_DELAY / 0.02) + 1
    for (let i = 0; i < ticks; i++) s = step(s, {}, 0.02).state
    expect(s.serveIn).toBe(0)
    expect(s.serveTo).toBe(null)
    expect(s.ball.vx).toBeLessThan(0)                        // launched toward X
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeCloseTo(SERVE_SPEED)
  })

  it('awards X a point when O misses', () => {
    let s = { ball: { x: O_FACE - 0.005, y: 0.1, vx: 0.8, vy: 0 }, paddles: { X: 0.5, O: 0.9 }, score: { X: 0, O: 0 }, serveCount: 0 }
    let scored = null
    for (let i = 0; i < 50 && !scored; i++) {
      const r = step(s, {}, 0.02)
      s = r.state
      const e = r.events.find(ev => ev.type === 'score')
      if (e) scored = e
    }
    expect(scored).toEqual({ type: 'score', by: 'X' })
    expect(s.score).toEqual({ X: 1, O: 0 })
    expect(s.serveTo).toBe('O')                              // will serve toward O (the loser)
  })

  it('paddles still move during the serve hold', () => {
    let s = { ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 1 }, serveCount: 1, serveTo: 'X', serveIn: SERVE_DELAY }
    s = step(s, { X: 1 }, 0.1).state
    expect(s.paddles.X).toBeGreaterThan(0.5)                 // paddle moved despite ball being held
  })
})

describe('computeAI', () => {
  it('chases the ball down when the ball is below and approaching', () => {
    const s = { ball: { x: 0.6, y: 0.8, vx: -0.5, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    expect(computeAI(s, 'X')).toBe(1)
  })

  it('chases the ball up when the ball is above and approaching', () => {
    const s = { ball: { x: 0.6, y: 0.2, vx: -0.5, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    expect(computeAI(s, 'X')).toBe(-1)
  })

  it('holds still within the deadzone', () => {
    const s = { ball: { x: 0.6, y: 0.51, vx: -0.5, vy: 0 }, paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    expect(computeAI(s, 'X')).toBe(0)
  })

  it('recentres when the ball is moving away', () => {
    const s = { ball: { x: 0.6, y: 0.9, vx: 0.5, vy: 0 }, paddles: { X: 0.2, O: 0.5 }, score: { X: 0, O: 0 }, serveCount: 0 }
    // ball below but moving away → target is centre (0.5), paddle at 0.2 → move down
    expect(computeAI(s, 'X')).toBe(1)
  })
})

describe('getWinner', () => {
  it('returns null below the threshold', () => {
    expect(getWinner({ X: WIN_SCORE - 1, O: 0 })).toBe(null)
  })
  it('declares the side that reaches WIN_SCORE', () => {
    expect(getWinner({ X: WIN_SCORE, O: 2 })).toBe('X')
    expect(getWinner({ X: 1, O: WIN_SCORE })).toBe('O')
  })
})

describe('full rally', () => {
  it('two AI paddles sustain a rally (the ball gets returned, not lost)', () => {
    let s = createState({ serveTo: 'O' })
    let hits = 0
    for (let i = 0; i < 2400; i++) { // 20s at 120Hz
      const inputs = { X: computeAI(s, 'X'), O: computeAI(s, 'O') }
      const r = step(s, inputs, 1 / 120)
      s = r.state
      hits += r.events.filter(e => e.type === 'paddle').length
    }
    expect(hits).toBeGreaterThan(2)                         // real volleys happened
    expect(s.ball.x).toBeGreaterThan(0)                     // ball never lost off-court
    expect(s.ball.x).toBeLessThan(1)
  })

  it('a parked paddle eventually concedes a point', () => {
    let s = createState({ serveTo: 'O' })
    s.paddles.O = 0.95                                       // O sits in the corner, AI only on X
    let scored = false
    for (let i = 0; i < 3000 && !scored; i++) {
      const r = step(s, { X: computeAI(s, 'X'), O: 0 }, 1 / 120)
      s = r.state
      if (r.events.some(e => e.type === 'score')) scored = true
    }
    expect(scored).toBe(true)
    expect(s.score.X).toBeGreaterThan(0)                    // X punished O's parked paddle
  })
})

describe('step — power-ups', () => {
  it('spawns a pickup after PICKUP_FIRST_AT seconds of rally', () => {
    let s = createState({ serveTo: 'O' })
    // Run for PICKUP_FIRST_AT seconds — a pickup should spawn.
    for (let i = 0; i < Math.ceil(PICKUP_FIRST_AT * 120) + 10; i++) {
      s = step(s, { X: computeAI(s, 'X'), O: computeAI(s, 'O') }, 1 / 120).state
      if (s.pickups.length > 0) break
    }
    expect(s.pickups.length).toBe(1)
    expect(s.pickups[0].kind).toBeTruthy()
  })

  it('does not spawn a pickup while one is already active', () => {
    let s = createState({ serveTo: 'O' })
    for (let i = 0; i < Math.ceil(PICKUP_FIRST_AT * 120) + 10; i++) {
      s = step(s, { X: computeAI(s, 'X'), O: computeAI(s, 'O') }, 1 / 120).state
      if (s.pickups.length > 0) break
    }
    expect(s.pickups.length).toBe(1)
    // Keep stepping — no second pickup should appear.
    const seqBefore = s.pickupSeq
    for (let i = 0; i < 300; i++) {
      s = step(s, { X: computeAI(s, 'X'), O: computeAI(s, 'O') }, 1 / 120).state
    }
    expect(s.pickups.length).toBeLessThanOrEqual(1)
    expect(s.pickupSeq).toBe(seqBefore)
  })

  it('grow pickup grows the last hitter and expires', () => {
    // Place a pickup directly on the ball, kind = grow (seq 0 → 'grow').
    let s = createState({ serveTo: 'O' })
    s.pickups = [{ id: 0, x: s.ball.x, y: s.ball.y, kind: 'grow' }]
    s.lastHitter = 'X'
    s.pickupSeq = 1
    const r = step(s, {}, 1 / 120)
    expect(r.events.some(e => e.type === 'pickup' && e.kind === 'grow')).toBe(true)
    expect(r.state.effects.X.grow).toBeGreaterThan(0)
    expect(r.state.pickups.length).toBe(0) // collected
    // Expire the effect.
    let s2 = r.state
    for (let i = 0; i < Math.ceil(EFFECT_GROW * 120) + 5; i++) {
      s2 = step(s2, {}, 1 / 120).state
    }
    expect(s2.effects.X.grow).toBe(0)
  })

  it('shrink pickup shrinks the opponent', () => {
    let s = createState({ serveTo: 'O' })
    s.pickups = [{ id: 0, x: s.ball.x, y: s.ball.y, kind: 'shrink' }]
    s.lastHitter = 'X'
    s.pickupSeq = 1
    const r = step(s, {}, 1 / 120)
    expect(r.state.effects.O.shrink).toBeGreaterThan(0) // opponent shrunk
    expect(r.state.effects.X.shrink).toBe(0)            // hitter not shrunk
  })

  it('slow pickup slows the ball movement', () => {
    let s = createState({ serveTo: 'O' })
    s.pickups = [{ id: 0, x: s.ball.x, y: s.ball.y, kind: 'slow' }]
    s.lastHitter = 'X'
    s.pickupSeq = 1
    const r = step(s, {}, 1 / 120)
    expect(r.state.ballMod.slow).toBeGreaterThan(0)
    // Compare movement: a step with slow vs without should move the ball less.
    const sNoSlow = { ...createState({ serveTo: 'O' }), ball: { x: 0.5, y: 0.5, vx: 0.6, vy: 0, spin: 0 } }
    const sSlow = { ...createState({ serveTo: 'O' }), ball: { x: 0.5, y: 0.5, vx: 0.6, vy: 0, spin: 0 }, ballMod: { slow: EFFECT_SLOW } }
    const dxNoSlow = step(sNoSlow, {}, 0.1).state.ball.x
    const dxSlow = step(sSlow, {}, 0.1).state.ball.x
    expect(dxSlow - 0.5).toBeCloseTo((dxNoSlow - 0.5) * SLOW_MULT)
  })

  it('clears all power-ups on a score', () => {
    let s = createState({ serveTo: 'O' })
    s.effects.X.grow = 3
    s.ballMod.slow = 2
    s.pickups = [{ id: 0, x: 0.3, y: 0.3, kind: 'grow' }]
    // Force a score: ball past O's wall.
    s.ball = { x: 1.01, y: 0.5, vx: 0.8, vy: 0, spin: 0 }
    s.serveIn = 0
    const r = step(s, {}, 1 / 120)
    expect(r.events.some(e => e.type === 'score')).toBe(true)
    expect(r.state.pickups.length).toBe(0)
    expect(r.state.effects.X.grow).toBe(0)
    expect(r.state.ballMod.slow).toBe(0)
    expect(r.state.nextPickupIn).toBe(PICKUP_FIRST_AT)
  })
})
