// dartsLogic.js — pure darts (STEADY HAND). No DOM, no Firebase, no React.
//
// The whole match lives in one object under the room's `round` node:
//   dCfg      { mode, start, ctrl, nerves, legs }  the lobby picks; kept over a rematch
//   dSeats    uid[]                                turn order (join order at START)
//   dThrows   ({ x, y } | { s: 1 })[]              append-only. x and y are integer tenths
//                                                  of a millimetre from the bull; { s: 1 }
//                                                  is a dart that never landed (the clock
//                                                  ran out, or the thrower was away)
//   dAt       number                               server time the current dart's clock began
//
// Scores, busts, Turf ownership, whose visit it is, legs and the winner are never
// stored: every client replays dThrows through `replay`, so they cannot disagree.
// The landing point is computed on the thrower's phone, so this is an honest-client
// game, like Archery.

import { mulberry32 } from './detMath'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4
export const DARTS_PER_VISIT = 3
/** The twenty sectors, clockwise from the top. */
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
/**
 * Arcade board, millimetres from the bull. The layout is a real clock board's, with
 * the treble, double and bull rings widened so a thumb can hit them (a real board
 * has 8 mm rings and a 6.35 mm bull).
 */
export const RADII = { bull: 9, outerBull: 22, trebleIn: 92, trebleOut: 110, doubleIn: 154, doubleOut: 170, edge: 226 }
/** Stored integers are tenths of a millimetre. */
export const UNIT = 10
export const COORD_LIMIT = 3000
export const MAX_THROWS = 600

export const MODES = ['x01', 'turf']
export const START_SCORES = [101, 301, 501]
export const DEFAULT_START = 301
export const THROW_STYLES = ['aim', 'one']
export const LEG_OPTIONS = [1, 3]
export const TURF_ROUNDS = 5
export const TURF_BULL_BONUS = 2
export const TURF_OUTER_BONUS = 1
/** One dart's clock online; when it runs out the rest of that visit is missed. */
export const DART_CLOCK_MS = 25000
/** How long a thrower may be seen offline before their visit is passed. */
export const DARTS_AWAY_GRACE_MS = 8000
const SHOOTOUT_TIES = 3

// Nerves: the player in front shakes up to 25% more, the one furthest behind 15% less.
export const NERVES_MIN = 0.85
export const NERVES_SPAN = 0.4

// Steady aim (touch). Starting values, tuned on a phone.
export const AIM_LIMIT_MM = 190
export const AIM_START_MM = 45
export const SHAKE_MM = 30
export const SHAKE_TIGHT = 0.26
export const BREATH_S = 1.5
export const TIRED_AFTER_S = 4.5
export const SCATTER_MM = 2.2
export const SWEEP_MM = 176
export const SWEEP_RATE = 2.3

export const BOT_LEVELS = ['easy', 'normal', 'hard']
const BOT_SIGMA_MM = { easy: 26, normal: 17, hard: 9 }

const TAU = Math.PI * 2
const MISS = Object.freeze({ v: 0, ring: 'M', n: 0, idx: -1, key: 'M', label: 'MISS' })

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** What a dart landing `x`, `y` millimetres from the bull scores. */
export function segmentAt(x, y) {
  const r = Math.hypot(x, y)
  if (r <= RADII.bull) return { v: 50, ring: 'B', n: 25, idx: -1, key: 'B', label: 'BULL' }
  if (r <= RADII.outerBull) return { v: 25, ring: 'O', n: 25, idx: -1, key: 'O', label: '25' }
  if (r > RADII.doubleOut) return MISS
  const a = (Math.atan2(x, -y) + TAU + TAU / 40) % TAU
  const idx = Math.floor(a / (TAU / 20)) % 20
  const n = SECTORS[idx]
  if (r >= RADII.trebleIn && r <= RADII.trebleOut) return { v: n * 3, ring: 'T', n, idx, key: `T${n}`, label: `T${n}` }
  if (r >= RADII.doubleIn) return { v: n * 2, ring: 'D', n, idx, key: `D${n}`, label: `D${n}` }
  return { v: n, ring: 'S', n, idx, key: `S${n}`, label: `${n}` }
}

