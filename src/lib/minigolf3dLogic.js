// @ts-check
// minigolf3dLogic.js — pure geometry for the 3D Minigolf view (no DOM, no three).
//
// The 3D view is a renderer swap: the sim stays the 2D one in minigolfPhysics.js
// and every position below is a course coordinate (360×600 for the front nine)
// mapped into world space. Slope-zone heights are cosmetic — the physics
// already applies a slope's push; terrain hills and jump ramps are drawn at the
// heights the physics uses. Nothing here may feed back into a replay.
//
// World space: x right, y up, z toward the tee (course y). One world unit is 40
// course units. Cameras are plain { pos, look, up } poses so they can be solved,
// eased and tested without a GL context.

import { COURSE_W, COURSE_H } from './minigolfCourses'
import { inRect, terrainHeight, rampHeight, aimRayLength } from './minigolfPhysics'
import { distanceField } from './minigolfBot'

export const K = 1 / 40
export const RISE = 1.1
export const FOV_DEG = 36
const TEE_PITCH = 0.98
// Where a hole may sit inside the view: the HUD lives outside the canvas, so the
// bands only keep a small margin.
const FIT_Y = 0.9
const FIT_X = 0.94

/** @typedef {{ x: number, y: number, z: number }} Vec3 */
/** @typedef {{ pos: Vec3, look: Vec3, up: Vec3 }} CameraPose */

/** @param {number} x @param {number} y */
export const courseToWorld = (x, y) => ({ x: (x - COURSE_W / 2) * K, z: (y - COURSE_H / 2) * K })

/** @param {number} X @param {number} Z */
export const worldToCourse = (X, Z) => ({ x: X / K + COURSE_W / 2, y: Z / K + COURSE_H / 2 })

const smooth = (/** @type {number} */ t) => t * t * (3 - 2 * t)

/**
 * Surface height at a course point: slope zones become ramps that ease in and
 * out (cosmetic), sideways slopes a camber across their band; terrain hills
 * and jump ramps add their real heights.
 * @param {{ zones?: any[], terrain?: any[] }} hole @param {number} x @param {number} y
 */
export function heightAt(hole, x, y) {
  let h = 0
  if (hole.terrain) h += terrainHeight(hole, x, y)
  for (const z of hole.zones || []) if (z.t === 'jump' && inRect(x, y, z.r)) h += rampHeight(z, x, y)
  for (const z of hole.zones || []) {
    if (z.t !== 'slope') continue
    const [rx, ry, rw, rh] = z.r
    if (x < rx - 40 || x > rx + rw + 40) continue
    if (z.ay > 0) h += y <= ry ? RISE : y >= ry + rh ? 0 : RISE * smooth((ry + rh - y) / rh)
    else if (z.ay < 0) h += y >= ry + rh ? RISE : y <= ry ? 0 : RISE * smooth((y - ry) / rh)
    else if (y >= ry - 4 && y <= ry + rh + 4) {
      const u = Math.min(1, Math.max(0, (x - rx) / rw))
      h += RISE * 0.6 * smooth(z.ax > 0 ? 1 - u : u)
    }
  }
  return h
}

/** The sand / water / slope zone covering a point, if any. @param {{ zones?: any[] }} hole */
export const zoneAt = (hole, /** @type {number} */ x, /** @type {number} */ y) =>
  (hole.zones || []).find(z => inRect(x, y, z.r))?.t

/** How far a zone sinks the turf below the fairway. @param {string | undefined} type */
export const zoneDip = (type) => (type === 'water' ? -0.16 : type === 'sand' ? -0.04 : 0)

/**
 * Where a camera ray meets the horizontal plane y = planeY, as course
 * coordinates. Null when the ray points away from the plane.
 * @param {Vec3} origin @param {Vec3} dir @param {number} [planeY]
 */
export function rayToCourse(origin, dir, planeY = 0) {
  if (Math.abs(dir.y) < 1e-9) return null
  const s = (planeY - origin.y) / dir.y
  if (s <= 0) return null
  return worldToCourse(origin.x + dir.x * s, origin.z + dir.z * s)
}

// ── small vector helpers ────────────────────────────────────────────────────
const sub = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (/** @type {Vec3} */ a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l } }

/**
 * Perspective projection of world points to normalised device coordinates for a
 * pose — the same maths a three PerspectiveCamera does, kept here so the camera
 * fit can be solved and tested without a renderer. Null when behind the camera.
 * @param {CameraPose} pose @param {number} fovDeg vertical field of view @param {number} aspect
 */
export function makeProjector(pose, fovDeg, aspect) {
  const f = norm(sub(pose.look, pose.pos))
  const right = norm(cross(f, pose.up))
  const u = cross(right, f)
  const tan = Math.tan((fovDeg * Math.PI) / 360)
  return (/** @type {Vec3} */ p) => {
    const v = sub(p, pose.pos)
    const zc = dot(v, f)
    if (zc < 0.05) return null
    return { x: dot(v, right) / (zc * tan * aspect), y: dot(v, u) / (zc * tan) }
  }
}

