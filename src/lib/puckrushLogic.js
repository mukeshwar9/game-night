// @ts-check
// puckrushLogic.js — pure sling-puck sim. No DOM, no network.
// Same contract as airhockeyLogic: createState / step / computeAI / getWinner.
//
// Court: width 1 × height COURT_H, origin top-left, x→right, y→down. A wall
// runs across the middle with one gap in its centre. X owns the BOTTOM half,
// O the TOP half. Each side starts with PUCKS_EACH pucks and wins the round
// the moment its own half is empty.
//
// Input per side, every tick:
//   { hold: { i, x, y } | null, f: [{ q, i, x, y, vx, vy }] }
// `hold` pins puck i under the finger. `f` is the side's recent flings; each
// carries a rising sequence number `q` and is applied once, so a client can
// resend the same list over a lossy channel until the snapshot acknowledges it.
// Fixed timestep dt = 1/120. step() runs ONE tick and returns { state, events }.

export const COURT_W = 1
export const COURT_H = 1.3
export const PUCK_R = 0.048
export const WALL_Y = COURT_H / 2
export const WALL_HALF = 0.02            // half the wall's thickness
export const GAP_HALF_W = 0.122          // gap is ~2.5 puck widths
export const PUCKS_EACH = 5
export const MAX_FLING_SPEED = 3.9       // court widths/s
export const FLING_GAIN = 11             // pull distance → launch speed

const DRAG = 0.42                        // v *= DRAG^dt
const WALL_RESTITUTION = 0.82
const PUCK_RESTITUTION = 0.95
const REST_SPEED = 0.017                 // below this a puck stops dead
const HIT_SOUND_SPEED = 0.6
const WALL_SOUND_SPEED = 1.1
const SUBSTEPS = 2

const GAP_L = COURT_W / 2 - GAP_HALF_W
const GAP_R = COURT_W / 2 + GAP_HALF_W
const WALL_REACH = PUCK_R + WALL_HALF

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

/** Which side's half a point is in. */
export function sideOf(y) { return y > WALL_Y ? 'X' : 'O' }

/** Where a held puck may sit: inside its owner's half, clear of the wall. */
export function clampHold(side, x, y) {
  const lo = side === 'X' ? WALL_Y + WALL_REACH : PUCK_R
  const hi = side === 'X' ? COURT_H - PUCK_R : WALL_Y - WALL_REACH
  return { x: clamp(x, PUCK_R, COURT_W - PUCK_R), y: clamp(y, lo, hi) }
}

/** Launch velocity for a puck pulled from `from` and let go at `to`. */
export function flingVelocity(from, to) {
  const dx = from.x - to.x
  const dy = from.y - to.y
  const d = Math.hypot(dx, dy)
  if (d < 0.02) return { vx: 0, vy: 0 }
  const sp = Math.min(MAX_FLING_SPEED, d * FLING_GAIN)
  return { vx: (dx / d) * sp, vy: (dy / d) * sp }
}

export function createState() {
  const pucks = []
  for (let i = 0; i < PUCKS_EACH; i++) {
    const x = 0.16 + i * 0.17
    pucks.push({ x, y: COURT_H - 0.19, vx: 0, vy: 0 })   // even index: starts on X's half
    pucks.push({ x, y: 0.19, vx: 0, vy: 0 })             // odd index: starts on O's half
  }
  return { pucks, held: { X: null, O: null }, seq: { X: 0, O: 0 }, tick: 0 }
}

/** Pucks left on each half; a puck belongs to the half its centre is in. */
export function countSides(state) {
  let x = 0
  for (const p of state.pucks) if (p.y > WALL_Y) x += 1
  return { X: x, O: state.pucks.length - x }
}

/** First side whose half is empty wins the round. A held puck is still on its half. */
export function getWinner(state) {
  const n = countSides(state)
  if (n.X === 0) return 'X'
  if (n.O === 0) return 'O'
  return null
}

