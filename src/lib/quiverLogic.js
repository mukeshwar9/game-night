// quiverLogic.js — pure QUIVER sim. No DOM, no network.
// Same contract as the other real-time sims: createState / step / botInput /
// getWinner, one fixed timestep per step() call.
//
// A wooden wheel turns in the middle of the table. Every player has a button at
// their own edge and a limited quiver. Press it and an arrow flies down your
// lane to the hub; where it lands depends on what part of the rim is facing
// your lane when it arrives, so you lead the wheel. Everyone shoots at once.
//
// Per arrow (resolved the moment it reaches the rim):
//   • CLINK     it lands on a stuck arrow (within CLINK_WIDTH): the arrow is lost,
//               you lose a point (never below 0) and your button locks for
//               LOCK_SECONDS. In co-op the team loses a heart instead.
//   • STAR      +1, the star is taken and the arrow sticks.
//   • GOLD      +3, same.
//   • BOMB      every stuck arrow blows off the rim; the arrow that set it off
//               is lost too.
//   • REVERSE   the wheel turns the other way from here on; the arrow sticks.
//   • CLOSE SHAVE (twist) landing just clear of a stuck arrow, on no item, +1.
//   • bare rim  the arrow sticks and scores nothing; it is now a wall.
//
// Rim items (twist) deal one gold star, one bomb and one reverse token on top
// of the stars. UNDERDOG SIGHT (twist) is a pure function of the state:
// `sightAngle()` says where an arrow shot right now would land, for whoever is
// strictly last.
//
// A wheel ends when its stars are gone, when every quiver is empty and nothing
// is in the air, or when WHEEL_SECONDS have passed. Three wheels per match:
// most stars wins; a tie plays up to SUDDEN_MAX sudden-death wheels (one star,
// one arrow each, only the tied leaders shoot) and then is a draw. Co-op: one
// team, three hearts; a clink or an uncleared wheel costs one; clear
// three wheels with a heart left.
//
// Input per player, every tick: { fire: boolean }. The sim never trusts more
// than that: reload, lock and quiver are checked here.
//
// Numbers are starting values to tune by playtest (see docs/STATUS.md). step()
// never mutates its argument (the host hook requires it) and draws every random
// number from a seed carried in the state, so a round replays exactly.

export const TABLE_W = 360
export const TABLE_H = 540
export const CENTER = { x: TABLE_W / 2, y: TABLE_H / 2 }
export const WHEEL_R = 68
export const ARROW_LEN = 44
export const FLY_SPEED = 900               // px / s down the lane
export const CLINK_WIDTH = 0.17            // rad: within this of a stuck arrow is a clink
export const STAR_WIDTH = 0.16             // rad: within this of an item takes it
export const SHAVE_WIDTH = 0.11            // rad: the CLOSE SHAVE band just outside a clink
export const WHEELS = 3
export const WHEEL_SECONDS = 15
export const SUDDEN_SECONDS = 12
export const SUDDEN_MAX = 4
export const RELOAD_SECONDS = 0.4
export const LOCK_SECONDS = 0.8
export const HEARTS = 3
export const GOLD_VALUE = 3
export const COUNT_IN_SECONDS = 3.4        // shows 3 · 2 · 1 then GO! for the last 0.4 s
export const BETWEEN_SECONDS = 1.1         // banner before each wheel
export const EMPTY_GRACE = 0.7             // all quivers empty: the wheel ends after this
export const MIN_SEPARATION = 0.52         // rad between two items on the rim
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4

/** Arrows per player, by player count. */
export const QUIVER = { 2: 8, 3: 6, 4: 5 }
/** Stars on each wheel, by player count (gold, bomb and reverse come on top). */
export const STARS = { 2: 5, 3: 6, 4: 6 }

export const ITEM_KINDS = ['star', 'gold', 'bomb', 'flip']
export const RESULT_KINDS = ['bare', 'star', 'gold', 'shave', 'clink', 'bomb', 'flip']

const MUZZLE_BACK = 34                     // an arrow leaves this far short of the seat centre
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const r1 = (n) => Math.round(n * 10) / 10
const r2 = (n) => Math.round(n * 100) / 100
const r3 = (n) => Math.round(n * 1000) / 1000

