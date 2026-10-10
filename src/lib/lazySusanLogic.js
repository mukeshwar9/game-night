// lazySusanLogic.js — pure LAZY SUSAN: one turning plate, 2–4 pairs of
// chopsticks, tap when a piece is in your gate. No DOM, no Firebase, no React.
//
// The whole match lives in one `round` object (under the room's `round` node
// online, in React state on one phone). Nothing in it is a position: every
// client derives the plate from (seed, start time, who ate what, and when).
//
//   lsSeats    uid[]                         seat order (join order at START)
//   lsSeed     number                        the match seed
//   lsStart    number                        server ms the countdown began
//   lsTarget   number                        points that win the match
//   lsTwists   { turn, chili, last }         the three twists, each on/off
//   lsClaims   { 'p{plate}_{piece}': { by, at } }   a piece taken (eaten or a chili)
//   lsMiss     { [id]: { by, at } }          a tap on nothing
//
// A claim key is written once and the rules refuse a second writer, so the
// first player to claim a piece owns it. Scores are the replay of every claim
// and miss in time order (derive), so every client reads the same table.

import { mulberry32 } from './detMath'
import { DEFAULT_TWISTS, MAX_PLAYERS, MIN_PLAYERS, TARGETS, createRound, targetFor } from './lazySusanRound'

export { DEFAULT_TWISTS, MAX_PLAYERS, MIN_PLAYERS, TARGETS, createRound, targetFor }

export const BOT_LEVELS = ['easy', 'normal', 'hard']

const TAU = Math.PI * 2

/** Every tuning number in one place; all are starting values to playtest. */
export const TUNING = {
  window: 0.2,        // rad either side of a gate's centre
  speed0: 1.45,       // rad/s on plate 1
  speedStep: 0.14,    // added per plate
  speedMax: 2.5,
  rush: 1.45,         // LAST BITE speed multiplier
  ease: 3.2,          // 1/s: how fast the plate's speed follows its target
  missLock: 0.45,     // s you cannot tap after tapping nothing
  hitLock: 0.22,      // s after eating
  stun: 0.9,          // s frozen after a chili
  buffer: 0.12,       // s: a tap this close to the end of a lock is kept
  bornLock: 0.3,      // s a piece cannot be taken after it appears
  stagger: 0.07,      // s between pieces appearing
  countdown: 3.2,     // s before the first plate can be played
  refill: 0.75,       // s between a cleared plate and the next
  bunValue: 3,
  dumplingValue: 1,
  goldMult: 2,
  hotPenalty: 2,
  missPenalty: 1,
  slots: 8,
}

/** Gate angle per seat in degrees, screen space (y down: 90 is the bottom). */
export const SEAT_ANGLES = {
  2: [90, -90],
  3: [90, -30, 210],
  4: [135, 45, -45, -135],
}

/** Bot error model per level: timing spread (s) and the share of pieces it ignores. */
export const BOT_MODEL = {
  easy: { sigma: 0.085, skip: 0.45 },
  normal: { sigma: 0.055, skip: 0.2 },
  hard: { sigma: 0.03, skip: 0.05 },
}

const MAX_PLATES = 400

export const wrap = (a) => {
  let x = (a + Math.PI) % TAU
  if (x < 0) x += TAU
  return x - Math.PI
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

export const seatAnglesFor = (n) => (SEAT_ANGLES[clamp(Math.round(n) || MIN_PLAYERS, MIN_PLAYERS, MAX_PLAYERS)]).map((d) => (d * Math.PI) / 180)
export const claimKey = (plate, piece) => `p${plate}_${piece}`

// ─── Round ──────────────────────────────────────────────────────────────────

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback)

/** A clean round from whatever the room held (Firebase drops empty objects). */
export function normalizeRound(raw) {
  if (!raw || typeof raw !== 'object') return null
  const seatsRaw = Array.isArray(raw.lsSeats) ? raw.lsSeats : Object.values(raw.lsSeats ?? {})
  const seats = seatsRaw.filter((u) => typeof u === 'string' && u).slice(0, MAX_PLAYERS)
  if (seats.length < MIN_PLAYERS) return null
  const tw = raw.lsTwists && typeof raw.lsTwists === 'object' ? raw.lsTwists : {}
  const entries = (o) => (o && typeof o === 'object' ? Object.entries(o) : [])
  const claims = {}
  for (const [k, c] of entries(raw.lsClaims)) {
    if (c && typeof c === 'object' && seats.includes(c.by)) claims[k] = { by: c.by, at: num(c.at, num(raw.lsStart)) }
  }
  const misses = {}
  for (const [k, c] of entries(raw.lsMiss)) {
    if (c && typeof c === 'object' && seats.includes(c.by)) misses[k] = { by: c.by, at: num(c.at, num(raw.lsStart)) }
  }
  return {
    seats,
    seed: num(raw.lsSeed) | 0,
    start: num(raw.lsStart),
    target: num(raw.lsTarget, targetFor(seats.length)),
    twists: { turn: tw.turn !== false, chili: tw.chili !== false, last: tw.last !== false },
    claims,
    misses,
  }
}

