// airhockeyLogic.js — pure portrait air-hockey sim. No DOM, no network.
// Mirrors pongLogic's contract: createState / step / computeAI / getWinner.
//
// Court: width 1 × height 1.5, origin top-left, x→right, y→down.
//   X defends the BOTTOM goal (y=H), O defends the TOP goal (y=0).
// Fixed timestep dt = 1/120. step() runs ONE tick and returns { state, events }.

export const COURT_W = 1
export const COURT_H = 1.5
export const MALLET_R = 0.06
export const PUCK_R = 0.035
export const GOAL_HALF_W = 0.175 // mouth ~35% of court width
export const WIN_SCORE = 7

const FRICTION_U = 0.25          // v *= (1 - μ·dt)
const WALL_RESTITUTION = 0.92
const MALLET_K = 0.6             // flick injection factor — #1 tuning knob
const MAX_SPEED = 2.2            // court-heights/s clamp
const STUCK_MS = 1500

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

export function createState() {
  return {
    puck: {
      x: COURT_W / 2,
      y: COURT_H / 2,
      vx: 0,
      vy: 0,
    },
    mallets: {
      X: { x: COURT_W / 2, y: COURT_H - 0.25 }, // bottom half
      O: { x: COURT_W / 2, y: 0.25 },           // top half
    },
    velocities: { X: { vx: 0, vy: 0 }, O: { vx: 0, vy: 0 } },
    score: { X: 0, O: 0 },
    serveTo: 'X',       // conceded player receives the serve
    serveTimer: 1000,   // ms remaining before live puck
    stuckMs: 0,
  }
}

// Mallets are position-driven: velocity derived from position delta each tick.
function trackVelocity(state, symbol, targetX, targetY, dt) {
  const m = state.mallets[symbol]
  const halfTop = symbol === 'O'
  const minY = halfTop ? MALLET_R : COURT_H / 2 + MALLET_R
  const maxY = halfTop ? COURT_H / 2 - MALLET_R : COURT_H - MALLET_R
  const nx = clamp(targetX, MALLET_R, COURT_W - MALLET_R)
  const ny = clamp(targetY, minY, maxY)
  const vx = dt > 0 ? (nx - m.x) / dt : 0
  const vy = dt > 0 ? (ny - m.y) / dt : 0
  m.x = nx
  m.y = ny
  state.velocities[symbol] = { vx, vy }
}

// Circle–circle impulse vs infinite-mass mallet + flick injection.
function collideMalletPuck(state, symbol, events) {
  const p = state.puck
  const m = state.mallets[symbol]
  let dx = p.x - m.x
  let dy = p.y - m.y
  const dist = Math.hypot(dx, dy)
  const minDist = PUCK_R + MALLET_R
  if (dist >= minDist || dist === 0) return
  const nx = dx / dist
  const ny = dy / dist
  // Positional correction — push puck out of overlap along the normal.
  p.x = m.x + nx * minDist
  p.y = m.y + ny * minDist
  const vn = p.vx * nx + p.vy * ny // puck velocity along normal (negative = approaching)
  const mvx = state.velocities[symbol].vx
  const mvy = state.velocities[symbol].vy
  const mn = mvx * nx + mvy * ny   // mallet velocity along normal
  if (vn < 0 || mn > 0) {
    // Reflect + inject mallet motion ("flick").
    p.vx = p.vx - (1 + 1.0) * vn * nx + MALLET_K * mvx
    p.vy = p.vy - (1 + 1.0) * vn * ny + MALLET_K * mvy
    events.push({ type: 'hit', by: symbol })
  }
}

