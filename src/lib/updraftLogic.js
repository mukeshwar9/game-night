// @ts-check
// UPDRAFT — a vertical auto-jumping climber raced (or climbed together) on
// one seeded tower. Pure: no DOM, no Firebase, no React.
//
// Both seats generate the identical tower from `updraft.seed`, and each
// phone simulates ONLY its own hopper (zero input latency). Firebase carries
// progress for the rival's ghost and height rail, hazards (CHAOS mode) and,
// in co-op, the gate keys and shared lives — the Arrows race model. The two
// phones never need bit-identical physics: only the tower has to match.
//
// World units: x ∈ [0, WORLD_W) left→right, y is height (up is positive),
// 10 units = 1 metre. A hopper's (x, y) is its bottom-left corner; a
// platform's y is its top surface.

export const WORLD_W = 360
export const VIEW_H = 640
export const HOPPER_W = 28
export const HOPPER_H = 28
export const PLAT_W = 64
export const PLAT_H = 10
export const UNITS_PER_M = 10

export const GRAVITY = 1500
export const JUMP_V = 760
export const SPRING_V = 1180
export const MOVE_SPEED = 300
/** Fixed simulation step: jump arcs never depend on the display's refresh rate. */
export const STEP_DT = 1 / 120
/** Highest a normal bounce can lift the hopper (v² / 2g ≈ 192 units). */
export const MAX_JUMP_H = (JUMP_V * JUMP_V) / (2 * GRAVITY)
/** Widest gap the guaranteed platform chain ever leaves. */
export const MAX_CHAIN_GAP = 160

// Room-level config lives in updraftConfig.js (the registry and matchRules
// import it without pulling the sim into the entry bundle).
export {
  COOP_LIVES, MATCH_TARGET, UPDRAFT_MODES, UPDRAFT_MODE_IDS, getUpdraftMode, randomUpdraftSeed, updraftFreshState,
} from './updraftConfig'

// Versus (Ghost Race)
export const SUMMIT_M = 400
export const SUMMIT_Y = SUMMIT_M * UNITS_PER_M
export const ROUND_LIMIT_MS = 120_000
export const COUNTDOWN_MS = 3000

// CHAOS-mode hazards: a grabbed pickup sends one to the rival.
export const HAZARD_KINDS = /** @type {const} */ (['crumble', 'gust', 'fog'])
export const HAZARD_TELEGRAPH_MS = 1000
export const GUST_MS = 2000
export const FOG_MS = 3000
export const CRUMBLE_COUNT = 3
export const GUST_DRIFT = 140
export const PICKUP_EVERY = 600
export const PICKUP_SIZE = 20

// Co-op (Twin Towers)
export const COOP_GOAL_M = 300
export const COOP_GOAL_Y = COOP_GOAL_M * UNITS_PER_M
export const GATE_EVERY = 500
export const COOP_LIMIT_MS = 180_000

// Input mapping
const DRAG_GAIN = 36        // world units of finger offset for full speed
const DRAG_DEADZONE = 3
const TILT_FULL_DEG = 22    // phone roll (gamma) for full speed
const TILT_DEADZONE_DEG = 3

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/** Small, fast, deterministic PRNG (mulberry32): same seed → same tower on both phones. */
export function seededRng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @typedef {{ id: number, x: number, y: number, kind: 'normal'|'moving'|'crumble'|'spring',
 *   chain: boolean, amp?: number, speed?: number, phase?: number }} Platform
 * @typedef {{ id: number, x: number, y: number }} Pickup
 * @typedef {{ gate: number, x: number, y: number }} GateKey
 * @typedef {{ seed: number, top: number, platforms: Platform[], pickups: Pickup[],
 *   gates: number[], keys: GateKey[] }} Tower
 */

/**
 * Deterministically build the tower for `seed`, up to `top` (plus a screen of
 * headroom). A chain of solid platforms (normal / moving / spring) never
 * leaves a gap wider than MAX_CHAIN_GAP, so every tower is climbable; crumble
 * platforms are decoys between chain steps and never the only way up. Gaps
 * widen and moving platforms get likelier with height.
 * `coop: true` adds a gate every GATE_EVERY units below the goal, each with
 * its key just under it. Pickups come from a separate stream so they never
 * change the platform layout.
 * @param {number} seed
 * @param {{ top?: number, coop?: boolean }} [opts]
 * @returns {Tower}
 */
