// SIDE KICK: a four-rider motorbike sprint where you can kick the rider beside
// you. Pure rules: no DOM, no Firebase, no React. The renderer is
// components/sideKickRender.js, the pages are SideKickDemo (solo) and
// SideKickGame (online, inside RaceShell).
//
// The world is a fixed 60 Hz step over a seeded pseudo-3D road. Every rider is
// either LOCAL (this phone simulates it: the player, the solo bots, the room
// coordinator's bots) or a GHOST (another phone's rider, placed from its last
// report). A kick is judged by the kicker's phone against the ghost it sees;
// the shove, the pip and the stagger are then applied by the victim's own phone
// (`receiveKick`), so a rider's state is only ever changed by its own sim.
//
// Every number below is a starting value chosen by playtest-free design; see
// docs/SIDE-KICK.md for what to move first.

import { mulberry32, detCos } from './detMath'

// ── Road ─────────────────────────────────────────────────────────────────
export const SEG = 200
export const MAXSPD = SEG * 60
export const LANEX = [-0.75, -0.25, 0.25, 0.75]
export const DT = 1 / 60
export const RIDERS = 4
export const MAX_X = 1.55

// ── Combat ───────────────────────────────────────────────────────────────
export const KICK_T = 0.3
export const KICK_HIT_AT = 0.09
export const KICK_CD = 0.7
export const KICK_BUFFER = 0.12
export const REACH_X = 0.37
export const REACH_MIN_X = 0.03
export const REACH_Z = 250
export const PIPS = 3
export const PIP_REGEN = 4
export const STAGGER = 0.5
export const OIL_STAGGER = 0.7
export const DOWN_T = 1.9
export const SHIELD = 1.5
export const SAME_ATTACKER_GUARD = 1
// Kicking costs balance: strain builds per kick, holds, then drains. Past 1.0 you fall.
export const STRAIN_HIT = 0.3
export const STRAIN_MISS = 0.4
export const STRAIN_HOLD = 0.4
export const STRAIN_DECAY = 0.25
// Boost: hold to burn, let go to refill.
export const BOOST_TOP = 1.18
export const BOOST_BURN = 1 / 2
export const BOOST_FILL = 1 / 8
export const BOOST_MIN = 0.15
export const BOOST_DELAY = 0.5
export const BOOST_START = 0.5
// Catch-up remount: only for a rider who falls with someone ahead of them.
export const DOWN_T_BEHIND = 1.2
export const CATCHUP_MAX = 6
export const CATCHUP_TOP = 1.14
export const CATCHUP_ACCEL = 2.2
export const REMOUNT_SPD = 0.28
export const REMOUNT_SPD_BEHIND = 0.55
export const SLIPSTREAM_TOP = 1.1
export const SLIPSTREAM_AFTER = 0.5
// Race flow.
export const COUNTDOWN = 3.2
export const RACE_END_AFTER_FIRST = 20
export const RACE_MAX = 120
export const FINISH_GRACE = 1.6
export const CUP_POINTS = [3, 2, 1, 0]
export const CUP_RACES = 3
export const PAYBACK_BONUS = 1

export const SOLO_NAMES = ['YOU', 'PLUM', 'RUBY', 'TEAL']
export const BOT_NAMES = ['PLUM', 'RUBY', 'TEAL', 'MOSS']

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeIn = (a, b, t) => a + (b - a) * t * t
const easeInOut = (a, b, t) => a + (b - a) * (-detCos(t * Math.PI) / 2 + 0.5)

// ── Tracks ───────────────────────────────────────────────────────────────
// A track is data: road pieces [enter, hold, leave, curve, hill] plus how busy
// and how wooded it is. RANDOM builds its pieces from the race seed.
const mirror = (list) => list.concat(list.map((q) => [q[0], q[1], q[2], -q[3], -q[4]]))