// ── wheel patterns ──────────────────────────────────────────────────────────
// Wheel 1 turns steadily, wheel 2 is faster with a speed wobble, wheel 3 is
// slower with big surges. Angle in radians as a function of seconds.
const PATTERNS = [
  (t) => 1.5 * t,
  (t) => 2.0 * t + 0.9 * Math.sin(1.3 * t),
  (t) => 1.2 * t + 2.2 * Math.sin(0.9 * t),
]

/** Wrap an angle into (-π, π]. */
export function norm(a) {
  let x = a % (Math.PI * 2)
  if (x > Math.PI) x -= Math.PI * 2
  if (x < -Math.PI) x += Math.PI * 2
  return x
}
export const angleDist = (a, b) => Math.abs(norm(a - b))

/** The wheel's angle at match time `tau` for this state's pattern. */
export function wheelAngle(s, tau = s.tau) {
  return s.off + s.dir * PATTERNS[s.pat % PATTERNS.length](tau)
}

// ── seats ───────────────────────────────────────────────────────────────────

/**
 * Where each button sits. Two face each other; three take the bottom corners
 * and the top centre; four take the corners. `flip` marks the seats across the
 * table, whose labels a phone laid flat should print upside down.
 */
export function seatsFor(n) {
  if (n <= 2) return [{ x: 180, y: 486, flip: false }, { x: 180, y: 54, flip: true }]
  if (n === 3) return [{ x: 56, y: 486, flip: false }, { x: 304, y: 486, flip: false }, { x: 180, y: 54, flip: true }]
  return [{ x: 56, y: 486, flip: false }, { x: 304, y: 486, flip: false }, { x: 304, y: 54, flip: true }, { x: 56, y: 54, flip: true }]
}

const laneAngle = (seat) => Math.atan2(seat.y - CENTER.y, seat.x - CENTER.x)
const laneStart = (seat) => Math.hypot(seat.x - CENTER.x, seat.y - CENTER.y) - MUZZLE_BACK

/** Seconds an arrow from player `p` spends in the air. */
export function flightSeconds(p) { return (laneStart(p.seat) - WHEEL_R) / FLY_SPEED }

// ── rng ─────────────────────────────────────────────────────────────────────

