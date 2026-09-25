import { describe, it, expect } from 'vitest'
import {
  createState, step, computeAI, getWinner, getRoundWinner, isSuddenDeath, nextServeTo,
  predictImpactY, obstaclesAt, pickupKind, paddleHalf, fitCourt,
  encodeSnapshot, decodeSnapshot, extrapolateBalls,
  MODES, MULTIPLAYER_MODES, getMode,
  WIN_SCORE, BALL_R, PADDLE_H, PADDLE_SPEED, BALL_MAX_SPEED, X_FACE, O_FACE,
  SERVE_DELAY, SERVE_SPEED, SPIN_TRANSFER, OFFSET_SPIN, SPIN_DECAY_RATE,
  PICKUP_FIRST_AT, PICKUP_KINDS, MAX_BALLS, RALLY_MILESTONE,
  EFFECT_GROW, EFFECT_SLOW, SLOW_MULT, FAST_MULT, GROW_MULT,
  COURT_MIN_RATIO, COURT_MAX_RATIO,
} from './pongLogic'

const speed = ({ vx, vy }) => Math.hypot(vx, vy)

// A minimal mid-rally state with one ball in play.
const withBall = (ball, extra = {}) => ({
  balls: [{ id: 1, spin: 0, ...ball }],
  paddles: { X: 0.5, O: 0.5 },
  score: { X: 0, O: 0 },
  serveCount: 0,
  ...extra,
})
const ball0 = (s) => s.balls[0]

// Step until an event of `type` fires (or `max` ticks pass).
function runUntil(s, type, inputs = {}, dt = 0.02, max = 200) {
  let hit = null
  for (let i = 0; i < max && !hit; i++) {
    const r = step(s, typeof inputs === 'function' ? inputs(s) : inputs, dt)
    s = r.state
    hit = r.events.find(e => e.type === type) || null
  }
  return { state: s, event: hit }
}

describe('createState', () => {
  it('centres one ball and the paddles with a zeroed score', () => {
    const s = createState()
    expect(s.balls).toHaveLength(1)
    expect(ball0(s).x).toBeCloseTo(0.5)
    expect(ball0(s).y).toBeCloseTo(0.5)
    expect(s.paddles).toEqual({ X: 0.5, O: 0.5 })
    expect(s.score).toEqual({ X: 0, O: 0 })
    expect(s.mode).toBe('classic')
  })

  it('serves toward the requested side (vx sign)', () => {
    expect(ball0(createState({ serveTo: 'X' })).vx).toBeLessThan(0)
    expect(ball0(createState({ serveTo: 'O' })).vx).toBeGreaterThan(0)
  })

  it('launches at SERVE_SPEED (slower than the rally base)', () => {
    expect(speed(ball0(createState({ serveTo: 'O' })))).toBeCloseTo(SERVE_SPEED)
  })

  it('carries an initial score through', () => {
    expect(createState({ score: { X: 2, O: 1 } }).score).toEqual({ X: 2, O: 1 })
  })

  it('holds the ball back when a serve delay is requested', () => {
    const s = createState({ serveIn: 1 })
    expect(s.balls).toEqual([])
    expect(s.serveIn).toBe(1)
  })

  it('falls back to classic for an unknown mode', () => {
    expect(createState({ mode: 'nope' }).mode).toBe('classic')
  })
})

