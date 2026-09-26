// Pure Pong simulation — no DOM, no network, no React. Deterministic and
// unit-testable. The court is a normalized 1×1 box: x ∈ [0,1] runs from X's
// goal to O's goal (the "long" axis between the paddles), y ∈ [0,1] runs
// across it. X's paddle sits near x=0, O's near x=1. The renderer decides how
// that box lands on screen (landscape or portrait, which side is nearest the
// viewer) — the sim never knows.
//
// This module is the single source of truth for the game's physics. The
// /demo route runs it directly (loopback), and in multiplayer the HOST runs
// it authoritatively and streams snapshots over the WebRTC data channel —
// the guest never simulates, so cross-client determinism is not required.

// ─── Modes ───────────────────────────────────────────────────────────────────
// A mode is plain config read by step()/getRoundWinner(); the state only
// stores the mode id so snapshots stay small.
export const MODES = {
  classic: {
    id: 'classic', label: 'CLASSIC', blurb: 'FIRST TO 7 · POWER-UPS',
    winScore: 7, powerups: true,
  },
  chaos: {
    id: 'chaos', label: 'CHAOS', blurb: 'POWER-UP STORM · MOVING BUMPERS',
    winScore: 7, powerups: true, obstacles: true, pickupFirstAt: 1.5, pickupRespawn: 2,
  },
  pure: {
    id: 'pure', label: 'PURE', blurb: 'OLD SCHOOL · NO POWER-UPS',
    winScore: 7, powerups: false,
  },
  blitz: {
    id: 'blitz', label: 'BLITZ', blurb: '60S CLOCK · MOST POINTS WINS',
    winScore: 0, timeLimit: 60, powerups: true,
  },
  survival: {
    id: 'survival', label: 'SURVIVAL', blurb: 'SOLO · 3 LIVES VS THE WALL',
    solo: true, wall: 'O', lives: 3, powerups: true,
    kinds: ['grow', 'slow', 'multi', 'shield'], speedup: 1.06, maxSpeed: 2.3,
  },
}
export const DEFAULT_MODE = 'classic'
/** Modes offered for two-player rooms (survival is a solo mode). */
export const MULTIPLAYER_MODES = ['classic', 'chaos', 'pure', 'blitz']
export const getMode = (id) => MODES[id] || MODES[DEFAULT_MODE]

export const WIN_SCORE = MODES.classic.winScore   // points to win one CLASSIC round (a round = one platform "score")

// ─── Geometry & physics ─────────────────────────────────────────────────────
export const PADDLE_H = 0.2           // paddle length as a fraction of the cross axis
export const PADDLE_W = 0.02          // paddle thickness
export const PADDLE_INSET = 0.035     // paddle centre distance from its goal line
export const BALL_R = 0.015           // ball radius

export const PADDLE_SPEED = 1.35      // cross-axis units per second at full input
export const BALL_SPEED = 0.72        // rally base speed (court units/sec)
export const SERVE_SPEED = 0.6        // launch speed after a score — slower so the receiver can react
export const SERVE_DELAY = 0.9        // seconds the ball holds at centre before launching after a point
export const BALL_SPEEDUP = 1.05      // multiplier applied on each paddle hit (rally speed-up)
export const BALL_MAX_SPEED = 1.7     // velocity ceiling so the ball stays trackable
export const MAX_BOUNCE = 1.05        // steepest return angle in radians (~60°)
export const SPIN_TRANSFER = 0.3      // paddle motion → spin (paddleVel × this)
export const OFFSET_SPIN = 0.2        // edge-hit offset → spin (offset × this)
export const SPIN_DECAY_RATE = 2.0    // per-second exponential spin decay
export const RALLY_MILESTONE = 5      // a 'rally' event fires every N consecutive paddle hits