export function generateTower(seed, { top = SUMMIT_Y, coop = false } = {}) {
  const rand = seededRng(seed)
  /** @type {Platform[]} */
  const platforms = [{ id: 0, x: (WORLD_W - PLAT_W) / 2, y: 0, kind: 'normal', chain: true }]
  let y = 0
  let id = 1
  const limit = top + VIEW_H
  while (y < limit) {
    const d = clamp(y / top, 0, 1)
    const gap = Math.min(MAX_CHAIN_GAP, 60 + d * 70 + rand() * 30)
    const prevY = y
    y += gap
    const roll = rand()
    const x = rand() * (WORLD_W - PLAT_W)
    /** @type {Platform} */
    const p = { id: id++, x, y: Math.round(y), kind: 'normal', chain: true }
    if (roll < 0.07) p.kind = 'spring'
    else if (roll < 0.07 + 0.1 + 0.25 * d) {
      p.kind = 'moving'
      p.amp = 30 + rand() * 50
      p.speed = 1 + rand() * 1.2 + d
      p.phase = rand() * Math.PI * 2
      p.x = clamp(x, p.amp, WORLD_W - PLAT_W - p.amp)
    }
    platforms.push(p)
    if (rand() < 0.3 + 0.3 * d) {
      platforms.push({ id: id++, x: rand() * (WORLD_W - PLAT_W), y: Math.round(prevY + gap * (0.35 + rand() * 0.3)), kind: 'crumble', chain: false })
    }
  }
  platforms.sort((a, b) => a.y - b.y || a.id - b.id)

  const chain = platforms.filter(p => p.chain && p.kind !== 'moving')
  const prand = seededRng((seed ^ 0x9e3779b9) >>> 0)
  /** @type {Pickup[]} */
  const pickups = []
  for (let h = PICKUP_EVERY, pid = 0; h < top; h += PICKUP_EVERY) {
    const band = chain.filter(p => p.y >= h - 150 && p.y < h)
    if (!band.length) continue
    const host = band[Math.floor(prand() * band.length)]
    pickups.push({ id: pid++, x: host.x + PLAT_W / 2, y: host.y + 44 })
  }

  /** @type {number[]} */
  const gates = []
  /** @type {GateKey[]} */
  const keys = []
  if (coop) {
    for (let g = 1; g * GATE_EVERY < top; g++) {
      const gy = g * GATE_EVERY
      gates.push(gy)
      const below = chain.filter(p => p.y < gy - 60 && p.y >= gy - 260)
      const host = below.length ? below[below.length - 1] : chain.filter(p => p.y < gy).pop()
      keys.push({ gate: g, x: (host?.x ?? 0) + PLAT_W / 2, y: Math.min((host?.y ?? 0) + 44, gy - 30) })
    }
  }
  return { seed, top, platforms, pickups, gates, keys }
}

/** A moving platform's left edge at sim time `t` (seconds since the round went live). */
export function platformX(p, t) {
  if (p.kind !== 'moving') return p.x
  return p.x + (p.amp ?? 0) * Math.sin((p.phase ?? 0) + t * (p.speed ?? 1))
}