describe('step — free flight', () => {
  it('advances the ball by velocity × dt when nothing is hit', () => {
    const { state, events } = step(withBall({ x: 0.5, y: 0.5, vx: 0.4, vy: 0.2 }), {}, 0.1)
    expect(ball0(state).x).toBeCloseTo(0.54)
    expect(ball0(state).y).toBeCloseTo(0.52)
    expect(events).toEqual([])
  })

  it('is pure — does not mutate the input state', () => {
    const s = createState()
    const snapshot = JSON.parse(JSON.stringify(s))
    step(s, { X: 1, O: -1 }, 0.1)
    expect(s).toEqual(snapshot)
  })

  it('moves paddles and clamps them inside the court', () => {
    const down = step(createState(), { X: 1 }, 0.1).state
    expect(down.paddles.X).toBeGreaterThan(0.5)
    let st = createState()
    for (let i = 0; i < 200; i++) st = step(st, { X: -1 }, 0.05).state
    expect(st.paddles.X).toBeGreaterThanOrEqual(PADDLE_H / 2 - 1e-9)
  })

  it('treats inputs as analog and clamps them to [-1, 1]', () => {
    const half = step(createState(), { X: 0.5 }, 0.1).state.paddles.X
    expect(half).toBeCloseTo(0.5 + 0.5 * PADDLE_SPEED * 0.1)
    const over = step(createState(), { X: 9 }, 0.1).state.paddles.X
    expect(over).toBeCloseTo(0.5 + PADDLE_SPEED * 0.1)
    const junk = step(createState(), { X: 'x' }, 0.1).state.paddles.X
    expect(junk).toBe(0.5)
  })
})

describe('step — walls', () => {
  it('bounces off the near side wall and flips vy', () => {
    const { state, events } = step(withBall({ x: 0.5, y: BALL_R + 0.001, vx: 0.1, vy: -0.5 }), {}, 0.1)
    expect(ball0(state).vy).toBeGreaterThan(0)
    expect(ball0(state).y).toBeGreaterThanOrEqual(BALL_R)
    expect(events.some(e => e.type === 'wall')).toBe(true)
  })

  it('bounces off the far side wall', () => {
    const { state } = step(withBall({ x: 0.5, y: 1 - BALL_R - 0.001, vx: 0.1, vy: 0.5 }), {}, 0.1)
    expect(ball0(state).vy).toBeLessThan(0)
    expect(ball0(state).y).toBeLessThanOrEqual(1 - BALL_R)
  })
})

describe('step — paddle returns', () => {
  it('returns a ball that reaches the X paddle aligned with it', () => {
    const { state, events } = step(withBall({ x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0 }), {}, 0.05)
    expect(ball0(state).vx).toBeGreaterThan(0)
    expect(events.some(e => e.type === 'paddle' && e.side === 'X')).toBe(true)
  })

  it('returns a ball off the O paddle', () => {
    const { state } = step(withBall({ x: O_FACE - 0.005, y: 0.5, vx: 0.6, vy: 0 }), {}, 0.05)
    expect(ball0(state).vx).toBeLessThan(0)
  })

  it('speeds the ball up on a hit but never past the cap', () => {
    const before = { x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0 }
    const after = ball0(step(withBall(before), {}, 0.05).state)
    expect(speed(after)).toBeGreaterThan(speed(before))
    const out = ball0(step(withBall({ x: X_FACE + 0.005, y: 0.5, vx: -3, vy: 0 }), {}, 1 / 240).state)
    expect(speed(out)).toBeLessThanOrEqual(BALL_MAX_SPEED + 1e-9)
  })

  it('angles the return by where the ball hits the paddle', () => {
    const { state } = step(withBall({ x: X_FACE + 0.005, y: 0.5 - PADDLE_H / 3, vx: -0.6, vy: 0 }), {}, 0.05)
    expect(ball0(state).vy).toBeLessThan(0)
  })

  it('counts the rally and fires a milestone event every RALLY_MILESTONE hits', () => {
    const r = step(withBall({ x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0 }, { rally: RALLY_MILESTONE - 1 }), {}, 0.05)
    expect(r.state.rally).toBe(RALLY_MILESTONE)
    expect(r.events).toContainEqual({ type: 'rally', n: RALLY_MILESTONE })
    const paddle = r.events.find(e => e.type === 'paddle')
    expect(paddle.rally).toBe(RALLY_MILESTONE)
  })

  it('resets the rally on a point', () => {
    const { state } = runUntil(withBall({ x: 0.1, y: 0.95, vx: -0.8, vy: 0 }, { rally: 7, paddles: { X: 0.1, O: 0.5 } }), 'score')
    expect(state.rally).toBe(0)
  })
})