/** Every segment that takes exactly `rem` points, so a leg can end on it. */
export function finishSegments(rem) {
  const out = []
  if (rem === 50) out.push({ ring: 'B', n: 25, idx: -1 })
  if (rem === 25) out.push({ ring: 'O', n: 25, idx: -1 })
  SECTORS.forEach((n, idx) => {
    if (n === rem) out.push({ ring: 'S', n, idx })
    if (n * 2 === rem) out.push({ ring: 'D', n, idx })
    if (n * 3 === rem) out.push({ ring: 'T', n, idx })
  })
  return out
}

/** "T20", "D16", "BULL", "25", "7". */
export function segmentLabel(s) {
  if (s.ring === 'B') return 'BULL'
  if (s.ring === 'O') return '25'
  return `${s.ring === 'S' ? '' : s.ring}${s.n}`
}

/** The middle of a segment, in millimetres, for a bot to aim at. */
export function segmentCentre(s) {
  if (s.ring === 'B') return { x: 0, y: 0 }
  if (s.ring === 'O') return { x: 0, y: -(RADII.bull + RADII.outerBull) / 2 }
  const a = (s.idx * TAU) / 20
  const r = s.ring === 'T'
    ? (RADII.trebleIn + RADII.trebleOut) / 2
    : s.ring === 'D' ? (RADII.doubleIn + RADII.doubleOut) / 2 : (RADII.trebleOut + RADII.doubleIn) / 2
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r }
}

// ---------------------------------------------------------------------------
// Config and round shape
// ---------------------------------------------------------------------------

export const DEFAULT_CFG = Object.freeze({ mode: 'x01', start: DEFAULT_START, ctrl: 'aim', nerves: true, legs: 1 })

/** Lobby picks as Firebase returns them (missing, partial or junk) → a complete config. */
export function normalizeCfg(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const mode = MODES.includes(r.mode) ? r.mode : DEFAULT_CFG.mode
  return {
    mode,
    start: START_SCORES.includes(r.start) ? r.start : DEFAULT_CFG.start,
    ctrl: THROW_STYLES.includes(r.ctrl) ? r.ctrl : DEFAULT_CFG.ctrl,
    nerves: r.nerves === undefined || r.nerves === null ? DEFAULT_CFG.nerves : !!r.nerves,
    // Legs are a countdown idea; Turf is one race over five rounds.
    legs: mode === 'x01' && LEG_OPTIONS.includes(r.legs) ? r.legs : 1,
  }
}

/** A throw as stored: `{ x, y }` in tenths of a millimetre, or `{ s: 1 }`. */
export function cleanThrow(t) {
  if (!t || typeof t !== 'object' || t.s || !Number.isFinite(t.x) || !Number.isFinite(t.y)) return { s: 1 }
  const clamp = (v) => Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, Math.round(v)))
  return { x: clamp(t.x), y: clamp(t.y) }
}

/**
 * The throw list as Firebase returns it (an array, or a numeric-keyed object once a
 * write has left a gap). Mapped by explicit key so a value never shifts index; a
 * hole becomes a miss so every later dart keeps its place in the order.
 */
export function normalizeThrows(raw) {
  if (!raw || typeof raw !== 'object') return []
  const entries = Object.entries(raw).filter(([k]) => /^\d+$/.test(k))
  if (!entries.length) return []
  const length = Math.min(MAX_THROWS, Math.max(...entries.map(([k]) => Number(k))) + 1)
  const out = Array.from({ length }, () => ({ s: 1 }))
  for (const [k, v] of entries) {
    const i = Number(k)
    if (i < length) out[i] = cleanThrow(v)
  }
  return out
}