// Substeps so max-speed pucks can't tunnel through mallets/goal lines.
export function step(state, inputs, dt) {
  const events = []
  const s = {
    ...state,
    puck: { ...state.puck },
    mallets: {
      X: { ...state.mallets.X },
      O: { ...state.mallets.O },
    },
    velocities: {
      X: { ...state.velocities.X },
      O: { ...state.velocities.O },
    },
    score: { ...state.score },
  }

  // Serve delay countdown — mallets move, puck frozen at center-ish.
  if (s.serveTimer > 0) {
    s.serveTimer -= dt * 1000
    trackVelocity(s, 'X', inputs.X.x, inputs.X.y, dt)
    trackVelocity(s, 'O', inputs.O.x, inputs.O.y, dt)
    return { state: s, events }
  }

  trackVelocity(s, 'X', inputs.X.x, inputs.X.y, dt)
  trackVelocity(s, 'O', inputs.O.x, inputs.O.y, dt)

  // Friction + integrate with substeps sized to never skip more than a radius.
  const p = s.puck
  p.vx *= (1 - FRICTION_U * dt)
  p.vy *= (1 - FRICTION_U * dt)
  let speed = Math.hypot(p.vx, p.vy)
  if (speed > MAX_SPEED) {
    p.vx *= MAX_SPEED / speed
    p.vy *= MAX_SPEED / speed
    speed = MAX_SPEED
  }
  const substeps = Math.max(1, Math.ceil((speed * dt) / (PUCK_R * 0.9)))
  const subDt = dt / substeps
  for (let i = 0; i < substeps; i++) {
    p.x += p.vx * subDt
    p.y += p.vy * subDt

    // Side walls always elastic.
    if (p.x < PUCK_R) { p.x = PUCK_R; p.vx = Math.abs(p.vx) * WALL_RESTITUTION; events.push({ type: 'wall' }) }
    if (p.x > COURT_W - PUCK_R) { p.x = COURT_W - PUCK_R; p.vx = -Math.abs(p.vx) * WALL_RESTITUTION; events.push({ type: 'wall' }) }

    // Top edge (O's back): goal mouth or bounce.
    if (p.y < PUCK_R) {
      if (Math.abs(p.x - COURT_W / 2) < GOAL_HALF_W) {
        if (p.y < -PUCK_R) {
          s.score.X += 1
          events.push({ type: 'goal', scorer: 'X' })
          return { state: resetServe(s, 'O'), events }
        }
      } else {
        p.y = PUCK_R
        p.vy = Math.abs(p.vy) * WALL_RESTITUTION
        events.push({ type: 'wall' })
      }
    }
    // Bottom edge (X's back).
    if (p.y > COURT_H - PUCK_R) {
      if (Math.abs(p.x - COURT_W / 2) < GOAL_HALF_W) {
        if (p.y > COURT_H + PUCK_R) {
          s.score.O += 1
          events.push({ type: 'goal', scorer: 'O' })
          return { state: resetServe(s, 'X'), events }
        }
      } else {
        p.y = COURT_H - PUCK_R
        p.vy = -Math.abs(p.vy) * WALL_RESTITUTION
        events.push({ type: 'wall' })
      }
    }

    collideMalletPuck(s, 'X', events)
    collideMalletPuck(s, 'O', events)
  }

  // Stuck detector: near-zero speed while overlapping either mallet too long
  // → nudge toward center.
  const overlapping =
    Math.hypot(p.x - s.mallets.X.x, p.y - s.mallets.X.y) < MALLET_R + PUCK_R ||
    Math.hypot(p.x - s.mallets.O.x, p.y - s.mallets.O.y) < MALLET_R + PUCK_R
  if (overlapping && Math.hypot(p.vx, p.vy) < 0.02) {
    s.stuckMs += dt * 1000
    if (s.stuckMs > STUCK_MS) {
      p.vx += (COURT_W / 2 - p.x) * 0.8
      p.vy += (COURT_H / 2 - p.y) * 0.8
      s.stuckMs = 0
    }
  } else {
    s.stuckMs = 0
  }

  return { state: s, events }
}

function resetServe(s, concededBy) {
  const next = { ...s }
  next.serveTo = concededBy
  next.serveTimer = 1000
  next.puck = {
    x: COURT_W / 2,
    y: concededBy === 'X' ? COURT_H * 0.62 : COURT_H * 0.38,
    vx: 0,
    vy: 0,
  }
  return next
}

export function getWinner(state) {
  if (state.score.X >= WIN_SCORE) return 'X'
  if (state.score.O >= WIN_SCORE) return 'O'
  return null
}

// Reaction-delay AI for demo mode. difficulty ∈ {easy, normal, hard}.
export function computeAI(state, difficulty = 'normal') {
  const cfg = {
    easy: { reactMs: 420, error: 0.12, speed: 0.55 },
    normal: { reactMs: 240, error: 0.06, speed: 0.75 },
    hard: { reactMs: 110, error: 0.02, speed: 0.95 },
  }[difficulty] ?? { reactMs: 240, error: 0.06, speed: 0.75 }

  const p = state.puck
  const me = state.mallets.O
  const defendY = GOAL_HALF_W * 0.4 + 0.18

  // Attack when puck in my half and moving slowly/toward me; else guard goal line.
  const incoming = p.vy < -0.05
  const inHalf = p.y < COURT_H / 2
  let tx
  let ty

  if (inHalf && (!incoming || Math.hypot(p.vx, p.vy) < 0.35)) {
    // Strike from behind the puck toward X's goal.
    tx = p.x + (p.x < COURT_W / 2 ? 0.08 : -0.08)
    ty = p.y + MALLET_R + PUCK_R + 0.01
  } else {
    // Track puck x with lag + error, hold defensive line.
    tx = p.x + cfg.error * (Math.random() - 0.5) * 2
    ty = Math.min(defendY, Math.max(MALLET_R, p.y - 0.22))
  }

  // Move toward target limited by speed factor of the tick distance.
  const dx = tx - me.x
  const dy = ty - me.y
  const dist = Math.hypot(dx, dy)
  const maxStep = cfg.speed * 0.06
  const scale = dist > maxStep ? maxStep / dist : 1
  return {
    x: me.x + dx * scale,
    y: me.y + dy * scale,
  }
}