describe('step — spin', () => {
  it('imparts spin from paddle motion on a hit', () => {
    const r0 = step(withBall({ x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0 }), { X: 0 }, 1 / 120)
    expect(ball0(r0.state).spin).toBeCloseTo(0, 1)

    const r1 = step(withBall({ x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0 }), { X: 1 }, 1 / 120)
    expect(ball0(r1.state).spin).toBeGreaterThan(0.2)
    const paddleYAfter = 0.5 + PADDLE_SPEED / 120
    const offset = (0.5 - paddleYAfter) / (PADDLE_H / 2)
    const expectedSpin = PADDLE_SPEED * SPIN_TRANSFER + offset * OFFSET_SPIN
    expect(ball0(r1.state).spin).toBeCloseTo(expectedSpin, 4)
  })

  it('imparts spin from edge-hit offset', () => {
    const r = step(withBall({ x: X_FACE + 0.005, y: 0.5 - PADDLE_H / 3, vx: -0.6, vy: 0 }), { X: 0 }, 0.05)
    expect(ball0(r.state).spin).toBeLessThan(0)
  })

  it('curves the trajectory while spin is non-zero', () => {
    let s = withBall({ x: 0.5, y: 0.5, vx: 0.6, vy: 0, spin: 1.0 })
    for (let i = 0; i < 60; i++) s = step(s, {}, 1 / 120).state
    expect(ball0(s).vy).toBeGreaterThan(0)
  })

  it('decays spin exponentially over time', () => {
    let s = withBall({ x: 0.5, y: 0.5, vx: 0, vy: 0, spin: 1.0 })
    for (let i = 0; i < 120; i++) s = step(s, {}, 1 / 120).state
    expect(ball0(s).spin).toBeCloseTo(Math.exp(-SPIN_DECAY_RATE), 1)
  })

  it('zero-spin trajectory is a straight line (regression)', () => {
    const { state } = step(withBall({ x: 0.5, y: 0.5, vx: 0.4, vy: 0.2 }), {}, 0.1)
    expect(ball0(state).x).toBeCloseTo(0.54)
    expect(ball0(state).y).toBeCloseTo(0.52)
    expect(ball0(state).spin).toBe(0)
  })

  it('serves a spin-free ball after a score', () => {
    let { state } = runUntil(withBall({ x: X_FACE + 0.005, y: 0.9, vx: -0.8, vy: 0, spin: 0.5 }, { paddles: { X: 0.1, O: 0.5 } }), 'score')
    for (let i = 0; i < 60; i++) state = step(state, {}, 0.02).state
    expect(ball0(state).spin).toBe(0)
  })
})

describe('step — scoring', () => {
  it('awards O a point and holds the serve for the delay', () => {
    const { state, event } = runUntil(withBall({ x: X_FACE + 0.005, y: 0.9, vx: -0.8, vy: 0 }, { paddles: { X: 0.1, O: 0.5 } }), 'score')
    expect(event).toMatchObject({ type: 'score', by: 'O' })
    expect(state.score).toEqual({ X: 0, O: 1 })
    expect(state.balls).toEqual([])                          // nothing in play during the hold
    expect(state.serveTo).toBe('X')                          // will serve toward the loser
    expect(state.serveIn).toBeGreaterThan(0)
  })

  it('launches toward the loser after the serve delay elapses', () => {
    let s = { balls: [], paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 1 }, serveCount: 1, serveTo: 'X', serveIn: SERVE_DELAY }
    const ticks = Math.ceil(SERVE_DELAY / 0.02) + 1
    for (let i = 0; i < ticks; i++) s = step(s, {}, 0.02).state
    expect(s.serveIn).toBe(0)
    expect(s.serveTo).toBe(null)
    expect(ball0(s).vx).toBeLessThan(0)
    expect(speed(ball0(s))).toBeCloseTo(SERVE_SPEED)
  })

  it('awards X a point when O misses', () => {
    const { state, event } = runUntil(withBall({ x: O_FACE - 0.005, y: 0.1, vx: 0.8, vy: 0 }, { paddles: { X: 0.5, O: 0.9 } }), 'score')
    expect(event).toMatchObject({ type: 'score', by: 'X' })
    expect(state.score).toEqual({ X: 1, O: 0 })
    expect(state.serveTo).toBe('O')
  })

  it('paddles still move during the serve hold', () => {
    const s = { balls: [], paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 1 }, serveCount: 1, serveTo: 'X', serveIn: SERVE_DELAY }
    expect(step(s, { X: 1 }, 0.1).state.paddles.X).toBeGreaterThan(0.5)
  })
})