// ─── Power-ups ───────────────────────────────────────────────────────────────
export const PICKUP_SIZE = 0.05       // pickup square size (fraction of court)
export const PICKUP_FIRST_AT = 3.0    // seconds into a rally before the first pickup spawns
export const PICKUP_RESPAWN = 4.0     // seconds after collection before the next spawns
export const EFFECT_GROW = 6          // seconds a grow power-up lasts
export const EFFECT_SHRINK = 5        // seconds a shrink power-up lasts
export const EFFECT_SLOW = 4          // seconds a slow ball power-up lasts
export const EFFECT_FAST = 4          // seconds a turbo ball power-up lasts
export const EFFECT_SHIELD = 8        // seconds a goal-line shield lasts (or until it blocks once)
export const GROW_MULT = 1.6          // paddle length multiplier when grown
export const SHRINK_MULT = 0.6        // paddle length multiplier when shrunk
export const SLOW_MULT = 0.7          // ball movement multiplier when slow
export const FAST_MULT = 1.35         // ball movement multiplier when turbo
export const MAX_BALLS = 3            // multi-ball cap
export const MULTI_SPREAD = 0.4       // radians each multi-ball clone veers off the original
export const PICKUP_KINDS = ['grow', 'shrink', 'slow', 'fast', 'multi', 'shield']

// Short player-facing names — shared by the pickup glyphs, the collect
// callout and the rules sheet so they never drift apart.
export const PICKUP_INFO = {
  grow:   { glyph: '+', name: 'BIG PADDLE' },
  shrink: { glyph: '-', name: 'SHRINK RAY' },
  slow:   { glyph: 'S', name: 'SLOW-MO' },
  fast:   { glyph: 'T', name: 'TURBO' },
  multi:  { glyph: 'M', name: 'MULTI-BALL' },
  shield: { glyph: 'W', name: 'GOAL WALL' },
}

// ─── Obstacles (CHAOS) ──────────────────────────────────────────────────────
export const OBSTACLE_W = 0.03        // bumper thickness along the long axis
export const OBSTACLE_H = 0.16        // bumper length across the court
const OBSTACLES = [
  { x: 0.4, phase: 0 },
  { x: 0.6, phase: Math.PI },
]
const OBSTACLE_AMP = 0.3
const OBSTACLE_FREQ = 0.9             // rad/sec

/** Bumper rectangles (centre + size) at sim time `time`; [] for modes without them. */
export function obstaclesAt(time, modeId) {
  if (!getMode(modeId).obstacles) return []
  return OBSTACLES.map(o => ({
    x: o.x,
    y: 0.5 + OBSTACLE_AMP * Math.sin((time || 0) * OBSTACLE_FREQ + o.phase),
    w: OBSTACLE_W,
    h: OBSTACLE_H,
  }))
}

const HALF = PADDLE_H / 2
export const X_FACE = PADDLE_INSET + PADDLE_W / 2          // O-facing edge of X's paddle
export const O_FACE = 1 - PADDLE_INSET - PADDLE_W / 2      // X-facing edge of O's paddle

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const frac = (v) => v - Math.floor(v)
const hash = (n) => frac(Math.sin(n * 12.9898 + 4.1414) * 43758.5453)

/** Effective half-length of a paddle, accounting for grow/shrink effects. */
export function paddleHalf(effects, side) {
  let h = HALF
  const e = effects?.[side]
  if (e?.grow > 0) h *= GROW_MULT
  if (e?.shrink > 0) h *= SHRINK_MULT
  return h
}

const blankEffects = () => ({ X: { grow: 0, shrink: 0, shield: 0 }, O: { grow: 0, shrink: 0, shield: 0 } })

// Normalize the effects object (handles missing/legacy state).
function normEffects(e) {
  if (!e) return blankEffects()
  const side = (v) => ({ grow: v?.grow ?? 0, shrink: v?.shrink ?? 0, shield: v?.shield ?? 0 })
  return { X: side(e.X), O: side(e.O) }
}

