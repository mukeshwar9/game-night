// bonkLogic.js — BONK BUGGIES sim: two dune buggies, one helmet each. Touch the
// rival's helmet with any part of your buggy and the round is yours; let your own
// helmet touch anything and it is theirs. Pure — no DOM, no Firebase, no React.
//
// Physics is planck.js vendored with deterministic trig (vendor/planck-det.js).
// A planck world is mutable, so unlike the flat-state sims step() advances the
// match IN PLACE and returns the same object: `{ state, events }` keeps the
// useRealtimeHost contract, and nothing outside this module may hold on to
// bodies. Everything the renderer and the wire need comes from bonkNet.js.
//
// One match (first to TARGET points) lives in one object: the phase machine
// count → play → ko → (pick) → count … → over, the points, the side swap, the
// spare lid and the arena choice. The room page, the one-phone page and the
// tests all drive the same step(). Fixed timestep DT = 1/120, the same the
// realtime host loop uses.
//
// Seats: car 0 is X (the room creator / hosts), car 1 is O.
import { World, Vec2, Polygon, Circle, Chain, Box, WheelJoint, RevoluteJoint } from './vendor/planck-det'
import { mulberry32 } from './detMath'
import { ARENAS, ARENA_IDS, arenaGeometry } from './bonkArenas'

export const DT = 1 / 120
export const TARGET = 5                  // points that win the match
export const SEATS = ['X', 'O']
export const LID_GAP = 2                 // trailing by this many points earns a spare lid
export const PICK_SECONDS = 5            // loser's choice, then the host picks for them
export const BOT_PICK_SECONDS = 1.1
export const COUNT_STEP = 0.5            // seconds per 3 · 2 · 1 digit
export const KO_SECONDS = 2.1
const LEAD_COUNT = 0.5                   // the realtime host already counted 3 · 2 · 1 before round one

export const T = {
  gravity: 13,          // m/s²
  wheelSpeed: 21,       // rad/s motor target
  wheelTorque: 2.7,     // N·m while a button is held
  brakeTorque: 2.2,     // N·m with no button (engine brake)
  airTorque: 4.6,       // N·m tilt while no wheel touches
  groundTilt: 2.0,      // N·m tilt while driving (lets you pop a wheelie)
  hopSpeed: 6.4,        // m/s along the buggy's own "up"
  hopCooldown: 2.2,     // s
  water0: 0.45,         // resting water line (m)
  tideStart: 10,        // s of play before the tide moves
  tideRate: 0.3,        // m/s
  shieldGrace: 0.7,     // s of safety after a spare lid pops
  readyBrake: 40,
  viewTop: 9,           // the tide stops rising here
}
const VEL_ITERS = 8
const POS_ITERS = 3
const V = (x, y) => new Vec2(x, y)

// ─── a buggy ─────────────────────────────────────────────────────────────────
export const HULL = [[-0.86, -0.1], [0.84, -0.1], [0.93, 0.08], [0.42, 0.22], [-0.82, 0.24]]
export const HEAD = { x: -0.14, y: 0.5, r: 0.2 }
export const WHEEL = { x: 0.58, y: -0.3, r: 0.3 }