describe('computeAI', () => {
  const at = (ball, paddles = { X: 0.5, O: 0.5 }) => withBall(ball, { paddles })

  it('chases the ball when it is approaching', () => {
    expect(computeAI(at({ x: 0.6, y: 0.8, vx: -0.5, vy: 0 }), 'X')).toBe(1)
    expect(computeAI(at({ x: 0.6, y: 0.2, vx: -0.5, vy: 0 }), 'X')).toBe(-1)
  })

  it('holds still within the deadzone', () => {
    expect(computeAI(at({ x: 0.6, y: 0.51, vx: -0.5, vy: 0 }), 'X')).toBe(0)
  })

  it('recentres when the ball is moving away', () => {
    expect(computeAI(at({ x: 0.6, y: 0.9, vx: 0.5, vy: 0 }, { X: 0.2, O: 0.5 }), 'X')).toBe(1)
  })

  it('tracks the soonest-arriving of several balls', () => {
    const s = {
      balls: [
        { id: 1, x: 0.8, y: 0.1, vx: -0.5, vy: 0, spin: 0 },   // far away
        { id: 2, x: 0.2, y: 0.9, vx: -0.5, vy: 0, spin: 0 },   // arrives first
      ],
      paddles: { X: 0.5, O: 0.5 }, score: { X: 0, O: 0 },
    }
    expect(computeAI(s, 'X')).toBe(1)
  })

  it('aims at the predicted impact point when predicting', () => {
    // Heading down-left steeply: currently above the paddle, will land below it.
    const s = at({ x: 0.5, y: 0.4, vx: -0.5, vy: 0.5 })
    expect(computeAI(s, 'X')).toBe(-1)
    expect(computeAI(s, 'X', { predict: true })).toBe(1)
  })
})

describe('predictImpactY', () => {
  it('projects a straight line', () => {
    expect(predictImpactY({ x: 0.5, y: 0.5, vx: -0.5, vy: 0.1 }, 0)).toBeCloseTo(0.6)
  })
  it('folds wall bounces back into the court', () => {
    const y = predictImpactY({ x: 0.5, y: 0.5, vx: -0.5, vy: 1.2 }, 0)   // would reach 1.7
    expect(y).toBeGreaterThanOrEqual(BALL_R)
    expect(y).toBeLessThanOrEqual(1 - BALL_R)
    expect(y).toBeCloseTo(BALL_R + ((1 - 2 * BALL_R) - (1.7 - BALL_R - (1 - 2 * BALL_R))), 5)
  })
  it('returns null for a ball moving away', () => {
    expect(predictImpactY({ x: 0.5, y: 0.5, vx: 0.5, vy: 0 }, 0)).toBe(null)
  })
})

describe('nextServeTo', () => {
  it('alternates deterministically from a known prior server', () => {
    expect(nextServeTo('X')).toBe('O')
    expect(nextServeTo('O')).toBe('X')
  })
  it('picks a side (not undefined) when there is no prior server', () => {
    expect(['X', 'O']).toContain(nextServeTo(null))
    expect(['X', 'O']).toContain(nextServeTo(undefined))
  })
})