export const TRACKS = {
  meadow: {
    name: 'MEADOW RUN', gap: [70, 90], oil: [95, 80], trees: 0.34, houses: 0.035,
    pieces: () => [[20, 50, 20, 0, 0], [40, 60, 40, 2.2, 0], [30, 50, 30, 0, 22], [40, 90, 40, -3.6, -22], [25, 60, 25, 0, 12], [30, 40, 30, 3, -12], [30, 40, 30, -3, 0], [40, 150, 40, 0, 0], [30, 60, 30, 5, 18], [30, 80, 30, -2, -30], [25, 40, 25, 0, 26], [25, 40, 25, 0, -26], [40, 100, 40, -4.6, 0], [30, 50, 30, 2.6, 14], [30, 50, 30, -2.6, -14], [40, 160, 40, 0, 0], [30, 70, 30, 4, 0], [40, 90, 40, 0, 0]],
  },
  pass: {
    name: 'SWITCHBACK PASS', gap: [120, 120], oil: [150, 90], trees: 0.55, houses: 0.01,
    pieces: () => [[20, 40, 20, 0, 0]].concat(
      mirror([[30, 50, 30, 4.6, 26], [30, 50, 30, -5.2, 20], [20, 30, 20, 0, -34], [30, 60, 30, 5.6, -16], [30, 40, 30, -4.2, 30], [25, 40, 25, 3.6, -30], [30, 70, 30, -5.6, 4]]),
      mirror([[30, 60, 30, 4.8, 22], [30, 50, 30, -4.4, -22], [20, 60, 20, 0, 0]]),
      [[40, 80, 40, 0, 0]],
    ),
  },
  rush: {
    name: 'RUSH HOUR', gap: [30, 34], oil: [60, 50], trees: 0.14, houses: 0.14,
    pieces: () => [[20, 80, 20, 0, 0]].concat(
      mirror([[40, 120, 40, 1.2, 0], [40, 200, 40, 0, 0], [40, 100, 40, -1.6, 6], [40, 220, 40, 0, -6], [40, 100, 40, 1.4, 0]]),
      [[40, 120, 40, 0, 0]],
    ),
  },
  random: {
    name: 'RANDOM ROAD', gap: [60, 90], oil: [90, 80], trees: 0.34, houses: 0.05,
    pieces: (rnd) => {
      const out = [[20, 50, 20, 0, 0]]
      let total = 90
      let up = 0
      // The total length and the corner strength are clamped so a random road
      // is never much longer or harder than the named ones.
      while (total < 2750) {
        const hill = Math.round((rnd() - 0.5 - up * 0.004) * 56)
        up += hill
        const q = rnd() < 0.4
          ? [30, 60 + Math.floor(rnd() * 130), 30, 0, hill]
          : [30, 40 + Math.floor(rnd() * 60), 30, (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 3.4), hill]
        out.push(q)
        total += q[0] + q[1] + q[2]
      }
      out.push([40, 90, 40, 0, 0])
      return out
    },
  },
}
export const TRACK_IDS = Object.keys(TRACKS)
/** The online cup rides these three in turn (RANDOM ROAD is solo only). */
export const TRACK_ORDER = ['meadow', 'pass', 'rush']
export const TRACK_SEED = 20261010

export const trackForRace = (raceIndex) => TRACK_ORDER[((raceIndex | 0) % TRACK_ORDER.length + TRACK_ORDER.length) % TRACK_ORDER.length]

/**
 * Build a road. Scenery and traffic are seeded, so every phone grows the same
 * roadside and the same cars; a car's position is a pure function of race time.
 * @returns {{ id: string, name: string, segs: any[], finish: number, cars: any[] }}
 */
export function buildTrack(seed, trackId = 'meadow') {
  const def = TRACKS[trackId] || TRACKS.meadow
  const rnd = mulberry32(seed)
  const segs = []
  const lastY = () => (segs.length ? segs[segs.length - 1].y2 : 0)
  const add = (curve, y) => { const n = segs.length; segs.push({ i: n, z: n * SEG, y1: lastY(), y2: y, curve, spr: [], dark: false }) }
  const road = (enter, hold, leave, curve, hill) => {
    const sy = lastY()
    const ey = sy + hill * SEG
    const total = enter + hold + leave
    for (let n = 0; n < enter; n++) add(easeIn(0, curve, n / enter), easeInOut(sy, ey, n / total))
    for (let n = 0; n < hold; n++) add(curve, easeInOut(sy, ey, (enter + n) / total))
    for (let n = 0; n < leave; n++) add(easeInOut(curve, 0, n / leave), easeInOut(sy, ey, (enter + hold + n) / total))
  }
  for (const q of def.pieces(rnd)) road(q[0], q[1], q[2], q[3], q[4])
  const finish = segs.length * SEG
  road(40, 140, 40, 0, 0)
  for (const s of segs) s.dark = Math.floor(s.i / 3) % 2 === 0
  for (let i = 4; i < segs.length; i++) {
    const s = segs[i]
    const side = rnd() < 0.5 ? -1 : 1
    if (rnd() < def.trees) s.spr.push({ k: rnd() < 0.5 ? 'pine' : (rnd() < 0.6 ? 'tree' : 'bush'), x: side * (1.4 + rnd() * 2.6), v: rnd() })
    if (rnd() < 0.22) s.spr.push({ k: 'tuft', x: -side * (1.14 + rnd() * 0.5), v: rnd() })
    if (rnd() < def.houses) s.spr.push({ k: 'house', x: side * (3.2 + rnd() * 2.2), v: rnd() })
    if (i % 24 === 0) { s.spr.push({ k: 'flag', x: -1.18, v: (i / 24) % 4 }); s.spr.push({ k: 'flag', x: 1.18, v: (i / 24 + 2) % 4 }) }
    if (i % 24 === 12) s.spr.push({ k: 'lamp', x: (i / 12) % 4 < 2 ? -1.2 : 1.2, v: (i / 12) % 4 < 2 ? 1 : -1 })
    if (i % 170 === 85) s.spr.push({ k: 'board', x: (i % 340 < 170 ? -1 : 1) * 1.75, v: (i / 85) % 4 })
    if (Math.abs(s.curve) > 2.9 && i % 10 === 0) s.spr.push({ k: 'chev', x: s.curve > 0 ? -1.22 : 1.22, v: s.curve > 0 ? 1 : -1 })
  }
  for (let i = 130; i < segs.length - 260; i += def.oil[0] + Math.floor(rnd() * def.oil[1])) {
    segs[i].spr.push({ k: 'oil', x: LANEX[Math.floor(rnd() * 4)] + (rnd() - 0.5) * 0.1 })
  }
  for (let i = 40; i < segs.length - 40; i += 23 + Math.floor(rnd() * 50)) segs[i].spr.push({ k: 'patch', x: (rnd() - 0.5) * 1.7, v: rnd() })
  segs[9].spr.push({ k: 'gate', x: 0, v: 0 })
  segs[finish / SEG].spr.push({ k: 'gate', x: 0, v: 1 })
  const cars = []
  for (let z = 90 * SEG; z < finish - 60 * SEG; z += (def.gap[0] + rnd() * def.gap[1]) * SEG) {
    cars.push({ z0: z, z, x: LANEX[Math.floor(rnd() * 4)], spd: MAXSPD * (0.3 + rnd() * 0.12), col: Math.floor(rnd() * 6), van: rnd() < 0.3 })
  }
  return { id: trackId, name: def.name, segs, finish, cars }
}

