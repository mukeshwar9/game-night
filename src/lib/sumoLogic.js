// Pure Sumo Arena simulation — no DOM, no network, no React. Deterministic and
// unit-testable. The arena is a normalized 1×1 box (x ∈ [0,1], y ∈ [0,1]) with
// a circular platform centred at (0.5, 0.5). Two blobs (X red, O blue) ram each
// other; the platform shrinks over time so the round always ends. A blob whose
// centre exits the platform radius dies; last alive wins.
//
// This module is the single source of truth for the game's physics. The /demo
// route runs it directly (loopback), and in multiplayer the HOST runs it
// authoritatively and streams snapshots over the WebRTC data channel — the
// guest never simulates, so cross-client determinism is not required.

export const BLOB_R = 0.06             // blob radius (fraction of arena)
export const PUSH_IMPULSE = 0.42       // per-tap velocity impulse toward opponent
export const FRICTION = 1.4            // per-second exponential velocity decay
export const MAX_SPEED = 1.5           // speed cap (arena units/sec)
export const RESTITUTION = 0.85        // blob-vs-blob collision restitution
export const SHRINK_START = 8          // seconds before the platform starts shrinking
export const SHRINK_RATE = 0.04        // arena radius lost per second after start
export const MIN_RADIUS = 0.16         // platform never shrinks below this
export const START_RADIUS = 0.5        // platform starts as the inscribed circle of the 1×1 square

const CENTER_X = 0.5
const CENTER_Y = 0.5

/**
 * Build a fresh simulation state.
 * @returns {{ blobs: object, arenaR: number, t: number }}
 */
export function createState() {
  return {
    blobs: {
      X: { x: 0.3, y: 0.5, vx: 0, vy: 0, alive: true },
      O: { x: 0.7, y: 0.5, vx: 0, vy: 0, alive: true },
    },
    arenaR: START_RADIUS,
    t: 0,
  }
}

function decayAndClamp(b, dt) {
  const f = Math.exp(-FRICTION * dt)
  b.vx *= f
  b.vy *= f
  const sp = Math.hypot(b.vx, b.vy)
  if (sp > MAX_SPEED) {
    b.vx *= MAX_SPEED / sp
    b.vy *= MAX_SPEED / sp
  }
}

function applyInput(b, input, opp, dt) {
  const press = input?.press ?? 0
  if (!press) return
  const dx = opp.x - b.x
  const dy = opp.y - b.y
  const dist = Math.hypot(dx, dy) || 1
  b.vx += PUSH_IMPULSE * (dx / dist)
  b.vy += PUSH_IMPULSE * (dy / dist)
  const sp = Math.hypot(b.vx, b.vy)
  if (sp > MAX_SPEED) {
    b.vx *= MAX_SPEED / sp
    b.vy *= MAX_SPEED / sp
  }
}

function moveAndBounceWalls(b, dt) {
  b.x += b.vx * dt
  b.y += b.vy * dt
  if (b.x < 0) { b.x = 0; b.vx = -b.vx }
  else if (b.x > 1) { b.x = 1; b.vx = -b.vx }
  if (b.y < 0) { b.y = 0; b.vy = -b.vy }
  else if (b.y > 1) { b.y = 1; b.vy = -b.vy }
}

// Equal-mass collision with restitution along the contact normal. The normal
// velocity components are exchanged and scaled by RESTITUTION; tangential
// components are preserved. Positions are separated so the blobs no longer
// overlap.
function resolveCollision(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  if (dist >= 2 * BLOB_R || dist === 0) return
  const nx = dx / dist
  const ny = dy / dist
  const v1n = a.vx * nx + a.vy * ny
  const v2n = b.vx * nx + b.vy * ny
  const e = RESTITUTION
  const newV1n = ((1 - e) * v1n + (1 + e) * v2n) / 2
  const newV2n = ((1 + e) * v1n + (1 - e) * v2n) / 2
  a.vx += (newV1n - v1n) * nx
  a.vy += (newV1n - v1n) * ny
  b.vx += (newV2n - v2n) * nx
  b.vy += (newV2n - v2n) * ny
  const overlap = 2 * BLOB_R - dist
  a.x -= nx * overlap / 2
  a.y -= ny * overlap / 2
  b.x += nx * overlap / 2
  b.y += ny * overlap / 2
}

/**
 * Advance the simulation by one fixed timestep. Pure: never mutates `state`.
 * @param {object} state  previous state
 * @param {{X?: {press:number}, O?: {press:number}}} inputs  tap intent per side (1 = push toward opponent)
 * @param {number} dt  seconds (use a fixed value, e.g. 1/120)
 * @returns {{ state: object, events: Array<{type:string, by?:string}> }}
 */
export function step(state, inputs, dt) {
  const X = { ...state.blobs.X }
  const O = { ...state.blobs.O }
  const s = {
    blobs: { X, O },
    arenaR: state.arenaR,
    t: state.t + dt,
  }
  const events = []

  for (const b of [X, O]) {
    if (!b.alive) continue
    decayAndClamp(b, dt)
  }
  if (X.alive) applyInput(X, inputs?.X, O, dt)
  if (O.alive) applyInput(O, inputs?.O, X, dt)
  for (const b of [X, O]) {
    if (!b.alive) continue
    moveAndBounceWalls(b, dt)
  }
  if (X.alive && O.alive) resolveCollision(X, O)

  if (s.t > SHRINK_START) s.arenaR = Math.max(MIN_RADIUS, s.arenaR - SHRINK_RATE * dt)

  const deathR = s.arenaR - BLOB_R * 0.5
  for (const [side, b] of [['X', X], ['O', O]]) {
    if (!b.alive) continue
    const d = Math.hypot(b.x - CENTER_X, b.y - CENTER_Y)
    if (d > deathR) {
      b.alive = false
      b.vx = 0
      b.vy = 0
      events.push({ type: 'out', by: side })
    }
  }

  return { state: s, events }
}

/**
 * Round winner: 'X' if O is dead and X alive, 'O' if X dead and O alive, 'draw'
 * if both are dead, `null` while both are alive.
 * @param {object} state
 * @returns {'X'|'O'|'draw'|null}
 */
export function getWinner(state) {
  const xAlive = state.blobs.X.alive
  const oAlive = state.blobs.O.alive
  if (xAlive && !oAlive) return 'X'
  if (oAlive && !xAlive) return 'O'
  if (!xAlive && !oAlive) return 'draw'
  return null
}

/**
 * Reaction-handicapped AI input. Taps the push button at intervals to ram the
 * opponent when close, and taps to retreat toward centre when near the edge.
 * Beatable by a human that taps faster and times their pushes.
 * @param {object} state
 * @param {'X'|'O'} side
 * @returns {{ press: 0|1 }}
 */
export function computeAI(state, side) {
  const me = state.blobs[side]
  const opp = state.blobs[side === 'X' ? 'O' : 'X']
  if (!me.alive) return { press: 0 }
  const distCenter = Math.hypot(me.x - CENTER_X, me.y - CENTER_Y)
  const edgeThresh = state.arenaR - 0.12
  const distOpp = Math.hypot(opp.x - me.x, opp.y - me.y)
  // Tap rhythm: ~every 200ms (deterministic from sim time) so the AI is beatable.
  const tapWindow = (Math.floor(state.t * 5) % 2) === 0
  if (!tapWindow) return { press: 0 }
  if (distCenter > edgeThresh) return { press: 1 }
  if (distOpp < 0.25) return { press: 1 }
  return { press: 0 }
}