function applyInput(s, side, input, events) {
  const flings = input?.f || []
  let flung = false
  for (const f of flings) {
    if (!(f.q > s.seq[side])) continue
    s.seq[side] = f.q
    const p = s.pucks[f.i]
    // Only a puck on your own half can be flung, wherever the client thinks it is.
    if (!p || sideOf(p.y) !== side) continue
    const at = clampHold(side, f.x ?? p.x, f.y ?? p.y)
    p.x = at.x; p.y = at.y
    let vx = Number(f.vx) || 0
    let vy = Number(f.vy) || 0
    const sp = Math.hypot(vx, vy)
    if (sp > MAX_FLING_SPEED) { vx *= MAX_FLING_SPEED / sp; vy *= MAX_FLING_SPEED / sp }
    p.vx = vx; p.vy = vy
    if (s.held[side] === f.i) s.held[side] = null
    flung = true
    events.push({ type: 'fling', by: side })
  }
  const h = input?.hold
  if (h && !flung) {
    const p = s.pucks[h.i]
    if (p && (s.held[side] === h.i || sideOf(p.y) === side)) {
      const at = clampHold(side, h.x, h.y)
      p.x = at.x; p.y = at.y; p.vx = 0; p.vy = 0
      s.held[side] = h.i
      return
    }
  }
  if (!h) s.held[side] = null
}

function moveOne(p, dt, events) {
  const py = p.y
  p.x += p.vx * dt
  p.y += p.vy * dt
  if (p.x < PUCK_R) { p.x = PUCK_R; p.vx = Math.abs(p.vx) * WALL_RESTITUTION }
  if (p.x > COURT_W - PUCK_R) { p.x = COURT_W - PUCK_R; p.vx = -Math.abs(p.vx) * WALL_RESTITUTION }
  if (p.y < PUCK_R) { p.y = PUCK_R; p.vy = Math.abs(p.vy) * WALL_RESTITUTION }
  if (p.y > COURT_H - PUCK_R) { p.y = COURT_H - PUCK_R; p.vy = -Math.abs(p.vy) * WALL_RESTITUTION }

  if (Math.abs(p.y - WALL_Y) < WALL_REACH) {
    if (p.x < GAP_L || p.x > GAP_R) {
      // Solid wall: back out on the side it came from.
      const above = py < WALL_Y
      if (Math.abs(p.vy) > WALL_SOUND_SPEED) events.push({ type: 'wall' })
      p.y = above ? WALL_Y - WALL_REACH : WALL_Y + WALL_REACH
      p.vy = (above ? -1 : 1) * Math.abs(p.vy) * WALL_RESTITUTION
    } else {
      // In the gap: the two wall ends are round posts.
      for (const gx of [GAP_L, GAP_R]) {
        const dx = p.x - gx
        const dy = p.y - WALL_Y
        const d = Math.hypot(dx, dy)
        if (d < WALL_REACH && d > 0) {
          const nx = dx / d
          const ny = dy / d
          const vn = p.vx * nx + p.vy * ny
          p.x = gx + nx * WALL_REACH
          p.y = WALL_Y + ny * WALL_REACH
          if (vn < 0) { p.vx -= (1 + WALL_RESTITUTION) * vn * nx; p.vy -= (1 + WALL_RESTITUTION) * vn * ny }
        }
      }
    }
  }
  // `by` is the side the puck just left: that side is one closer to winning.
  if ((py - WALL_Y) * (p.y - WALL_Y) < 0) events.push({ type: 'cross', by: py > WALL_Y ? 'X' : 'O' })
}

