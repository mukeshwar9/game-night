// @ts-check
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

const ENGAGE_DIST = 0.33          // bot rams once the gap closes inside this (start gap is 0.4)
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

function applyInput(b, input, opp) {
  const press = input?.press ?? 0
  if (!press) return
  const dx = opp.x - b.x
  const dy = opp.y - b.y
  const dist = Math.hypot(dx, dy) || 1
  // `press` is a tap COUNT (a guest can land >1 tap between host substeps —
  // see useRealtimeHost's additive guest-input accumulation), so N taps apply
  // N impulses' worth of push in this single substep.
  b.vx += PUSH_IMPULSE * press * (dx / dist)
  b.vy += PUSH_IMPULSE * press * (dy / dist)
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
  if (dist >= 2 * BLOB_R || dist === 0) return false
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
  return true
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
  if (X.alive) applyInput(X, inputs?.X, O)
  if (O.alive) applyInput(O, inputs?.O, X)
  for (const b of [X, O]) {
    if (!b.alive) continue
    moveAndBounceWalls(b, dt)
  }
  if (X.alive && O.alive && resolveCollision(X, O)) events.push({ type: 'clash' })

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
 * Reaction-handicapped AI input. Taps the push button on a fixed rhythm to
 * ram the opponent once within ENGAGE_DIST. Pressing ALWAYS pushes toward the opponent (see
 * applyInput) — there is no separate "retreat" impulse — so near the edge the
 * AI only taps when doing so also carries it back toward centre (i.e. the
 * opponent is roughly between it and the centre); otherwise tapping would
 * shove it further off the platform, so it holds off instead.
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
  // Tap rhythm: a press window opens for the first 120 ms of every 200 ms
  // slot (deterministic from sim time). pollBot re-decides every
  // AI_REACTION_MS, so the bot lands about one tap per slot — at most five a
  // second, which a player tapping faster can out-push.
  const tapWindow = ((state.t * 5) % 1) < 0.6
  if (!tapWindow) return { press: 0 }
  if (distCenter > edgeThresh) {
    const toOppDist = distOpp || 1
    const toCenterDist = distCenter || 1
    const dot = ((opp.x - me.x) / toOppDist) * ((CENTER_X - me.x) / toCenterDist)
              + ((opp.y - me.y) / toOppDist) * ((CENTER_Y - me.y) / toCenterDist)
    return { press: dot > 0 ? 1 : 0 }
  }
  // Ram once the gap closes. The start gap is wider, so the bot waits for the
  // player's first push (or the shrinking ring) instead of charging at GO.
  if (distOpp < ENGAGE_DIST) return { press: 1 }
  return { press: 0 }
}

// How often the solo bot re-decides (ms). The demo used to hold the bot's
// {press: 1} for this whole window and feed it to every 1/120 s substep,
// which turned one bot "tap" into ~14 impulses while the player's tap stays a
// single impulse. pollBot hands out one tap per decision instead.
export const AI_REACTION_MS = 120

/** @returns {{ at: number }} fresh bot timer for pollBot */
export function createBot() {
  return { at: -Infinity }
}

/**
 * Edge-triggered bot input: re-runs computeAI at most once per
 * AI_REACTION_MS and turns a "press" decision into exactly one tap, so the bot
 * pushes with the same one-impulse-per-tap rule as the player.
 * @param {{ at: number }} bot
 * @param {object} state
 * @param {'X'|'O'} side
 * @param {number} nowMs
 * @returns {{ bot: { at: number }, press: 0|1 }}
 */
export function pollBot(bot, state, side, nowMs) {
  if (nowMs - bot.at < AI_REACTION_MS) return { bot, press: 0 }
  return { bot: { at: nowMs }, press: computeAI(state, side).press ? 1 : 0 }
}

/**
 * Advance the sim by whole fixed steps for one rendered frame. Taps are
 * applied to the first substep only (a tap is one impulse however many
 * substeps the frame needs); `consumed` is false when no substep ran, so the
 * caller keeps its pending taps for the next frame.
 * @param {object} state
 * @param {{X?: {press:number}, O?: {press:number}}} taps
 * @param {number} acc  seconds of unsimulated time
 * @param {number} dt
 * @returns {{ state: object, events: Array<{type:string, by?:string}>, acc: number, consumed: boolean }}
 */
export function stepFrame(state, taps, acc, dt) {
  let s = state
  let consumed = false
  const events = []
  while (acc >= dt) {
    const r = step(s, consumed ? {} : taps, dt)
    consumed = true
    s = r.state
    if (r.events.length) events.push(...r.events)
    acc -= dt
    if (getWinner(s)) break
  }
  return { state: s, events, acc, consumed }
}

/**
 * How close a blob is to falling off: 0 at the centre, 1 on the death line.
 * Drives the edge-danger HUD bars and the tension sound; presentation only.
 * @param {{x:number, y:number, alive?:boolean}} blob
 * @param {number} arenaR
 * @returns {number}
 */
export function edgeDanger(blob, arenaR) {
  if (!blob || blob.alive === false) return 0
  const deathR = arenaR - BLOB_R * 0.5
  if (deathR <= 0) return 1
  const d = Math.hypot(blob.x - CENTER_X, blob.y - CENTER_Y)
  return Math.max(0, Math.min(1, d / deathR))
}

/**
 * How hard two blobs hit, 0..1: their closing speed along the line between
 * them, relative to twice the speed cap. Scales the clash shake, particles and
 * thud. Reads only positions and velocities, so the guest can compute it from
 * a snapshot.
 * @param {{x:number, y:number, vx:number, vy:number}} a
 * @param {{x:number, y:number, vx:number, vy:number}} b
 * @returns {number}
 */
export function clashIntensity(a, b) {
  if (!a || !b) return 0
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy) || 1
  const closing = Math.abs(((a.vx - b.vx) * dx + (a.vy - b.vy) * dy) / dist)
  return Math.max(0, Math.min(1, closing / (MAX_SPEED * 2) * 2.5))
}

/**
 * Unit vector from the platform centre through a blob — the direction a
 * ringed-out wrestler tumbles. Falls back to straight right at the centre.
 * @param {{x:number, y:number}} blob
 * @returns {{ x: number, y: number }}
 */
export function outDirection(blob) {
  const dx = (blob?.x ?? CENTER_X) - CENTER_X
  const dy = (blob?.y ?? CENTER_Y) - CENTER_Y
  const d = Math.hypot(dx, dy)
  return d < 1e-6 ? { x: 1, y: 0 } : { x: dx / d, y: dy / d }
}

// How long the finished round stays on the dohyo before the result replaces
// it, so the ring-out tumble, flash and crowd roar can play out.
export const RINGOUT_HOLD_MS = 1200