describe('getWinner / getRoundWinner', () => {
  it('returns null below the threshold and declares the side that reaches it', () => {
    expect(getWinner({ X: WIN_SCORE - 1, O: 0 })).toBe(null)
    expect(getWinner({ X: WIN_SCORE, O: 2 })).toBe('X')
    expect(getWinner({ X: 1, O: WIN_SCORE })).toBe('O')
  })

  it('uses the mode target for first-to-N modes', () => {
    for (const id of ['classic', 'chaos', 'pure']) {
      const target = MODES[id].winScore
      expect(getRoundWinner({ mode: id, score: { X: target - 1, O: 0 } })).toBe(null)
      expect(getRoundWinner({ mode: id, score: { X: 0, O: target } })).toBe('O')
    }
  })

  it('BLITZ: no winner while the clock runs, the leader when it stops, sudden death on a tie', () => {
    expect(getRoundWinner({ mode: 'blitz', clock: 5, score: { X: 9, O: 0 } })).toBe(null)
    expect(getRoundWinner({ mode: 'blitz', clock: 0, score: { X: 3, O: 2 } })).toBe('X')
    const tied = { mode: 'blitz', clock: 0, score: { X: 2, O: 2 } }
    expect(getRoundWinner(tied)).toBe(null)
    expect(isSuddenDeath(tied)).toBe(true)
    expect(isSuddenDeath({ mode: 'classic', clock: 0, score: { X: 2, O: 2 } })).toBe(false)
  })

  it('SURVIVAL ends only when the last life is gone', () => {
    expect(getRoundWinner({ mode: 'survival', lives: 1, score: { X: 30, O: 0 } })).toBe(null)
    expect(getRoundWinner({ mode: 'survival', lives: 0, score: { X: 30, O: 0 } })).toBe('O')
  })
})

describe('modes', () => {
  it('offers only non-solo modes to two-player rooms', () => {
    for (const id of MULTIPLAYER_MODES) expect(getMode(id).solo).toBeFalsy()
    expect(MULTIPLAYER_MODES).not.toContain('survival')
  })

  it('PURE never spawns a pickup', () => {
    let s = createState({ mode: 'pure', serveTo: 'O' })
    for (let i = 0; i < 120 * 20; i++) {
      s = step(s, { X: computeAI(s, 'X'), O: computeAI(s, 'O') }, 1 / 120).state
      expect(s.pickups).toEqual([])
    }
  })

  it('BLITZ counts the clock down (through serve holds) and fires timeup once', () => {
    let s = createState({ mode: 'blitz', serveIn: 1 })
    expect(s.clock).toBe(MODES.blitz.timeLimit)
    s = step(s, {}, 0.5).state
    expect(s.clock).toBeCloseTo(MODES.blitz.timeLimit - 0.5)
    s = { ...s, clock: 0.01 }
    const r = step(s, {}, 0.02)
    expect(r.state.clock).toBe(0)
    expect(r.events).toContainEqual({ type: 'timeup' })
    expect(step(r.state, {}, 0.02).events.some(e => e.type === 'timeup')).toBe(false)
  })

  it('CHAOS has moving bumpers that deflect the ball', () => {
    expect(obstaclesAt(0, 'classic')).toEqual([])
    const [a] = obstaclesAt(0, 'chaos')
    const [a2] = obstaclesAt(1, 'chaos')
    expect(a2.y).not.toBeCloseTo(a.y)
    // Ball flying straight into the first bumper's left face.
    const s = withBall({ x: a.x - a.w / 2 - BALL_R + 0.002, y: a.y, vx: 0.5, vy: 0 }, { mode: 'chaos', time: 0 })
    const r = step(s, {}, 1 / 240)
    expect(r.events.some(e => e.type === 'bump')).toBe(true)
    expect(ball0(r.state).vx).toBeLessThan(0)
  })

  it('SURVIVAL: the back wall returns the ball, each return scores, and misses cost lives', () => {
    let s = createState({ mode: 'survival', serveTo: 'O' })
    expect(s.lives).toBe(3)
    expect(ball0(s).vx).toBeLessThan(0)                      // always served at the player
    // The back wall bounces instead of scoring.
    const wall = step(withBall({ x: 1 - BALL_R - 0.001, y: 0.5, vx: 0.6, vy: 0 }, { mode: 'survival', lives: 3 }), {}, 0.02)
    expect(ball0(wall.state).vx).toBeLessThan(0)
    expect(wall.state.score).toEqual({ X: 0, O: 0 })
    // A return scores for the player.
    const hit = step(withBall({ x: X_FACE + 0.005, y: 0.5, vx: -0.6, vy: 0 }, { mode: 'survival', lives: 3 }), {}, 0.02)
    expect(hit.state.score.X).toBe(1)
    // A miss costs a life; the last one ends the run.
    const miss = runUntil(withBall({ x: 0.05, y: 0.95, vx: -0.8, vy: 0 }, { mode: 'survival', lives: 1, paddles: { X: 0.1, O: 0.5 } }), 'gameover')
    expect(miss.state.lives).toBe(0)
    expect(miss.state.score.O).toBe(0)                       // the wall never scores
    expect(getRoundWinner(miss.state)).toBe('O')
  })

  it('SURVIVAL rides out a long rally with a tracking paddle', () => {
    let s = createState({ mode: 'survival' })
    let hits = 0
    for (let i = 0; i < 120 * 15; i++) {
      const r = step(s, { X: computeAI(s, 'X', { predict: true, deadzone: 0.02 }) }, 1 / 120)
      s = r.state
      hits += r.events.filter(e => e.type === 'paddle').length
    }
    expect(hits).toBeGreaterThan(5)
  })
})