function makeCar(world, i, x, y, dir, shield) {
  const grp = -(i + 1)
  const chassis = world.createBody({ type: 'dynamic', position: V(x, y), angularDamping: 0.6 })
  chassis.createFixture({
    shape: new Polygon(HULL.map((p) => V(p[0] * dir, p[1]))),
    density: 1.5, friction: 0.35, restitution: 0.12, filterGroupIndex: grp, userData: { car: i, part: 'hull' },
  })
  chassis.createFixture({
    shape: new Circle(V(HEAD.x * dir, HEAD.y), HEAD.r),
    density: 0.35, friction: 0.3, restitution: 0.2, filterGroupIndex: grp, userData: { car: i, part: 'head' },
  })
  const wheels = []
  const joints = []
  for (const s of [-1, 1]) {
    const w = world.createBody({ type: 'dynamic', position: V(x + s * WHEEL.x, y + WHEEL.y), angularDamping: 0.3 })
    w.createFixture({
      shape: new Circle(WHEEL.r), density: 1.0, friction: 1.7, restitution: 0.08,
      filterGroupIndex: grp, userData: { car: i, part: 'wheel' },
    })
    const j = world.createJoint(new WheelJoint({
      motorSpeed: 0, maxMotorTorque: T.readyBrake, enableMotor: true, frequencyHz: 4.6, dampingRatio: 0.62,
    }, chassis, w, w.getPosition(), V(0, 1)))
    wheels.push(w)
    joints.push(j)
  }
  return {
    i, dir, chassis, wheels, joints, headR: HEAD.r,
    alive: true, shield: shield ? 1 : 0, grace: 0, hopCd: 0, hopFx: 0, ground: 0, headTouch: [], out: null, d: 0,
  }
}

// ─── one round ───────────────────────────────────────────────────────────────
/**
 * A fresh round on arena `opt.arena`.
 * `flip` alternates which body is created first, `swap` which end each seat
 * starts at: the solver favours creation order in a perfectly mirrored
 * head-on, so both change every other round. `shields[i]` gives seat i a lid.
 */
export function createRound(opt = {}) {
  const geo = arenaGeometry(opt.arena)
  const arena = ARENAS.find((a) => a.id === opt.arena) || ARENAS[0]
  const world = new World({ gravity: V(0, -T.gravity) })
  const ground = world.createBody({ type: 'static' })
  for (const s of geo.solids) {
    ground.createFixture({
      shape: new Chain(s.pts.map((p) => V(p[0], p[1])), true),
      friction: 0.9, restitution: 0.05, userData: { terrain: true },
    })
  }
  const planks = geo.planks.map((p) => {
    const b = world.createBody({ type: 'dynamic', position: V(p.x, p.y), angularDamping: 0.8 })
    b.createFixture({ shape: new Box(p.len / 2, p.th / 2), density: 1.1, friction: 0.95, userData: { terrain: true, plank: true } })
    world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -p.limit, upperAngle: p.limit }, ground, b, V(p.px, p.py)))
    return { body: b, len: p.len, th: p.th, px: p.px, py: p.py }
  })
  const cars = []
  for (let q = 0; q < 2; q++) {
    const i = opt.flip ? 1 - q : q
    const sx = geo.spawns[opt.swap ? 1 - i : i]
    let gy = geo.ground(sx)
    for (const pk of planks) {
      if (Math.abs(sx - pk.body.getPosition().x) < pk.len / 2) gy = Math.max(gy, pk.body.getPosition().y + 0.1)
    }
    cars[i] = makeCar(world, i, sx, gy + 0.72, sx < 0 ? 1 : -1, opt.shields && opt.shields[i])
  }
  const r = {
    world, arena, geo, planks, cars, hop: !!opt.hop,
    phase: 'ready', t: 0, water: T.water0, events: [], outcome: null,
  }
  world.on('begin-contact', (c) => touch(r, c, 1))
  world.on('end-contact', (c) => touch(r, c, -1))
  world.on('post-solve', (c, imp) => {
    const p = imp.normalImpulses[0] || 0
    if (p < 0.9 || r.events.length > 24) return
    const a = c.getFixtureA().getUserData() || {}
    const b = c.getFixtureB().getUserData() || {}
    const wm = c.getWorldManifold(null)
    if (!wm || !wm.points || !wm.points[0]) return
    r.events.push({
      type: 'hit', x: wm.points[0].x, y: wm.points[0].y, power: p,
      cars: a.car != null && b.car != null, wheel: a.part === 'wheel' || b.part === 'wheel',
    })
  })
  return r
}

function touch(r, c, sign) {
  const a = c.getFixtureA().getUserData() || {}
  const b = c.getFixtureB().getUserData() || {}
  one(r, a, b, sign)
  one(r, b, a, sign)
}