// Deterministic pickup position from a sequence counter — keeps step() pure.
// Positions are in the central band, away from the paddle faces.
function pickupPos(seq) {
  const hx = Math.sin(seq * 12.9898) * 43758.5453
  const hy = Math.sin(seq * 78.233 + 1.3) * 43758.5453
  return {
    x: 0.25 + frac(hx) * 0.5,   // 0.25..0.75
    y: 0.15 + frac(hy) * 0.7,   // 0.15..0.85
  }
}

/** Deterministic, well-mixed pickup kind for a sequence number. */
export function pickupKind(seq, kinds = PICKUP_KINDS) {
  return kinds[Math.floor(hash(seq + 0.5) * kinds.length) % kinds.length]
}

// Deterministic serve angles cycled by serve count so successive serves vary
// without needing an RNG (keeps step() pure).
const SERVE_ANGLES = [0.18, -0.28, 0.32, -0.16, 0.24, -0.34, 0.12, -0.22]

function serveVelocity(toward, n = 0) {
  const dir = toward === 'X' ? -1 : 1               // toward X = decreasing x
  const a = SERVE_ANGLES[((n % SERVE_ANGLES.length) + SERVE_ANGLES.length) % SERVE_ANGLES.length]
  return { vx: Math.cos(a) * SERVE_SPEED * dir, vy: Math.sin(a) * SERVE_SPEED }
}

// Launch a single ball from centre toward `serveTo` at SERVE_SPEED. Clears the
// serve-hold state so step()'s normal integration takes over next tick.
// The server (opposite of serveTo) is credited as lastHitter so power-up
// attribution works immediately after the serve.
function launch(s) {
  const v = serveVelocity(s.serveTo, s.serveCount)
  s.ballSeq += 1
  s.balls = [{ id: s.ballSeq, x: 0.5, y: 0.5, vx: v.vx, vy: v.vy, spin: 0 }]
  s.lastHitter = s.serveTo === 'X' ? 'O' : 'X'
  s.serveTo = null
  s.serveIn = 0
}

// Reflect the ball off a paddle. The cross-axis hit offset (relative to the
// paddle's *effective* half-length) sets the return angle; each hit nudges
// the speed up to a cap. Paddle motion + edge offset impart spin.
function reflect(paddleY, ballY, dirX, vx, vy, paddleVel, eh, mode) {
  const offset = clamp((ballY - paddleY) / eh, -1, 1)
  const angle = offset * MAX_BOUNCE
  const speed = Math.min(Math.hypot(vx, vy) * (mode.speedup || BALL_SPEEDUP), mode.maxSpeed || BALL_MAX_SPEED)
  const spin = paddleVel * SPIN_TRANSFER + offset * OFFSET_SPIN
  return { vx: Math.cos(angle) * speed * dirX, vy: Math.sin(angle) * speed, spin }
}

// Push a ball out of an axis-aligned bumper and reflect it off the face it
// penetrated least. Mutates `b`; returns true on contact.
function bounceObstacle(b, o) {
  const dx = b.x - o.x
  const dy = b.y - o.y
  const px = o.w / 2 + BALL_R - Math.abs(dx)
  const py = o.h / 2 + BALL_R - Math.abs(dy)
  if (px <= 0 || py <= 0) return false
  if (px < py) {
    const sx = dx >= 0 ? 1 : -1
    b.x += sx * px
    b.vx = Math.abs(b.vx) * sx
  } else {
    const sy = dy >= 0 ? 1 : -1
    b.y += sy * py
    b.vy = Math.abs(b.vy) * sy
  }
  return true
}

/**
 * Given the side that served the previous round (or null for the very first
 * round of a session), returns who should serve next: always the opposite
 * side when a previous server is known, otherwise a random pick. Callers
 * that want deterministic round-to-round fairness should track the return
 * value and feed it back in as `prevServeTo` on the next call — see
 * PongGame.jsx's host loop, which threads this through a ref so serve
 * advantage alternates across rounds instead of always favoring one side.
 * @param {'X'|'O'|null} [prevServeTo]
 * @returns {'X'|'O'}
 */