function rand(s) {
  s.rng = (s.rng + 0x6D2B79F5) | 0
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ── state ───────────────────────────────────────────────────────────────────

/**
 * @param {{ players?: number, bots?: Array<string|null>, seed?: number,
 *   countIn?: number, shave?: boolean, items?: boolean, sight?: boolean,
 *   coop?: boolean }} [opts]
 */
export function createState(opts = {}) {
  const n = clamp(Math.round(opts.players ?? 2), MIN_PLAYERS, MAX_PLAYERS)
  const seats = seatsFor(n)
  const countIn = opts.countIn ?? COUNT_IN_SECONDS
  const s = {
    tick: 0, t: 0,
    phase: countIn > 0 ? 'count' : 'play',
    count: countIn,
    tau: 0, off: 0, dir: 1, pat: 0,
    wheel: 0, sudden: 0,
    wt: WHEEL_SECONDS, pause: 0, empty: 0,
    hearts: HEARTS,
    coop: !!opts.coop,
    shave: opts.shave !== false,
    itemsOn: opts.items !== false,
    sightOn: opts.sight !== false,
    winner: null,
    rng: (opts.seed ?? 1) | 0,
    nextId: 1,
    players: seats.map((seat, i) => ({
      i, seat, phi: laneAngle(seat), score: 0, ammo: QUIVER[n], cool: 0, stun: 0, out: false,
      bot: opts.bots?.[i] ?? null,
    })),
    pins: [],            // { id, a, o }  a is the angle in the wheel's own frame
    items: [],           // { id, a, kind }
    fly: [],             // { id, o, d, d0 }  d is the distance left to the hub
    results: [],         // the last few arrows' fates: { id, o, kind }
    cleared: true,       // co-op: every star on this wheel was taken
  }
  dealWheel(s)
  s.pause = 0          // the count-in is the first wheel's banner
  return s
}

function cloneState(st) {
  return {
    ...st,
    players: st.players.map((p) => ({ ...p })),
    pins: st.pins.map((x) => ({ ...x })),
    items: st.items.map((x) => ({ ...x })),
    fly: st.fly.map((x) => ({ ...x })),
    results: st.results.slice(),
  }
}

/** Put a fresh wheel on the table: items dealt, quivers refilled, clock reset. */
function dealWheel(s) {
  const n = s.players.length
  const sudden = s.sudden > 0
  const kinds = []
  for (let i = 0; i < (sudden ? 1 : STARS[n]); i++) kinds.push('star')
  if (s.itemsOn && !sudden) kinds.push('gold', 'bomb', 'flip')
  // Shuffle, then place each item in its own slice of the rim with a little
  // jitter, so no two are closer than MIN_SEPARATION.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1))
    ;[kinds[i], kinds[j]] = [kinds[j], kinds[i]]
  }
  const slot = (Math.PI * 2) / kinds.length
  const base = rand(s) * Math.PI * 2
  s.items = kinds.map((kind, k) => ({
    id: s.nextId++,
    a: norm(base + (k + 0.5 + (rand(s) - 0.5) * 0.2) * slot),
    kind,
  }))
  s.pins = []
  s.fly = []
  s.pat = sudden ? 1 : s.wheel % PATTERNS.length
  // Keep the wheel where it is: only the pattern (and so the speed) changes.
  s.off = wheelAngle(s, s.tau) - s.dir * PATTERNS[s.pat](s.tau)
  s.wt = sudden ? SUDDEN_SECONDS : WHEEL_SECONDS
  s.pause = BETWEEN_SECONDS
  s.empty = 0
  s.cleared = true
  for (const p of s.players) {
    p.ammo = sudden ? (p.out ? 0 : 1) : QUIVER[n]
    p.cool = 0
    p.stun = 0
  }
}

export function canFire(s, i) {
  const p = s.players[i]
  return !!p && s.phase === 'play' && s.pause <= 0 && !p.out && p.ammo > 0 && p.cool <= 0 && p.stun <= 0
}

const starsLeft = (s) => s.items.reduce((n, it) => n + (it.kind === 'star' || it.kind === 'gold' ? 1 : 0), 0)
const teamScore = (s) => s.players.reduce((n, p) => n + p.score, 0)

// ── landing ─────────────────────────────────────────────────────────────────

function pushResult(s, id, o, kind) {
  s.results.push({ id, o, kind })
  if (s.results.length > 6) s.results.shift()
}

/** An arrow reaches the rim. Mutates the (already cloned) state. */
function land(s, f, events) {
  const p = s.players[f.o]
  const a = norm(p.phi - wheelAngle(s))
  let near = Infinity
  for (const pin of s.pins) near = Math.min(near, angleDist(a, pin.a))

  if (near < CLINK_WIDTH) {
    if (s.coop) { s.hearts = Math.max(0, s.hearts - 1) } else p.score = Math.max(0, p.score - 1)
    p.stun = LOCK_SECONDS
    pushResult(s, f.id, f.o, 'clink')
    events.push({ type: 'clink', by: f.o })
    return
  }

  let hit = null
  for (const it of s.items) if (angleDist(a, it.a) < STAR_WIDTH) hit = it
  if (hit) s.items = s.items.filter((it) => it !== hit)

  if (hit?.kind === 'bomb') {
    s.pins = []
    pushResult(s, f.id, f.o, 'bomb')
    events.push({ type: 'bomb', by: f.o })
    return
  }

  let kind = 'bare'
  if (hit?.kind === 'star') { p.score += 1; kind = 'star' }
  else if (hit?.kind === 'gold') { p.score += GOLD_VALUE; kind = 'gold' }
  else if (hit?.kind === 'flip') {
    const th = wheelAngle(s)
    s.dir = -s.dir
    s.off = th - s.dir * PATTERNS[s.pat](s.tau)
    kind = 'flip'
  } else if (s.shave && near < CLINK_WIDTH + SHAVE_WIDTH) { p.score += 1; kind = 'shave' }

  // The pin is added after the reversal so it keeps its place on the wheel.
  s.pins.push({ id: f.id, a, o: f.o })
  pushResult(s, f.id, f.o, kind)
  events.push({ type: kind === 'bare' ? 'stick' : kind, by: f.o })
}