function one(r, me, other, sign) {
  if (me.car == null || me.car === other.car) return
  const car = r.cars[me.car]
  if (me.part === 'wheel') car.ground = Math.max(0, car.ground + sign)
  if (me.part === 'head') {
    const by = other.car != null ? other.car : -1
    if (sign > 0) car.headTouch.push(by)
    else {
      const k = car.headTouch.indexOf(by)
      if (k >= 0) car.headTouch.splice(k, 1)
    }
  }
}

/** World position of a buggy's helmet centre. */
export function helmetAt(car) {
  const p = car.chassis.getWorldPoint(V(HEAD.x * car.dir, HEAD.y))
  return { x: p.x, y: p.y }
}

/** Advance one round tick. `inputs[i]` = { d: -1|0|1, hop } for car i. */
export function stepRound(r, inputs, dt) {
  const playing = r.phase === 'play'
  for (let i = 0; i < r.cars.length; i++) {
    const c = r.cars[i]
    const inp = (playing && c.alive && inputs && inputs[i]) || { d: 0, hop: false }
    const d = inp.d || 0
    c.d = d
    for (let k = 0; k < 2; k++) {
      c.joints[k].setMotorSpeed(-d * T.wheelSpeed)
      c.joints[k].setMaxMotorTorque(r.phase === 'ready' ? T.readyBrake : d ? T.wheelTorque : (c.alive ? T.brakeTorque : 0.4))
    }
    if (d) c.chassis.applyTorque(d * (c.ground ? T.groundTilt : T.airTorque), true)
    c.hopCd = Math.max(0, c.hopCd - dt)
    c.hopFx = Math.max(0, c.hopFx - dt)
    c.grace = Math.max(0, c.grace - dt)
    if (r.hop && inp.hop && c.hopCd <= 0) {
      const up = c.chassis.getWorldVector(V(0, 1))
      for (const b of [c.chassis, c.wheels[0], c.wheels[1]]) {
        b.applyLinearImpulse(V(up.x * T.hopSpeed * b.getMass(), up.y * T.hopSpeed * b.getMass()), b.getWorldCenter(), true)
      }
      c.hopCd = T.hopCooldown
      c.hopFx = 0.28
      const p = c.chassis.getPosition()
      r.events.push({ type: 'hop', x: p.x, y: p.y, car: i, ux: up.x, uy: up.y })
    }
  }
  if (playing) {
    r.t += dt
    if (r.t > T.tideStart) r.water = Math.min(T.viewTop + 0.5, r.water + T.tideRate * dt)
  }
  // water: drag and lift on anything below the line
  for (let b = r.world.getBodyList(); b; b = b.getNext()) {
    if (b.isStatic()) continue
    const bp = b.getPosition()
    if (bp.y < r.water) {
      const depth = Math.min(1, (r.water - bp.y) / 0.5)
      const m = b.getMass()
      const v = b.getLinearVelocity()
      b.applyForceToCenter(V(-v.x * m * 2.6 * depth, (T.gravity * 1.35 - v.y * 3.2) * m * depth), true)
      b.setAngularVelocity(b.getAngularVelocity() * (1 - 2.5 * dt * depth))
      if (!b._wet && v.y < -1.2) r.events.push({ type: 'splash', x: bp.x, y: r.water, power: Math.min(8, -v.y) })
      b._wet = true
    } else b._wet = false
  }
  r.world.step(dt, VEL_ITERS, POS_ITERS)
  if (!playing) return

  const fell = []
  for (let i = 0; i < r.cars.length; i++) {
    const c = r.cars[i]
    if (!c.alive) continue
    const pos = c.chassis.getPosition()
    if (pos.y < r.water - 0.12 || Math.abs(pos.x) > r.geo.half + 3.5 || pos.y < -2) { fell.push({ i, reason: 'sunk', by: -1 }); continue }
    if (c.headTouch.length && c.grace <= 0) {
      let by = -1
      for (const h of c.headTouch) if (h >= 0) by = h
      const hp = helmetAt(c)
      if (c.shield > 0) {
        c.shield = 0
        c.grace = T.shieldGrace
        r.events.push({ type: 'shield', x: hp.x, y: hp.y, car: i })
        if (by >= 0) {
          const o = r.cars[by].chassis
          const op = o.getPosition()
          const dx = op.x - pos.x
          const dy = op.y - pos.y
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          o.applyLinearImpulse(V(dx / len * 3.2, dy / len * 3.2 + 1.5), o.getWorldCenter(), true)
        }
      } else fell.push({ i, reason: by >= 0 ? 'bonk' : 'self', by, x: hp.x, y: hp.y })
    }
  }
  if (!fell.length) return
  for (const f of fell) {
    const car = r.cars[f.i]
    car.alive = false
    car.out = f
    r.events.push({ type: f.reason, x: f.x != null ? f.x : car.chassis.getPosition().x, y: f.y != null ? f.y : r.water, car: f.i, by: f.by })
  }
  const alive = r.cars.filter((q) => q.alive)
  if (alive.length <= 1) {
    r.phase = 'over'
    const last = fell[fell.length - 1]
    r.outcome = {
      winner: alive.length ? alive[0].i : -1, reason: last.reason,
      double: !alive.length, loser: last.i, t: r.t, x: fell[0].x, y: fell[0].y,
    }
  }
}

