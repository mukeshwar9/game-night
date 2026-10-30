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
export const UNITS_PER_M = 20

export const GRAVITY = 1500
export const JUMP_V = 760
export const SPRING_V = 1180
export const MOVE_SPEED = 300
/** Fixed simulation step: jump arcs never depend on the display's refresh rate. */
export const STEP_DT = 1 / 120
/** Highest a normal bounce can lift the hopper (v² / 2g ≈ 192 units). */
export const MAX_JUMP_H = (JUMP_V * JUMP_V) / (2 * GRAVITY)
/** Widest gap the guaranteed platform chain ever leaves (reached near the summit). */
export const MAX_CHAIN_GAP = 182

// Room-level config lives in updraftConfig.js (the registry and matchRules
// import it without pulling the sim into the entry bundle).
export {
  COOP_LIVES, MATCH_TARGET, UPDRAFT_MODES, UPDRAFT_MODE_IDS, getUpdraftMode, randomUpdraftSeed, updraftFreshState,
} from './updraftConfig'

// Versus (Ghost Race)
export const SUMMIT_M = 400
export const SUMMIT_Y = SUMMIT_M * UNITS_PER_M
export const ROUND_LIMIT_MS = 75_000
export const COUNTDOWN_MS = 3000

// CHAOS-mode hazards: a grabbed pickup sends one to the rival.
export const HAZARD_KINDS = /** @type {const} */ (['crumble', 'gust', 'fog'])
/** Everything one seat can send the other through `updraft/haz`: the hazards, plus the co-op BOOST. */
export const SEND_KINDS = /** @type {const} */ ([...HAZARD_KINDS, 'boost'])
export const HAZARD_TELEGRAPH_MS = 1000
export const GUST_MS = 2000
export const FOG_MS = 3000
export const CRUMBLE_COUNT = 3
/** A cursed platform's bounce, as a share of a normal bounce's height. */
export const CURSED_BOUNCE = 0.6
export const CURSED_V = JUMP_V * Math.sqrt(CURSED_BOUNCE)
export const GUST_DRIFT = 140
export const PICKUP_EVERY = 900
export const PICKUP_SIZE = 20

// FEATHER pickups (both versus modes): a rare self-boost, a FEATHER_MS float.
export const FEATHER_EVERY = 2500
export const FEATHER_MS = 2000
const FEATHER_GRAVITY = 0.35
const FEATHER_LIFT_V = 0.8 * JUMP_V

// UPDRAFT vents: columns of rising air that lift whoever flies through them.
export const VENT_W = 56
export const VENT_H = 220
export const VENT_START = 600
const VENT_LIFT = 3600
const VENT_MAX_V = 900

// Camera: a critically damped follow that keeps the hopper at CAM_FRACTION of
// the screen, looking further ahead (CAM_LOOKAHEAD) while a launch is rising.
// It never scrolls down; falling below the screen ends the climb.
export const CAM_FRACTION = 0.4
export const CAM_LOOKAHEAD = 0.3
const CAM_OMEGA = 10

// Co-op (Twin Towers)
export const COOP_GOAL_M = 300
export const COOP_GOAL_Y = COOP_GOAL_M * UNITS_PER_M
export const GATE_EVERY = 60 * UNITS_PER_M
export const COOP_LIMIT_MS = 120_000

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
 * @typedef {'gem'|'feather'|'boost'} PickupKind
 * @typedef {{ id: number, x: number, y: number, kind: PickupKind }} Pickup
 * @typedef {{ id: number, x: number, y: number }} Vent   x: left edge, y: bottom of the column
 * @typedef {{ gate: number, x: number, y: number }} GateKey
 * @typedef {{ seed: number, top: number, platforms: Platform[], pickups: Pickup[], vents: Vent[],
 *   gates: number[], keys: GateKey[] }} Tower
 */