/**
 * The tee camera: behind the tee at a fixed pitch, with distance and aim point
 * solved so the whole hole fits the view at any aspect. In landscape the camera
 * rolls so the hole's long axis runs across the screen, matching the 2D view
 * (cup on the left, tee on the right).
 * @param {{ bounds: number[][][] }} hole @param {{ aspect: number, landscape?: boolean }} opts
 * @returns {CameraPose}
 */
export function solveTeeCamera(hole, { aspect, landscape = false }) {
  const pts = hole.bounds.flat()
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs) - 16, x1 = Math.max(...xs) + 16
  const y0 = Math.min(...ys) - 16, y1 = Math.max(...ys) + 16
  /** @type {Vec3[]} */
  const corners = []
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const h of [0, 1.3]) {
    const w = courseToWorld(x, y)
    corners.push({ x: w.x, y: h, z: w.z })
  }
  const mid = courseToWorld((x0 + x1) / 2, (y0 + y1) / 2)
  const up = landscape ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  // Ground directions of screen-up and screen-right under that roll.
  const gu = landscape ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: -1 }
  const gr = landscape ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  const sp = Math.sin(TEE_PITCH), cp = Math.cos(TEE_PITCH)

  let tx = mid.x, tz = mid.z
  /** @param {number} dist */
  const place = (dist) => {
    /** @type {CameraPose} */
    const pose = { pos: { x: tx, y: sp * dist, z: tz + cp * dist }, look: { x: tx, y: 0, z: tz }, up }
    const project = makeProjector(pose, FOV_DEG, aspect)
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
    for (const c of corners) {
      const v = project(c)
      if (!v) return { pose, w: 1e9, h: 1e9, cx: 0, cy: 0 }
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x)
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y)
    }
    return { pose, w: maxX - minX, h: maxY - minY, cx: (maxX + minX) / 2, cy: (maxY + minY) / 2 }
  }
  /** Re-centre the look point so the hole's projected box is centred. @param {number} dist */
  const centre = (dist) => {
    for (let k = 0; k < 8; k++) {
      const r = place(dist)
      tx += (gu.x * r.cy + gr.x * r.cx) * dist * 0.3
      tz += (gu.z * r.cy + gr.z * r.cx) * dist * 0.3
    }
    return place(dist)
  }

  let lo = 3, hi = 80
  for (let it = 0; it < 24; it++) {
    const dist = (lo + hi) / 2
    const r = centre(dist)
    if (r.h > 2 * FIT_Y || r.w > 2 * FIT_X) lo = dist; else hi = dist
  }
  return centre(hi).pose
}

/**
 * Follow camera while a stroke plays: behind the ball along its heading.
 * @param {{ zones?: any[] }} hole @param {number} x @param {number} y ball, course coords
 * @param {number} vx @param {number} vy heading, course units (any scale)
 * @returns {CameraPose}
 */
export function followCamera(hole, x, y, vx, vy) {
  const sp = Math.hypot(vx, vy) || 1
  const ux = vx / sp, uy = vy / sp
  const b = courseToWorld(x, y), by = heightAt(hole, x, y)
  return {
    pos: { x: b.x - ux * 5.4, y: by + 4.4, z: b.z - uy * 5.4 },
    look: { x: b.x + ux * 2.2, y: by, z: b.z + uy * 2.2 },
    up: { x: 0, y: 1, z: 0 },
  }
}

/** Close-up on the cup for the sink. @param {{ cup: number[], zones?: any[] }} hole @returns {CameraPose} */
export function sinkCamera(hole) {
  const [cx, cy] = hole.cup
  const c = courseToWorld(cx, cy), ch = heightAt(hole, cx, cy)
  return {
    pos: { x: c.x + 1.5, y: ch + 1.6, z: c.z + 2.4 },
    look: { x: c.x, y: ch + 0.1, z: c.z },
    up: { x: 0, y: 1, z: 0 },
  }
}

/**
 * One easing step between two poses (exponential smoothing; `alpha` in 0..1).
 * @param {CameraPose} cur @param {CameraPose} target @param {number} alpha
 * @returns {CameraPose}
 */
export function easePose(cur, target, alpha) {
  const lerp = (/** @type {Vec3} */ a, /** @type {Vec3} */ b) => ({ x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha, z: a.z + (b.z - a.z) * alpha })
  return { pos: lerp(cur.pos, target.pos), look: lerp(cur.look, target.look), up: norm(lerp(cur.up, target.up)) }
}

/** True once two poses are visually the same. @param {CameraPose} a @param {CameraPose} b */
export function poseSettled(a, b, eps = 0.004) {
  return ['pos', 'look', 'up'].every(k => {
    const p = /** @type {Vec3} */ (/** @type {any} */ (a)[k]), q = /** @type {Vec3} */ (/** @type {any} */ (b)[k])
    return Math.abs(p.x - q.x) < eps && Math.abs(p.y - q.y) < eps && Math.abs(p.z - q.z) < eps
  })
}

/** Frame-rate independent smoothing factor. @param {number} dtSec @param {number} rate */
export const easeAlpha = (dtSec, rate) => 1 - Math.exp(-Math.max(0, dtSec) * rate)

