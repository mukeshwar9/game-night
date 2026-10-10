// bonkNet.js — BONK BUGGIES: the plain-object "view" the renderer paints, and
// the compact snapshot the host streams so the guest can paint the same thing.
// Pure — no DOM, no Firebase, no React, no physics engine.
//
// The renderer never touches planck bodies: it draws a view. The host builds
// one straight from the sim (viewOf), the guest decodes one from a snapshot
// (decodeSnapshot) and dead-reckons it forward (extrapolate), the one-phone
// page uses viewOf like the host. A view is:
//
//   { phase, timer, digit, round, score:[a,b], target, arena, water, tideLeft,
//     cars:[{ i, dir, x, y, a, vx, vy, w, wheels:[{x,y,a}×2], alive, shield,
//             grace, hopCd, hopFx, d, headR, out }],
//     planks:[{x,y,a}], pick:{by,options,left}|null, outcome, winner }

import { ARENA_IDS, arenaGeometry } from './bonkArenas'
import { HEAD, T, WHEEL, TARGET, PICK_SECONDS, BOT_PICK_SECONDS, SEATS, countDigit } from './bonkLogic'

const PHASES = ['count', 'play', 'ko', 'pick', 'over']
const REASONS = ['bonk', 'self', 'sunk']
const EVENT_TYPES = ['hit', 'splash', 'hop', 'shield', 'bonk', 'self', 'sunk', 'point', 'count', 'go', 'pick', 'chose', 'match']
export const MAX_SNAPSHOT_EVENTS = 16

const r3 = (n) => Math.round(n * 1e3) / 1e3
const bool = (v) => (v ? 1 : 0)

/** The view of a live match, straight from the sim. */
export function viewOf(m) {
  const r = m.r
  const cars = r.cars.map((c) => {
    const p = c.chassis.getPosition()
    const v = c.chassis.getLinearVelocity()
    return {
      i: c.i, dir: c.dir, x: p.x, y: p.y, a: c.chassis.getAngle(), vx: v.x, vy: v.y, w: c.chassis.getAngularVelocity(),
      wheels: c.wheels.map((b) => { const q = b.getPosition(); return { x: q.x, y: q.y, a: b.getAngle() } }),
      alive: c.alive, shield: c.shield > 0, grace: c.grace, hopCd: c.hopCd, hopFx: c.hopFx, d: c.d, headR: c.headR,
      out: c.out ? { reason: c.out.reason, x: c.out.x ?? p.x, y: c.out.y ?? r.water } : null,
    }
  })
  const o = m.outcome
  return {
    phase: m.phase, timer: m.timer, digit: countDigit(m), round: m.round, score: m.score.slice(), target: m.target,
    arena: r.arena.id, water: r.water, tideLeft: T.tideStart - r.t, cars,
    planks: r.planks.map((p) => { const q = p.body.getPosition(); return { x: q.x, y: q.y, a: p.body.getAngle() } }),
    pick: m.pick ? { by: m.pick.by, options: m.pick.options.slice(), left: Math.max(0, (m.bots.includes(SEATS[m.pick.by]) ? BOT_PICK_SECONDS : PICK_SECONDS) - m.timer) } : null,
    outcome: o ? { winner: o.winner, reason: o.reason, double: o.double, loser: o.loser, x: o.x, y: o.y } : null,
    winner: m.winner,
  }
}

/** A still view for the connecting screen and the first frames of a guest. */
export function staticView(arena = ARENA_IDS[0]) {
  const geo = arenaGeometry(arena)
  const cars = [0, 1].map((i) => {
    const x = geo.spawns[i]
    const y = geo.ground(x) + 0.72
    const dir = x < 0 ? 1 : -1
    return {
      i, dir, x, y, a: 0, vx: 0, vy: 0, w: 0,
      wheels: [-1, 1].map((s) => ({ x: x + s * WHEEL.x, y: y + WHEEL.y, a: 0 })),
      alive: true, shield: false, grace: 0, hopCd: 0, hopFx: 0, d: 0, headR: HEAD.r, out: null,
    }
  })
  return {
    phase: 'count', timer: 0, digit: 0, round: 1, score: [0, 0], target: TARGET, arena, water: T.water0, tideLeft: T.tideStart,
    cars, planks: geo.planks.map((p) => ({ x: p.x, y: p.y, a: 0 })), pick: null, outcome: null, winner: null,
  }
}

// ─── events over the wire ────────────────────────────────────────────────────
/** One event as a short numeric tuple [type, x, y, a, b, c] (cosmetic only). */
export function encodeEvent(e) {
  const t = EVENT_TYPES.indexOf(e.type)
  if (t < 0) return null
  const x = r3(e.x ?? 0)
  const y = r3(e.y ?? 0)
  switch (e.type) {
    case 'hit': return [t, x, y, r3(e.power), bool(e.cars), bool(e.wheel)]
    case 'splash': return [t, x, y, r3(e.power), 0, 0]
    case 'hop': return [t, x, y, r3(e.ux), r3(e.uy), e.car]
    case 'shield': return [t, x, y, 0, 0, e.car]
    case 'bonk': case 'self': case 'sunk': return [t, x, y, SEATS.indexOf(e.by), 0, e.car]
    case 'point': return [t, x, y, e.winner, bool(e.double), REASONS.indexOf(e.reason)]
    case 'count': return [t, 0, 0, e.digit, 0, 0]
    case 'pick': return [t, 0, 0, SEATS.indexOf(e.by), 0, 0]
    case 'chose': return [t, 0, 0, ARENA_IDS.indexOf(e.arena), 0, 0]
    default: return [t, 0, 0, 0, 0, 0]
  }
}