// ─── bot ─────────────────────────────────────────────────────────────────────
export const BOT_LEVELS = {
  easy: { think: 0.34, slip: 0.26, hop: 0.25, guard: 0.5 },
  normal: { think: 0.17, slip: 0.1, hop: 0.6, guard: 0.8 },
  hard: { think: 0.07, slip: 0.02, hop: 0.9, guard: 1 },
}

function normAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

/**
 * A bot driver for one seat: `bot(round, seat, dt) => { d, hop }`. It drives at
 * the rival, backs off when stuck nose to nose, levels itself in the air, stays
 * off the island ends and heads for high ground when the tide rises. `rng` is
 * injectable so tests are deterministic.
 */
export function makeBot(level = 'normal', rng = Math.random) {
  const L = BOT_LEVELS[level] || BOT_LEVELS.normal
  let hold = { d: 0, hop: false }
  let wait = 0
  let jam = 0
  return (r, i, dt) => {
    wait -= dt
    const me = r.cars[i]
    const sp = Math.abs(me.chassis.getLinearVelocity().x)
    // nose to nose and going nowhere: back off, then charge again
    jam = (me.ground && sp < 0.7 && hold.d) ? jam + dt : 0
    if (jam > 0.5 + 0.5 * (1 - L.guard)) {
      jam = 0
      hold = { d: -hold.d, hop: false }
      wait = 0.35 + 0.5 * rng()
    }
    if (wait > 0) return { d: hold.d, hop: false }
    wait = L.think * (0.7 + 0.6 * rng())
    const p = me.chassis.getPosition()
    const a = normAngle(me.chassis.getAngle())
    const w = me.chassis.getAngularVelocity()
    const foe = r.cars.find((c) => c.i !== i && c.alive)
    if (!foe) return (hold = { d: 0, hop: false })
    const fp = foe.chassis.getPosition()
    const dx = fp.x - p.x
    const dy = fp.y - p.y
    const lean = a + 0.22 * w
    let d = 0
    let hop = false
    if (!me.ground) d = Math.abs(lean) > 0.12 ? (lean > 0 ? -1 : 1) : 0
    else if (Math.abs(lean) > 0.85 * L.guard + (1 - L.guard)) d = lean > 0 ? -1 : 1
    else {
      d = dx > 0 ? 1 : -1
      if (dy > 0.55 && Math.abs(dx) < 1.7 && rng() < L.guard) d = -d            // they are above me: get out from under
      const vx = me.chassis.getLinearVelocity().x
      if (!r.geo.closed && Math.abs(p.x) > r.geo.half - 1.3 && (Math.sign(p.x) === d || vx * p.x > 4)) d = p.x > 0 ? -1 : 1   // do not drive off the end
      if (r.water > p.y - 1.1) {
        const hx = (p.x > 0 ? 1 : -1) * r.geo.half * 0.84
        if (r.geo.ground(hx) > r.geo.ground(p.x) + 0.4) d = hx > p.x ? 1 : -1
      }
    }
    if (r.hop && me.hopCd <= 0 && Math.abs(lean) < 0.5 && rng() < L.hop) {
      if (Math.abs(dx) < 2.3 && Math.abs(dx) > 0.7 && dy > -0.4 && dy < 0.9 && me.ground) hop = true
      if (r.water > p.y - 0.5) hop = true
    }
    if (rng() < L.slip) d = [-1, 0, 1][Math.floor(rng() * 3)]
    hold = { d, hop }
    return hold
  }
}