describe('full rally', () => {
  it('two AI paddles sustain a rally (the ball gets returned, not lost)', () => {
    let s = createState({ mode: 'pure', serveTo: 'O' })
    let hits = 0
    for (let i = 0; i < 2400; i++) {
      const r = step(s, { X: computeAI(s, 'X'), O: computeAI(s, 'O') }, 1 / 120)
      s = r.state
      hits += r.events.filter(e => e.type === 'paddle').length
    }
    expect(hits).toBeGreaterThan(2)
    for (const b of s.balls) { expect(b.x).toBeGreaterThan(0); expect(b.x).toBeLessThan(1) }
  })

  it('a parked paddle eventually concedes a point', () => {
    let s = createState({ serveTo: 'O' })
    s.paddles.O = 0.95
    const { state, event } = runUntil(s, 'score', (st) => ({ X: computeAI(st, 'X'), O: 0 }), 1 / 120, 3000)
    expect(event).toBeTruthy()
    expect(state.score.X).toBeGreaterThan(0)
  })
})

describe('step — power-ups', () => {
  const onBall = (kind, extra = {}) => {
    const s = createState({ serveTo: 'O' })
    const b = ball0(s)
    return { ...s, pickups: [{ id: 0, x: b.x, y: b.y, kind }], lastHitter: 'X', pickupSeq: 1, ...extra }
  }

  it('spawns a pickup after PICKUP_FIRST_AT seconds of rally', () => {
    let s = createState({ serveTo: 'O' })
    for (let i = 0; i < Math.ceil(PICKUP_FIRST_AT * 120) + 10; i++) {
      s = step(s, { X: computeAI(s, 'X'), O: computeAI(s, 'O') }, 1 / 120).state
      if (s.pickups.length > 0) break
    }
    expect(s.pickups.length).toBe(1)
    expect(PICKUP_KINDS).toContain(s.pickups[0].kind)
  })

  it('does not spawn a pickup while one is already active', () => {
    let s = createState({ serveTo: 'O' })
    for (let i = 0; i < Math.ceil(PICKUP_FIRST_AT * 120) + 10; i++) {
      s = step(s, { X: computeAI(s, 'X'), O: computeAI(s, 'O') }, 1 / 120).state
      if (s.pickups.length > 0) break
    }
    const seqBefore = s.pickupSeq
    // Park the pickup out of the ball's way, then keep stepping.
    s = { ...s, pickups: [{ ...s.pickups[0], x: 0.5, y: 2 }] }
    for (let i = 0; i < 300; i++) s = step(s, { X: computeAI(s, 'X'), O: computeAI(s, 'O') }, 1 / 120).state
    expect(s.pickups.length).toBeLessThanOrEqual(1)
    expect(s.pickupSeq).toBe(seqBefore)
  })

  it('pickupKind covers every kind and respects a restricted list', () => {
    const seen = new Set()
    for (let i = 0; i < 200; i++) seen.add(pickupKind(i))
    expect([...seen].sort()).toEqual([...PICKUP_KINDS].sort())
    for (let i = 0; i < 50; i++) expect(['grow', 'slow']).toContain(pickupKind(i, ['grow', 'slow']))
  })

  it('grow pickup grows the last hitter and expires', () => {
    const r = step(onBall('grow'), {}, 1 / 120)
    expect(r.events.some(e => e.type === 'pickup' && e.kind === 'grow' && e.by === 'X')).toBe(true)
    expect(r.state.effects.X.grow).toBeGreaterThan(0)
    expect(paddleHalf(r.state.effects, 'X')).toBeCloseTo(PADDLE_H / 2 * GROW_MULT)
    expect(r.state.pickups.length).toBe(0)
    let s2 = r.state
    for (let i = 0; i < Math.ceil(EFFECT_GROW * 120) + 5; i++) s2 = step(s2, {}, 1 / 120).state
    expect(s2.effects.X.grow).toBe(0)
  })

  it('shrink pickup shrinks the opponent', () => {
    const r = step(onBall('shrink'), {}, 1 / 120)
    expect(r.state.effects.O.shrink).toBeGreaterThan(0)
    expect(r.state.effects.X.shrink).toBe(0)
  })

  it('slow and turbo pickups scale ball movement', () => {
    expect(step(onBall('slow'), {}, 1 / 120).state.ballMod.slow).toBeGreaterThan(0)
    expect(step(onBall('fast'), {}, 1 / 120).state.ballMod.fast).toBeGreaterThan(0)
    const move = (ballMod) => ball0(step(withBall({ x: 0.5, y: 0.5, vx: 0.6, vy: 0 }, { ballMod }), {}, 0.1).state).x - 0.5
    expect(move({ slow: EFFECT_SLOW })).toBeCloseTo(move({}) * SLOW_MULT)
    expect(move({ fast: 1 })).toBeCloseTo(move({}) * FAST_MULT)
  })

  it('multi-ball splits the ball up to MAX_BALLS', () => {
    const r = step(onBall('multi'), {}, 1 / 120)
    expect(r.state.balls).toHaveLength(MAX_BALLS)
    const ids = new Set(r.state.balls.map(b => b.id))
    expect(ids.size).toBe(MAX_BALLS)
    const v0 = speed(r.state.balls[0])
    for (const b of r.state.balls) expect(speed(b)).toBeCloseTo(v0)
  })

  it('with several balls, a goal scores but play continues until the last one is out', () => {
    const s = {
      ...createState({ serveTo: 'O' }),
      balls: [
        { id: 1, x: 0.002, y: 0.95, vx: -0.8, vy: 0, spin: 0 },
        { id: 2, x: 0.5, y: 0.5, vx: 0.4, vy: 0, spin: 0 },
      ],
      paddles: { X: 0.1, O: 0.5 },
      effects: { X: { grow: 2, shrink: 0, shield: 0 }, O: { grow: 0, shrink: 0, shield: 0 } },
    }
    const r = step(s, {}, 0.02)
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'score', by: 'O' }))
    expect(r.state.score.O).toBe(1)
    expect(r.state.balls).toHaveLength(1)
    expect(r.state.serveIn).toBe(0)                          // no serve reset yet
    expect(r.state.effects.X.grow).toBeGreaterThan(0)        // effects survive
  })

  it('a shield blocks one goal and then breaks', () => {
    const s = withBall({ x: 0.002, y: 0.95, vx: -0.8, vy: 0 }, {
      paddles: { X: 0.1, O: 0.5 },
      effects: { X: { grow: 0, shrink: 0, shield: 5 }, O: { grow: 0, shrink: 0, shield: 0 } },
    })
    const r = step(s, {}, 0.02)
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'shield', side: 'X' }))
    expect(r.state.score).toEqual({ X: 0, O: 0 })
    expect(ball0(r.state).vx).toBeGreaterThan(0)
    expect(r.state.effects.X.shield).toBe(0)
    const { event } = runUntil({ ...r.state, balls: [{ id: 1, x: 0.002, y: 0.95, vx: -0.8, vy: 0, spin: 0 }] }, 'score')
    expect(event).toMatchObject({ by: 'O' })
  })

  it('clears all power-ups when the last ball is out', () => {
    const s = {
      ...createState({ serveTo: 'O' }),
      balls: [{ id: 1, x: 1.01, y: 0.5, vx: 0.8, vy: 0, spin: 0 }],
      pickups: [{ id: 0, x: 0.3, y: 0.3, kind: 'grow' }],
      effects: { X: { grow: 3, shrink: 0, shield: 0 }, O: { grow: 0, shrink: 2, shield: 0 } },
      ballMod: { slow: 2, fast: 1 },
    }
    const r = step(s, {}, 1 / 120)
    expect(r.events.some(e => e.type === 'score')).toBe(true)
    expect(r.state.pickups.length).toBe(0)
    expect(r.state.effects.X.grow).toBe(0)
    expect(r.state.effects.O.shrink).toBe(0)
    expect(r.state.ballMod).toEqual({ slow: 0, fast: 0 })
    expect(r.state.nextPickupIn).toBe(PICKUP_FIRST_AT)
  })
})