export const segAt = (track, z) => track.segs[clamp(Math.floor(z / SEG), 0, track.segs.length - 1)]
export const roadY = (track, z) => {
  const s = segAt(track, z)
  return lerp(s.y1, s.y2, clamp((z - s.z) / SEG, 0, 1))
}

// ── Difficulty ───────────────────────────────────────────────────────────
// Per bot (k = 0, 1, 2): top speed as a share of MAXSPD, and how eagerly it
// hunts and kicks. NORMAL is the prototype's tuning.
export const DIFFICULTY = {
  easy: { label: 'EASY', base: [0.86, 0.88, 0.9, 0.9], aggr: [0.5, 0.7, 0.8, 0.8], band: 0.12 },
  normal: { label: 'NORMAL', base: [0.905, 0.925, 0.945, 0.945], aggr: [0.8, 1.1, 1.3, 1.3], band: 0.1 },
  hard: { label: 'HARD', base: [0.95, 0.97, 0.99, 0.99], aggr: [1.1, 1.4, 1.7, 1.7], band: 0.06 },
}
export const DIFFICULTY_IDS = Object.keys(DIFFICULTY)
export const getDifficulty = (id) => DIFFICULTY[id] || DIFFICULTY.normal

// ── World ────────────────────────────────────────────────────────────────
const GRID_X = [-0.45, 0.45, -0.15, 0.15]

function newRider(i, desc, slot, tune) {
  return {
    i, id: desc.id ?? `r${i}`, name: desc.name ?? `R${i + 1}`, avatar: desc.avatar ?? null,
    bot: !!desc.bot, local: desc.local !== false,
    x: GRID_X[slot % 4], z: 1500 + (slot % 4) * 250,
    vx: 0, speed: 0, lean: 0, state: 'ride', t: 0, tMax: DOWN_T, stag: 0, shield: 0, pips: PIPS, sinceHit: 0,
    kickT: 0, kickSide: 0, kicked: false, cd: 0, draft: 0, done: false, time: 0, hits: 0, offs: 0,
    kickCount: 0, buf: null,
    base: tune.base, aggr: tune.aggr, tx: GRID_X[slot % 4], think: 0, hunt: 0, flash: 0,
    mark: -1, lastDownBy: -1, lastHitBy: -1, hitGuard: 0, paybacks: 0, finishedAt: 0,
    strain: 0, strainT: 0, boost: BOOST_START, boosting: false, boostT: 0, burn: false,
    cu: 0, cuTarget: -1, cuGap: 0, rec: 0, recV: 0, sq: 0, susp: 0, suspV: 0, slope: 0, brk: false, look: 0,
    // Ghost bookkeeping (only used while `local` is false).
    seenKick: 0, seenDown: 0, netAt: 0, netState: 0, netLean: 0, netCu: 0,
  }
}

/**
 * A fresh race.
 * @param {{ seed?: number, trackId?: string, riders: { id?: string, name?: string, avatar?: string|null, bot?: boolean, local?: boolean }[],
 *   difficulty?: string, gridBackToFront?: number[], phase?: 'count'|'race', seedRng?: number }} o
 */
export function createWorld({ seed = TRACK_SEED, trackId = 'meadow', riders, difficulty = 'normal', gridBackToFront = null, phase = 'count', seedRng = seed }) {
  const track = buildTrack(seed, trackId)
  const diff = getDifficulty(difficulty)
  const count = Math.min(RIDERS, riders.length)
  let botK = 0
  const slotOf = (i) => {
    if (!gridBackToFront) return i
    const at = gridBackToFront.indexOf(i)
    return at < 0 ? i : at
  }
  const list = riders.slice(0, count).map((d, i) => {
    const tune = d.bot ? { base: diff.base[botK], aggr: diff.aggr[botK++] } : { base: 1, aggr: 1 }
    return newRider(i, d, slotOf(i), tune)
  })
  return {
    track, difficulty: diff, riders: list, cars: track.cars, t: 0,
    phase, countT: phase === 'count' ? COUNTDOWN : 0, firstFinishAt: null,
    events: [], rng: mulberry32(seedRng ^ 0x5bd1e995), uiSeed: seed,
  }
}