export function nextServeTo(prevServeTo) {
  if (prevServeTo === 'X') return 'O'
  if (prevServeTo === 'O') return 'X'
  return Math.random() < 0.5 ? 'X' : 'O'
}

/**
 * Build a fresh simulation state.
 * @param {{ mode?: string, serveTo?: 'X'|'O', serveIn?: number, score?: {X:number,O:number}, serveCount?: number }} [opts]
 */
export function createState(opts = {}) {
  const mode = getMode(opts.mode)
  const { serveIn = 0, score = { X: 0, O: 0 }, serveCount = 0 } = opts
  // Survival has no opponent paddle — every serve comes at the player.
  const serveTo = mode.wall ? 'X' : (opts.serveTo ?? 'O')
  const s = {
    mode: mode.id,
    time: 0,
    clock: mode.timeLimit || 0,
    lives: mode.lives || 0,
    balls: [],
    ballSeq: 0,
    paddles: { X: 0.5, O: 0.5 },
    score: { X: score.X | 0, O: score.O | 0 },
    serveCount,
    serveTo,
    serveIn,
    lastHitter: null,
    rally: 0,
    pickups: [],
    nextPickupIn: mode.pickupFirstAt ?? PICKUP_FIRST_AT,
    pickupSeq: 0,
    effects: blankEffects(),
    ballMod: { slow: 0, fast: 0 },
  }
  if (serveIn <= 0) launch(s)          // immediate first serve (callers gate the opener with their own countdown)
  return s
}

// Reset everything a point clears, and hold the next serve toward `serveTo`.
function resetAfterPoint(s, mode, serveTo) {
  s.serveCount += 1
  s.serveTo = serveTo
  s.serveIn = SERVE_DELAY
  s.balls = []
  s.rally = 0
  s.pickups = []
  s.effects = blankEffects()
  s.ballMod = { slow: 0, fast: 0 }
  s.nextPickupIn = mode.pickupFirstAt ?? PICKUP_FIRST_AT
}

/**
 * Advance the simulation by one fixed timestep. Pure: never mutates `state`.
 * Inputs are analog paddle intents in [-1, 1] (keyboard sends ±1, touch drags
 * send a proportional value).
 * @param {object} state  previous state
 * @param {{X?: number, O?: number}} inputs  paddle movement intent per side
 * @param {number} dt  seconds (use a fixed value, e.g. 1/120)
 * @returns {{ state: object, events: Array<object> }}
 */
