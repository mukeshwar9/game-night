// Pure Pong simulation — no DOM, no network, no React. Deterministic and
// unit-testable. The court is a normalized 1×1 box: x ∈ [0,1] left→right,
// y ∈ [0,1] top→bottom. X's paddle is on the left, O's on the right.
//
// This module is the single source of truth for the game's physics. The
// /demo route runs it directly (loopback), and in multiplayer the HOST runs
// it authoritatively and streams snapshots over the WebRTC data channel —
// the guest never simulates, so cross-client determinism is not required.

export const WIN_SCORE = 5            // points to win one round (a round = one platform "score")

export const PADDLE_H = 0.2           // paddle length as a fraction of court height
export const PADDLE_W = 0.02          // paddle thickness
export const PADDLE_INSET = 0.035     // paddle centre distance from its wall
export const BALL_R = 0.015           // ball radius

export const PADDLE_SPEED = 1.25      // court-heights per second
export const BALL_SPEED = 0.72        // rally base speed (court units/sec)
export const SERVE_SPEED = 0.6        // launch speed after a score — slower so the receiver can react
export const SERVE_DELAY = 0.9        // seconds the ball holds at centre before launching after a point
export const BALL_SPEEDUP = 1.05      // multiplier applied on each paddle hit
export const BALL_MAX_SPEED = 1.7     // velocity ceiling so the ball stays trackable
export const MAX_BOUNCE = 1.05        // steepest return angle in radians (~60°)
export const SPIN_TRANSFER = 0.3      // paddle motion → spin (paddleVel × this)
export const OFFSET_SPIN = 0.2        // edge-hit offset → spin (offset × this)
export const SPIN_DECAY_RATE = 2.0    // per-second exponential spin decay

// Power-ups
export const PICKUP_SIZE = 0.04       // pickup square size (fraction of court)
export const PICKUP_FIRST_AT = 3.0    // seconds into a rally before the first pickup spawns
export const PICKUP_RESPAWN = 4.0     // seconds after collection before the next spawns
export const EFFECT_GROW = 5          // seconds a grow power-up lasts
export const EFFECT_SHRINK = 5        // seconds a shrink power-up lasts
export const EFFECT_SLOW = 4          // seconds a slow ball power-up lasts
export const GROW_MULT = 1.6          // paddle length multiplier when grown
export const SHRINK_MULT = 0.6        // paddle length multiplier when shrunk
export const SLOW_MULT = 0.7          // ball movement multiplier when slow
export const PICKUP_KINDS = ['grow', 'shrink', 'slow']

const HALF = PADDLE_H / 2
export const X_FACE = PADDLE_INSET + PADDLE_W / 2          // right edge of X's paddle
export const O_FACE = 1 - PADDLE_INSET - PADDLE_W / 2      // left edge of O's paddle

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// Effective half-length of a paddle, accounting for grow/shrink effects.
function effHalf(effects, side) {
  let h = HALF
  const e = effects?.[side]
  if (e?.grow > 0) h *= GROW_MULT
  if (e?.shrink > 0) h *= SHRINK_MULT
  return h
}

// Normalize the effects object (handles missing/legacy state).
function normEffects(e) {
  if (!e) return { X: { grow: 0, shrink: 0 }, O: { grow: 0, shrink: 0 } }
  return {
    X: { grow: e.X?.grow ?? 0, shrink: e.X?.shrink ?? 0 },
    O: { grow: e.O?.grow ?? 0, shrink: e.O?.shrink ?? 0 },
  }
}

// Deterministic pickup position from a sequence counter — keeps step() pure.
// Positions are in the central band, away from the paddle faces.
function pickupPos(seq) {
  const hx = Math.sin(seq * 12.9898) * 43758.5453
  const hy = Math.sin(seq * 78.233 + 1.3) * 43758.5453
  return {
    x: 0.25 + (hx - Math.floor(hx)) * 0.5,   // 0.25..0.75
    y: 0.15 + (hy - Math.floor(hy)) * 0.7,    // 0.15..0.85
  }
}

function pickupKind(seq) {
  return PICKUP_KINDS[seq % PICKUP_KINDS.length]
}

// Deterministic serve angles cycled by serve count so successive serves vary
// without needing an RNG (keeps step() pure).
const SERVE_ANGLES = [0.18, -0.28, 0.32, -0.16, 0.24, -0.34, 0.12, -0.22]

function serveVelocity(toward, n = 0) {
  const dir = toward === 'X' ? -1 : 1               // toward X = leftward
  const a = SERVE_ANGLES[((n % SERVE_ANGLES.length) + SERVE_ANGLES.length) % SERVE_ANGLES.length]
  return { vx: Math.cos(a) * SERVE_SPEED * dir, vy: Math.sin(a) * SERVE_SPEED }
}

