// @ts-check
// minigolfPhysics.js — deterministic ball sim for Minigolf.
//
// DETERMINISM CONTRACT (same discipline as artilleryLogic.js): online rooms
// store only each stroke's integer inputs { a, p, k } and every client replays
// them, so this module must reach bit-identical results on every engine:
//   * fixed timestep DT = 1/120, plain + − × ÷ on doubles, Math.sqrt (IEEE
//     correctly rounded) and Math.floor/min/max/abs only
//   * no Math.sin/cos/atan2/hypot/pow — blade and slider motion use detMath
//   * inputs are integers: angle a in 1/65536 turns, power p per-mille,
//     k = the obstacle clock tick (1/120 s) at release — so moving obstacles
//     replay exactly where the shooter saw them
// The shooter's own client simulates the quantized shot too (quantizeShot),
// never its raw float aim.

import { detSin, detCos, TWO_PI } from './detMath'

export const DT = 1 / 120
export const BALL_R = 6
export const CUP_R = 10
export const MAX_SPEED = 620          // u/s at 100% power
export const MAX_STEPS = 1440         // 12 s hard cap per stroke
const ROLL_DECEL = 55                 // u/s² rolling friction
const DRAG = 0.9                      // 1/s exponential drag
const SAND_DECEL = 5                  // × friction in sand
const SAND_DRAG = 3                   // × drag in sand
const WALL_E = 0.72                   // wall restitution
const BLADE_E = 0.6
const SLIDER_E = 0.8
const BUMPER_KICK = 120
const BUMPER_MAX = 700
const CUP_CAPTURE_SPEED = 330         // faster balls lip out
const CUP_PULL = 420                  // gentle pull near the cup, slow balls only
const CUP_PULL_SPEED = 160
const STOP_SPEED = 4
const PORTAL_R = 12
const PORTAL_COOLDOWN = 40            // steps
// Lip-out deflection: rotate 0.5 rad and keep 85% speed. Literal doubles so no
// transcendental is evaluated at runtime.
const LIP_COS = 0.8775825618903728
const LIP_SIN = 0.479425538604203

const NO_MOVERS = []

export const ANGLE_STEPS = 65536
export const POWER_STEPS = 1000

/**
 * Quantize a float aim to the integers that are stored and replayed.
 * @param {number} angle radians (any range)
 * @param {number} power 0..1
 * @returns {{ a: number, p: number }}
 */
export function quantizeShot(angle, power) {
  let a = Math.round((angle / TWO_PI) * ANGLE_STEPS) % ANGLE_STEPS
  if (a < 0) a += ANGLE_STEPS
  const p = Math.max(1, Math.min(POWER_STEPS, Math.round(power * POWER_STEPS)))
  return { a, p }
}

/** Launch velocity of a quantized shot. @param {{ a: number, p: number }} shot */
export function shotVelocity(shot) {
  const rad = (shot.a * TWO_PI) / ANGLE_STEPS
  const speed = (shot.p * MAX_SPEED) / POWER_STEPS
  return { vx: detCos(rad) * speed, vy: detSin(rad) * speed }
}

/** @param {number[][]} poly */
function polySegs(poly) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    out.push([a[0], a[1], b[0], b[1]])
  }
  return out
}

/** @param {number} x @param {number} y @param {number[][]} poly */
export function pointInPoly(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

/** @param {number} x @param {number} y @param {number[]} r */
export const inRect = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]

const compiled = new WeakMap()
/** Static wall segments of a hole (bounds + blocks), cached. @param {any} hole */
export function holeSegments(hole) {
  let segs = compiled.get(hole)
  if (!segs) {
    segs = []
    for (const p of hole.bounds) segs.push(...polySegs(p))
    for (const p of hole.blocks || []) segs.push(...polySegs(p))
    compiled.set(hole, segs)
  }
  return segs
}

/**
 * Geometry of a moving obstacle at time t (seconds on the hole clock).
 * @param {any} m
 * @param {number} t
 * @returns {{ seg: number[], e: number, vx: number, vy: number, mill: any }[]}
 */
