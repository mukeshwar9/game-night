// animalStackLogic.js — ANIMAL STACK core: pieces, physics drops, replay,
// hearts/turn rules. Pure — no DOM, no Firebase, no React.
//
// DETERMINISM CONTRACT (same idea as artilleryLogic.js): every client replays
// the same seed + drop list and MUST reach the bit-identical tower.
//   * physics is planck.js vendored with deterministic trig (vendor/planck-det.js)
//   * fixed timestep 1/60, fixed solver iterations, settle counted in ticks
//   * inputs are integers: x in centimetres, rotation as a 0-23 step (15°)
//   * after every settle the tower is quantised into a "canonical state" and
//     the next drop rebuilds the world from it, so no solver cache or float
//     drift survives from one drop to the next
//   * piece identity comes from the seed (pieceSequence), never from a client
import { World, Vec2, Polygon } from './vendor/planck-det'
import { mulberry32 } from './detMath'
import { PIXELS } from './animalStackPixels'
import { heartsFor, hashState, nextAlive, roundSeed } from './animalStackCore'

export { heartsFor, hashState, nextAlive, roundSeed }

export const DT = 1 / 60
const VEL_ITERS = 8
const POS_ITERS = 3
export const ROT_STEPS = 24
export const ROT_STEP = (2 * Math.PI) / ROT_STEPS // 15°
export const FALL_Y = -1.2 // an animal whose centre sinks below this has left the island
const STILL_V = 0.06
const STILL_W = 0.1
export const STILL_TICKS = 36
export const MAX_TICKS = 540
export const AIM_LIMIT_CM = 320 // aim range ±3.2 m
export const SPAWN_GAP = 0.45 // drop height above the tower's highest point
export const TURN_MS = 15000 // online aim timer
export const ISLAND = [[-2.6, 0], [2.6, 0], [2.35, -0.35], [1.9, -1.6], [-1.9, -1.6], [-2.35, -0.35]]

// Twelve animals. Each hull is built from its pixel-art grid (animalStackPixels.js),
// so the sprite and the physics share one silhouette. `tone` is the --c-*
// token the renderer fills it with — never a p1-p4 player colour.
const DEFS = [
  { id: 'elephant', name: 'ELEPHANT', density: 1.3, weight: 'HEAVY' },
  { id: 'giraffe', name: 'GIRAFFE', density: 0.9, weight: 'LIGHT' },
  { id: 'penguin', name: 'PENGUIN', density: 1, weight: 'MID' },
  { id: 'hippo', name: 'HIPPO', density: 1.4, weight: 'HEAVY' },
  { id: 'snake', name: 'SNAKE', density: 0.8, weight: 'LIGHT' },
  { id: 'turtle', name: 'TURTLE', density: 1.2, weight: 'MID' },
  { id: 'frog', name: 'FROG', density: 1, weight: 'MID' },
  { id: 'pig', name: 'PIG', density: 1.1, weight: 'MID' },
  { id: 'croc', name: 'CROC', density: 1, weight: 'MID' },
  { id: 'owl', name: 'OWL', density: 0.9, weight: 'LIGHT' },
  { id: 'rhino', name: 'RHINO', density: 1.35, weight: 'HEAVY' },
  { id: 'chick', name: 'CHICK', density: 0.7, weight: 'LIGHT' },
]
export const PIECES = DEFS.map(d => ({ ...d, tone: PIXELS[d.id].tone, parts: PIXELS[d.id].parts }))
for (const p of PIECES) {
  let r = 0
  for (const part of p.parts) for (const [x, y] of part) r = Math.max(r, Math.sqrt(x * x + y * y))
  p.radius = r
}

// ─── Seeds & piece order ─────────────────────────────────────────────────────

/** Shuffled 12-bags: every animal appears once per 12 drops. */
export function pieceSequence(seed, n) {
  const rng = mulberry32(seed)
  const out = []
  while (out.length < n) {
    const bag = PIECES.map((_, i) => i)
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    out.push(...bag)
  }
  return out.slice(0, n)
}