/** Index of the first platform with y ≥ `y` (platforms are sorted by y). */
function firstAtOrAbove(platforms, y) {
  let lo = 0
  let hi = platforms.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (platforms[mid].y < y) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * @typedef {{ x: number, y: number, vx: number, vy: number, t: number, best: number,
 *   camY: number, dead: boolean, top: boolean, broken: Record<number, true>,
 *   cursed: Record<number, true>, taken: Record<number, true>, keys: Record<number, true>,
 *   floor: number }} Run
 */

/** A fresh hopper standing on the start platform, about to bounce. */
/** @returns {Run} */
export function createRun() {
  return {
    x: (WORLD_W - HOPPER_W) / 2, y: 0, vx: 0, vy: JUMP_V, t: 0, best: 0, camY: -80,
    dead: false, top: false, broken: {}, cursed: {}, taken: {}, keys: {}, floor: 0,
  }
}

/**
 * Advance one hopper by `dt` seconds. Pure: returns `{ run, events }`.
 * `input` ∈ [-1, 1] steers; `env.drift` (a gust) pushes sideways;
 * `env.ceiling` is a closed co-op gate the hopper cannot rise through;
 * `env.goal` is the height that ends the climb (summit / co-op flag).
 * Events: `bounce` {kind}, `pickup` {id}, `key` {gate}, `fall`, `top`.
 * @param {Run} run
 * @param {Tower} tower
 * @param {number} input
 * @param {number} dt
 * @param {{ drift?: number, ceiling?: number|null, goal?: number, pickups?: boolean }} [env]
 */
export function stepRun(run, tower, input, dt, env = {}) {
  /** @type {Array<{ type: string, kind?: string, id?: number, gate?: number }>} */
  const events = []
  if (run.dead || run.top) return { run, events }
  const goal = env.goal ?? tower.top
  const next = { ...run }
  next.t = run.t + dt
  next.vx = clamp(input, -1, 1) * MOVE_SPEED + (env.drift ?? 0)
  let x = run.x + next.vx * dt
  if (x < -HOPPER_W / 2) x += WORLD_W
  else if (x > WORLD_W - HOPPER_W / 2) x -= WORLD_W
  next.x = x
  next.vy = run.vy - GRAVITY * dt
  let y = run.y + next.vy * dt

  const ceiling = env.ceiling ?? null
  if (ceiling != null && y + HOPPER_H > ceiling && run.y + HOPPER_H <= ceiling + 1) {
    y = ceiling - HOPPER_H
    if (next.vy > 0) next.vy = 0
  }

  if (next.vy < 0) {
    const plats = tower.platforms
    for (let i = firstAtOrAbove(plats, y); i < plats.length && plats[i].y <= run.y; i++) {
      const p = plats[i]
      if (run.broken[p.id]) continue
      const px = platformX(p, next.t)
      if (x + HOPPER_W > px + 2 && x < px + PLAT_W - 2) {
        y = p.y
        next.vy = p.kind === 'spring' ? SPRING_V : JUMP_V
        if (p.kind === 'crumble' || run.cursed[p.id]) next.broken = { ...run.broken, [p.id]: true }
        events.push({ type: 'bounce', kind: run.cursed[p.id] ? 'crumble' : p.kind })
        break
      }
    }
  }
  next.y = y

  const hit = (ix, iy) => Math.abs(ix - (x + HOPPER_W / 2)) < (HOPPER_W + PICKUP_SIZE) / 2
    && iy + PICKUP_SIZE / 2 > y && iy - PICKUP_SIZE / 2 < y + HOPPER_H
  if (env.pickups) {
    for (const k of tower.pickups) {
      if (next.taken[k.id] || k.y > y + 200 || k.y < y - 200) continue
      if (hit(k.x, k.y)) {
        next.taken = { ...next.taken, [k.id]: true }
        events.push({ type: 'pickup', id: k.id })
      }
    }
  }
  for (const k of tower.keys) {
    if (next.keys[k.gate] || k.y > y + 200 || k.y < y - 200) continue
    if (hit(k.x, k.y)) {
      next.keys = { ...next.keys, [k.gate]: true }
      events.push({ type: 'key', gate: k.gate })
    }
  }

  next.best = Math.max(run.best, Math.min(y, goal))
  next.camY = Math.max(run.camY, y - VIEW_H * 0.4)
  if (y >= goal) {
    next.top = true
    events.push({ type: 'top' })
  } else if (y + HOPPER_H < next.camY) {
    next.dead = true
    events.push({ type: 'fall' })
  }
  return { run: next, events }
}

/**
 * Run `stepRun` in fixed STEP_DT steps over `elapsed` seconds, carrying the
 * remainder. Returns `{ run, events, acc }`.
 * @param {Run} run
 * @param {Tower} tower
 * @param {() => number} readInput
 * @param {number} acc   leftover seconds from the previous frame
 * @param {number} elapsed
 * @param {(run: Run) => Parameters<typeof stepRun>[4]} envFor
 */
export function advanceRun(run, tower, readInput, acc, elapsed, envFor) {
  let a = acc + Math.min(elapsed, 0.1)
  let r = run
  const events = []
  while (a >= STEP_DT) {
    a -= STEP_DT
    const out = stepRun(r, tower, readInput(), STEP_DT, envFor(r))
    r = out.run
    events.push(...out.events)
  }
  return { run: r, events, acc: a }
}

/** Metres climbed, as shown and compared everywhere. */
export const toMetres = (units) => Math.max(0, Math.floor((Number(units) || 0) / UNITS_PER_M))

/**
 * Put a CHAOS crumble hazard on the next CRUMBLE_COUNT solid platforms above
 * the hopper: each breaks after one bounce.
 * @param {Run} run
 * @param {Tower} tower
 */
export function curseAhead(run, tower) {
  const cursed = { ...run.cursed }
  let n = 0
  for (let i = firstAtOrAbove(tower.platforms, run.y + 1); i < tower.platforms.length && n < CRUMBLE_COUNT; i++) {
    const p = tower.platforms[i]
    if (p.kind === 'crumble' || run.broken[p.id]) continue
    cursed[p.id] = true
    n++
  }
  return { ...run, cursed }
}

/**
 * Put a fallen co-op climber back on the highest solid platform at or below
 * `checkpoint`, bouncing, with the camera reset under them.
 * @param {Run} run
 * @param {Tower} tower
 * @param {number} checkpoint
 */
export function respawnRun(run, tower, checkpoint) {
  const idx = firstAtOrAbove(tower.platforms, checkpoint + 1) - 1
  let spot = tower.platforms[0]
  for (let i = idx; i >= 0; i--) {
    const p = tower.platforms[i]
    if (p.kind !== 'crumble' && p.kind !== 'moving' && !run.broken[p.id]) { spot = p; break }
  }
  return {
    ...run, x: spot.x + (PLAT_W - HOPPER_W) / 2, y: spot.y, vx: 0, vy: JUMP_V,
    camY: spot.y - VIEW_H * 0.4, dead: false, floor: checkpoint,
  }
}

/** Highest gate a climber has already passed (their co-op checkpoint). */
export function checkpointFor(tower, height) {
  let cp = 0
  for (const g of tower.gates) if (height >= g) cp = g
  return cp
}

/**
 * The first gate above `height` that is still closed, or null. Gate g opens
 * when the PARTNER has grabbed key g on their own tower.
 * @param {Tower} tower
 * @param {number} height
 * @param {Record<number, true> | Record<string, boolean>} partnerKeys
 */
export function closedGateAbove(tower, height, partnerKeys) {
  for (let i = 0; i < tower.gates.length; i++) {
    const gy = tower.gates[i]
    if (gy < height + HOPPER_H - 1) continue // already below the hopper's head
    if (!partnerKeys?.[i + 1]) return gy
  }
  return null
}

/**
 * The gate keys a co-op climber has earned: every key they grabbed, plus the
 * key of any gate they have climbed past (a backstop — the camera never
 * lets them go back down for a skipped key, and the partner would be stuck
 * at that gate for good).
 * @param {Tower} tower
 * @param {Run} run
 * @returns {number[]} gate numbers, ascending
 */
export function keysEarned(tower, run) {
  const out = []
  tower.gates.forEach((gy, i) => {
    const g = i + 1
    if (run.keys[g] || run.best >= gy) out.push(g)
  })
  return out
}

// ── Steering ────────────────────────────────────────────────────────────

/**
 * Drag steering: the hopper chases the finger's x (both in world units).
 * @param {number} targetX
 * @param {number} hopperX  hopper's left edge
 */
export function dragInput(targetX, hopperX) {
  const dx = targetX - (hopperX + HOPPER_W / 2)
  if (Math.abs(dx) < DRAG_DEADZONE) return 0
  return clamp(dx / DRAG_GAIN, -1, 1)
}

/** Tilt steering from the phone's left/right roll (DeviceOrientationEvent.gamma, degrees). */
export function tiltInput(gamma) {
  const g = Number(gamma)
  if (!Number.isFinite(g) || Math.abs(g) < TILT_DEADZONE_DEG) return 0
  return clamp(g / TILT_FULL_DEG, -1, 1)
}

// ── Bot ghost (solo demo) ───────────────────────────────────────────────

/** Signed shortest horizontal distance from a to b on the wrapping world. */
export function wrapDx(a, b) {
  let d = (b - a) % WORLD_W
  if (d > WORLD_W / 2) d -= WORLD_W
  if (d < -WORLD_W / 2) d += WORLD_W
  return d
}

/**
 * A simple climbing bot: steer toward the platform it can land on next —
 * the highest solid one under the current arc's apex while rising, the
 * nearest one below while falling. `skill` ∈ (0, 1] sets its pace: for a
 * (1 − skill) share of its seconds (deterministic per second) it drifts
 * through the rising half of the arc and only picks a landing on the way
 * down, so easier ghosts climb slower without ever getting stuck.
 * @param {Run} run
 * @param {Tower} tower
 * @param {number} [skill]
 */
export function botInput(run, tower, skill = 1) {
  const cx = run.x + HOPPER_W / 2
  const apex = run.y + Math.max(0, run.vy) ** 2 / (2 * GRAVITY)
  const reach = MOVE_SPEED * 0.7
  const sec = Math.floor(run.t)
  const lazy = run.vy > 0 && ((Math.sin(sec * 12.9898 + tower.seed * 0.001) * 43758.5453) % 1 + 1) % 1 > skill
  let target = null
  let bestScore = -Infinity
  const lo = firstAtOrAbove(tower.platforms, run.y - 220)
  for (let i = lo; i < tower.platforms.length && tower.platforms[i].y <= apex; i++) {
    const p = tower.platforms[i]
    if (run.broken[p.id] || run.cursed[p.id] || p.kind === 'crumble') continue
    const dx = Math.abs(wrapDx(cx, platformX(p, run.t) + PLAT_W / 2))
    if (dx > reach) continue
    const score = (run.vy > 0 ? p.y : -Math.abs(run.y - p.y)) - dx * 0.4
    if (score > bestScore) { bestScore = score; target = p }
  }
  if (!target || lazy) return 0
  const dx = wrapDx(cx, platformX(target, run.t) + PLAT_W / 2)
  if (Math.abs(dx) < 6) return 0
  return clamp(dx / 30, -1, 1)
}

// ── Firebase shapes ─────────────────────────────────────────────────────
//
// games/{id}/updraft:
//   { seed, startedAt?, mode: 'chaos'|'pure' (versus), lives (co-op),
//     X: { y, best, dead, top }, O: {…},           — each seat writes its own
//     haz: { X: { pushId: { k, at } }, O: {…} },   — hazards aimed at a seat
//     keys: { X: { gate: true }, O: {…} } }        — keys a seat has grabbed

/** A seat's reported progress; missing/malformed fields read as a fresh climber. */
export function normalizeSeat(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0)
  return { y: num(r.y), best: num(r.best), dead: r.dead === true, top: r.top === true }
}