describe('snapshots', () => {
  it('round-trips everything the guest renders', () => {
    let s = createState({ mode: 'blitz', serveTo: 'O' })
    s = { ...s, pickups: [{ id: 4, x: 0.3, y: 0.6, kind: 'multi' }], rally: 3,
      effects: { X: { grow: 1.5, shrink: 0, shield: 2 }, O: { grow: 0, shrink: 1, shield: 0 } },
      ballMod: { slow: 0, fast: 0.5 } }
    const d = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(s))))
    expect(d.balls).toHaveLength(1)
    expect(d.balls[0].x).toBeCloseTo(ball0(s).x)
    expect(d.balls[0].vx).toBeCloseTo(ball0(s).vx, 3)
    expect(d.paddles).toEqual(s.paddles)
    expect(d.score).toEqual(s.score)
    expect(d.effects).toEqual(s.effects)
    expect(d.ballMod).toEqual(s.ballMod)
    expect(d.pickups).toEqual(s.pickups)
    expect(d.clock).toBeCloseTo(s.clock)
    expect(d.rally).toBe(3)
    expect(d.serving).toBe(false)
  })

  it('decodes an empty message without throwing', () => {
    const d = decodeSnapshot({})
    expect(d.balls).toEqual([])
    expect(d.paddles).toEqual({ X: 0.5, O: 0.5 })
  })

  it('extrapolates balls forward and keeps them inside the side walls', () => {
    const [b] = extrapolateBalls([{ id: 1, x: 0.5, y: 0.9, vx: 0.2, vy: 0.5, spin: 0 }], 0.2, null)
    expect(b.x).toBeCloseTo(0.54)
    expect(b.y).toBeLessThanOrEqual(1 - BALL_R)
    expect(b.y).toBeCloseTo(1 - BALL_R - (0.9 + 0.1 - (1 - BALL_R)), 5)
    const [slow] = extrapolateBalls([{ id: 1, x: 0.5, y: 0.5, vx: 0.2, vy: 0, spin: 0 }], 0.2, { slow: 1 })
    expect(slow.x).toBeCloseTo(0.5 + 0.2 * 0.2 * SLOW_MULT)
  })
})

describe('fitCourt', () => {
  it('goes portrait in a tall box and fills its width', () => {
    const c = fitCourt(358, 640)
    expect(c.orientation).toBe('portrait')
    expect(c.w).toBe(358)
    expect(c.h).toBe(640)
  })

  it('goes landscape in a wide box', () => {
    const c = fitCourt(1000, 600)
    expect(c).toEqual({ orientation: 'landscape', w: 1000, h: 600 })
  })

  it('never exceeds the box and keeps the side ratio in range', () => {
    for (const [w, h] of [[390, 900], [390, 400], [1400, 500], [300, 2000], [800, 800], [2000, 300]]) {
      const c = fitCourt(w, h)
      expect(c.w).toBeLessThanOrEqual(w)
      expect(c.h).toBeLessThanOrEqual(h)
      const ratio = Math.min(c.w, c.h) / Math.max(c.w, c.h)
      expect(ratio).toBeGreaterThanOrEqual(COURT_MIN_RATIO - 0.01)
      expect(ratio).toBeLessThanOrEqual(COURT_MAX_RATIO + 0.01)
    }
  })
})