const humans = (world) => world.riders.filter((r) => !r.bot)

/** A kick lands only on a rider beside the kicker, one lane away at most. */
export function inReach(r, o, side) {
  if (o === r || o.state !== 'ride' || o.shield > 0 || o.done) return false
  const dx = (o.x - r.x) * side
  return Math.abs(o.z - r.z) < REACH_Z && dx > REACH_MIN_X && dx < REACH_X
}

/** The rider a kick would land on right now, or null. Used for the aim cue. */
export function kickTarget(world, r, side) {
  return world.riders.filter((q) => inReach(r, q, side)).sort((a, b) => Math.abs(a.z - r.z) - Math.abs(b.z - r.z))[0] ?? null
}

export function tryKick(world, r, side) {
  if (r.cd > 0 || r.state !== 'ride' || r.stag > 0 || r.done) return false
  r.kickT = KICK_T; r.kickSide = side; r.kicked = false; r.cd = KICK_CD
  r.kickCount++
  world.events.push({ t: 'swing', by: r.i })
  return true
}

export function knockOff(world, r, why, by = -1) {
  const lead = world.riders.filter((o) => o !== r && !o.done && o.z > r.z).sort((a, b) => a.z - b.z)[0]
  r.cuTarget = lead ? lead.i : -1
  r.cuGap = lead ? lead.z - r.z : 0
  r.cu = 0
  r.boosting = false; r.strain = 0
  r.state = 'down'
  r.t = r.tMax = lead ? DOWN_T_BEHIND : DOWN_T
  r.offs++
  r.kickT = 0; r.stag = 0; r.draft = 0; r.buf = null
  r.lastDownBy = why === 'kick' ? by : -1
  world.events.push({ t: 'down', to: r.i, why, by })
}

/**
 * The victim's side of a landed kick: the shove, the stagger and the pip. A
 * second pip from the same attacker inside a second is not taken (the shove
 * still happens), so one rider cannot chain a victim off the bike.
 */
export function applyHit(world, o, from, side) {
  o.vx += side * 1.35
  o.speed *= 0.82
  o.stag = STAGGER
  o.flash = 0.18
  o.recV += side * 7
  o.sq = 1
  o.sinceHit = 0
  const guarded = o.lastHitBy === from.i && o.hitGuard > 0
  o.lastHitBy = from.i
  o.hitGuard = SAME_ATTACKER_GUARD
  if (!guarded) o.pips--
  world.events.push({ t: 'hit', by: from.i, to: o.i, side, ko: o.pips <= 0, soft: guarded })
  if (o.pips <= 0) {
    // Hitting back the rider who last knocked you off is a payback (bonus cup point).
    knockOff(world, o, 'kick', from.i)
    if (from.local && from.mark === o.i) { from.paybacks++; from.mark = -1; world.events.push({ t: 'payback', by: from.i, to: o.i }) }
    o.mark = from.i
  }
}

/**
 * A kick arriving over the network, addressed to local rider `to`. Dropped if
 * the victim is shielded, down or done (the kicker sees a clang), or if the
 * kicker's ghost is nowhere near (a forged or very stale event).
 */
export function receiveKick(world, to, byIdx, side) {
  const o = world.riders[to]
  const k = world.riders[byIdx]
  if (!o || !k || !o.local || o === k || (side !== 1 && side !== -1)) return false
  if (Math.abs(k.z - o.z) > REACH_Z * 3 || Math.abs(k.x - o.x) > REACH_X * 2.5) return false
  if (o.state !== 'ride' || o.shield > 0 || o.done) { world.events.push({ t: 'clang', by: byIdx, to }); return false }
  applyHit(world, o, k, side)
  return true
}