/** Hazards aimed at one seat, oldest first. */
export function normalizeHazards(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw)
    .filter(([, h]) => h && HAZARD_KINDS.includes(h.k) && Number.isFinite(Number(h.at)))
    .map(([id, h]) => ({ id, k: h.k, at: Number(h.at) }))
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

/** A seat's grabbed keys as `{ gate: true }`, gate numbers parsed by key. */
export function normalizeKeys(raw) {
  /** @type {Record<number, true>} */
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    const g = parseInt(k, 10)
    if (v === true && g >= 1) out[g] = true
  }
  return out
}

/** Which hazard a pickup sends: deterministic per seed and pickup id. */
export function hazardForPickup(seed, pickupId) {
  const r = seededRng(((seed >>> 0) + pickupId * 2654435761) >>> 0)()
  return HAZARD_KINDS[Math.floor(r * HAZARD_KINDS.length)]
}

/**
 * Who has won a Ghost Race round, or null while it is still open.
 * Summit first wins; a climber who fell loses as soon as the other passes
 * their best height; both fallen (or time up) → higher best wins, equal
 * metres draw. Heights compare in whole metres (what both screens show).
 * @param {{ X: ReturnType<typeof normalizeSeat>, O: ReturnType<typeof normalizeSeat> }} seats
 * @param {{ timeUp?: boolean }} [opts]
 * @returns {'X'|'O'|'draw'|null}
 */
export function raceOutcome(seats, { timeUp = false } = {}) {
  const { X, O } = seats
  if (X.top && !O.top) return 'X'
  if (O.top && !X.top) return 'O'
  if (X.top && O.top) return null // the first finish transaction decides
  const mx = toMetres(X.best)
  const mo = toMetres(O.best)
  if ((X.dead && O.dead) || timeUp) return mx > mo ? 'X' : mo > mx ? 'O' : 'draw'
  if (X.dead && mo > mx) return 'O'
  if (O.dead && mx > mo) return 'X'
  return null
}

/**
 * How a co-op run ended, or null while it is still going.
 * @param {{ X: ReturnType<typeof normalizeSeat>, O: ReturnType<typeof normalizeSeat>, lives: number }} run
 * @param {{ timeUp?: boolean }} [opts]
 * @returns {'cleared'|'failed'|null}
 */
export function coopOutcome({ X, O, lives }, { timeUp = false } = {}) {
  if (X.top && O.top) return 'cleared'
  if (lives <= 0 || timeUp) return 'failed'
  return null
}