export function step(state, inputs, dt) {
  const mode = getMode(state.mode)
  const s = {
    mode: mode.id,
    time: (state.time ?? 0) + dt,
    clock: state.clock ?? (mode.timeLimit || 0),
    lives: state.lives ?? (mode.lives || 0),
    balls: (state.balls || []).map(b => ({ ...b, spin: b.spin ?? 0 })),
    ballSeq: state.ballSeq ?? 0,
    paddles: { ...state.paddles },
    score: { ...state.score },
    serveCount: state.serveCount ?? 0,
    serveTo: state.serveTo ?? null,
    serveIn: state.serveIn ?? 0,
    lastHitter: state.lastHitter ?? null,
    rally: state.rally ?? 0,
    pickups: state.pickups ? state.pickups.map(p => ({ ...p })) : [],
    nextPickupIn: state.nextPickupIn ?? (mode.pickupFirstAt ?? PICKUP_FIRST_AT),
    pickupSeq: state.pickupSeq ?? 0,
    effects: normEffects(state.effects),
    ballMod: { slow: state.ballMod?.slow ?? 0, fast: state.ballMod?.fast ?? 0 },
  }
  const events = []

  // Round clock (BLITZ) — runs through serve holds too, so a stalling player
  // can't freeze it.
  if (mode.timeLimit && s.clock > 0) {
    s.clock = Math.max(0, s.clock - dt)
    if (s.clock === 0) events.push({ type: 'timeup' })
  }

  // Tick down effect timers.
  for (const side of ['X', 'O']) {
    for (const k of ['grow', 'shrink', 'shield']) {
      if (s.effects[side][k] > 0) s.effects[side][k] = Math.max(0, s.effects[side][k] - dt)
    }
  }
  if (s.ballMod.slow > 0) s.ballMod.slow = Math.max(0, s.ballMod.slow - dt)
  if (s.ballMod.fast > 0) s.ballMod.fast = Math.max(0, s.ballMod.fast - dt)

  // Move paddles, clamped inside the court using their effective half-length
  // (a grown paddle can't press against the wall as far; a shrunk one can).
  const dirs = {}
  for (const side of ['X', 'O']) {
    dirs[side] = clamp(Number(inputs?.[side]) || 0, -1, 1)
    const eh = paddleHalf(s.effects, side)
    s.paddles[side] = clamp(s.paddles[side] + dirs[side] * PADDLE_SPEED * dt, eh, 1 - eh)
  }

  // Serve hold: no ball in play while the delay counts down.
  if (s.serveIn > 0) {
    s.serveIn -= dt
    if (s.serveIn <= 0) launch(s)
    return { state: s, events }
  }

  // Spawn pickups (only after the ball has been hit and no pickup is active).
  if (mode.powerups && s.lastHitter && s.pickups.length === 0) {
    s.nextPickupIn -= dt
    if (s.nextPickupIn <= 0) {
      const pos = pickupPos(s.pickupSeq)
      s.pickups.push({ id: s.pickupSeq, x: pos.x, y: pos.y, kind: pickupKind(s.pickupSeq, mode.kinds) })
    }
  }

  const obstacles = obstaclesAt(s.time, mode.id)
  const moveMult = (s.ballMod.slow > 0 ? SLOW_MULT : 1) * (s.ballMod.fast > 0 ? FAST_MULT : 1)
  const survivors = []
  const spawned = []
  let lastConceded = null

  for (const b of s.balls) {
    // Ball movement — slow/turbo power-ups scale effective speed.
    b.x += b.vx * moveMult * dt
    b.y += b.vy * moveMult * dt

    // Spin curves the trajectory in flight.
    if (b.spin !== 0) {
      b.vy += b.spin * dt
      b.spin *= Math.exp(-SPIN_DECAY_RATE * dt)
    }

    // Side walls (the edges of the cross axis).
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = -b.vy; events.push({ type: 'wall', x: b.x, y: b.y }) }
    else if (b.y > 1 - BALL_R) { b.y = 1 - BALL_R; b.vy = -b.vy; events.push({ type: 'wall', x: b.x, y: b.y }) }

    // Bumpers.
    for (const o of obstacles) {
      if (bounceObstacle(b, o)) events.push({ type: 'bump', x: b.x, y: b.y })
    }

    // X paddle — uses effective half-length for collision + reflect.
    if (b.vx < 0 && b.x - BALL_R <= X_FACE && b.x > 0) {
      const eh = paddleHalf(s.effects, 'X')
      if (Math.abs(b.y - s.paddles.X) <= eh + BALL_R) {
        Object.assign(b, reflect(s.paddles.X, b.y, 1, b.vx, b.vy, dirs.X * PADDLE_SPEED, eh, mode))
        b.x = X_FACE + BALL_R
        s.lastHitter = 'X'
        s.rally += 1
        if (mode.wall) s.score.X += 1            // survival: every return is a point
        events.push({ type: 'paddle', side: 'X', x: b.x, y: b.y, rally: s.rally, speed: Math.hypot(b.vx, b.vy) })
        if (s.rally % RALLY_MILESTONE === 0) events.push({ type: 'rally', n: s.rally })
      }
    }
    // O paddle — or, in survival, a solid back wall that kicks the ball back
    // at a slightly randomized angle so it never settles into a loop.
    if (mode.wall === 'O') {
      if (b.vx > 0 && b.x + BALL_R >= 1) {
        b.x = 1 - BALL_R
        const speed = Math.hypot(b.vx, b.vy)
        const a = (hash(s.rally * 7 + s.serveCount) - 0.5) * 1.3
        b.vx = -Math.cos(a) * speed
        b.vy = Math.sin(a) * speed
        events.push({ type: 'wall', x: b.x, y: b.y })
      }
    } else if (b.vx > 0 && b.x + BALL_R >= O_FACE && b.x < 1) {
      const eh = paddleHalf(s.effects, 'O')
      if (Math.abs(b.y - s.paddles.O) <= eh + BALL_R) {
        Object.assign(b, reflect(s.paddles.O, b.y, -1, b.vx, b.vy, dirs.O * PADDLE_SPEED, eh, mode))
        b.x = O_FACE - BALL_R
        s.lastHitter = 'O'
        s.rally += 1
        events.push({ type: 'paddle', side: 'O', x: b.x, y: b.y, rally: s.rally, speed: Math.hypot(b.vx, b.vy) })
        if (s.rally % RALLY_MILESTONE === 0) events.push({ type: 'rally', n: s.rally })
      }
    }

    // Pickup collision: circle (ball) vs square (pickup).
    if (s.pickups.length > 0) {
      const pk = s.pickups[0]
      if (Math.abs(b.x - pk.x) <= BALL_R + PICKUP_SIZE / 2 && Math.abs(b.y - pk.y) <= BALL_R + PICKUP_SIZE / 2) {
        const hitter = s.lastHitter || 'X'
        const opponent = hitter === 'X' ? 'O' : 'X'
        if (pk.kind === 'grow') s.effects[hitter].grow = EFFECT_GROW
        else if (pk.kind === 'shrink') s.effects[opponent].shrink = EFFECT_SHRINK
        else if (pk.kind === 'slow') s.ballMod.slow = EFFECT_SLOW
        else if (pk.kind === 'fast') s.ballMod.fast = EFFECT_FAST
        else if (pk.kind === 'shield') s.effects[hitter].shield = EFFECT_SHIELD
        else if (pk.kind === 'multi') {
          const speed = Math.hypot(b.vx, b.vy)
          const base = Math.atan2(b.vy, b.vx)
          const room = MAX_BALLS - s.balls.length - spawned.length
          for (const d of [MULTI_SPREAD, -MULTI_SPREAD].slice(0, Math.max(0, room))) {
            s.ballSeq += 1
            spawned.push({ id: s.ballSeq, x: b.x, y: b.y, vx: Math.cos(base + d) * speed, vy: Math.sin(base + d) * speed, spin: 0 })
          }
        }
        s.pickups = []
        s.nextPickupIn = mode.pickupRespawn ?? PICKUP_RESPAWN
        s.pickupSeq += 1
        events.push({ type: 'pickup', kind: pk.kind, by: hitter, x: pk.x, y: pk.y })
      }
    }

    // Goal lines: a live shield bounces the ball back once, otherwise the
    // ball is out.
    if (b.x < 0 || b.x > 1) {
      const conceded = b.x < 0 ? 'X' : 'O'
      if (s.effects[conceded].shield > 0) {
        s.effects[conceded].shield = 0
        b.x = conceded === 'X' ? BALL_R : 1 - BALL_R
        b.vx = conceded === 'X' ? Math.abs(b.vx) : -Math.abs(b.vx)
        events.push({ type: 'shield', side: conceded, x: b.x, y: b.y })
        survivors.push(b)
        continue
      }
      lastConceded = conceded
      if (!mode.wall) {
        const by = conceded === 'X' ? 'O' : 'X'
        s.score[by] += 1
        events.push({ type: 'score', by, x: conceded === 'X' ? 0 : 1, y: b.y })
      }
      continue
    }
    survivors.push(b)
  }
  s.balls = survivors.concat(spawned)

  // The last ball left the court: a point (or, in survival, a life) is over.
  if (s.balls.length === 0 && lastConceded) {
    if (mode.wall) {
      s.lives = Math.max(0, s.lives - 1)
      events.push({ type: 'life', lives: s.lives })
      if (s.lives === 0) events.push({ type: 'gameover', score: s.score.X })
    }
    resetAfterPoint(s, mode, mode.wall ? 'X' : lastConceded)
  }

  return { state: s, events }
}