/** The round with one piece claimed, or null when that key is taken or invalid. */
export function withClaim(raw, key, by, at) {
  const r = normalizeRound(raw)
  if (!r || !r.seats.includes(by) || r.claims[key]) return null
  return { ...raw, lsClaims: { ...(raw.lsClaims ?? {}), [key]: { by, at } } }
}

/** The round with one empty tap recorded. */
export function withMiss(raw, id, by, at) {
  const r = normalizeRound(raw)
  if (!r || !r.seats.includes(by)) return null
  return { ...raw, lsMiss: { ...(raw.lsMiss ?? {}), [id]: { by, at } } }
}

// ─── Plates ─────────────────────────────────────────────────────────────────

/** Speed of plate `n` (1-based), rad/s, before LAST BITE. */
export const plateSpeed = (n) => Math.min(TUNING.speedMax, TUNING.speed0 + TUNING.speedStep * (n - 1))
/** +1 or −1: with THE TURN the plate reverses every plate. */
export const plateDir = (n, twists) => (twists.turn && n % 2 === 0 ? -1 : 1)

/** What plate `n` carries, from the seed alone. Piece 0 is always the bun. */
export function plateLayout(seed, n, twists) {
  const rnd = mulberry32(((seed | 0) ^ Math.imul(n, 0x9e3779b1)) | 0)
  const kinds = ['bun', 'dump', 'dump', 'dump']
  if (n % 2 === 0) kinds.push('dump')
  if (twists.chili) {
    kinds.push('chili')
    if (n >= 4) kinds.push('chili')
  }
  const slots = Array.from({ length: TUNING.slots }, (_, i) => i)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  const off = rnd() * TAU
  return kinds.map((kind, i) => ({ i, kind, a: off + (slots[i] * TAU) / TUNING.slots + (rnd() - 0.5) * 0.2 }))
}

/**
 * The plate's angle and angular velocity `s` seconds after it appeared. The
 * speed eases toward its target (the plate has weight), and toward the LAST
 * BITE target from `rushS` on; both are closed forms, so any client can ask
 * for any moment without stepping.
 */
export function dynamics(plate, s, rushS = null) {
  const k = TUNING.ease
  const seg = (th0, cur0, target, t) => {
    const e = Math.exp(-k * t)
    return { th: th0 + target * t + ((cur0 - target) * (1 - e)) / k, cur: target + (cur0 - target) * e }
  }
  const t1 = rushS != null ? Math.min(s, Math.max(0, rushS)) : s
  const a = seg(plate.th0, plate.cur0, plate.target, Math.max(0, t1))
  if (rushS == null || s <= rushS) return a
  return seg(a.th, a.cur, plate.target * TUNING.rush, s - rushS)
}

const cache = new WeakMap()

/**
 * Everything a round implies, independent of the clock: the chain of plates,
 * the replayed scores and log, and the winner. Memoised on the round object.
 */