// ─── a match ─────────────────────────────────────────────────────────────────
export const DEFAULT_TWISTS = { hop: true, lid: true, pick: true }

/**
 * A new match. `seed` makes arena order and the loser's two cards repeatable.
 * `bots` lists seats ('X' | 'O') a bot drives (they pick arenas on their own).
 * `leadCount` is the length of the first 3 · 2 · 1 in seconds; the realtime
 * host already counts down, so the room uses a short one and the solo page a
 * full one. `arena` pins every round to one arena; `score` resumes a match.
 */
export function createMatch({ seed = 1, twists = DEFAULT_TWISTS, bots = [], leadCount = LEAD_COUNT, arena = null, score = [0, 0] } = {}) {
  const m = {
    phase: 'count', timer: 0, slow: 0,
    round: 0, score: [score[0] | 0, score[1] | 0], target: TARGET,
    twists: { ...DEFAULT_TWISTS, ...twists },
    bots, leadCount, fixedArena: arena,
    lastArena: null, nextArena: null, pick: null,
    outcome: null, winner: null,
    rng: mulberry32(seed >>> 0),
    r: null,
  }
  startRound(m)
  return m
}

function pickArenaId(m) {
  if (m.nextArena) {
    const id = m.nextArena
    m.nextArena = null
    return id
  }
  if (m.fixedArena) return m.fixedArena
  const pool = ARENA_IDS.filter((id) => id !== m.lastArena)
  return pool[Math.floor(m.rng() * pool.length)]
}

function startRound(m) {
  m.round += 1
  const top = Math.max(m.score[0], m.score[1])
  const arena = pickArenaId(m)
  m.lastArena = arena
  m.r = createRound({
    arena, hop: m.twists.hop, flip: m.round % 2 === 0, swap: m.round % 2 === 0,
    shields: m.score.map((s) => m.twists.lid && top - s >= LID_GAP),
  })
  m.phase = 'count'
  m.timer = 0
  m.slow = 0
  m.pick = null
  m.outcome = null
}

/** Seconds the 3 · 2 · 1 lasts this round. */
export function countLength(m) {
  return m.round === 1 ? m.leadCount : COUNT_STEP * 3
}

/** The digit to show while counting: 3, 2, 1 — or 0 for the short lead-in. */
export function countDigit(m) {
  if (m.phase !== 'count') return 0
  const len = countLength(m)
  if (len < COUNT_STEP * 3 - 1e-9) return 0
  return Math.max(1, 3 - Math.floor(m.timer / COUNT_STEP))
}

/** Time scale during the knockout: a hit pause, slow motion, then back to speed. */
export function koScale(t) {
  if (t < 0.09) return 0
  if (t < 0.75) return 0.2
  return Math.min(1, 0.2 + (t - 0.75) * 2.2)
}