function botDrive(world, r) {
  const { riders, cars } = world
  r.think -= DT; r.hunt -= DT
  if (r.think <= 0) {
    r.think = 0.16 + world.rng() * 0.1
    const danger = (x) => cars.some((c) => { const dz = c.z - r.z; return dz > -250 && dz < 2400 && Math.abs(c.x - x) < 0.31 })
    if (danger(r.x) || danger(r.tx)) {
      const free = LANEX.filter((l) => !danger(l)).sort((a, b) => Math.abs(a - r.x) - Math.abs(b - r.x))
      if (free.length) r.tx = free[0]
    } else if (r.hunt <= 0) {
      const prey = riders.find((o) => o !== r && o.state === 'ride' && !o.done && Math.abs(o.z - r.z) < 800 && Math.abs(o.x - r.x) < 0.8)
      if (prey && world.rng() < 0.45 * r.aggr) { r.tx = clamp(prey.x + (Math.sign(r.x - prey.x) || 1) * 0.22, -0.85, 0.85); r.hunt = 1.1 }
      else if (world.rng() < 0.06) r.tx = LANEX[Math.floor(world.rng() * 4)]
    }
  }
  for (const side of [-1, 1]) {
    const o = riders.find((q) => inReach(r, q, side))
    if (o && r.strain < 0.55 && world.rng() < (o.bot ? 0.9 : 0.85) * r.aggr * DT) tryKick(world, r, side)
  }
  if (!r.burn && r.boost > 0.9 && Math.abs(segAt(world.track, r.z).curve) < 1.2 && riders.some((o) => o.z > r.z && o.z - r.z < 6000)) r.burn = true
  if (r.burn && r.boost < 0.15) r.burn = false
  return clamp((r.tx - r.x) * 7, -1, 1)
}

/** Mean position of the people still riding: bots slow down when they are far ahead of it. */
function humanFocus(world) {
  const hs = humans(world).filter((r) => !r.done)
  if (!hs.length) return null
  return hs.reduce((a, r) => a + r.z, 0) / hs.length
}