// ── wheels and the match ────────────────────────────────────────────────────

function finish(s, winner, events) {
  s.phase = 'over'
  s.winner = winner
  s.fly = []
  events.push({ type: 'end' })
}

/** The wheel is over: score it, then deal the next one or end the match. */
function endWheel(s, events) {
  if (s.coop) {
    if (!s.cleared) s.hearts = Math.max(0, s.hearts - 1)
    if (s.hearts <= 0) return finish(s, 'lost', events)
    if (s.wheel + 1 >= WHEELS) return finish(s, 'team', events)
  } else if (s.sudden === 0) {
    if (s.wheel + 1 >= WHEELS) {
      const best = Math.max(...s.players.map((p) => p.score))
      const lead = s.players.filter((p) => p.score === best)
      if (lead.length === 1) return finish(s, lead[0].i, events)
      s.players.forEach((p) => { p.out = !lead.includes(p) })
      s.sudden = 1
      events.push({ type: 'sudden' })
      return dealWheel(s)
    }
  } else if (s.sudden >= SUDDEN_MAX) {
    return finish(s, 'draw', events)
  } else {
    s.sudden += 1
    events.push({ type: 'sudden' })
    return dealWheel(s)
  }
  s.wheel += 1
  events.push({ type: 'wheel', n: s.wheel })
  return dealWheel(s)
}

// ── step ────────────────────────────────────────────────────────────────────

/** Normalise whatever a page or a peer sent for one player. */
export function cleanInput(input) {
  return { fire: !!input?.fire }
}

/**
 * Advance one fixed tick. `inputs` is indexed by player. Returns the new state
 * and the events of this tick: throw, stick, star, gold, shave, clink, bomb,
 * flip (each with `by`), plus sudden, wheel, tick, go and end.
 * @returns {{ state: ReturnType<typeof createState>, events: Array<{type: string, by?: number, n?: number}> }}
 */
export function step(state, inputs, dt) {
  const s = cloneState(state)
  const events = []
  s.tick += 1
  s.t += dt
  s.tau += dt
  if (s.phase === 'over') return { state: s, events }

  if (s.phase === 'count') {
    s.count -= dt
    if (s.count <= 0) { s.phase = 'play'; s.count = 0; events.push({ type: 'go' }) }
    return { state: s, events }
  }

  if (s.pause > 0) { s.pause = Math.max(0, s.pause - dt); return { state: s, events } }

  for (const p of s.players) {
    if (p.cool > 0) p.cool = Math.max(0, p.cool - dt)
    if (p.stun > 0) p.stun = Math.max(0, p.stun - dt)
  }

  // Shots first, so an arrow fired this tick starts flying this tick.
  for (const p of s.players) {
    if (!cleanInput(inputs?.[p.i]).fire || !canFire(s, p.i)) continue
    p.ammo -= 1
    p.cool = RELOAD_SECONDS
    const d = laneStart(p.seat)
    s.fly.push({ id: s.nextId++, o: p.i, d, d0: d })
    events.push({ type: 'throw', by: p.i })
  }

  // Flights, in the order the arrows were fired.
  const landed = []
  const before = s.wt
  for (const f of s.fly) {
    f.d -= FLY_SPEED * dt
    if (f.d <= WHEEL_R) landed.push(f)
  }
  if (landed.length) {
    s.fly = s.fly.filter((f) => f.d > WHEEL_R)
    for (const f of landed) {
      land(s, f, events)
      if (s.coop && s.hearts <= 0) {
        finish(s, 'lost', events)
        return { state: s, events }
      }
    }
  }

  // Sudden death ends the instant a star is taken.
  if (s.sudden > 0 && landed.length) {
    const taker = s.results.slice(-landed.length).find((r) => r.kind === 'star')
    if (taker) { finish(s, taker.o, events); return { state: s, events } }
  }

  s.wt = Math.max(0, s.wt - dt)
  // A tick for each of the last three whole seconds on the wheel clock.
  if (s.wt > 0 && Math.ceil(s.wt) <= 3 && Math.ceil(before) > Math.ceil(s.wt)) events.push({ type: 'tick' })
  const spent = s.players.every((p) => p.out || p.ammo <= 0)
  s.empty = spent && s.fly.length === 0 ? s.empty + dt : 0

  if (starsLeft(s) === 0) {
    if (s.fly.length === 0) endWheel(s, events)
  } else if (s.empty >= EMPTY_GRACE || (s.wt <= 0 && s.fly.length === 0)) {
    if (s.coop) s.cleared = false
    endWheel(s, events)
  }
  return { state: s, events }
}