// Launch the ball from centre toward `serveTo` at SERVE_SPEED. Clears the
// serve-hold state so step()'s normal integration takes over next tick.
// The server (opposite of serveTo) is credited as lastHitter so power-up
// attribution works immediately after the serve.
function launch(s) {
  const v = serveVelocity(s.serveTo, s.serveCount)
  s.ball = { x: 0.5, y: 0.5, vx: v.vx, vy: v.vy, spin: 0 }
  s.lastHitter = s.serveTo === 'X' ? 'O' : 'X'
  s.serveTo = null
  s.serveIn = 0
}

// Reflect the ball off a paddle. The vertical hit offset (relative to the
// paddle's *effective* half-length) sets the return angle; each hit nudges
// the speed up to a cap. Paddle motion + edge offset impart spin.
function reflect(paddleY, ballY, dirX, vx, vy, paddleVel, eh) {
  const offset = clamp((ballY - paddleY) / eh, -1, 1)
  const angle = offset * MAX_BOUNCE
  const speed = Math.min(Math.hypot(vx, vy) * BALL_SPEEDUP, BALL_MAX_SPEED)
  const spin = paddleVel * SPIN_TRANSFER + offset * OFFSET_SPIN
  return { vx: Math.cos(angle) * speed * dirX, vy: Math.sin(angle) * speed, spin }
}

/**
 * Build a fresh simulation state.
 * @param {{ serveTo?: 'X'|'O', serveIn?: number, score?: {X:number,O:number}, serveCount?: number }} [opts]
 */
export function createState(opts = {}) {
  const { serveTo = 'O', serveIn = 0, score = { X: 0, O: 0 }, serveCount = 0 } = opts
  const s = {
    ball: { x: 0.5, y: 0.5, vx: 0, vy: 0, spin: 0 },
    paddles: { X: 0.5, O: 0.5 },
    score: { X: score.X | 0, O: score.O | 0 },
    serveCount,
    serveTo,
    serveIn,
    lastHitter: null,
    pickups: [],
    nextPickupIn: PICKUP_FIRST_AT,
    pickupSeq: 0,
    effects: { X: { grow: 0, shrink: 0 }, O: { grow: 0, shrink: 0 } },
    ballMod: { slow: 0 },
  }
  if (serveIn <= 0) launch(s)          // immediate first serve (PongGame gates the opener via COUNTDOWN_MS)
  return s
}

/**
 * Advance the simulation by one fixed timestep. Pure: never mutates `state`.
 * @param {object} state  previous state
 * @param {{X?: -1|0|1, O?: -1|0|1}} inputs  paddle movement intent per side
 * @param {number} dt  seconds (use a fixed value, e.g. 1/120)
 * @returns {{ state: object, events: Array<{type:string, side?:string, by?:string}> }}
 */