/**
 * Where the ball will cross the line x = faceX, folding in side-wall bounces
 * (spin ignored). Returns null when the ball is moving away from that line.
 */
export function predictImpactY(ball, faceX) {
  if (!ball || !ball.vx) return null
  const t = (faceX - ball.x) / ball.vx
  if (t < 0) return null
  const span = 1 - 2 * BALL_R
  const u = ball.y + ball.vy * t - BALL_R
  const m = ((u % (2 * span)) + 2 * span) % (2 * span)
  return BALL_R + (m <= span ? m : 2 * span - m)
}

/** Bot skill presets for solo play. */
export const AI_LEVELS = {
  easy:   { label: 'EASY',   reactMs: 170, deadzone: 0.1,  predict: false },
  normal: { label: 'NORMAL', reactMs: 110, deadzone: 0.07, predict: false },
  hard:   { label: 'HARD',   reactMs: 70,  deadzone: 0.04, predict: true },
}

/**
 * Heuristic AI paddle input (-1 / 0 / +1 along the cross axis). Beatable by
 * design: it only chases a ball approaching its side (the soonest-arriving
 * one when several are in play), otherwise it drifts back to centre, and a
 * deadzone keeps it from jittering. With `predict` it aims at the folded
 * impact point instead of the ball's current y.
 */