export function derive(raw) {
  if (!raw || typeof raw !== 'object') return null
  const hit = cache.get(raw)
  if (hit) return hit
  const r = normalizeRound(raw)
  if (!r) return null

  const byPlate = new Map()
  for (const [key, c] of Object.entries(r.claims)) {
    const m = /^p(\d{1,3})_(\d)$/.exec(key)
    if (!m) continue
    const n = Number(m[1])
    if (!byPlate.has(n)) byPlate.set(n, new Map())
    byPlate.get(n).set(Number(m[2]), { ...c, key })
  }

  const plates = []
  let at = r.start
  let th0 = mulberry32(r.seed ^ 0x5eed)() * TAU
  let cur0 = 0
  for (let n = 1; n <= MAX_PLATES; n++) {
    const pieces = plateLayout(r.seed, n, r.twists)
    const claims = byPlate.get(n) ?? new Map()
    const target = plateDir(n, r.twists) * plateSpeed(n)
    const edibles = pieces.filter((p) => p.kind !== 'chili')
    const eaten = [...claims.entries()]
      .filter(([i]) => pieces[i] && pieces[i].kind !== 'chili')
      .map(([i, c]) => ({ i, ...c }))
      .sort((a, b) => a.at - b.at || a.i - b.i)
    const rushAt = r.twists.last && edibles.length >= 2 && eaten.length >= edibles.length - 1 ? eaten[edibles.length - 2].at : null
    const cleared = eaten.length >= edibles.length
    const clearAt = cleared ? eaten[edibles.length - 1].at : null
    const endAt = clearAt != null ? clearAt + TUNING.refill * 1000 : null
    const plate = {
      n, at, th0, cur0, target, pieces, claims, edibles: edibles.length, rushAt, clearAt, endAt,
      playAt: n === 1 ? at + TUNING.countdown * 1000 : at,
    }
    plates.push(plate)
    if (!cleared) break
    const end = dynamics(plate, Math.max(0, (endAt - at) / 1000), rushAt != null ? (rushAt - at) / 1000 : null)
    th0 = end.th
    cur0 = end.cur
    at = endAt
  }

  // Replay: every claim and miss in time order.
  const events = []
  for (const p of plates) {
    for (const [i, c] of p.claims) {
      if (!p.pieces[i]) continue
      events.push({ key: c.key, kind: p.pieces[i].kind === 'chili' ? 'hot' : 'eat', by: c.by, at: c.at, plate: p.n, i, piece: p.pieces[i].kind })
    }
  }
  for (const [key, c] of Object.entries(r.misses)) events.push({ key: `m_${key}`, kind: 'miss', by: c.by, at: c.at, plate: 0, i: -1, piece: null })
  events.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  const scores = Object.fromEntries(r.seats.map((u) => [u, 0]))
  const taken = new Map()
  const log = []
  let winner = null
  let winAt = null
  for (const ev of events) {
    const before = scores[ev.by]
    let delta
    let gold = false
    if (ev.kind === 'eat') {
      const plate = plates[ev.plate - 1]
      const n = (taken.get(ev.plate) ?? 0) + 1
      taken.set(ev.plate, n)
      gold = r.twists.last && plate.edibles >= 2 && n === plate.edibles
      delta = (ev.piece === 'bun' ? TUNING.bunValue : TUNING.dumplingValue) * (gold ? TUNING.goldMult : 1)
    } else if (ev.kind === 'hot') {
      delta = 0 - Math.min(before, TUNING.hotPenalty)
    } else {
      delta = 0 - Math.min(before, TUNING.missPenalty)
    }
    scores[ev.by] = before + delta
    log.push({ ...ev, seat: r.seats.indexOf(ev.by), delta, gold, score: scores[ev.by] })
    if (ev.kind === 'eat' && scores[ev.by] >= r.target) {
      winner = ev.by
      winAt = ev.at
      break
    }
  }

  const out = { round: r, plates, log, scores, winner, winAt }
  cache.set(raw, out)
  return out
}

// ─── View at a moment ───────────────────────────────────────────────────────

/**
 * The table at `now` (ms): phase, plate angle, and the pieces still on it.
 * phase is 'count' | 'play' | 'refill' | 'over'.
 */
export function viewAt(d, now) {
  const { plates, round } = d
  let p = plates[0]
  for (let k = plates.length - 1; k >= 0; k--) {
    if (plates[k].at <= now) { p = plates[k]; break }
  }
  const s = Math.max(0, (now - p.at) / 1000)
  const rushS = p.rushAt != null ? (p.rushAt - p.at) / 1000 : null
  const { th, cur } = dynamics(p, s, rushS)
  const over = d.winner != null
  const refill = !over && p.clearAt != null && now >= p.clearAt
  const count = p.n === 1 && now < p.playAt
  const phase = over ? 'over' : count ? 'count' : refill ? 'refill' : 'play'

  const left = p.pieces.filter((x) => x.kind !== 'chili' && !p.claims.has(x.i)).length
  const pieces = []
  for (const x of p.pieces) {
    if (p.claims.has(x.i)) continue
    const born = s - x.i * TUNING.stagger
    if (born <= 0) continue
    const edible = x.kind !== 'chili'
    const fade = refill ? clamp(1 - ((now - p.clearAt) / 1000) * 2.4, 0, 1) : 1
    pieces.push({
      key: claimKey(p.n, x.i), plate: p.n, i: x.i, kind: x.kind, a: x.a + th, born,
      gold: round.twists.last && edible && p.edibles >= 2 && left === 1,
      fade, grab: phase === 'play' && born >= TUNING.bornLock && fade > 0,
    })
  }
  return {
    phase, plate: p.n, th, cur, pieces,
    rush: p.rushAt != null && now >= p.rushAt,
    count: count ? Math.max(0, (p.playAt - now) / 1000) : 0,
    overT: over ? Math.max(0, (now - d.winAt) / 1000) : 0,
    bornAge: s,
  }
}