/** Piece index for drop number `n` (0-based) of a tower seeded `seed`. */
export function pieceAt(seed, n) {
  return pieceSequence(seed, n + 1)[n]
}

// ─── Physics ─────────────────────────────────────────────────────────────────

function spawn(world, k, x, y, a) {
  const def = PIECES[k]
  const body = world.createBody({ type: 'dynamic', position: Vec2(x, y), angle: a })
  for (const part of def.parts) {
    body.createFixture(Polygon(part.map(([px, py]) => Vec2(px, py))), { density: def.density, friction: 0.8, restitution: 0.02 })
  }
  body.setUserData({ k })
  return body
}

/** A fresh world holding the island and the tower in `state`. */
export function makeWorld(state) {
  const world = new World({ gravity: Vec2(0, -10) })
  world.createBody().createFixture(Polygon(ISLAND.map(([x, y]) => Vec2(x, y))), { friction: 0.9 })
  const bodies = state.map(s => spawn(world, s.k, s.x, s.y, s.a))
  return { world, bodies }
}

/** Highest point of any body (0 = island top). */
export function topOfBodies(bodies) {
  let top = 0
  for (const b of bodies) {
    for (const part of PIECES[b.getUserData().k].parts) {
      for (const [x, y] of part) {
        const p = b.getWorldPoint(Vec2(x, y))
        if (p.y > top) top = p.y
      }
    }
  }
  return top
}

export const stateTop = (state) => topOfBodies(makeWorld(state).bodies)

/** Height the piece hovers (and is released) at above `top`. */
export const spawnY = (top, k) => top + PIECES[k].radius + SPAWN_GAP

// `|| 0` folds -0 into 0 so the canonical state survives a round trip through
// the checkpoint string (String(-0) === '0') unchanged.
const q4 = (v) => Math.round(v * 1e4) / 1e4 || 0
const q5 = (v) => Math.round(v * 1e5) / 1e5 || 0

/** Quantised tower: [{ k, x, y, a }]. */
export function canon(bodies) {
  return bodies.map(b => {
    const p = b.getPosition()
    return { k: b.getUserData().k, x: q4(p.x), y: q4(p.y), a: q5(b.getAngle()) }
  })
}

export const encodePoses = (state) => state.map(o => `${o.k},${o.x},${o.y},${o.a}`).join(';')

export function decodePoses(str) {
  if (!str) return []
  return String(str).split(';').map(row => {
    const [k, x, y, a] = row.split(',').map(Number)
    return { k, x, y, a }
  }).filter(o => Number.isInteger(o.k) && o.k >= 0 && o.k < PIECES.length && [o.x, o.y, o.a].every(Number.isFinite))
}

/** Clamp a raw aim into the integer inputs a drop carries. */
export function normalizeDrop({ k, x, r }) {
  const cm = Math.max(-AIM_LIMIT_CM, Math.min(AIM_LIMIT_CM, Math.round(Number(x) || 0)))
  const rot = ((Math.round(Number(r) || 0) % ROT_STEPS) + ROT_STEPS) % ROT_STEPS
  return { k, x: cm, r: rot }
}

/**
 * Start simulating one drop: rebuild the world from `state`, release piece
 * `drop.k` at rest `drop.x` cm across with rotation step `drop.r`.
 * Step it with stepDrop until `done`.
 */
export function startDrop(state, drop, maxTicks = MAX_TICKS) {
  const { world, bodies } = makeWorld(state)
  const d = normalizeDrop(drop)
  const y = spawnY(topOfBodies(bodies), d.k)
  const dropBody = spawn(world, d.k, d.x / 100, y, d.r * ROT_STEP)
  bodies.push(dropBody)
  return { world, bodies, dropBody, ticks: 0, still: 0, fell: false, fellTick: -1, done: false, maxTicks }
}