/** 0-based seat, 'draw', 'team' (co-op cleared), 'lost' (co-op) or null while playing. */
export function getWinner(state) { return state.phase === 'over' ? state.winner : null }

export function ranking(state) {
  return state.players.map((p) => ({ i: p.i, score: p.score })).sort((a, b) => b.score - a.score || a.i - b.i)
}

// ── online seats ────────────────────────────────────────────────────────────

export const SEAT_SYMBOLS = ['X', 'O']
export const seatOfSymbol = (sym) => (sym === 'O' ? 1 : 0)
/** The room's winner symbol: 'X' | 'O' | 'draw' | null while playing. */
export function winnerSymbol(state) {
  const w = getWinner(state)
  if (w == null) return null
  if (w === 'draw') return 'draw'
  return typeof w === 'number' ? SEAT_SYMBOLS[w] ?? 'draw' : 'draw'
}

// ── underdog sight ──────────────────────────────────────────────────────────

/**
 * The twist: whoever is strictly last sees where an arrow shot right now would
 * land. Returns the marker's angle in the wheel's own frame, or null.
 */
export function sightAngle(state, i) {
  const p = state.players[i]
  if (!state.sightOn || state.coop || !p || p.bot || p.out || state.sudden > 0) return null
  if (state.phase !== 'play' || p.ammo <= 0) return null
  const lowest = Math.min(...state.players.map((q) => q.score))
  if (p.score !== lowest || state.players.filter((q) => q.score === lowest).length !== 1) return null
  return norm(p.phi - wheelAngle(state, state.tau + flightSeconds(p)))
}

// ── bots ────────────────────────────────────────────────────────────────────

/** Timing error (σ, seconds) per level: the only handicap a bot has. */
export const BOT_LEVELS = { easy: 0.13, normal: 0.06, hard: 0.02 }

export function createBrain() { return { at: null, sig: '' } }

function gauss(rng) {
  let u = 0
  for (let k = 0; k < 6; k++) u += rng()
  return (u - 3) / 0.7071
}

/** When (in seconds from now) a bot should loose its next arrow. */
function plan(state, p, level, rng) {
  const fl = flightSeconds(p)
  let best = null
  let safe = null
  for (let t = 0.3; t < 1.6; t += 1 / 120) {
    const a = norm(p.phi - wheelAngle(state, state.tau + t + fl))
    let near = Infinity
    for (const pin of state.pins) near = Math.min(near, angleDist(a, pin.a))
    if (near < CLINK_WIDTH + 0.07) continue
    if (state.items.some((it) => it.kind !== 'bomb' && angleDist(a, it.a) < 0.04)) { best = t; break }
    if (safe == null && near > 0.45) safe = t
  }
  const t = best ?? safe ?? 1.2
  return Math.max(0.2, t + gauss(rng) * (BOT_LEVELS[level] ?? BOT_LEVELS.normal))
}

/**
 * One bot's input for this tick. `brain` keeps the planned shot between calls;
 * a bot re-plans whenever the rim or the items change under it.
 */