/** The grabbable piece nearest the centre of a gate, or null. */
export function aimedPiece(view, seatAngle) {
  let best = null
  let bd = TUNING.window
  for (const p of view.pieces) {
    if (!p.grab) continue
    const dist = Math.abs(wrap(p.a - seatAngle))
    if (dist < bd) { bd = dist; best = p }
  }
  return best
}

/** True while a grabbable piece sits in the gate (the gate lights up). */
export const gateHot = (view, seatAngle) => aimedPiece(view, seatAngle) !== null

/**
 * What a tap by seat `seatIndex` does right now:
 * { kind: 'none' } (countdown or match over), { kind: 'miss' },
 * { kind: 'eat' | 'hot', key, plate, i, piece, gold }.
 */
export function planTap(d, seatIndex, now) {
  const view = viewAt(d, now)
  if (view.phase === 'count' || view.phase === 'over') return { kind: 'none' }
  const ang = seatAnglesFor(d.round.seats.length)[seatIndex]
  const hit = ang == null ? null : aimedPiece(view, ang)
  if (!hit) return { kind: 'miss' }
  return { kind: hit.kind === 'chili' ? 'hot' : 'eat', key: hit.key, plate: hit.plate, i: hit.i, piece: hit.kind, gold: !!hit.gold }
}

/** Plays an outcome into a local round (one phone and solo). */
export function applyOutcome(raw, uid, outcome, at, missId) {
  if (outcome.kind === 'eat' || outcome.kind === 'hot') return withClaim(raw, outcome.key, uid, at)
  if (outcome.kind === 'miss') return withMiss(raw, missId, uid, at)
  return null
}

// ─── Per-seat tap locks (client side, not part of the round) ────────────────

export const freshLock = () => ({ until: 0, stunUntil: 0, buffered: false })

/** 'tap' when a press should resolve now; 'ignore' otherwise (buffering a late one). */
export function press(lock, now) {
  if (now < lock.stunUntil) return 'ignore'
  if (now < lock.until) {
    if (lock.until - now <= TUNING.buffer * 1000) lock.buffered = true
    return 'ignore'
  }
  return 'tap'
}

/** Starts the lock an outcome earns. */
export function settle(lock, outcome, now) {
  if (outcome.kind === 'miss') lock.until = now + TUNING.missLock * 1000
  else if (outcome.kind === 'eat') lock.until = now + TUNING.hitLock * 1000
  else if (outcome.kind === 'hot') { lock.until = now + TUNING.stun * 1000; lock.stunUntil = lock.until }
}

/** True once when a buffered press may fire (the lock has run out). */
export function takeBuffered(lock, now) {
  if (!lock.buffered || now < lock.until) return false
  lock.buffered = false
  return true
}

// ─── Bot ────────────────────────────────────────────────────────────────────

const gauss = (rnd) => (rnd() + rnd() + rnd() - 1.5) * 1.15

/**
 * When a bot should tap next, or null. It watches pieces about to reach its
 * gate, never aims at a chili, and errs by the level's timing spread. `seen`
 * (Map key → ms) stops it planning the same piece twice. The caller taps at
 * the returned time through the same locks as a person, so it may still lose
 * the piece to someone else.
 */
export function planBot(view, seatAngle, level, rnd, seen, now) {
  if (view.phase !== 'play' || Math.abs(view.cur) < 0.4) return null
  const model = BOT_MODEL[level] ?? BOT_MODEL.normal
  let pick = null
  let pickT = 9
  for (const p of view.pieces) {
    if (p.kind === 'chili' || !p.grab) continue
    if ((seen.get(p.key) ?? 0) > now) continue
    const t = wrap(seatAngle - p.a) / view.cur
    if (t > 0.14 && t < 0.5 && t < pickT) { pick = p; pickT = t }
  }
  if (!pick) return null
  seen.set(pick.key, now + 1200)
  if (rnd() < model.skip) return null
  return { at: now + Math.max(0.02, pickT + gauss(rnd) * model.sigma) * 1000, key: pick.key }
}

// ─── Results ────────────────────────────────────────────────────────────────

/** Seats best score first; ties keep seat order. */
export function standings(d) {
  return d.round.seats
    .map((uid, seat) => ({ uid, seat, score: d.scores[uid] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat)
}

/** The winner a transaction should write, or null while the match is on. */
export const winnerOf = (raw) => derive(raw)?.winner ?? null

/** Which seat index a seat uid holds (-1 if none). */
export const seatIndexOf = (raw, uid) => normalizeRound(raw)?.seats.indexOf(uid) ?? -1