export function computeAI(state, side, opts = {}) {
  const { deadzone = 0.05, predict = false } = opts
  const face = side === 'X' ? X_FACE : O_FACE
  let best = null
  let bestT = Infinity
  for (const b of state.balls || []) {
    const approaching = side === 'X' ? b.vx < 0 : b.vx > 0
    if (!approaching) continue
    const t = (face - b.x) / b.vx
    if (t >= 0 && t < bestT) { bestT = t; best = b }
  }
  const target = best ? (predict ? predictImpactY(best, face) ?? best.y : best.y) : 0.5
  const diff = target - state.paddles[side]
  if (Math.abs(diff) < deadzone) return 0
  return diff > 0 ? 1 : -1
}

/** Winner once a side reaches `target` points, else null. */
export function getWinner(score, target = WIN_SCORE) {
  if ((score?.X ?? 0) >= target) return 'X'
  if ((score?.O ?? 0) >= target) return 'O'
  return null
}

/** True while a BLITZ round is tied after the clock ran out (next point wins). */
export function isSuddenDeath(state) {
  const mode = getMode(state.mode)
  return !!mode.timeLimit && (state.clock ?? 0) <= 0 && state.score.X === state.score.O
}

/**
 * The round's result under its mode's rules, else null while it is still live.
 * Survival returns 'O' (the wall) once the last life is gone.
 */
export function getRoundWinner(state) {
  const mode = getMode(state.mode)
  if (mode.wall) return state.lives <= 0 ? 'O' : null
  if (mode.timeLimit) {
    if ((state.clock ?? 0) > 0) return null
    if (state.score.X > state.score.O) return 'X'
    if (state.score.O > state.score.X) return 'O'
    return null
  }
  return getWinner(state.score, mode.winScore)
}

// ─── Network snapshot (host → guest) ────────────────────────────────────────
const r4 = (n) => Math.round((n || 0) * 1e4) / 1e4