export function moverGeometry(m, t) {
  if (m.t === 'mill') {
    const out = []
    for (let i = 0; i < m.n; i++) {
      const a = m.w * t + (i * TWO_PI) / m.n
      out.push({ seg: [m.x, m.y, m.x + detCos(a) * m.len, m.y + detSin(a) * m.len], e: BLADE_E, vx: 0, vy: 0, mill: m })
    }
    return out
  }
  const phase = TWO_PI * (t / m.period + m.ph)
  const u = 0.5 - 0.5 * detCos(phase)
  const x = m.x0 + (m.x1 - m.x0) * u
  const vx = (m.x1 - m.x0) * 0.5 * detSin(phase) * TWO_PI / m.period
  const poly = [[x, m.y], [x + m.w, m.y], [x + m.w, m.y + m.h], [x, m.y + m.h]]
  return polySegs(poly).map(seg => ({ seg, e: SLIDER_E, vx, vy: 0, mill: null }))
}

// Push the ball out of a segment and reflect it (in the obstacle's moving
// frame). Returns the normal impact speed, 0 when there was no contact.
function collideSeg(b, seg, e, svx, svy, mill) {
  const x1 = seg[0], y1 = seg[1], dx = seg[2] - x1, dy = seg[3] - y1
  const len2 = dx * dx + dy * dy
  let u = len2 ? ((b.x - x1) * dx + (b.y - y1) * dy) / len2 : 0
  u = u < 0 ? 0 : u > 1 ? 1 : u
  const px = x1 + dx * u, py = y1 + dy * u
  let nx = b.x - px, ny = b.y - py
  const d2 = nx * nx + ny * ny
  const rad = mill ? BALL_R + 3 : BALL_R
  if (d2 >= rad * rad) return 0
  let d = Math.sqrt(d2)
  if (d < 1e-9) { nx = -dy; ny = dx; d = Math.sqrt(nx * nx + ny * ny) || 1 }
  nx /= d; ny /= d
  b.x = px + nx * rad; b.y = py + ny * rad
  if (mill) { svx = -mill.w * (py - mill.y); svy = mill.w * (px - mill.x) }
  const vn = (b.vx - svx) * nx + (b.vy - svy) * ny
  if (vn >= 0) return 0
  b.vx -= (1 + e) * vn * nx
  b.vy -= (1 + e) * vn * ny
  return -vn
}

/**
 * Simulate one stroke.
 * @param {any} hole  a HOLES entry
 * @param {{ x: number, y: number }} from ball rest position
 * @param {{ a: number, p: number, k: number }} shot quantized inputs
 * @param {{ path?: boolean }} [opts] record the per-step path (for animation)
 * @returns {{ x: number, y: number, holed: boolean, water: boolean, oob: boolean,
 *   steps: number, path: number[] | null, events: [number, string, number][] }}
 */