/** One fixed 1/60 tick. Ends on a fall, on 36 still ticks, or at the cap. */
export function stepDrop(sim) {
  sim.world.step(DT, VEL_ITERS, POS_ITERS)
  sim.ticks++
  let moving = false
  for (const b of sim.bodies) {
    if (!sim.fell && b.getPosition().y < FALL_Y) { sim.fell = true; sim.fellTick = sim.ticks }
    const v = b.getLinearVelocity()
    if (Math.abs(v.x) > STILL_V || Math.abs(v.y) > STILL_V || Math.abs(b.getAngularVelocity()) > STILL_W) moving = true
  }
  sim.still = moving ? 0 : sim.still + 1
  if (sim.fell || sim.still >= STILL_TICKS || sim.ticks >= sim.maxTicks) sim.done = true
  return sim
}

/** Outcome of a finished sim: `{ fell, state, hash }` (state null on a fall). */
export function simResult(sim) {
  if (sim.fell) return { fell: true, state: null, hash: null, ticks: sim.ticks }
  const state = canon(sim.bodies)
  return { fell: false, state, hash: hashState(state), ticks: sim.ticks }
}

/** Simulate a drop to the end. */
export function runDrop(state, drop, maxTicks) {
  const sim = startDrop(state, drop, maxTicks)
  while (!sim.done) stepDrop(sim)
  return simResult(sim)
}

/** Rebuild a tower from its drops: `{ fell, at?, state, hash }`. */
export function replay(drops, from = []) {
  let state = from
  for (let i = 0; i < drops.length; i++) {
    const r = runDrop(state, drops[i])
    if (r.fell) return { fell: true, at: i, state, hash: hashState(state) }
    state = r.state
  }
  return { fell: false, state, hash: hashState(state) }
}

// ─── Match rules (hearts, turns, towers) ─────────────────────────────────────

/** Fresh match for `n` seats. */
export function createMatch(n, baseSeed) {
  return {
    baseSeed: baseSeed | 0, round: 1, seed: roundSeed(baseSeed, 1),
    hearts: Array(n).fill(heartsFor(n)), turn: 0,
    drops: [], state: [], maxHeight: 0,
    winner: null, lastToppler: null,
  }
}

/**
 * Fold one drop's outcome into the match.
 * Stands → the tower grows and the next seat with hearts drops.
 * Topples → the dropper loses a heart; if one seat is left it wins, otherwise
 * a new empty tower starts with the toppler (or the next live seat).
 * Returns `{ match, event: 'stand' | 'topple' | 'win' }`.
 */
export function applyOutcome(match, drop, result) {
  if (!result.fell) {
    const top = stateTop(result.state)
    return {
      event: 'stand',
      match: {
        ...match,
        drops: [...match.drops, drop], state: result.state,
        maxHeight: Math.max(match.maxHeight, top),
        turn: nextAlive(match.hearts, match.turn),
      },
    }
  }
  const toppler = match.turn
  const hearts = match.hearts.map((h, i) => (i === toppler ? Math.max(0, h - 1) : h))
  const alive = hearts.map((h, i) => (h > 0 ? i : -1)).filter(i => i >= 0)
  if (alive.length <= 1 && hearts.length > 1) {
    return { event: 'win', match: { ...match, hearts, drops: [...match.drops, drop], winner: alive[0] ?? null, lastToppler: toppler } }
  }
  if (hearts.length === 1) {
    // CLIMB: one topple ends the run.
    return { event: 'win', match: { ...match, hearts, drops: [...match.drops, drop], winner: null, lastToppler: toppler } }
  }
  const round = match.round + 1
  return {
    event: 'topple',
    match: {
      ...match, hearts, round, seed: roundSeed(match.baseSeed, round),
      drops: [], state: [], maxHeight: 0, lastToppler: toppler,
      turn: hearts[toppler] > 0 ? toppler : nextAlive(hearts, toppler),
    },
  }
}