function stepRider(world, r, input) {
  const { track } = world
  const s = segAt(track, r.z)
  const sp = r.speed / MAXSPD
  r.cd = Math.max(0, r.cd - DT); r.shield = Math.max(0, r.shield - DT); r.flash = Math.max(0, r.flash - DT)
  r.hitGuard = Math.max(0, r.hitGuard - DT)
  if (r.state === 'down') {
    r.t -= DT; r.speed *= Math.exp(-2.6 * DT); r.z += r.speed * DT; r.x += r.vx * DT; r.vx *= Math.exp(-4 * DT)
    if (r.t <= 0) {
      r.state = 'ride'
      r.cu = r.cuTarget >= 0 ? CATCHUP_MAX : 0
      r.speed = MAXSPD * (r.cu ? REMOUNT_SPD_BEHIND : REMOUNT_SPD)
      r.shield = SHIELD; r.pips = PIPS; r.strain = 0
      r.x = clamp(r.x, -0.85, 0.85); r.vx = 0
      world.events.push({ t: 'up', to: r.i, catchUp: r.cu > 0 })
    }
    return
  }
  let steer
  if (r.done) steer = clamp((r.tx - r.x) * 4, -1, 1)
  else if (r.bot) steer = botDrive(world, r)
  else {
    steer = input?.steer || 0
    // A press during the cooldown is held for a moment, so a kick is never eaten.
    if (input?.kick) r.buf = { side: input.kick, t: KICK_BUFFER }
    if (r.buf) {
      if (tryKick(world, r, r.buf.side)) r.buf = null
      else { r.buf.t -= DT; if (r.buf.t <= 0) r.buf = null }
    }
  }
  if (r.stag > 0) { r.stag -= DT; steer *= 0.35 }
  if (r.strainT > 0) r.strainT -= DT; else r.strain = Math.max(0, r.strain - STRAIN_DECAY * DT)
  steer *= 1 - 0.4 * Math.min(1, r.strain)
  const want = !r.done && (r.bot ? r.burn : !!input?.boost)
  const was = r.boosting
  r.boosting = want && r.stag <= 0 && (was ? r.boost > 0 : r.boost >= BOOST_MIN)
  if (r.boosting) { r.boost = Math.max(0, r.boost - BOOST_BURN * DT); r.boostT = BOOST_DELAY; if (!was) world.events.push({ t: 'boost', by: r.i }) }
  else if (r.boostT > 0) r.boostT -= DT
  else r.boost = Math.min(1, r.boost + BOOST_FILL * DT)
  // Body springs: a hit rocks the rider and settles; crests and dips load the suspension.
  r.recV += (-r.rec * 170 - r.recV * 8) * DT; r.rec += r.recV * DT; r.sq *= Math.exp(-9 * DT)
  const slope = (s.y2 - s.y1) / SEG
  r.suspV += (r.slope - slope) * sp * 2600; r.slope = slope
  r.suspV += (-r.susp * 130 - r.suspV * 11) * DT; r.susp = clamp(r.susp + r.suspV * DT, -7, 7)
  r.look = lerp(r.look, r.kickT > 0 ? r.kickSide : steer * 0.5, 1 - Math.exp(-12 * DT))
  r.lean = lerp(r.lean, steer, 1 - Math.exp(-10 * DT))
  // Slipstream: sit in another rider's wake to charge a boost.
  const lead = world.riders.find((o) => o !== r && o.state === 'ride' && o.z - r.z > 150 && o.z - r.z < 1500 && Math.abs(o.x - r.x) < 0.15)
  r.draft = clamp(r.draft + (lead ? DT : -2 * DT), 0, 1.2)
  let top = r.base
  if (r.bot && !r.done) {
    const focus = humanFocus(world)
    if (focus != null) top -= world.difficulty.band * clamp((r.z - focus) / 5000, -1, 1)
  }
  if (r.draft > SLIPSTREAM_AFTER) top *= SLIPSTREAM_TOP
  if (r.boosting) top *= BOOST_TOP
  if (r.cu > 0) {
    const L = world.riders[r.cuTarget]
    r.cu -= DT
    if (!L || L.z - r.z <= r.cuGap || r.done) r.cu = 0
    else top *= CATCHUP_TOP
  }
  if (Math.abs(r.x) > 1) top = Math.min(top, 0.42)
  if (r.done) top = 0.3
  const target = top * MAXSPD
  r.brk = r.speed > target + 40
  if (r.stag <= 0 && r.speed < target) r.speed = Math.min(target, r.speed + (MAXSPD / 5.5) * (r.cu > 0 ? CATCHUP_ACCEL : r.boosting ? 2 : 1) * DT)
  else if (r.speed > target) r.speed = Math.max(target, r.speed - (MAXSPD / 2.2) * DT)
  r.x += steer * 1.55 * DT * (0.35 + 0.65 * sp) + r.vx * DT - s.curve * sp * sp * 0.2 * DT
  r.vx *= Math.exp(-6 * DT)
  r.x = clamp(r.x, -MAX_X, MAX_X)
  const zi = Math.floor(r.z / SEG)
  r.z += r.speed * DT
  // Oil: a wobble, never a pip.
  if (Math.floor(r.z / SEG) !== zi && r.shield <= 0) {
    for (const q of segAt(track, r.z).spr) {
      if (q.k === 'oil' && Math.abs(q.x - r.x) < 0.15) {
        r.stag = OIL_STAGGER; r.vx += (world.rng() < 0.5 ? -1 : 1) * 0.9; r.recV += (world.rng() - 0.5) * 12
        world.events.push({ t: 'oil', to: r.i })
      }
    }
  }
  // The kick lands on one frame, in the kicker's own view of the road.
  if (r.kickT > 0) {
    r.kickT -= DT
    if (!r.kicked && KICK_T - r.kickT >= KICK_HIT_AT) {
      r.kicked = true
      const o = kickTarget(world, r, r.kickSide)
      if (o) {
        r.strain += STRAIN_HIT; r.hits++
        if (o.local) applyHit(world, o, r, r.kickSide)
        else {
          // A ghost: show the blow now, let the victim's phone decide what it costs.
          o.flash = 0.18; o.recV += r.kickSide * 7; o.sq = 1
          world.events.push({ t: 'hit', by: r.i, to: o.i, side: r.kickSide, ko: o.pips <= 1, ghost: true })
          world.events.push({ t: 'send', kind: 'kick', by: r.i, to: o.i, side: r.kickSide })
        }
      } else {
        r.speed *= 0.97; r.strain += STRAIN_MISS
        world.events.push({ t: 'miss', by: r.i })
      }
      r.strainT = STRAIN_HOLD; r.recV -= r.kickSide * (2.5 + 7 * Math.min(1, r.strain)); r.vx -= r.kickSide * 0.3 * Math.min(1, r.strain)
      if (r.strain > 1) knockOff(world, r, 'over')
    }
  }
  r.sinceHit += DT
  if (r.pips < PIPS && r.sinceHit > PIP_REGEN) { r.pips++; r.sinceHit = 0 }
  // Traffic.
  if (r.shield <= 0 && r.state === 'ride') {
    for (const c of world.cars) {
      if (Math.abs(c.z - r.z) < 300 && Math.abs(c.x - r.x) < 0.235) { r.vx = (Math.sign(r.x - c.x) || 1) * 0.7; knockOff(world, r, 'car'); break }
    }
  }
  if (!r.done && r.z >= track.finish) {
    r.done = true; r.time = world.t; r.tx = LANEX[r.i % 4]
    if (world.firstFinishAt == null) world.firstFinishAt = world.t
    world.events.push({ t: 'finish', to: r.i, time: r.time })
  }
}

/** Visual-only upkeep for a ghost: spring settle, timers and the swing animation. */
function stepGhost(world, r) {
  r.flash = Math.max(0, r.flash - DT)
  r.recV += (-r.rec * 170 - r.recV * 8) * DT; r.rec += r.recV * DT; r.sq *= Math.exp(-9 * DT)
  const s = segAt(world.track, r.z)
  const sp = r.speed / MAXSPD
  const slope = (s.y2 - s.y1) / SEG
  r.suspV += (r.slope - slope) * sp * 2600; r.slope = slope
  r.suspV += (-r.susp * 130 - r.suspV * 11) * DT; r.susp = clamp(r.susp + r.suspV * DT, -7, 7)
  r.look = lerp(r.look, r.kickT > 0 ? r.kickSide : r.netLean * 0.5, 1 - Math.exp(-12 * DT))
  r.lean = lerp(r.lean, r.netLean, 1 - Math.exp(-10 * DT))
  if (r.kickT > 0) r.kickT -= DT
  if (r.state === 'down' && r.t > 0) r.t -= DT
  r.shield = Math.max(0, r.shield - DT)
  r.brk = false
}