export function simulateShot(hole, from, shot, opts = {}) {
  const segs = holeSegments(hole)
  const zones = hole.zones || [], bumpers = hole.bumpers || [], movers = hole.movers || [], portals = hole.portals || []
  const v = shotVelocity(shot)
  const b = { x: from.x, y: from.y, vx: v.vx, vy: v.vy }
  const path = opts.path ? [b.x, b.y] : null
  /** @type {[number, string, number][]} */
  const events = []
  const k0 = shot.k || 0
  let holed = false, water = false, lipped = false, inSand = false, portalCd = 0
  let steps = 0
  for (let i = 1; i <= MAX_STEPS; i++) {
    steps = i
    const t = (k0 + i) / 120
    let dec = ROLL_DECEL, drag = DRAG, ax = 0, ay = 0, onSlope = false, sandNow = false
    for (const z of zones) {
      if (!inRect(b.x, b.y, z.r)) continue
      if (z.t === 'sand') { dec *= SAND_DECEL; drag *= SAND_DRAG; sandNow = true }
      else if (z.t === 'slope') { ax += z.ax || 0; ay += z.ay || 0; onSlope = true }
      else if (z.t === 'water') water = true
    }
    if (sandNow && !inSand) events.push([i, 'sand', 0])
    inSand = sandNow
    if (water) { events.push([i, 'water', 0]); break }

    b.vx += ax * DT; b.vy += ay * DT
    let sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
    if (sp > 0) {
      const ns = Math.max(0, sp - dec * DT) * (1 - drag * DT)
      b.vx *= ns / sp; b.vy *= ns / sp; sp = ns
    }
    let cdx = hole.cup[0] - b.x, cdy = hole.cup[1] - b.y
    let cd = Math.sqrt(cdx * cdx + cdy * cdy)
    if (cd < CUP_R + 8 && cd > 0.01 && sp < CUP_PULL_SPEED) {
      b.vx += (cdx / cd) * CUP_PULL * DT; b.vy += (cdy / cd) * CUP_PULL * DT
    }
    b.x += b.vx * DT; b.y += b.vy * DT

    const moverGeoms = movers.length ? movers.map(m => moverGeometry(m, t)) : NO_MOVERS
    for (let pass = 0; pass < 3; pass++) {
      let hit = 0
      for (const geoms of moverGeoms) {
        for (const g of geoms) {
          const imp = collideSeg(b, g.seg, g.e, g.vx, g.vy, g.mill)
          if (imp > 20) events.push([i, 'mover', imp])
          hit += imp
        }
      }
      for (const bp of bumpers) {
        let nx = b.x - bp[0], ny = b.y - bp[1]
        const d = Math.sqrt(nx * nx + ny * ny)
        const rr = bp[2] + BALL_R
        if (d >= rr || d === 0) continue
        nx /= d; ny /= d
        b.x = bp[0] + nx * rr; b.y = bp[1] + ny * rr
        const vn = b.vx * nx + b.vy * ny
        if (vn >= 0) continue
        b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny
        b.vx += nx * BUMPER_KICK; b.vy += ny * BUMPER_KICK
        const s2 = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
        if (s2 > BUMPER_MAX) { b.vx *= BUMPER_MAX / s2; b.vy *= BUMPER_MAX / s2 }
        events.push([i, 'bump', -vn])
        hit += 1
      }
      // Static walls last, so a slider squeezing the ball against a wall can
      // never shove it through.
      for (const s of segs) {
        const imp = collideSeg(b, s, WALL_E, 0, 0, null)
        if (imp > 40) events.push([i, 'wall', imp])
        hit += imp
      }
      if (!hit) break
    }

    if (portalCd > 0) portalCd--
    for (const pt of portals) {
      const px = b.x - pt.a[0], py = b.y - pt.a[1]
      if (portalCd === 0 && px * px + py * py < PORTAL_R * PORTAL_R) {
        b.x = pt.b[0]; b.y = pt.b[1]; portalCd = PORTAL_COOLDOWN
        events.push([i, 'portal', 0])
      }
    }

    sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
    cdx = hole.cup[0] - b.x; cdy = hole.cup[1] - b.y
    cd = Math.sqrt(cdx * cdx + cdy * cdy)
    if (cd < CUP_R - 3 && sp < CUP_CAPTURE_SPEED) {
      holed = true
      b.x = hole.cup[0]; b.y = hole.cup[1]
      if (path) path.push(b.x, b.y)
      events.push([i, 'sink', 0])
      break
    }
    if (cd < CUP_R && sp >= CUP_CAPTURE_SPEED && !lipped) {
      lipped = true
      const nvx = (b.vx * LIP_COS - b.vy * LIP_SIN) * 0.85
      const nvy = (b.vx * LIP_SIN + b.vy * LIP_COS) * 0.85
      b.vx = nvx; b.vy = nvy
      events.push([i, 'lip', 0])
    }
    if (cd > CUP_R + 4) lipped = false

    // Escaped every wall (a sim edge case): reset to the shot's start, free.
    if (!hole.bounds.some(p => pointInPoly(b.x, b.y, p))) {
      events.push([i, 'oob', 0])
      return { x: from.x, y: from.y, holed: false, water: false, oob: true, steps: i, path, events }
    }
    if (path) path.push(b.x, b.y)
    if (!onSlope && sp < STOP_SPEED) break
  }
  if (water) return { x: from.x, y: from.y, holed: false, water: true, oob: false, steps, path, events }
  return { x: b.x, y: b.y, holed, water: false, oob: false, steps, path, events }
}