export function botInput(state, i, level, brain, rng = Math.random) {
  const p = state.players[i]
  if (!canFire(state, i)) { brain.at = null; return { fire: false } }
  const sig = `${state.wheel}.${state.sudden}:${state.pins.length}:${state.items.length}:${state.dir}`
  if (brain.at == null || brain.sig !== sig) {
    brain.sig = sig
    brain.at = state.tau + plan(state, p, level, rng)
  }
  if (state.tau >= brain.at) { brain.at = null; return { fire: true } }
  return { fire: false }
}

// ── snapshots (online) ──────────────────────────────────────────────────────

const PHASES = ['count', 'play', 'over']
const winnerCode = (w) => (w == null ? -1 : w === 'draw' ? -2 : w === 'team' ? -3 : w === 'lost' ? -4 : w)
const winnerOf = (c) => (c === -1 ? null : c === -2 ? 'draw' : c === -3 ? 'team' : c === -4 ? 'lost' : c)

/** The wire form of the table the host streams ~30 times a second. */
export function encodeSnapshot(s) {
  return {
    t: 's',
    ph: PHASES.indexOf(s.phase),
    c: r2(s.count),
    w: s.wheel, su: s.sudden,
    ta: r3(s.tau), of: r3(s.off), di: s.dir, pa: s.pat,
    wt: r2(s.wt), ps: r2(s.pause),
    h: s.hearts, cl: s.cleared ? 1 : 0,
    wi: winnerCode(s.winner),
    pl: s.players.map((p) => [p.score, p.ammo, r2(p.cool), r2(p.stun), p.out ? 1 : 0]),
    pn: s.pins.map((x) => [x.id, r3(x.a), x.o]),
    it: s.items.map((x) => [x.id, r3(x.a), ITEM_KINDS.indexOf(x.kind)]),
    fy: s.fly.map((x) => [x.id, x.o, r1(x.d), r1(x.d0)]),
    rs: s.results.map((x) => [x.id, x.o, RESULT_KINDS.indexOf(x.kind)]),
  }
}

/** Rebuild a scene from a snapshot, on top of `base` (same options and player count). */
export function decodeSnapshot(snap, base) {
  const s = cloneState(base)
  s.phase = PHASES[snap.ph] ?? 'play'
  s.count = snap.c
  s.wheel = snap.w
  s.sudden = snap.su
  s.tau = snap.ta
  s.off = snap.of
  s.dir = snap.di
  s.pat = snap.pa
  s.wt = snap.wt
  s.pause = snap.ps
  s.hearts = snap.h
  s.cleared = !!snap.cl
  s.winner = winnerOf(snap.wi)
  snap.pl.forEach((q, i) => {
    const p = s.players[i]
    if (!p) return
    p.score = q[0]; p.ammo = q[1]; p.cool = q[2]; p.stun = q[3]; p.out = !!q[4]
  })
  s.pins = snap.pn.map(([id, a, o]) => ({ id, a, o }))
  s.items = snap.it.map(([id, a, k]) => ({ id, a, kind: ITEM_KINDS[k] ?? 'star' }))
  s.fly = snap.fy.map(([id, o, d, d0]) => ({ id, o, d, d0 }))
  s.results = snap.rs.map(([id, o, k]) => ({ id, o, kind: RESULT_KINDS[k] ?? 'bare' }))
  return s
}

/**
 * Carry a decoded scene forward by the snapshot's age so the wheel and the
 * arrows in the air do not stutter between snapshots. Landings wait for the
 * host: an arrow waits at the rim until the next snapshot resolves it.
 */
export function deadReckon(scene, age) {
  const a = clamp(age, 0, 0.25)
  if (a <= 0 || scene.phase === 'over') return scene
  const s = cloneState(scene)
  s.tau += a
  if (s.phase === 'count') { s.count = Math.max(0, s.count - a); return s }
  if (s.pause > 0) { s.pause = Math.max(0, s.pause - a); return s }
  s.wt = Math.max(0, s.wt - a)
  for (const p of s.players) { p.cool = Math.max(0, p.cool - a); p.stun = Math.max(0, p.stun - a) }
  for (const f of s.fly) f.d = Math.max(WHEEL_R + 0.5, f.d - FLY_SPEED * a)
  return s
}