/**
 * Deterministically build the tower for `seed`, up to `top` (plus a screen of
 * headroom). A chain of solid platforms (normal / moving / spring) never
 * leaves a gap wider than MAX_CHAIN_GAP, so every tower is climbable; crumble
 * platforms are decoys between chain steps and never the only way up. With
 * height the gaps widen toward MAX_CHAIN_GAP, moving platforms and decoys get
 * likelier and springs rarer.
 * `coop: true` adds a gate every GATE_EVERY units below the goal, each with
 * its key just under it, and turns the gem pickups into BOOSTs. Pickups and
 * vents come from separate streams so they never change the platform layout;
 * vents only add lift, so they never make a tower harder.
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
    const gap = Math.min(MAX_CHAIN_GAP, 60 + d * 110 + rand() * 25)
    const prevY = y
    y += gap
    const roll = rand()
    const x = rand() * (WORLD_W - PLAT_W)
    /** @type {Platform} */
    const p = { id: id++, x, y: Math.round(y), kind: 'normal', chain: true }
    const spring = 0.05 - 0.035 * d
    if (roll < spring) p.kind = 'spring'
    else if (roll < spring + 0.12 + 0.4 * d) {
      p.kind = 'moving'
      p.amp = 30 + rand() * 50
      p.speed = 1 + rand() * 1.2 + d
      p.phase = rand() * Math.PI * 2
      p.x = clamp(x, p.amp, WORLD_W - PLAT_W - p.amp)
    }
    platforms.push(p)
    if (rand() < 0.3 + 0.35 * d) {
      platforms.push({ id: id++, x: rand() * (WORLD_W - PLAT_W), y: Math.round(prevY + gap * (0.35 + rand() * 0.3)), kind: 'crumble', chain: false })
    }
  }
  platforms.sort((a, b) => a.y - b.y || a.id - b.id)

  const chain = platforms.filter(p => p.chain && p.kind !== 'moving')
  const prand = seededRng((seed ^ 0x9e3779b9) >>> 0)
  /** @type {Pickup[]} */
  const pickups = []
  let pid = 0
  const place = (h, kind) => {
    const band = chain.filter(p => p.y >= h - 150 && p.y < h)
    if (!band.length) return
    const host = band[Math.floor(prand() * band.length)]
    pickups.push({ id: pid++, x: host.x + PLAT_W / 2, y: host.y + 44, kind })
  }
  for (let h = PICKUP_EVERY; h < top; h += PICKUP_EVERY) place(h, coop ? 'boost' : 'gem')
  if (!coop) for (let h = FEATHER_EVERY; h < top; h += FEATHER_EVERY) place(h + 300, 'feather')

  const vrand = seededRng((seed ^ 0x5bd1e995) >>> 0)
  /** @type {Vent[]} */
  const vents = []
  for (let h = VENT_START + vrand() * 300, vid = 0; h < top - VENT_H; h += 700 + vrand() * 600) {
    vents.push({ id: vid++, x: Math.round(vrand() * (WORLD_W - VENT_W)), y: Math.round(h) })
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
  return { seed, top, platforms, pickups, vents, gates, keys }
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
 * `camY` is the bottom of the screen in world units (the camera, and the
 * fall line), `camV` its speed; `lockY` is where a hard-locked camera would
 * be (reduced motion draws that, never below `camY`). `land` is the last bounce (sim time and kind) for the render-only
 * squash; `floatUntil` the end of a FEATHER float; `boost` the BOOSTs a co-op
 * partner sent (each turns the next landing into a spring); `springs` counts
 * launches (springs, BOOSTs) for the round-end strip.
 * @typedef {{ x: number, y: number, vx: number, vy: number, t: number, best: number,
 *   camY: number, camV: number, lockY: number, dead: boolean, top: boolean, broken: Record<number, true>,
 *   cursed: Record<number, true>, taken: Record<number, true>, keys: Record<number, true>,
 *   floor: number, land: { t: number, kind: string, id: number, x: number, y: number } | null,
 *   floatUntil: number, vent: number | null,
 *   boost: number, springs: number }} Run
 */

/** A fresh hopper standing on the start platform, about to bounce. */
/** @returns {Run} */
export function createRun() {
  return {
    x: (WORLD_W - HOPPER_W) / 2, y: 0, vx: 0, vy: JUMP_V, t: 0, best: 0, camY: -80, camV: 0, lockY: -80,
    dead: false, top: false, broken: {}, cursed: {}, taken: {}, keys: {}, floor: 0,
    land: null, floatUntil: 0, vent: null, boost: 0, springs: 0,
  }
}

/** Where the camera floor wants to be for a hopper at `y` moving at `vy`. */
export function cameraTarget(y, vy) {
  return y - VIEW_H * (vy > JUMP_V ? CAM_LOOKAHEAD : CAM_FRACTION)
}

/**
 * Advance one hopper by `dt` seconds. Pure: returns `{ run, events }`.
 * `input` ∈ [-1, 1] steers; `env.drift` (a gust) pushes sideways;
 * `env.ceiling` is a closed co-op gate the hopper cannot rise through;
 * `env.goal` is the height that ends the climb (summit / co-op flag);
 * `env.pickups` lists the pickup kinds this climber collects.
 * Events: `bounce` {kind}, `pickup` {id, kind}, `vent`, `key` {gate}, `fall`, `top`.
 * @param {Run} run
 * @param {Tower} tower
 * @param {number} input
 * @param {number} dt
 * @param {{ drift?: number, ceiling?: number|null, goal?: number, pickups?: readonly string[] }} [env]
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
  const floating = next.t < (run.floatUntil ?? 0)
  next.vy = run.vy - GRAVITY * (floating ? FEATHER_GRAVITY : 1) * dt

  // A vent lifts whoever is inside its column, up to VENT_MAX_V.
  const cx = x + HOPPER_W / 2
  const vent = (tower.vents ?? []).find(v => cx > v.x && cx < v.x + VENT_W && run.y + HOPPER_H > v.y && run.y < v.y + VENT_H)
  next.vent = vent ? vent.id : null
  if (vent) {
    if (next.vy < VENT_MAX_V) next.vy = Math.min(VENT_MAX_V, next.vy + VENT_LIFT * dt)
    if (run.vent !== vent.id) events.push({ type: 'vent', id: vent.id })
  }
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
        const cursed = !!run.cursed[p.id]
        /** @type {string} */
        let kind = cursed ? 'crumble' : p.kind
        if (cursed) next.vy = CURSED_V
        else if (p.kind === 'spring') next.vy = SPRING_V
        else if (run.boost > 0 && p.kind !== 'crumble') {
          next.vy = SPRING_V
          next.boost = run.boost - 1
          kind = 'boost'
        } else next.vy = JUMP_V
        if (next.vy === SPRING_V) next.springs = (run.springs ?? 0) + 1
        if (p.kind === 'crumble' || cursed) next.broken = { ...run.broken, [p.id]: true }
        next.land = { t: next.t, kind, id: p.id, x: x + HOPPER_W / 2, y: p.y }
        events.push({ type: 'bounce', kind })
        break
      }
    }
  }
  next.y = y

  const hit = (ix, iy) => Math.abs(ix - (x + HOPPER_W / 2)) < (HOPPER_W + PICKUP_SIZE) / 2
    && iy + PICKUP_SIZE / 2 > y && iy - PICKUP_SIZE / 2 < y + HOPPER_H
  if (env.pickups?.length) {
    for (const k of tower.pickups) {
      if (next.taken[k.id] || k.y > y + 200 || k.y < y - 200 || !env.pickups.includes(k.kind)) continue
      if (hit(k.x, k.y)) {
        next.taken = { ...next.taken, [k.id]: true }
        if (k.kind === 'feather') {
          next.floatUntil = next.t + FEATHER_MS / 1000
          next.vy = Math.max(next.vy, FEATHER_LIFT_V)
        }
        events.push({ type: 'pickup', id: k.id, kind: k.kind })
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
  // Critically damped follow (semi-implicit Euler), never scrolling down.
  const target = cameraTarget(y, next.vy)
  const camV = (run.camV ?? 0) + (CAM_OMEGA * CAM_OMEGA * (target - run.camY) - 2 * CAM_OMEGA * (run.camV ?? 0)) * dt
  const camY = run.camY + camV * dt
  next.camY = camY > run.camY ? camY : run.camY
  next.camV = camY > run.camY ? camV : 0
  next.lockY = Math.max(run.lockY ?? -Infinity, y - VIEW_H * CAM_FRACTION)
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

/** Pickups a versus climber collects: feathers always, sabotage gems only in CHAOS. */
export const versusPickups = (chaos) => (chaos ? ['gem', 'feather'] : ['feather'])

/**
 * A climb's own numbers for the round-end strip: time to the summit (if
 * reached), launches, and in CHAOS the hazards sent and taken.
 * @param {Run} run
 * @param {{ sent?: number, took?: number }} [tally]
 */
export function climbStats(run, { sent = 0, took = 0 } = {}) {
  const springs = run.springs ?? 0
  const parts = []
  if (run.top) parts.push(`${run.t.toFixed(1)}s`)
  parts.push(`${springs} SPRING${springs === 1 ? '' : 'S'}`)
  if (sent || took) parts.push(`SENT ${sent} · TOOK ${took}`)
  return parts.join(' · ')
}

/** Metres climbed, as shown and compared everywhere. */
export const toMetres = (units) => Math.max(0, Math.floor((Number(units) || 0) / UNITS_PER_M))

/**
 * The CRUMBLE_COUNT solid platforms just above the hopper: the ones a CHAOS
 * crumble hazard curses (outlined during its telegraph).
 * @param {Run} run
 * @param {Tower} tower
 * @returns {number[]} platform ids
 */
export function curseTargets(run, tower) {
  const ids = []
  for (let i = firstAtOrAbove(tower.platforms, run.y + 1); i < tower.platforms.length && ids.length < CRUMBLE_COUNT; i++) {
    const p = tower.platforms[i]
    if (p.kind === 'crumble' || run.broken[p.id]) continue
    ids.push(p.id)
  }
  return ids
}

/**
 * Curse platforms: each gives a CURSED_BOUNCE bounce, then breaks. `ids`
 * (the telegraphed targets) are cursed if any is still above the hopper;
 * otherwise, and by default, the next ones above it.
 * @param {Run} run
 * @param {Tower} tower
 * @param {number[]} [ids]
 */
export function curseAhead(run, tower, ids) {
  const byId = new Map(tower.platforms.map(p => [p.id, p]))
  const still = (ids ?? []).filter(id => (byId.get(id)?.y ?? -Infinity) > run.y && !run.broken[id])
  const cursed = { ...run.cursed }
  for (const id of still.length ? still : curseTargets(run, tower)) cursed[id] = true
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
    camY: spot.y - VIEW_H * CAM_FRACTION, camV: 0, lockY: spot.y - VIEW_H * CAM_FRACTION, dead: false, floor: checkpoint,
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
 * (1 − skill) share of its seconds (deterministic per second) it spends
 * the rising half of the arc heading back over the platform nearest below
 * it instead of the highest one ahead, so easier ghosts climb slower rather
 * than fall more.
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
    if (run.broken[p.id] || run.cursed[p.id] || p.kind === 'crumble' || (lazy && p.y > run.y)) continue
    const dx = Math.abs(wrapDx(cx, platformX(p, run.t) + PLAT_W / 2))
    if (dx > reach) continue
    const score = (run.vy > 0 && !lazy ? p.y : -Math.abs(run.y - p.y)) - dx * 0.4
    if (score > bestScore) { bestScore = score; target = p }
  }
  if (!target) return 0
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
    .filter(([, h]) => h && SEND_KINDS.includes(h.k) && Number.isFinite(Number(h.at)))
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