/**
 * Which camera rig to use. A hole sunk holds the close-up; a stroke in flight
 * follows the ball; everything else is the tee overview.
 * @param {{ playing: boolean, sunk: boolean }} s @returns {'tee' | 'follow' | 'sink'}
 */
export function cameraMode({ playing, sunk }) {
  return sunk ? 'sink' : playing ? 'follow' : 'tee'
}

/** Heading from a stroke path (flat [x0,y0,x1,y1,…]) at step i, over the last few steps. @param {ArrayLike<number>} path */
export function pathHeading(path, i, back = 6) {
  const k = Math.max(0, i - back)
  return { vx: path[i * 2] - path[k * 2], vy: path[i * 2 + 1] - path[k * 2 + 1] }
}

/** Reach readout in metres (one world unit) for the aim line. @param {number} length course units */
export const reachMetres = (length) => length * K

// ── ball camera (holes with `ballCam`) ──────────────────────────────────────
// The play camera sits behind the ball looking along the aim; while a stroke
// plays it chases the ball along its heading. Course angles: 0 = +x, π/2 = +y
// (toward the tee side), the same convention as quantizeShot.

export const BALL_FOV_DEG = 58
const BALL_BACK = 2.2, BALL_UP = 1.15, BALL_AHEAD = 3.8
const RAIL_CLEAR = 0.38 // metres: rail height (0.3) plus a margin
const MAX_UP = 3.2

/**
 * Behind-the-ball pose for aiming.
 * @param {any} hole @param {number} x @param {number} y ball, course coords
 * @param {number} angle aim, radians @param {number} [z] air height, course units
 * @returns {CameraPose}
 */
export function ballCamera(hole, x, y, angle, z = 0) {
  return behindPose(hole, x, y, angle, z, BALL_BACK, BALL_UP, BALL_AHEAD)
}

/**
 * Free distance (metres) behind the ball before a wall or block, capped at `want`.
 * @param {any} hole @param {number} x @param {number} y @param {number} a @param {number} want
 */
export function clearBehind(hole, x, y, a, want) {
  return Math.min(want, aimRayLength(hole, x, y, -Math.cos(a), -Math.sin(a), want / K) * K)
}

/**
 * Chase pose while the ball rolls: further back and higher when fast or airborne.
 * @param {any} hole @param {number} x @param {number} y @param {number} heading radians
 * @param {number} speed course units/s @param {number} [z] air height, course units
 * @returns {CameraPose}
 */
export function chaseCamera(hole, x, y, heading, speed, z = 0) {
  const back = 2.6 + Math.min(1.2, speed / 500)
  const up = 1.25 + Math.min(0.8, speed / 600) + z * K * 0.5
  return behindPose(hole, x, y, heading, z, back, up, 2.4)
}

/** @param {any} hole @param {number} x @param {number} y @param {number} a @param {number} z @param {number} want @param {number} up @param {number} ahead */
function behindPose(hole, x, y, a, z, back, up, ahead) {
  // A rail right behind the ball would cut the sight line: rise until the line
  // from the camera to the ball clears a rail at that distance (with a margin).
  // Past MAX_UP, come in closer instead (a steep look down at a ball on the rail).
  const free = Math.max(0.02, clearBehind(hole, x, y, a, back))
  if (free < back) {
    const need = (RAIL_CLEAR * back) / free
    if (need <= MAX_UP) up = Math.max(up, need)
    else { up = MAX_UP; back = Math.max(0.5, (MAX_UP * free) / RAIL_CLEAR) }
  }
  const w = courseToWorld(x, y), h = heightAt(hole, x, y) + z * K
  const dx = Math.cos(a), dz = Math.sin(a)
  return {
    pos: { x: w.x - dx * back, y: h + up, z: w.z - dz * back },
    look: { x: w.x + dx * ahead, y: h + 0.05, z: w.z + dz * ahead },
    up: { x: 0, y: 1, z: 0 },
  }
}

/**
 * Default aim for the ball camera: the direction that gets furthest along the
 * route to the cup (the bot's distance field), looking down the corridor as far
 * as the walls allow (up to 200 units). Cosmetic: it only sets where the camera
 * starts; the player can turn it.
 * @param {any} hole @param {number} x @param {number} y
 */
export function routeAngle(hole, x, y) {
  const { dist, cellOf } = distanceField(hole)
  let best = { d: dist[cellOf(x, y)], a: Math.atan2(hole.cup[1] - y, hole.cup[0] - x) }
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a)
    const reach = aimRayLength(hole, x, y, dx, dy, 200)
    if (reach < 12) continue
    const d = dist[cellOf(x + dx * reach * 0.9, y + dy * reach * 0.9)]
    if (d < best.d - 0.5) best = { d, a }
  }
  return best.a
}

/**
 * Camera rig for a ball-camera hole.
 * @param {{ playing: boolean, sunk: boolean, map: boolean }} s
 * @returns {'map' | 'sink' | 'chase' | 'ball'}
 */
export function ballCameraMode({ playing, sunk, map }) {
  return map ? 'map' : sunk ? 'sink' : playing ? 'chase' : 'ball'
}