/**
 * Advance the world one fixed step. `inputs[i]` is `{ steer, kick, boost }` for
 * rider i (only read for local human riders); a `kick` is consumed. Online, pass
 * `clockT` (seconds since the shared go signal) so traffic and finish times agree
 * across phones; solo accumulates dt.
 */
export function step(world, inputs = [], dt = DT, clockT = null) {
  if (world.phase === 'count') {
    world.countT -= DT
    if (world.countT <= 0) { world.phase = 'race'; world.events.push({ t: 'go' }) }
    return
  }
  if (world.phase === 'done') return
  world.t = clockT != null ? clockT : world.t + dt
  for (const c of world.cars) c.z = c.z0 + c.spd * world.t
  for (const r of world.riders) {
    if (r.local) stepRider(world, r, inputs[r.i])
    else stepGhost(world, r)
  }
  // Riders lean on each other instead of overlapping (each phone moves its own).
  const rs = world.riders
  for (let a = 0; a < rs.length; a++) {
    for (let b = a + 1; b < rs.length; b++) {
      const p = rs[a]; const q = rs[b]
      if (p.state !== 'ride' || q.state !== 'ride') continue
      const dx = q.x - p.x
      if (Math.abs(q.z - p.z) < 230 && Math.abs(dx) < 0.15) {
        const push = (0.15 - Math.abs(dx)) * (dx >= 0 ? 1 : -1) * 0.5
        if (p.local) p.x -= push
        if (q.local) q.x += push
      }
    }
  }
  for (const k of Object.keys(inputs)) if (inputs[k]) inputs[k].kick = 0
  if (world.phase === 'race' && raceShouldEnd(world)) { world.phase = 'finishing'; world.countT = FINISH_GRACE }
  if (world.phase === 'finishing') {
    world.countT -= DT
    if (world.countT <= 0) { world.phase = 'done'; world.events.push({ t: 'results' }) }
  }
}

/** Everyone who is not a bot has finished, the first finisher is 20 s ahead, or time ran out. */
export function raceShouldEnd(world) {
  const hs = humans(world)
  if (hs.length && hs.every((r) => r.done)) return true
  if (world.firstFinishAt != null && world.t - world.firstFinishAt > RACE_END_AFTER_FIRST) return true
  return world.t > RACE_MAX
}

/** Finished riders by time, then the rest by distance. */
export function standings(world) {
  return world.riders.slice().sort((a, b) => ((a.done && b.done) ? a.time - b.time : a.done ? -1 : b.done ? 1 : b.z - a.z))
}
export const placeOf = (world, r) => standings(world).indexOf(r) + 1

// ── Cup ──────────────────────────────────────────────────────────────────
/** Cup points for a finishing order (rider index list, best first): 3 / 2 / 1 / 0, plus one payback bonus. */
export function cupAward(order, paybacks = {}) {
  const out = {}
  order.forEach((id, place) => {
    out[id] = (CUP_POINTS[place] ?? 0) + (paybacks[id] > 0 ? PAYBACK_BONUS : 0)
  })
  return out
}

/** Grid for the next race: last place starts in front. Ids from the back of the grid to the front. */
export function nextGrid(orderBestFirst) {
  return orderBestFirst.slice()
}

// ── Network state ────────────────────────────────────────────────────────
// A rider's report: small integers, one flat object, so a write is a few dozen
// bytes. Everything is re-validated on read: stats are written by clients.
export const SYNC_MS = 100

/** @returns {Record<string, number>} */
export function encodeRider(r, serverMs) {
  return {
    z: Math.round(r.z), x: Math.round(r.x * 1000), v: Math.round((r.speed / MAXSPD) * 1000),
    s: r.state === 'down' ? 1 : 0, ln: Math.round(clamp(r.lean, -1, 1) * 100),
    pp: r.pips, bo: r.boosting ? 1 : 0, sh: r.shield > 0 ? 1 : 0, sg: r.stag > 0 ? 1 : 0, cu: r.cu > 0 ? 1 : 0,
    kn: r.kickCount, ks: r.kickSide > 0 ? 1 : 0, dn: r.offs, dw: r.lastDownBy + 1,
    hk: r.hits, pb: r.paybacks, fin: r.done ? Math.max(1, Math.round(r.time * 1000)) : 0,
    at: Math.round(serverMs),
  }
}

const num = (v, lo, hi, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? clamp(Number(v), lo, hi) : d)

/** Sanitise a report read from the room. Returns null if there is nothing usable. */
export function decodeRider(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!Number.isFinite(Number(raw.z))) return null
  return {
    z: num(raw.z, 0, 1e7), x: num(raw.x, -2000, 2000) / 1000, v: num(raw.v, 0, 1400) / 1000,
    s: raw.s === 1 || raw.s === '1' ? 1 : 0, ln: num(raw.ln, -100, 100) / 100,
    pp: Math.round(num(raw.pp, 0, PIPS, PIPS)), bo: raw.bo ? 1 : 0, sh: raw.sh ? 1 : 0, sg: raw.sg ? 1 : 0, cu: raw.cu ? 1 : 0,
    kn: Math.round(num(raw.kn, 0, 9999)), ks: raw.ks ? 1 : 0, dn: Math.round(num(raw.dn, 0, 9999)), dw: Math.round(num(raw.dw, 0, RIDERS)),
    hk: Math.round(num(raw.hk, 0, 9999)), pb: Math.round(num(raw.pb, 0, 99)), fin: Math.round(num(raw.fin, 0, 1e7)),
    at: num(raw.at, 0, 1e15),
  }
}