function twoCards(m, exclude) {
  const pool = ARENA_IDS.filter((id) => id !== exclude)
  const a = Math.floor(m.rng() * pool.length)
  let b = Math.floor(m.rng() * (pool.length - 1))
  if (b >= a) b += 1
  return [pool[a], pool[b]]
}

function endRound(m, events) {
  const o = m.r.outcome
  m.outcome = o
  m.phase = 'ko'
  m.timer = 0
  m.slow = 0
  if (o.winner >= 0) m.score[o.winner] += 1
  events.push({
    type: 'point', by: o.winner >= 0 ? SEATS[o.winner] : undefined, winner: o.winner, double: o.double,
    reason: o.reason, score: m.score.slice(), x: o.x, y: o.y,
  })
}

function afterKo(m, events) {
  const o = m.outcome
  const w = o.winner
  if (w >= 0 && m.score[w] >= m.target) {
    m.phase = 'over'
    m.winner = SEATS[w]
    events.push({ type: 'match', by: m.winner })
    return
  }
  if (m.twists.pick && w >= 0 && o.loser >= 0) {
    m.phase = 'pick'
    m.timer = 0
    m.pick = { by: o.loser, options: twoCards(m, m.r.arena.id) }
    events.push({ type: 'pick', by: SEATS[o.loser] })
    return
  }
  startRound(m)
}

function choose(m, id, events) {
  m.nextArena = id
  events.push({ type: 'chose', by: SEATS[m.pick.by], arena: id })
  startRound(m)
}

/**
 * One tick. `inputs` = { X, O } each { d, hop, pick? }, `bot(round, seat, dt)`
 * results for bot seats are supplied by the caller (see botInputs). Returns
 * `{ state: m, events }`; `m` is the same object, advanced in place.
 */
export function step(m, inputs, dt = DT) {
  const events = []
  const r = m.r
  if (m.phase === 'over') return { state: m, events }

  if (m.phase === 'pick') {
    m.timer += dt
    const by = m.pick.by
    const want = inputs?.[SEATS[by]]?.pick
    const bot = m.bots.includes(SEATS[by])
    if (want && m.pick.options.includes(want)) choose(m, want, events)
    else if (m.timer >= (bot ? BOT_PICK_SECONDS : PICK_SECONDS)) choose(m, m.pick.options[Math.floor(m.rng() * 2)], events)
    return { state: m, events }
  }

  let scale = 1
  if (m.phase === 'count') {
    const before = countDigit(m)
    m.timer += dt
    const after = countDigit(m)
    if (after !== before && after > 0) events.push({ type: 'count', digit: after })
    if (m.timer >= countLength(m)) {
      r.phase = 'play'
      m.phase = 'play'
      m.timer = 0
      events.push({ type: 'go' })
    }
  } else if (m.phase === 'play') {
    m.timer += dt
  } else if (m.phase === 'ko') {
    m.timer += dt
    scale = koScale(m.timer)
  }

  const ins = m.phase === 'play' ? [inputs?.X, inputs?.O] : null
  m.slow += scale
  if (m.slow >= 1) {
    m.slow -= 1
    stepRound(r, ins, dt)
  }
  for (const e of r.events) {
    // The wire and the sfx map carry the seat letter of whoever scored.
    if (e.type === 'bonk' || e.type === 'self' || e.type === 'sunk') e.by = e.type === 'bonk' && e.by >= 0 ? SEATS[e.by] : undefined
    events.push(e)
  }
  r.events.length = 0

  if (m.phase === 'play' && r.outcome) endRound(m, events)
  else if (m.phase === 'ko' && m.timer >= KO_SECONDS) afterKo(m, events)
  return { state: m, events }
}

/** 'X' | 'O' once the match is decided, else null. */
export function getWinner(m) {
  return m.phase === 'over' ? m.winner : null
}

/** Seats currently trailing far enough to wear a spare lid this round. */
export function lidSeats(m) {
  return m.r.cars.map((c) => c.shield > 0)
}
