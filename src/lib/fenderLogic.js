// FENDER BENDER — pure simulation for a top-down road brawl, 2 to 4 cars.
// No DOM, no Firebase, no React. The online room runs one copy on the host and
// streams snapshots (encodeSnapshot / decodeSnapshot); the solo and one-phone
// pages run the same step against bots and pads.
//
// The road scrolls past. Cars move freely inside a fixed court (W × H). Traffic
// comes down four lanes; a hit costs a heart, a car with none left is wrecked,
// and crossing the road edge is out at once. Cars shove each other for free:
// the car driving in harder wins the bump and the other is knocked away, skids
// with little steering for a moment, then braces against a second knock. From
// SQUEEZE_AT the road closes in from both sides so a round always ends.
//
// Twists: HORN (a shove on a four-second recharge) and GHOST TRUCK (a car that
// is out comes back as a truck down the road after two seconds).
//
// Everything is in court pixels and seconds. `step(state, inputs, dt)` is pure:
// it never mutates `state`, and returns `{ state, events }`.

export const W = 360
export const H = 440
export const ROAD_L = 44
export const ROAD_R = 316
export const LANES = 4
export const LANE_W = (ROAD_R - ROAD_L) / LANES
export const CAR_R = 14

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4
export const HEARTS = 3

export const HORN_COOLDOWN = 4      // s between blasts
export const HORN_RADIUS = 96
const HORN_START = 0.75             // the horn begins three-quarters recharged: no blast in the first second
export const SQUEEZE_AT = 28        // s before the road starts closing in
export const SQUEEZE_RATE = 4       // px/s from each side
export const SQUEEZE_MAX = 100      // each side; leaves 72 px of road, so a round always ends
export const GHOST_DELAY = 2        // s from knock-out to the truck coming in
export const GHOST_SPEED_Y = 160
export const GHOST_SPEED_X = 150
export const INVULN = 1.1           // s of flashing safety after a traffic hit
export const HARD_BUMP = 140        // closing speed above which a shove is a 'hit', not a 'bump'

export const BOT_LEVELS = ['easy', 'normal', 'hard']

/** Vehicle sizes in court px; `v` scales the lane speed. */
export const KINDS = {
  car: { w: 26, h: 44, v: 1 },
  van: { w: 30, h: 58, v: 0.9 },
  bus: { w: 34, h: 96, v: 0.78 },
}
const KIND_LIST = ['car', 'van', 'bus']
export const GHOST_SIZE = { w: 32, h: 60 }

const ACC = 1500
const DAMP = 5.5
const SPEED_CAP = 480

/** Round wins needed: first to 3 with two cars, 5 with three, 7 with four. */
export const MATCH_TARGETS = { 2: 3, 3: 5, 4: 7 }
export const matchTarget = (n) => MATCH_TARGETS[n] ?? MATCH_TARGETS[2]

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const num = (v) => (Number.isFinite(v) ? v : 0)
const r0 = (n) => Math.round(n)
const r1 = (n) => Math.round(n * 10) / 10
const r2 = (n) => Math.round(n * 100) / 100