/** The round as the page should read it, or null before the match starts. */
export function normalizeRound(raw) {
  if (!raw || typeof raw !== 'object' || !raw.dSeats || typeof raw.dSeats !== 'object') return null
  const seats = Object.entries(raw.dSeats)
    .filter(([k]) => /^\d+$/.test(k))
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, uid]) => uid)
    .filter((uid) => typeof uid === 'string' && uid.length > 0)
    .slice(0, MAX_PLAYERS)
  if (seats.length < MIN_PLAYERS) return null
  return {
    cfg: normalizeCfg(raw.dCfg),
    seats,
    throws: normalizeThrows(raw.dThrows),
    at: Number.isFinite(raw.dAt) ? raw.dAt : null,
  }
}

/** A fresh match: the lobby config, the seat order, no darts thrown. */
export function createRound(seats, cfg) {
  return { dCfg: normalizeCfg(cfg), dSeats: seats.slice(0, MAX_PLAYERS), dAt: null }
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

function newLeg(seats, cfg, legIndex) {
  const n = seats.length
  const order = Array.from({ length: n }, (_, i) => seats[(legIndex + i) % n])
  const scores = {}
  const thrown = {}
  const bonus = {}
  for (const u of seats) { scores[u] = cfg.mode === 'x01' ? cfg.start : 0; thrown[u] = 0; bonus[u] = 0 }
  return {
    legIndex, order, scores, thrown, bonus,
    turf: Array.from({ length: 20 }, () => null),
    pos: 0, round: 1, dartsLeft: DARTS_PER_VISIT, visit: [], visitStart: scores[order[0]],
    finishers: [], shoot: null,
  }
}

const turfPoints = (leg, uid) => leg.turf.filter((t) => t && t.owner === uid).length + leg.bonus[uid]

/** One Turf dart: claim, lock or spread. Returns what happened for the popup. */
function turfHit(leg, uid, seg) {
  const res = { claimed: 0, locked: false, blocked: false, bonus: 0 }
  if (seg.ring === 'M') return res
  if (seg.ring === 'B' || seg.ring === 'O') {
    res.bonus = seg.ring === 'B' ? TURF_BULL_BONUS : TURF_OUTER_BONUS
    leg.bonus[uid] += res.bonus
    return res
  }
  const take = (i) => {
    const t = leg.turf[i]
    if (t && t.lock && t.owner !== uid) return false
    leg.turf[i] = { owner: uid, lock: !!(t && t.owner === uid && t.lock) }
    return true
  }
  if (seg.ring === 'S') {
    if (take(seg.idx)) res.claimed = 1; else res.blocked = true
  } else if (seg.ring === 'D') {
    if (take(seg.idx)) { leg.turf[seg.idx].lock = true; res.claimed = 1; res.locked = true } else res.blocked = true
  } else {
    // A treble takes the wedge and both neighbours, whichever of them are not locked.
    for (const d of [-1, 0, 1]) if (take((seg.idx + d + 20) % 20)) res.claimed += 1
    if (!res.claimed) res.blocked = true
  }
  return res
}

const seatOf = (leg) => (leg.shoot ? leg.shoot.seats[leg.shoot.i] : leg.order[leg.pos])

/** Open a shoot-off among `tied` seats: one dart each, nearest the bull takes it. */
function startShoot(leg, tied, attempt) {
  leg.shoot = { seats: leg.order.filter((u) => tied.includes(u)), i: 0, d: [], attempt }
  leg.dartsLeft = 1
  leg.visit = []
  leg.visitStart = leg.scores[leg.shoot.seats[0]]
}

/** The leg's winner now, or null with the next visit set up. Called when a visit ends. */
function afterVisit(leg, cfg) {
  const n = leg.order.length
  leg.pos += 1
  leg.dartsLeft = DARTS_PER_VISIT
  leg.visit = []
  if (leg.pos < n) { leg.visitStart = leg.scores[leg.order[leg.pos]]; return null }
  // The round is complete: every seat has had its visit (a fair finish).
  leg.pos = 0
  let tied = null
  if (cfg.mode === 'x01') {
    if (leg.finishers.length) {
      const best = Math.min(...leg.finishers.map((f) => f.darts))
      tied = leg.finishers.filter((f) => f.darts === best).map((f) => f.seat)
    }
  } else if (leg.round >= TURF_ROUNDS) {
    const pts = leg.order.map((u) => turfPoints(leg, u))
    const top = Math.max(...pts)
    tied = leg.order.filter((_, i) => pts[i] === top)
  }
  if (!tied) { leg.round += 1; leg.visitStart = leg.scores[leg.order[0]]; return null }
  if (tied.length === 1) return tied[0]
  startShoot(leg, tied, 1)
  return null
}

/** One shoot-off dart. Returns the winner when the set of darts is complete and decisive. */
function shootThrow(leg, t) {
  const s = leg.shoot
  s.d.push(t.s ? Infinity : t.x * t.x + t.y * t.y)
  s.i += 1
  if (s.i < s.seats.length) { leg.visitStart = leg.scores[s.seats[s.i]]; leg.dartsLeft = 1; leg.visit = []; return null }
  const best = Math.min(...s.d)
  const tied = s.seats.filter((_, i) => s.d[i] === best)
  if (tied.length === 1) return tied[0]
  if (s.attempt >= SHOOTOUT_TIES) return tied[0]
  startShoot(leg, tied, s.attempt + 1)
  return null
}

/**
 * Everything a client needs, derived from the stored round. `null` for a round that
 * has not started. Pure and deterministic: the same throws always give the same state.
 */
export function replay(rawRound) {
  const r = normalizeRound(rawRound)
  if (!r) return null
  const { cfg, seats, throws } = r
  const needed = Math.ceil(cfg.legs / 2)
  const legWins = Object.fromEntries(seats.map((u) => [u, 0]))
  const legs = []
  const log = []
  let leg = newLeg(seats, cfg, 0)
  let winner = null
  let visitNo = 0

  for (let seq = 0; seq < throws.length && !winner; seq++) {
    const t = throws[seq]
    const uid = seatOf(leg)
    const seg = t.s ? MISS : segmentAt(t.x / UNIT, t.y / UNIT)
    const entry = {
      seq, uid, leg: leg.legIndex, visitNo, x: t.s ? null : t.x, y: t.s ? null : t.y,
      skip: !!t.s, seg, dartInVisit: DARTS_PER_VISIT - leg.dartsLeft, shoot: !!leg.shoot,
      bust: false, out: false, left: null, claimed: 0, locked: false, blocked: false, bonus: 0,
      visitTotal: 0, legEnd: null, matchEnd: false,
    }
    let legWinner = null

    if (leg.shoot) {
      legWinner = shootThrow(leg, t)
      visitNo += 1
    } else {
      leg.thrown[uid] += 1
      leg.dartsLeft -= 1
      leg.visit.push({ uid, seg, skip: !!t.s })
      let visitDone = leg.dartsLeft === 0
      if (cfg.mode === 'x01') {
        const left = leg.scores[uid] - seg.v
        if (left < 0) {
          entry.bust = true
          leg.scores[uid] = leg.visitStart
          entry.left = leg.visitStart
          visitDone = true
        } else {
          leg.scores[uid] = left
          entry.left = left
          if (left === 0) {
            entry.out = true
            leg.finishers.push({ seat: uid, darts: leg.thrown[uid] })
            visitDone = true
          }
        }
        entry.visitTotal = entry.bust ? 0 : leg.visit.reduce((s, d) => s + d.seg.v, 0)
      } else {
        Object.assign(entry, turfHit(leg, uid, seg))
      }
      if (visitDone) {
        visitNo += 1
        legWinner = afterVisit(leg, cfg)
      }
    }
    if (legWinner) {
      legWins[legWinner] += 1
      entry.legEnd = legWinner
      legs.push({ winner: legWinner, thrown: { ...leg.thrown }, scores: { ...leg.scores } })
      if (legWins[legWinner] >= needed) { winner = legWinner; entry.matchEnd = true } else leg = newLeg(seats, cfg, leg.legIndex + 1)
    }
    log.push(entry)
  }

  const points = Object.fromEntries(seats.map((u) => [u, turfPoints(leg, u)]))
  return {
    cfg, seats, at: r.at, count: throws.length,
    over: !!winner, winner, turnUid: winner ? null : seatOf(leg),
    leg: leg.legIndex, legsNeeded: needed, legWins, legs,
    scores: leg.scores, turf: leg.turf.map((t) => (t ? { ...t } : null)), points,
    round: leg.round, dartsLeft: leg.dartsLeft, visit: leg.visit.slice(), visitStart: leg.visitStart,
    thrown: leg.thrown, order: leg.order, firstUid: leg.order[0],
    phase: winner ? 'over' : leg.shoot ? 'shoot' : 'main',
    shoot: leg.shoot ? { seats: leg.shoot.seats.slice(), i: leg.shoot.i, attempt: leg.shoot.attempt } : null,
    visitNo, log,
  }
}

// ---------------------------------------------------------------------------
// Moves (applied inside a room transaction by the page)
// ---------------------------------------------------------------------------

/**
 * Append `shot` for `uid`. Null when it is not their dart, the match is over, or
 * `atCount` (the number of darts the caller saw) is stale. Otherwise the new raw
 * round and its replayed state.
 */
export function throwDart(rawRound, uid, shot, atCount = null) {
  const r = normalizeRound(rawRound)
  const state = replay(rawRound)
  if (!r || !state || state.over || state.turnUid !== uid) return null
  if (atCount !== null && atCount !== r.throws.length) return null
  if (r.throws.length >= MAX_THROWS) return null
  const next = { ...rawRound, dThrows: [...r.throws, cleanThrow(shot)] }
  return { round: next, state: replay(next) }
}

/**
 * Miss every dart `uid` has left in this visit (a shoot-off has one). Used when the
 * dart clock runs out or the thrower is away, so a leg never stalls.
 */
export function missVisit(rawRound, uid, atCount = null) {
  const r = normalizeRound(rawRound)
  const state = replay(rawRound)
  if (!r || !state || state.over || state.turnUid !== uid) return null
  if (atCount !== null && atCount !== r.throws.length) return null
  const misses = Math.min(state.dartsLeft, MAX_THROWS - r.throws.length)
  if (misses <= 0) return null
  const next = { ...rawRound, dThrows: [...r.throws, ...Array.from({ length: misses }, () => ({ s: 1 }))] }
  return { round: next, state: replay(next) }
}

/**
 * The caption for one replayed dart: what the stage pops up where it lands.
 * `tone` is 'score', 'good', 'bad' or 'miss'; `big` marks a bigger pop.
 */
export function describeThrow(entry, mode = 'x01') {
  const seg = entry.seg
  if (entry.skip) return { text: 'TIMED OUT', sub: null, tone: 'miss', big: false }
  if (entry.shoot) {
    const mm = Math.round(Math.hypot(entry.x, entry.y) / UNIT)
    return { text: seg.ring === 'B' ? 'BULL' : `${mm} MM OUT`, sub: 'NEAREST THE BULL WINS', tone: 'score', big: seg.ring === 'B' }
  }
  const named = seg.ring === 'T' ? `TREBLE ${seg.n}` : seg.ring === 'D' ? `DOUBLE ${seg.n}` : seg.ring === 'B' ? 'BULLSEYE' : seg.ring === 'O' ? 'OUTER BULL' : null
  if (mode === 'turf') {
    if (seg.ring === 'M') return { text: 'MISS', sub: null, tone: 'miss', big: false }
    if (entry.bonus) return { text: `+${entry.bonus} BONUS`, sub: seg.ring === 'B' ? 'BULLSEYE' : 'OUTER BULL', tone: 'good', big: true }
    if (entry.blocked) return { text: 'LOCKED!', sub: 'THAT WEDGE IS TAKEN', tone: 'bad', big: false }
    if (entry.locked) return { text: 'LOCKED IN', sub: `NOBODY CAN STEAL ${seg.n}`, tone: 'good', big: true }
    if (seg.ring === 'T') return { text: `SPREAD ×${entry.claimed}`, sub: 'TREBLE TAKES NEIGHBOURS', tone: 'good', big: true }
    return { text: `CLAIMED ${seg.n}`, sub: null, tone: 'score', big: false }
  }
  if (entry.bust) return { text: 'BUST', sub: `BACK TO ${entry.left}`, tone: 'bad', big: true }
  if (entry.out) return { text: 'CHECKOUT!', sub: named ?? segmentLabel(seg), tone: 'good', big: true }
  if (!seg.v) return { text: 'MISS', sub: null, tone: 'miss', big: false }
  return { text: `${seg.v}`, sub: named, tone: seg.v >= 40 ? 'good' : 'score', big: seg.v >= 40 }
}

// ---------------------------------------------------------------------------
// Nerves, labels and stats
// ---------------------------------------------------------------------------

/** Hand-shake multiplier for `uid`: 1.25 in front, 0.85 furthest behind, 1 when level. */
export function nervesFactor(state, uid) {
  if (!state || !state.cfg.nerves || state.seats.length < 2) return 1
  const key = (u) => (state.cfg.mode === 'x01' ? -state.scores[u] : state.points[u])
  const keys = state.seats.map(key)
  const top = Math.max(...keys)
  const low = Math.min(...keys)
  if (top === low) return 1
  return NERVES_MIN + NERVES_SPAN * ((key(uid) - low) / (top - low))
}

/** SHAKY / EVEN / CALM for a seat card. */
export function nervesLabel(factor) {
  return factor > 1.08 ? 'SHAKY' : factor < 0.95 ? 'CALM' : 'EVEN'
}

/** Three-dart average this leg: points taken off per dart, times three. */
export function threeDartAverage(state, uid) {
  const darts = state.thrown[uid]
  if (!darts || state.cfg.mode !== 'x01') return 0
  return Math.round(((state.cfg.start - state.scores[uid]) / darts) * DARTS_PER_VISIT * 10) / 10
}

/** Seats ordered by who is ahead: fewest points left (Countdown) or most points (Turf). */
export function standings(state) {
  const key = (u) => (state.cfg.mode === 'x01' ? -state.scores[u] : state.points[u])
  return state.seats
    .map((uid, i) => ({ uid, i, key: key(uid) }))
    .sort((a, b) => (state.winner === a.uid ? -1 : state.winner === b.uid ? 1 : b.key - a.key || a.i - b.i))
    .map((s) => s.uid)
}

// ---------------------------------------------------------------------------
// Throw feel (the thrower's own phone; only the landing point is stored)
// ---------------------------------------------------------------------------

/** Radius of the hand shake after `t` seconds of holding, with Nerves applied. */
export function shakeRadius(t, factor = 1, steady = false) {
  const breath = SHAKE_TIGHT + (1 - SHAKE_TIGHT) * (0.5 + 0.5 * Math.cos((TAU * t) / BREATH_S))
  const tired = t > TIRED_AFTER_S ? 1 + (t - TIRED_AFTER_S) * 0.5 : 1
  return SHAKE_MM * breath * tired * factor * (steady ? 0.3 : 1)
}

/** Where inside the shake ring the hand is at `t` seconds. */
export function shakeOffset(t, radius) {
  return { x: Math.sin(t * 5.3 + 1.2) * radius * 0.86, y: Math.sin(t * 3.9 + 0.3) * radius * 0.86 }
}

/**
 * Where the crosshair starts for a touch: a random point 20 to 45 mm away in a
 * random direction, so each dart begins with a correction. Millimetres.
 */
export function aimStart(touch, rng = Math.random) {
  const a = rng() * TAU
  const d = AIM_START_MM * (0.45 + 0.55 * Math.sqrt(rng()))
  return clampAim({ x: touch.x + Math.cos(a) * d, y: touch.y + Math.sin(a) * d })
}

export function clampAim(p) {
  const r = Math.hypot(p.x, p.y)
  return r > AIM_LIMIT_MM ? { x: (p.x * AIM_LIMIT_MM) / r, y: (p.y * AIM_LIMIT_MM) / r } : p
}

/** One-button throw: a line sweeping the board; `axis` 'x' then 'y'. Millimetres. */
export function sweepAt(t, axis, factor = 1) {
  return SWEEP_MM * Math.sin(t * SWEEP_RATE * factor + (axis === 'y' ? 1.1 : 0))
}

/** Roughly normal noise, mean 0, spread about 1. */
export function gauss(rng = Math.random) {
  let u = 0
  for (let i = 0; i < 4; i++) u += rng()
  return (u - 2) * 1.73
}

/** A millimetre point as the integer throw to store. */
export function toThrow(x, y) {
  return cleanThrow({ x: Math.round(x * UNIT), y: Math.round(y * UNIT) })
}

// ---------------------------------------------------------------------------
// Bot (solo and pass-and-play pages). The same aim model as a person, with a
// wider error at the lower levels and Nerves applied: never a hidden advantage.
// ---------------------------------------------------------------------------

// Leaves that are easy to finish from, best first.
const LEAVES = [40, 32, 36, 24, 16, 20, 8, 12, 4, 28, 10, 6, 2, 30, 18, 14, 22, 26, 34, 38]

function leaveSingle(rem) {
  let best = 1
  let bestCost = Infinity
  for (let n = 1; n <= 20; n++) {
    const left = rem - n
    if (left < 2) continue
    const at = LEAVES.indexOf(left)
    const cost = at >= 0 ? at : 40 + left
    if (cost < bestCost) { bestCost = cost; best = n }
  }
  return segmentCentre({ ring: 'S', n: best, idx: SECTORS.indexOf(best) })
}

/** Where the bot means to throw, in millimetres. */
export function botTarget(state, uid, level = 'normal', rng = Math.random) {
  if (state.phase === 'shoot') return { x: 0, y: 0 }
  if (state.cfg.mode === 'turf') {
    const open = []
    state.turf.forEach((t, idx) => {
      if (t && t.lock && t.owner !== uid) return
      if (t && t.owner === uid && (level !== 'hard' || t.lock)) return
      open.push(idx)
    })
    if (!open.length) return { x: 0, y: 0 }
    const idx = open[Math.floor(rng() * open.length)]
    const mine = state.turf[idx] && state.turf[idx].owner === uid
    return segmentCentre({ ring: mine ? 'D' : 'S', n: SECTORS[idx], idx })
  }
  const rem = state.scores[uid]
  const fin = finishSegments(rem)
  if (fin.length) {
    const order = ['S', 'T', 'D', 'O', 'B']
    fin.sort((a, b) => order.indexOf(a.ring) - order.indexOf(b.ring))
    return segmentCentre(fin[0])
  }
  if (rem > 60) return segmentCentre({ ring: 'T', n: 20, idx: 0 })
  return leaveSingle(rem)
}

/** The bot's dart: its target plus the level's error and the board's scatter, stored form. */
export function botThrow(state, uid, level = 'normal', rng = Math.random) {
  const target = botTarget(state, uid, level, rng)
  const sigma = (BOT_SIGMA_MM[level] ?? BOT_SIGMA_MM.normal) * nervesFactor(state, uid)
  return toThrow(
    target.x + gauss(rng) * sigma + gauss(rng) * SCATTER_MM,
    target.y + gauss(rng) * sigma + gauss(rng) * SCATTER_MM,
  )
}

/** A seeded random source for tests and replays of bot play. */
export const botRng = (seed) => mulberry32(seed)