/**
 * Place ghost `r` from its last report. Position is carried forward by the
 * report's age (capped), then eased in so a 10 Hz feed does not stutter.
 * Returns the events this report implies for the local player: a new kick swing
 * (animation only) and a knock-off by `meIdx`.
 */
export function applyGhost(world, r, snap, nowMs, meIdx = -1) {
  if (!snap || r.local) return
  const age = clamp((nowMs - snap.at) / 1000, 0, 0.4)
  const speed = snap.v * MAXSPD
  const tz = snap.z + (snap.s ? 0 : speed * age)
  const fresh = r.netAt === 0
  if (fresh || Math.abs(tz - r.z) > 2500) { r.z = tz; r.x = snap.x } else {
    r.z += (tz - r.z) * 0.4
    r.x += (snap.x - r.x) * 0.4
  }
  r.speed = speed; r.netLean = snap.ln
  r.netAt = snap.at
  r.stag = snap.sg ? 0.3 : 0
  r.shield = snap.sh ? Math.max(r.shield, 0.2) : 0
  r.boosting = !!snap.bo
  r.cu = snap.cu ? 1 : 0
  r.pips = snap.pp
  r.hits = snap.hk; r.paybacks = snap.pb
  const wasDown = r.state === 'down'
  if (snap.s) {
    if (!wasDown) { r.state = 'down'; r.tMax = r.t = snap.cu || r.cuTarget >= 0 ? DOWN_T_BEHIND : DOWN_T; r.offs = snap.dn }
  } else if (wasDown) { r.state = 'ride'; r.t = 0 }
  if (snap.kn > r.seenKick) {
    if (!fresh) { r.kickT = KICK_T; r.kickSide = snap.ks ? 1 : -1; r.kicked = true }
    r.seenKick = snap.kn
  }
  if (snap.fin > 0 && !r.done) { r.done = true; r.time = snap.fin / 1000; r.tx = r.x }
  if (snap.dn > r.seenDown) {
    // The ghost was knocked off. If it was me who did it, and they had marked me, that is a payback.
    if (!fresh && meIdx >= 0 && snap.dw === meIdx + 1) {
      const me = world.riders[meIdx]
      world.events.push({ t: 'ghostdown', by: meIdx, to: r.i })
      if (me && me.local && me.mark === r.i) { me.paybacks++; me.mark = -1; world.events.push({ t: 'payback', by: meIdx, to: r.i }) }
    }
    r.seenDown = snap.dn
  }
}

/** Promote a bot that was a ghost to a local one (the room coordinator changed). */
export function promoteBot(r) {
  r.local = true
  r.tx = r.x; r.think = 0; r.hunt = 0
  r.speed = Math.max(r.speed, 0)
  r.kickT = 0; r.buf = null
}
/** The reverse: this phone stops driving the bot and follows its reports instead. */
export function demoteBot(r) {
  r.local = false
  r.netAt = 0
}

/** Shared-state key for a kick sent over the network: `victimId|side` under the kicker's `k/{n}`. */
export const kickKey = (victimId, side) => `${victimId}|${side > 0 ? 1 : -1}`
export function parseKick(v) {
  if (typeof v !== 'string') return null
  const at = v.lastIndexOf('|')
  if (at < 1) return null
  const side = v.slice(at + 1) === '1' ? 1 : v.slice(at + 1) === '-1' ? -1 : 0
  return side ? { to: v.slice(0, at), side } : null
}

// ── Race entries (RaceShell) ─────────────────────────────────────────────
/** Normalise one rider's stats node (Firebase may hand back anything). */
export function normalizeStats(raw) {
  const snap = decodeRider(raw)
  const k = raw && typeof raw.k === 'object' && raw.k ? raw.k : {}
  return snap ? { ...snap, k } : null
}

/** Finished by time, otherwise by distance (smaller sortKey is better). */
export function raceEntry(stats) {
  const s = decodeRider(stats)
  if (!s) return { sortKey: null, score: null }
  if (s.fin > 0) return { sortKey: [0, s.fin], score: s.fin }
  return { sortKey: [1, -Math.round(s.z)], score: null }
}
export const raceIsDone = (stats) => (decodeRider(stats)?.fin ?? 0) > 0
export const raceIsDownOrIdle = (stats) => !decodeRider(stats)

/** Seconds as M:SS.cc */
export function formatRaceTime(t) {
  if (!Number.isFinite(t) || t < 0) return '-:--.--'
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`
}