// mulberry32, advancing the seed held in the state so step stays pure.
function rand(s) {
  s.seed = (s.seed + 0x6D2B79F5) | 0
  let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function createState({ players = 2, seed = 1, horn = true, ghost = true } = {}) {
  const n = clamp(Math.round(players), MIN_PLAYERS, MAX_PLAYERS)
  const cars = []
  for (let i = 0; i < n; i++) {
    cars.push({
      x: ROAD_L + 36 + ((i + 0.5) * (ROAD_R - ROAD_L - 72)) / n,
      y: H * 0.66,
      vx: 0, vy: 0,
      hp: HEARTS, alive: true,
      inv: 0, stun: 0, brace: 0,
      cd: HORN_COOLDOWN * HORN_START,
      hornSeen: 0,
      outAt: -1, why: '', gained: 0,
    })
  }
  return {
    t: 0, n, seed: seed | 0, spawn: 0.9,
    opts: { horn: !!horn, ghost: !!ghost },
    cars, traffic: [], ghosts: Array(n).fill(null),
    roadL: ROAD_L, roadR: ROAD_R,
    over: false,
  }
}

function cloneState(s) {
  return {
    ...s,
    opts: { ...s.opts },
    cars: s.cars.map((c) => ({ ...c })),
    traffic: s.traffic.map((t) => ({ ...t })),
    ghosts: s.ghosts.map((g) => (g ? { ...g } : null)),
  }
}

/** How far each side of the road has closed in at time `t`. */
export function squeezeAt(t) {
  return t > SQUEEZE_AT ? Math.min((t - SQUEEZE_AT) * SQUEEZE_RATE, SQUEEZE_MAX) : 0
}

// A knocked car skids with little steering, then is braced against another
// knock for a moment, so one car cannot be chain-stunned.
function knock(c, secs) {
  if (c.brace > 0) return
  c.stun = secs
  c.brace = secs + 0.8
}

export function step(state, inputs, dt) {
  if (state.over) return { state, events: [] }
  const s = cloneState(state)
  const events = []
  const out = []                       // cars knocked out during this step
  s.t += dt

  const knockOut = (i, why) => {
    const c = s.cars[i]
    if (!c.alive) return
    c.alive = false
    c.outAt = s.t
    c.why = why
    out.push(i)
    events.push({ k: why, i })
  }

  // Circle (a car) against an axis-aligned rect (traffic or a ghost truck).
  // `slideOnly` is the car pinned on the bottom edge: slide it sideways.
  const hitRect = (i, r, slideOnly) => {
    const c = s.cars[i]
    const hx = r.w / 2, hy = r.h / 2
    const dx = c.x - r.x, dy = c.y - r.y
    const px = clamp(dx, -hx, hx), py = clamp(dy, -hy, hy)
    let nx = dx - px, ny = dy - py
    let d = Math.hypot(nx, ny)
    if (d >= CAR_R) return
    if (slideOnly) {
      c.x = r.x + (dx >= 0 ? 1 : -1) * (hx + CAR_R + 0.5)
      c.vx = (dx >= 0 ? 1 : -1) * 120
      return
    }
    if (d < 0.001) {
      const ox = hx - Math.abs(dx), oy = hy - Math.abs(dy)
      if (ox < oy) { nx = dx >= 0 ? 1 : -1; ny = 0; d = -ox } else { nx = 0; ny = dy >= 0 ? 1 : -1; d = -oy }
    } else { nx /= d; ny /= d }
    const pen = CAR_R - d
    c.x += nx * pen; c.y += ny * pen
    const vn = c.vx * nx + (c.vy - r.v) * ny
    if (vn < 0) { c.vx -= 1.6 * vn * nx; c.vy -= 1.6 * vn * ny }
    c.vx += nx * 70; c.vy += ny * 70
    if (c.inv <= 0) {
      c.hp -= 1
      c.inv = INVULN
      events.push({ k: 'crash', i })
      if (c.hp <= 0) knockOut(i, 'wreck')
    }
  }

  // Road edges: the squeeze closes both sides together.
  const sq = squeezeAt(s.t)
  s.roadL = ROAD_L + sq
  s.roadR = ROAD_R - sq

  // Traffic: always leaves at least one lane open at spawn.
  const d = Math.min(1, s.t / 40)
  s.spawn -= dt
  if (s.spawn <= 0) {
    s.spawn = 1.05 - 0.55 * d + rand(s) * 0.25
    const busy = []
    for (let l = 0; l < LANES; l++) busy[l] = s.traffic.some((t) => t.lane === l && t.y - t.h / 2 < 150)
    const free = []
    for (let l = 0; l < LANES; l++) {
      const cx = ROAD_L + (l + 0.5) * LANE_W
      if (!busy[l] && cx > s.roadL + 12 && cx < s.roadR - 12) free.push(l)
    }
    if (free.length > 1 || (free.length === 1 && busy.filter(Boolean).length < LANES - 1)) {
      const lane = free[Math.floor(rand(s) * free.length)]
      const q = rand(s)
      const kind = q < 0.5 ? 'car' : q < 0.82 ? 'van' : 'bus'
      const K = KINDS[kind]
      s.traffic.push({
        kind, lane,
        x: ROAD_L + (lane + 0.5) * LANE_W + (rand(s) - 0.5) * 14,
        y: -K.h, w: K.w, h: K.h,
        v: (115 + 80 * d) * K.v,
        tint: (rand(s) * 97) | 0,
      })
    }
  }
  for (const t of s.traffic) t.y += t.v * dt
  s.traffic = s.traffic.filter((t) => t.y < H + 90)

  // Ghost trucks: a car that is out comes back down the road after a pause.
  if (s.opts.ghost) {
    for (let i = 0; i < s.n; i++) {
      const c = s.cars[i]
      if (c.alive || s.t - c.outAt < GHOST_DELAY) continue
      let g = s.ghosts[i]
      if (!g) {
        g = { x: clamp(c.x, ROAD_L + 30, ROAD_R - 30), y: -70, w: GHOST_SIZE.w, h: GHOST_SIZE.h, v: GHOST_SPEED_Y, owner: i }
        s.ghosts[i] = g
      }
      g.x = clamp(g.x + clamp(num(inputs?.[i]?.x), -1, 1) * GHOST_SPEED_X * dt, s.roadL + 20, s.roadR - 20)
      g.y += g.v * dt
      if (g.y > H + 60) g.y = -90
    }
  }
  const rects = s.traffic.concat(s.ghosts.filter(Boolean))

  // Steering, speed, horn.
  for (let i = 0; i < s.n; i++) {
    const c = s.cars[i]
    if (!c.alive) continue
    const inp = inputs?.[i]
    const ix = clamp(num(inp?.x), -1, 1)
    const iy = clamp(num(inp?.y), -1, 1)
    const grip = c.stun > 0 ? 0.2 : 1
    const damp = c.stun > 0 ? 2.2 : DAMP
    c.vx += ix * ACC * grip * dt
    c.vy += iy * ACC * grip * dt
    const f = Math.exp(-damp * dt)
    c.vx *= f; c.vy *= f
    const sp = Math.hypot(c.vx, c.vy)
    if (sp > SPEED_CAP) { c.vx *= SPEED_CAP / sp; c.vy *= SPEED_CAP / sp }
    c.x += c.vx * dt; c.y += c.vy * dt
    c.inv = Math.max(0, c.inv - dt)
    c.cd = Math.max(0, c.cd - dt)
    c.stun = Math.max(0, c.stun - dt)
    c.brace = Math.max(0, c.brace - dt)
    // A horn press is either a boolean edge or a growing counter; a counter
    // value is applied once, so a resent packet cannot honk twice.
    let wantHorn = !!inp?.horn
    if (Number.isFinite(inp?.hq) && inp.hq !== c.hornSeen) { c.hornSeen = inp.hq; wantHorn = true }
    if (wantHorn && s.opts.horn && c.cd <= 0) {
      c.cd = HORN_COOLDOWN
      events.push({ k: 'horn', i })
      for (let j = 0; j < s.n; j++) {
        const o = s.cars[j]
        if (j === i || !o.alive) continue
        const ex = o.x - c.x, ey = o.y - c.y
        const dist = Math.hypot(ex, ey) || 1
        if (dist < HORN_RADIUS) {
          const p = 300 * (1 - 0.5 * dist / HORN_RADIUS)
          o.vx += (ex / dist) * p; o.vy += (ey / dist) * p
          knock(o, 0.22)
        }
      }
    }
  }

  // Car against car: free shoves. The car driving in harder wins the bump.
  for (let i = 0; i < s.n; i++) {
    for (let j = i + 1; j < s.n; j++) {
      const a = s.cars[i], b = s.cars[j]
      if (!a.alive || !b.alive) continue
      let nx = b.x - a.x, ny = b.y - a.y
      const dist = Math.hypot(nx, ny) || 0.01
      if (dist >= 2 * CAR_R) continue
      nx /= dist; ny /= dist
      const pen = (2 * CAR_R - dist) / 2
      a.x -= nx * pen; a.y -= ny * pen
      b.x += nx * pen; b.y += ny * pen
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
      if (vn < 0) {
        const closing = Math.min(420, -vn)
        const wa = Math.max(0, a.vx * nx + a.vy * ny)
        const wb = Math.max(0, -(b.vx * nx + b.vy * ny))
        const tot = wa + wb || 1
        const sb = wa / tot, sa = wb / tot          // each car's share of the drive: sb is how hard A pushes B
        const half = vn / 2
        a.vx += half * nx; a.vy += half * ny
        b.vx -= half * nx; b.vy -= half * ny
        const base = 60 + 0.6 * closing
        const ka = base * (0.25 + 0.75 * sa), kb = base * (0.25 + 0.75 * sb)
        a.vx -= ka * nx; a.vy -= ka * ny
        b.vx += kb * nx; b.vy += kb * ny
        if (sa > 0.55 && closing > 70) knock(a, 0.14 + 0.24 * sa)
        if (sb > 0.55 && closing > 70) knock(b, 0.14 + 0.24 * sb)
        events.push({ k: closing > HARD_BUMP ? 'hit' : 'bump', i: sb >= sa ? j : i, p: r0(closing) })
      }
    }
  }

  // Cars against traffic, the screen's top and bottom, the road edge.
  for (let i = 0; i < s.n; i++) {
    const c = s.cars[i]
    if (!c.alive) continue
    for (const r of rects) if (c.alive) hitRect(i, r, false)
    if (!c.alive) continue
    if (c.y < 22) { c.y = 22; if (c.vy < 0) c.vy = 0 }
    if (c.y > H - 22) {
      c.y = H - 22
      if (c.vy > 0) c.vy = 0
      for (const r of rects) hitRect(i, r, true)    // pinned under a bus: slide out sideways, never through
    }
    if (c.x < s.roadL + 3 || c.x > s.roadR - 3) knockOut(i, 'fell')
  }

  // Every car still rolling outlasted each car that went out this step. Cars
  // that go out in the same step score nothing off each other.
  if (out.length) for (const c of s.cars) if (c.alive) c.gained += out.length
  if (s.cars.filter((c) => c.alive).length <= 1) s.over = true
  return { state: s, events }
}

/**
 * The finished round: `winner` is a car index, 'draw' (the last cars went out
 * in the same step) or null while the round is still on. `gained[i]` is how
 * many rivals car i outlasted — the round's points: 1 for the winner with two
 * cars, 3/2/1/0 with four.
 */
export function getRoundResult(s) {
  if (!s.over) return null
  const alive = s.cars.findIndex((c) => c.alive)
  return { winner: alive >= 0 ? alive : 'draw', gained: s.cars.map((c) => c.gained) }
}

/** Online duel seats: car 0 is X (the host), car 1 is O. */
export const SEAT_OF = ['X', 'O']
export function getWinner(s) {
  const r = getRoundResult(s)
  if (!r) return null
  return r.winner === 'draw' ? 'draw' : SEAT_OF[r.winner]
}

/** Add a finished round's points to the running match totals. */
export function addRound(points, result) {
  return points.map((p, i) => p + (result.gained[i] || 0))
}

/** Index of the match winner, or null: needs the target and a clear lead. */
export function matchWinner(points) {
  const n = points.length
  const top = Math.max(...points)
  if (top < matchTarget(n)) return null
  const leaders = points.filter((p) => p === top).length
  return leaders === 1 ? points.indexOf(top) : null
}

// ─── Snapshot codec (host → guest over the data channel) ────────────────────

const WHY = ['', 'wreck', 'fell']

export function encodeSnapshot(s) {
  return {
    t: 's',
    st: r2(s.t),
    c: s.cars.flatMap((c) => [
      r1(c.x), r1(c.y), r0(c.vx), r0(c.vy), c.hp, c.alive ? 1 : 0,
      r2(c.inv), r2(c.stun), r2(c.cd), WHY.indexOf(c.why),
    ]),
    r: s.traffic.flatMap((t) => [KIND_LIST.indexOf(t.kind), r1(t.x), r1(t.y), r0(t.v), t.tint, t.lane]),
    g: s.ghosts.flatMap((g, i) => (g ? [i, r1(g.x), r1(g.y), r0(g.v)] : [])),
    l: r1(s.roadL),
    rr: r1(s.roadR),
  }
}

/** A state-shaped view the renderer can draw: fields the guest does not need are left out. */
export function decodeSnapshot(snap, n) {
  const cars = []
  for (let i = 0; i < n; i++) {
    const k = i * 10
    const why = WHY[snap.c?.[k + 9]] ?? ''
    cars.push({
      x: snap.c?.[k] ?? 0, y: snap.c?.[k + 1] ?? 0, vx: snap.c?.[k + 2] ?? 0, vy: snap.c?.[k + 3] ?? 0,
      hp: snap.c?.[k + 4] ?? 0, alive: snap.c?.[k + 5] === 1,
      inv: snap.c?.[k + 6] ?? 0, stun: snap.c?.[k + 7] ?? 0, cd: snap.c?.[k + 8] ?? 0, why,
      brace: 0, hornSeen: 0, outAt: -1, gained: 0,
    })
  }
  const traffic = []
  const r = snap.r || []
  for (let k = 0; k + 5 < r.length; k += 6) {
    const kind = KIND_LIST[r[k]] || 'car'
    const K = KINDS[kind]
    traffic.push({ kind, x: r[k + 1], y: r[k + 2], v: r[k + 3], tint: r[k + 4], lane: r[k + 5], w: K.w, h: K.h })
  }
  const ghosts = Array(n).fill(null)
  const g = snap.g || []
  for (let k = 0; k + 3 < g.length; k += 4) {
    if (g[k] >= 0 && g[k] < n) ghosts[g[k]] = { x: g[k + 1], y: g[k + 2], v: g[k + 3], w: GHOST_SIZE.w, h: GHOST_SIZE.h, owner: g[k] }
  }
  return {
    t: snap.st ?? 0, n, cars, traffic, ghosts,
    roadL: snap.l ?? ROAD_L, roadR: snap.rr ?? ROAD_R,
    opts: { horn: true, ghost: true }, over: cars.filter((c) => c.alive).length <= 1,
  }
}

/** Dead-reckon a decoded view forward by `age` seconds (capped) for smooth guest drawing. */
export function advanceView(view, age) {
  const a = clamp(age, 0, 0.1)
  if (a <= 0) return view
  return {
    ...view,
    cars: view.cars.map((c) => (c.alive
      ? { ...c, x: c.x + c.vx * a, y: clamp(c.y + c.vy * a, 22, H - 22) }
      : c)),
    traffic: view.traffic.map((t) => ({ ...t, y: t.y + t.v * a })),
    ghosts: view.ghosts.map((g) => (g ? { ...g, y: g.y + g.v * a } : g)),
  }
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Steering for car `i` at a bot level (0 easy, 1 normal, 2 hard): head for the
 * safest column that is clear of traffic, keep off the edge, and from NORMAL
 * ram rivals that sit near an edge and honk when one is close to going over.
 * A car that is out steers its ghost truck toward the nearest survivor.
 * Returns { x, y, horn }.
 */
export function computeAI(s, i, level = 1) {
  const c = s.cars[i]
  const out = { x: 0, y: 0, horn: false }
  const rects = s.traffic.concat(s.ghosts.filter(Boolean))
  if (!c.alive) {
    const g = s.ghosts[i]
    if (!g) return out
    let best = null
    for (const o of s.cars) if (o.alive && (!best || Math.abs(o.y - g.y) < Math.abs(best.y - g.y))) best = o
    if (best) out.x = clamp((best.x - g.x) / 30, -1, 1) * (level === 0 ? 0.4 : 0.8)
    return out
  }
  const look = [100, 140, 185][level] ?? 140
  let bx = c.x
  let bs = 1e9
  for (let x = s.roadL + 22; x <= s.roadR - 22; x += 10) {
    const home = s.roadL + ((i + 0.5) * (s.roadR - s.roadL)) / s.n
    let sc = Math.abs(x - c.x) * 0.3 + Math.abs(x - home) * 0.1
    const edge = Math.min(x - s.roadL, s.roadR - x)
    if (edge < 60) sc += (60 - edge) * 3
    for (let j = 0; j < s.n; j++) {
      const o = s.cars[j]
      // do not sit between a rival and the edge
      if (j !== i && o.alive && Math.abs(o.y - c.y) < 36 && Math.abs(x - o.x) < 34 && edge < Math.min(o.x - s.roadL, s.roadR - o.x)) sc += 22
    }
    for (const r of rects) {
      if (r.y + r.h / 2 < c.y - look || r.y - r.h / 2 > c.y + 34) continue
      const gap = Math.abs(x - r.x) - (r.w / 2 + CAR_R + 5)
      if (gap < 0) sc += 260 + (look - Math.max(0, c.y - r.y)) * 0.6
      else if (gap < 16) sc += 36
    }
    if (level > 0 && s.t > 4) {
      for (let j = 0; j < s.n; j++) {
        const o = s.cars[j]
        if (j === i || !o.alive) continue
        const oe = Math.min(o.x - s.roadL, s.roadR - o.x)
        if (oe < (level === 2 ? 70 : 50) && Math.abs(o.y - c.y) < 40 && Math.abs(x - o.x) < 26) sc -= level === 2 ? 34 : 14
      }
    }
    if (sc < bs) { bs = sc; bx = x }
  }
  out.x = clamp((bx - c.x) / 20, -1, 1)
  out.y = clamp((H * 0.62 - c.y) / 40, -1, 1)
  if (level === 0) out.x = clamp(out.x * 0.7 + Math.sin(s.t * 2.3 + i * 2) * 0.45, -1, 1)
  if (s.opts.horn && c.cd <= 0 && level > 0 && s.t > 4) {
    for (let j = 0; j < s.n; j++) {
      const o = s.cars[j]
      if (j === i || !o.alive) continue
      const dist = Math.hypot(o.x - c.x, o.y - c.y)
      const oe = Math.min(o.x - s.roadL, s.roadR - o.x)
      const me = Math.min(c.x - s.roadL, s.roadR - c.x)
      if (dist < 50 && oe < me && oe < (level === 2 ? 60 : 44)) out.horn = true
    }
  }
  return out
}