export function step(state, inputs, dt) {
  const s = {
    ball: { ...state.ball },
    paddles: { ...state.paddles },
    score: { ...state.score },
    serveCount: state.serveCount,
    serveTo: state.serveTo ?? null,
    serveIn: state.serveIn ?? 0,
    lastHitter: state.lastHitter ?? null,
    pickups: state.pickups ? state.pickups.map(p => ({ ...p })) : [],
    nextPickupIn: state.nextPickupIn ?? PICKUP_FIRST_AT,
    pickupSeq: state.pickupSeq ?? 0,
    effects: normEffects(state.effects),
    ballMod: { slow: state.ballMod?.slow ?? 0 },
  }
  const events = []

  // Tick down effect timers.
  for (const side of ['X', 'O']) {
    if (s.effects[side].grow > 0) s.effects[side].grow = Math.max(0, s.effects[side].grow - dt)
    if (s.effects[side].shrink > 0) s.effects[side].shrink = Math.max(0, s.effects[side].shrink - dt)
  }
  if (s.ballMod.slow > 0) s.ballMod.slow = Math.max(0, s.ballMod.slow - dt)

  // Move paddles, clamped inside the court using their effective half-length
  // (a grown paddle can't press against the wall as far; a shrunk one can).
  for (const side of ['X', 'O']) {
    const dir = inputs?.[side] || 0
    const eh = effHalf(s.effects, side)
    s.paddles[side] = clamp(s.paddles[side] + dir * PADDLE_SPEED * dt, eh, 1 - eh)
  }

  // Serve hold: ball pinned at centre with zero velocity while the delay counts down.
  if (s.serveIn > 0) {
    s.serveIn -= dt
    if (s.serveIn <= 0) launch(s)
    else s.ball = { x: 0.5, y: 0.5, vx: 0, vy: 0, spin: s.ball.spin ?? 0 }
    return { state: s, events }
  }

  // Spawn pickups (only after the ball has been hit and no pickup is active).
  if (s.lastHitter && s.pickups.length === 0) {
    s.nextPickupIn -= dt
    if (s.nextPickupIn <= 0) {
      const pos = pickupPos(s.pickupSeq)
      s.pickups.push({ id: s.pickupSeq, x: pos.x, y: pos.y, kind: pickupKind(s.pickupSeq) })
    }
  }

  let { x, y, vx, vy } = s.ball
  let spin = s.ball.spin ?? 0

  // Ball movement — slow power-up reduces effective movement speed.
  const moveMult = s.ballMod.slow > 0 ? SLOW_MULT : 1
  x += vx * moveMult * dt
  y += vy * moveMult * dt

  // Spin curves the trajectory in flight.
  if (spin !== 0) {
    vy += spin * dt
    spin *= Math.exp(-SPIN_DECAY_RATE * dt)
  }

  // Top / bottom walls.
  if (y < BALL_R) { y = BALL_R; vy = -vy; events.push({ type: 'wall' }) }
  else if (y > 1 - BALL_R) { y = 1 - BALL_R; vy = -vy; events.push({ type: 'wall' }) }

  // Left paddle (X) — uses effective half-length for collision + reflect.
  if (vx < 0 && x - BALL_R <= X_FACE && x > 0) {
    const eh = effHalf(s.effects, 'X')
    if (Math.abs(y - s.paddles.X) <= eh + BALL_R) {
      const paddleVel = (inputs?.X || 0) * PADDLE_SPEED
      ;({ vx, vy, spin } = reflect(s.paddles.X, y, 1, vx, vy, paddleVel, eh))
      x = X_FACE + BALL_R
      s.lastHitter = 'X'
      events.push({ type: 'paddle', side: 'X' })
    }
  }
  // Right paddle (O).
  if (vx > 0 && x + BALL_R >= O_FACE && x < 1) {
    const eh = effHalf(s.effects, 'O')
    if (Math.abs(y - s.paddles.O) <= eh + BALL_R) {
      const paddleVel = (inputs?.O || 0) * PADDLE_SPEED
      ;({ vx, vy, spin } = reflect(s.paddles.O, y, -1, vx, vy, paddleVel, eh))
      x = O_FACE - BALL_R
      s.lastHitter = 'O'
      events.push({ type: 'paddle', side: 'O' })
    }
  }

  // Pickup collision: circle (ball) vs square (pickup).
  if (s.pickups.length > 0) {
    const pk = s.pickups[0]
    if (Math.abs(x - pk.x) <= BALL_R + PICKUP_SIZE / 2 && Math.abs(y - pk.y) <= BALL_R + PICKUP_SIZE / 2) {
      const hitter = s.lastHitter
      const opponent = hitter === 'X' ? 'O' : 'X'
      if (pk.kind === 'grow') s.effects[hitter].grow = EFFECT_GROW
      else if (pk.kind === 'shrink') s.effects[opponent].shrink = EFFECT_SHRINK
      else if (pk.kind === 'slow') s.ballMod.slow = EFFECT_SLOW
      s.pickups = []
      s.nextPickupIn = PICKUP_RESPAWN
      s.pickupSeq += 1
      events.push({ type: 'pickup', kind: pk.kind, by: hitter })
    }
  }

  // Scoring: ball fully past a wall. Hold the ball at centre for SERVE_DELAY
  // before serving toward the player who was scored on. Clear all power-ups.
  if (x < 0) {
    s.score = { ...s.score, O: s.score.O + 1 }
    s.serveCount += 1
    events.push({ type: 'score', by: 'O' })
    s.serveTo = 'X'
    s.serveIn = SERVE_DELAY
    s.pickups = []; s.effects = normEffects(null); s.ballMod = { slow: 0 }
    s.nextPickupIn = PICKUP_FIRST_AT
    x = 0.5; y = 0.5; vx = 0; vy = 0; spin = 0
  } else if (x > 1) {
    s.score = { ...s.score, X: s.score.X + 1 }
    s.serveCount += 1
    events.push({ type: 'score', by: 'X' })
    s.serveTo = 'O'
    s.serveIn = SERVE_DELAY
    s.pickups = []; s.effects = normEffects(null); s.ballMod = { slow: 0 }
    s.nextPickupIn = PICKUP_FIRST_AT
    x = 0.5; y = 0.5; vx = 0; vy = 0; spin = 0
  }

  s.ball = { x, y, vx, vy, spin }
  return { state: s, events }
}

/**
 * Heuristic AI paddle input (-1 up / 0 hold / +1 down). Beatable by design:
 * it only chases the ball while the ball approaches its side, otherwise it
 * drifts back to centre, and a deadzone keeps it from jittering — a steep,
 * fast return can still pass it.
 */
export function computeAI(state, side, opts = {}) {
  const { deadzone = 0.05 } = opts
  const ball = state.ball
  const approaching = side === 'X' ? ball.vx < 0 : ball.vx > 0
  const target = approaching ? ball.y : 0.5
  const diff = target - state.paddles[side]
  if (Math.abs(diff) < deadzone) return 0
  return diff > 0 ? 1 : -1
}

/** Round winner once a side reaches WIN_SCORE, else null. */
export function getWinner(score, target = WIN_SCORE) {
  if ((score?.X ?? 0) >= target) return 'X'
  if ((score?.O ?? 0) >= target) return 'O'
  return null
}