/** The inverse of encodeEvent, in the shape the sim's own events have. */
export function decodeEvent(tuple) {
  if (!Array.isArray(tuple)) return null
  const [t, x, y, a, b, c] = tuple
  const type = EVENT_TYPES[t]
  if (!type) return null
  switch (type) {
    case 'hit': return { type, x, y, power: a, cars: !!b, wheel: !!c }
    case 'splash': return { type, x, y, power: a }
    case 'hop': return { type, x, y, ux: a, uy: b, car: c }
    case 'shield': return { type, x, y, car: c }
    case 'bonk': case 'self': case 'sunk': return { type, x, y, by: SEATS[a], car: c }
    case 'point': return { type, x, y, winner: a, by: a >= 0 ? SEATS[a] : undefined, double: !!b, reason: REASONS[c] }
    case 'count': return { type, digit: a }
    case 'pick': return { type, by: SEATS[a] }
    case 'chose': return { type, arena: ARENA_IDS[a] }
    default: return { type }
  }
}

// ─── snapshots ───────────────────────────────────────────────────────────────
/** What the host sends ~30 times a second. `events` are the sim's own events since the last one. */
export function encodeSnapshot(m, events = []) {
  const v = viewOf(m)
  const o = v.outcome
  return {
    t: 's',
    ph: PHASES.indexOf(v.phase), tm: r3(v.timer), dg: v.digit, rd: v.round, sc: v.score,
    ar: ARENA_IDS.indexOf(v.arena), wt: r3(v.water), tl: r3(v.tideLeft),
    c: v.cars.map((c) => [
      r3(c.x), r3(c.y), r3(c.a), r3(c.vx), r3(c.vy), r3(c.w),
      r3(c.wheels[0].x), r3(c.wheels[0].y), r3(c.wheels[0].a), r3(c.wheels[1].x), r3(c.wheels[1].y), r3(c.wheels[1].a),
      bool(c.alive) | (bool(c.shield) << 1), r3(c.hopCd), r3(c.hopFx), r3(c.grace), c.d, c.dir, r3(c.headR),
      c.out ? REASONS.indexOf(c.out.reason) : -1, c.out ? r3(c.out.x) : 0, c.out ? r3(c.out.y) : 0,
    ]),
    pl: v.planks.map((p) => [r3(p.x), r3(p.y), r3(p.a)]),
    pk: v.pick ? [v.pick.by, ARENA_IDS.indexOf(v.pick.options[0]), ARENA_IDS.indexOf(v.pick.options[1]), r3(v.pick.left)] : null,
    oc: o ? [o.winner, REASONS.indexOf(o.reason), bool(o.double), o.loser, r3(o.x ?? 0), r3(o.y ?? 0)] : null,
    w: v.winner ? SEATS.indexOf(v.winner) : -1,
    ev: events.slice(-MAX_SNAPSHOT_EVENTS).map(encodeEvent).filter(Boolean),
  }
}

/** Snapshot → view. Tolerates a short or malformed snapshot by falling back to a still scene. */
export function decodeSnapshot(s) {
  const arena = ARENA_IDS[s?.ar] || ARENA_IDS[0]
  if (!s || !Array.isArray(s.c) || s.c.length < 2) return staticView(arena)
  const cars = s.c.slice(0, 2).map((c, i) => ({
    i, dir: c[17] < 0 ? -1 : 1, x: c[0], y: c[1], a: c[2], vx: c[3], vy: c[4], w: c[5],
    wheels: [{ x: c[6], y: c[7], a: c[8] }, { x: c[9], y: c[10], a: c[11] }],
    alive: !!(c[12] & 1), shield: !!(c[12] & 2), hopCd: c[13], hopFx: c[14], grace: c[15], d: c[16], headR: c[18] || HEAD.r,
    out: c[19] >= 0 ? { reason: REASONS[c[19]] || 'sunk', x: c[20], y: c[21] } : null,
  }))
  const oc = s.oc
  return {
    phase: PHASES[s.ph] || 'count', timer: s.tm || 0, digit: s.dg || 0, round: s.rd || 1,
    score: Array.isArray(s.sc) ? [s.sc[0] | 0, s.sc[1] | 0] : [0, 0], target: TARGET,
    arena, water: s.wt ?? T.water0, tideLeft: s.tl ?? T.tideStart, cars,
    planks: (s.pl || []).map((p) => ({ x: p[0], y: p[1], a: p[2] })),
    pick: s.pk ? { by: s.pk[0], options: [ARENA_IDS[s.pk[1]], ARENA_IDS[s.pk[2]]], left: s.pk[3] } : null,
    outcome: oc ? { winner: oc[0], reason: REASONS[oc[1]] || 'sunk', double: !!oc[2], loser: oc[3], x: oc[4], y: oc[5] } : null,
    winner: s.w >= 0 ? SEATS[s.w] : null,
  }
}

const MAX_REACKON = 0.1
/** Dead-reckon a decoded view `age` seconds forward (only while the sim runs at full speed). */
export function extrapolate(view, age) {
  if (view.phase !== 'play') return view
  const a = Math.min(Math.max(age, 0), MAX_REACKON)
  if (a <= 0) return view
  return {
    ...view,
    cars: view.cars.map((c) => (c.alive ? {
      ...c,
      x: c.x + c.vx * a, y: c.y + c.vy * a, a: c.a + c.w * a,
      wheels: c.wheels.map((w) => ({ ...w, x: w.x + c.vx * a, y: w.y + c.vy * a })),
    } : c)),
  }
}