function collidePucks(s, events) {
  const heldX = s.held.X
  const heldO = s.held.O
  const pinned = (i) => i === heldX || i === heldO
  for (let i = 0; i < s.pucks.length; i++) {
    for (let j = i + 1; j < s.pucks.length; j++) {
      const p = s.pucks[i]
      const q = s.pucks[j]
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d = Math.hypot(dx, dy)
      if (d >= 2 * PUCK_R || d === 0) continue
      const nx = dx / d
      const ny = dy / d
      const ov = 2 * PUCK_R - d
      const pi = pinned(i)
      const pj = pinned(j)
      if (pi && pj) continue
      // A puck under a finger does not give way; the free one takes the whole push.
      if (pi) { q.x += nx * ov; q.y += ny * ov }
      else if (pj) { p.x -= nx * ov; p.y -= ny * ov }
      else { p.x -= nx * ov / 2; p.y -= ny * ov / 2; q.x += nx * ov / 2; q.y += ny * ov / 2 }
      const rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny
      if (rv >= 0) continue
      if (pi) { q.vx -= (1 + PUCK_RESTITUTION) * rv * nx; q.vy -= (1 + PUCK_RESTITUTION) * rv * ny }
      else if (pj) { p.vx += (1 + PUCK_RESTITUTION) * rv * nx; p.vy += (1 + PUCK_RESTITUTION) * rv * ny }
      else {
        const k = rv * PUCK_RESTITUTION
        p.vx += k * nx; p.vy += k * ny
        q.vx -= k * nx; q.vy -= k * ny
      }
      if (-rv > HIT_SOUND_SPEED) events.push({ type: 'hit' })
    }
  }
}

export function step(state, inputs, dt) {
  const events = []
  const s = {
    pucks: state.pucks.map((p) => ({ ...p })),
    held: { ...state.held },
    seq: { ...state.seq },
    tick: (state.tick ?? 0) + 1,
  }
  // Alternate who is applied first so a contested puck is not always X's.
  const order = s.tick % 2 === 0 ? ['X', 'O'] : ['O', 'X']
  for (const side of order) applyInput(s, side, inputs?.[side], events)

  const sub = dt / SUBSTEPS
  const drag = Math.pow(DRAG, sub)
  for (let k = 0; k < SUBSTEPS; k++) {
    for (let i = 0; i < s.pucks.length; i++) {
      if (i === s.held.X || i === s.held.O) continue
      const p = s.pucks[i]
      p.vx *= drag; p.vy *= drag
      if (Math.abs(p.vx) + Math.abs(p.vy) < REST_SPEED) { p.vx = 0; p.vy = 0; continue }
      moveOne(p, sub, events)
    }
    collidePucks(s, events)
  }
  return { state: s, events }
}

// Bot levels for the solo page: how long it waits between shots, how far its
// aim wanders from the gap, and how hard it flings.
export const BOT_LEVELS = {
  easy: { waitMs: [1900, 3100], aim: 0.34, power: [0.45, 0.7] },
  normal: { waitMs: [1200, 2300], aim: 0.2, power: [0.6, 0.9] },
  hard: { waitMs: [700, 1400], aim: 0.07, power: [0.8, 1] },
}

/**
 * One bot shot for `side`, or null when it has no resting puck to fling.
 * Picks a resting puck on its own half and aims at the gap, off by up to the
 * level's `aim` (in court widths). Returns a fling without a sequence number;
 * the caller numbers it. `rng` is injectable so tests are deterministic.
 */
export function computeAI(state, side = 'O', difficulty = 'normal', rng = Math.random) {
  const cfg = BOT_LEVELS[difficulty] ?? BOT_LEVELS.normal
  const mine = []
  state.pucks.forEach((p, i) => {
    if (sideOf(p.y) !== side || i === state.held.X || i === state.held.O) return
    if (Math.abs(p.y - WALL_Y) < WALL_REACH + 0.01) return
    if (Math.abs(p.vx) + Math.abs(p.vy) < 0.1) mine.push(i)
  })
  if (!mine.length) return null
  const i = mine[Math.floor(rng() * mine.length)]
  const p = state.pucks[i]
  const tx = COURT_W / 2 + (rng() - 0.5) * 2 * cfg.aim
  const dx = tx - p.x
  const dy = WALL_Y - p.y
  const d = Math.hypot(dx, dy) || 1
  const sp = MAX_FLING_SPEED * (cfg.power[0] + rng() * (cfg.power[1] - cfg.power[0]))
  return { i, x: p.x, y: p.y, vx: (dx / d) * sp, vy: (dy / d) * sp }
}