/** Compact wire form of the parts of the state the guest renders. */
export function encodeSnapshot(state) {
  const e = (side) => [r4(state.effects[side].grow), r4(state.effects[side].shrink), r4(state.effects[side].shield)]
  const pk = state.pickups[0]
  return {
    t: 's',
    b: state.balls.map(b => [b.id, r4(b.x), r4(b.y), r4(b.vx), r4(b.vy), r4(b.spin)]),
    p: [r4(state.paddles.X), r4(state.paddles.O)],
    x: state.score.X, o: state.score.O,
    e: [e('X'), e('O')],
    m: [r4(state.ballMod.slow), r4(state.ballMod.fast)],
    k: pk ? [pk.id, r4(pk.x), r4(pk.y), pk.kind] : null,
    tm: r4(state.time), ck: r4(state.clock), r: state.rally, sv: state.serveIn > 0 ? 1 : 0,
  }
}

/** Inverse of encodeSnapshot — tolerant of missing fields. */
export function decodeSnapshot(msg) {
  const eff = (a) => ({ grow: a?.[0] ?? 0, shrink: a?.[1] ?? 0, shield: a?.[2] ?? 0 })
  return {
    balls: (msg.b || []).map(([id, x, y, vx, vy, spin]) => ({ id, x, y, vx, vy, spin: spin ?? 0 })),
    paddles: { X: msg.p?.[0] ?? 0.5, O: msg.p?.[1] ?? 0.5 },
    score: { X: msg.x ?? 0, O: msg.o ?? 0 },
    effects: { X: eff(msg.e?.[0]), O: eff(msg.e?.[1]) },
    ballMod: { slow: msg.m?.[0] ?? 0, fast: msg.m?.[1] ?? 0 },
    pickups: msg.k ? [{ id: msg.k[0], x: msg.k[1], y: msg.k[2], kind: msg.k[3] }] : [],
    time: msg.tm ?? 0,
    clock: msg.ck ?? 0,
    rally: msg.r ?? 0,
    serving: !!msg.sv,
  }
}

/**
 * Dead-reckon balls `age` seconds past a snapshot (guest rendering): velocity
 * plus spin, folded back off the side walls, never past the goal lines.
 */
export function extrapolateBalls(balls, age, ballMod) {
  const mult = (ballMod?.slow > 0 ? SLOW_MULT : 1) * (ballMod?.fast > 0 ? FAST_MULT : 1)
  const span = 1 - 2 * BALL_R
  return balls.map(b => {
    const vy = b.vy + (b.spin || 0) * age
    const u = b.y + vy * mult * age - BALL_R
    const m = ((u % (2 * span)) + 2 * span) % (2 * span)
    return {
      ...b,
      x: clamp(b.x + b.vx * mult * age, 0, 1),
      y: BALL_R + (m <= span ? m : 2 * span - m),
    }
  })
}

// ─── Layout ─────────────────────────────────────────────────────────────────
// Long-to-short side ratio limits for the on-screen court. The sim is
// normalized so any ratio plays; the clamp keeps it from getting silly on
// very tall or very wide windows.
export const COURT_MIN_RATIO = 0.5
export const COURT_MAX_RATIO = 0.72

/**
 * Largest court that fits a `w × h` pixel box. Taller-than-wide boxes get a
 * portrait court (paddles top and bottom), otherwise landscape.
 * @returns {{ orientation: 'portrait'|'landscape', w: number, h: number }}
 */
export function fitCourt(w, h) {
  const aw = Math.max(0, w)
  const ah = Math.max(0, h)
  const portrait = ah > aw
  const long = portrait ? ah : aw
  const short = portrait ? aw : ah
  let L = Math.min(long, short / COURT_MIN_RATIO)
  let S = Math.min(short, L * COURT_MAX_RATIO)
  L = Math.min(L, S / COURT_MIN_RATIO)
  L = Math.floor(L)
  S = Math.floor(S)
  return portrait ? { orientation: 'portrait', w: S, h: L } : { orientation: 'landscape', w: L, h: S }
}
