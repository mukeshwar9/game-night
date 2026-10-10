// birdseyeLogic.js — BIRDSEYE physics: a 2D planck sim in the x/y plane that
// the renderer views through 3D cameras. Pure — no DOM, no Firebase, no React.
//
// DETERMINISM CONTRACT (same as animalStackLogic.js / artilleryLogic.js):
//   * planck.js vendored with deterministic trig (vendor/planck-det.js)
//   * fixed timestep 1/60, fixed solver iterations, settle counted in ticks
//   * shots are integers (quantShot): angle in 1/4096 turns, power per-mille,
//     ability tick k
//   * every shot rebuilds the world from the previous shot's quantised
//     snapshot, so no solver warm-start state carries over and a replay of
//     {snapshot, shot} is exact on every client
import { World, Vec2, Box, Circle, Edge } from './vendor/planck-det'
import { detSin, detCos } from './detMath'
import {
  BIRDS, MATS, CROW, VMAX, SLING, PULL_M, ANGLE_STEPS, MAX_SHOT_TICKS, CROW_POINTS,
  FORTS, duelShots, duelWinner, DUEL_SHOTS_EACH, duelBird,
} from './birdseyeCore'

export const DT = 1 / 60
const VEL_ITERS = 8
const POS_ITERS = 3
export const GRAVITY = -10
const STILL_V = 0.12
const STILL_TICKS = 40
const PRESETTLE_TICKS = 120
const CROW_TIP = 1.05 // rad — a scarecrow tipped past ~60° pops
const CROW_DROP = 0.9 // m — or one that falls this far below where it stood

// `|| 0` folds -0 into 0 so a snapshot survives a JSON round trip unchanged.
const q = (v) => Math.round(v * 1e4) / 1e4 || 0

function makeWorld() {
  const world = new World({ gravity: Vec2(0, GRAVITY) })
  const ground = world.createBody()
  ground.createFixture(Edge(Vec2(-60, 0), Vec2(260, 0)), { friction: 0.9 })
  ground.setUserData({ type: 'ground' })
  return world
}

function addBlock(world, s) {
  const m = MATS[s.mat]
  const b = world.createBody({ type: 'dynamic', position: Vec2(s.x, s.y), angle: s.a || 0 })
  b.createFixture(Box(s.w / 2, s.h / 2), { density: m.density, friction: m.friction, restitution: 0.05 })
  b.setUserData({ type: 'block', mat: s.mat, w: s.w, h: s.h, zw: s.zw, hp: s.hp ?? m.hp, id: s.id })
  return b
}

function addCrow(world, s) {
  const b = world.createBody({ type: 'dynamic', position: Vec2(s.x, s.y), angle: s.a || 0 })
  b.createFixture(Box(CROW.w / 2, CROW.h / 2), { density: CROW.density, friction: CROW.friction })
  b.setUserData({ type: 'crow', w: CROW.w, h: CROW.h, hp: s.hp ?? CROW.hp, id: s.id, y0: s.y0 ?? s.y })
  return b
}

/** Fort definition → its body list, as authored (before settling). */
export function fortItems(fort) {
  const items = []
  let id = 0
  for (const [mat, x, y, w, h, zw] of fort.blocks) items.push({ kind: 'block', mat, x, y, w, h, zw, id: id++ })
  for (const [x, y] of fort.crows) items.push({ kind: 'crow', x, y, w: CROW.w, h: CROW.h, id: id++ })
  return items
}

const settled = new Map()
/** The fort after a 120-tick settle — the snapshot every first shot starts from. */
export function fortSnapshot(fort) {
  if (settled.has(fort.id)) return settled.get(fort.id)
  const sim = new BirdseyeSim(fortItems(fort), fort)
  for (let i = 0; i < PRESETTLE_TICKS; i++) sim.world.step(DT, VEL_ITERS, POS_ITERS)
  const snap = sim.snapshot()
  settled.set(fort.id, snap)
  return snap
}

export class BirdseyeSim {
  constructor(snap, fort) {
    this.fort = fort
    this.world = makeWorld()
    this.bodies = snap.map(s => (s.kind === 'crow' ? addCrow(this.world, s) : addBlock(this.world, s)))
    this.birds = []
    this.tick = 0
    this.launchTick = 0
    this.events = [] // drained by the renderer each step: hit / break / pop / thud / ability
    this.hitTick = -1
    this.still = 0
    this.done = false
    this.abilityUsed = false
    this.replaying = false
    this.shot = null
    this.dmg = new Map()
    this.world.on('post-solve', (contact, impulse) => {
      const a = contact.getFixtureA().getBody(), b = contact.getFixtureB().getBody()
      const n = impulse.normalImpulses[0] + (impulse.normalImpulses[1] || 0)
      if (!(n > 0)) return
      this.hurt(a, n); this.hurt(b, n)
      const ua = a.getUserData(), ub = b.getUserData()
      const birdHit = (ua?.type === 'bird' && ub?.type !== 'ground') || (ub?.type === 'bird' && ua?.type !== 'ground')
      if (birdHit && this.hitTick < 0) {
        this.hitTick = this.tick
        const p = (ua?.type === 'bird' ? a : b).getPosition()
        this.events.push({ t: 'hit', x: p.x, y: p.y })
      }
      if (n > 6) { const p = a.getPosition(); this.events.push({ t: 'thud', n, x: p.x, y: p.y }) }
    })
  }

  hurt(body, n) {
    const u = body.getUserData()
    if (!u || (u.type !== 'block' && u.type !== 'crow')) return
    const thr = u.type === 'crow' ? CROW.thr : MATS[u.mat].thr
    if (n > thr) this.dmg.set(body, (this.dmg.get(body) || 0) + (n - thr))
  }

  /** Quantised body list — the input of the next shot. */
  snapshot() {
    return this.bodies.map(b => {
      const u = b.getUserData(), p = b.getPosition()
      const s = { kind: u.type === 'crow' ? 'crow' : 'block', w: u.w, h: u.h, hp: q(u.hp), id: u.id, x: q(p.x), y: q(p.y), a: q(b.getAngle()) }
      if (u.type === 'crow') s.y0 = u.y0
      else { s.mat = u.mat; s.zw = u.zw }
      return s
    })
  }

  /** Start a shot `{ b, a, p, k }` from the pouch. */
  launch(shot) {
    this.shot = { ...shot }
    const def = BIRDS[shot.b]
    const ang = shot.a * 2 * Math.PI / ANGLE_STEPS
    const v = VMAX * shot.p / 1000
    const pull = PULL_M * shot.p / 1000
    const c = detCos(ang), s = detSin(ang)
    this.spawnBird(def, SLING.x - c * pull, SLING.y - s * pull, c * v, s * v)
    this.launchTick = this.tick
  }

  spawnBird(def, x, y, vx, vy) {
    const b = this.world.createBody({ type: 'dynamic', position: Vec2(x, y), bullet: true, angularDamping: 2 })
    b.createFixture(Circle(def.r), { density: def.density, friction: 0.6, restitution: 0.2 })
    b.setUserData({ type: 'bird', def })
    b.setLinearVelocity(Vec2(vx, vy))
    this.birds.push(b)
    return b
  }

  get bird() { return this.birds[0] || null }

  canUseAbility() { return !!this.shot && !this.abilityUsed && this.hitTick < 0 && !!this.bird && !this.replaying }

  /** Live tap: fire the ability now and record its tick in the shot. */
  useAbility() {
    if (!this.canUseAbility()) return false
    this.abilityUsed = true
    this.shot.k = this.tick - this.launchTick
    this.ability()
    return true
  }

  ability() {
    const b = this.bird
    if (!b) return
    const def = b.getUserData().def, v = b.getLinearVelocity(), p = b.getPosition()
    this.events.push({ t: 'ability', name: def.ability, x: p.x, y: p.y })
    if (def.ability === 'FLAP') b.setLinearVelocity(Vec2(v.x * 0.92, Math.max(v.y, 0) + 7.5))
    else if (def.ability === 'DIVE') b.setLinearVelocity(Vec2(v.x * 1.8, v.y * 1.8))
    else if (def.ability === 'SPLIT') {
      // a small fan built from literal coefficients (no trig at runtime)
      for (const s of [-1, 1]) this.spawnBird(def, p.x, p.y + s * 0.5, v.x - v.y * 0.14 * s, v.y + v.x * 0.14 * s)
    }
  }

  step() {
    const s = this.shot
    if (s && this.replaying && s.k >= 0 && !this.abilityUsed && this.tick - this.launchTick === s.k) {
      this.abilityUsed = true
      this.ability()
    }
    const wind = this.fort.wind || 0
    if (wind && this.hitTick < 0) for (const b of this.birds) b.applyForceToCenter(Vec2(wind * b.getMass(), 0), true)
    this.world.step(DT, VEL_ITERS, POS_ITERS)
    this.tick++
    for (const [body, dmg] of this.dmg) {
      const u = body.getUserData()
      u.hp -= dmg
      if (u.hp <= 0) this.remove(body, u.type === 'crow' ? 'pop' : 'break')
    }
    this.dmg.clear()
    for (const b of this.bodies.slice()) {
      const u = b.getUserData()
      if (u.type !== 'crow') continue
      const p = b.getPosition()
      if (Math.abs(b.getAngle()) > CROW_TIP || p.y < u.y0 - CROW_DROP) this.remove(b, 'pop')
    }
    for (const b of this.birds.slice()) {
      const p = b.getPosition()
      if (p.x > 120 || p.x < -20 || p.y < -5) { this.world.destroyBody(b); this.birds.splice(this.birds.indexOf(b), 1) }
    }
    if (s) {
      let moving = false
      for (const b of this.bodies) if (b.isAwake() && b.getLinearVelocity().length() > STILL_V) { moving = true; break }
      if (!moving) for (const b of this.birds) if (b.isAwake() && b.getLinearVelocity().length() > STILL_V * 4) { moving = true; break }
      this.still = moving ? 0 : this.still + 1
      const t = this.tick - this.launchTick
      if ((t > 50 && this.still >= STILL_TICKS) || t > MAX_SHOT_TICKS) this.done = true
    }
  }

  remove(body, kind) {
    const i = this.bodies.indexOf(body)
    if (i < 0) return
    const u = body.getUserData(), p = body.getPosition(), v = body.getLinearVelocity()
    const points = kind === 'pop' ? CROW_POINTS : MATS[u.mat].points
    this.events.push({ t: kind, x: p.x, y: p.y, a: body.getAngle(), w: u.w, h: u.h, zw: u.zw, mat: u.mat, vx: v.x, vy: v.y, points })
    this.bodies.splice(i, 1)
    this.world.destroyBody(body)
  }

  crowsLeft() { return this.bodies.filter(b => b.getUserData().type === 'crow').length }
}

/** FNV-1a over a snapshot (ids + poses) as 8 hex chars — a desync tripwire. */
export function hashSnap(snap) {
  const str = snap.map(o => `${o.id},${o.x},${o.y},${o.a}`).join(';')
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// Replays are deterministic, so a shot from a given board always settles the
// same way: remember recent results (the duel re-derives its whole shot list
// on every room update, and a shot can cost ~50-150 ms to simulate).
const shotCache = new Map()
const SHOT_CACHE_MAX = 48

/** Headless: replay one recorded shot from `snap` to rest. */
export function runShot(snap, fort, shot) {
  const key = `${fort.id}|${hashSnap(snap)}|${snap.length}|${shot.b},${shot.a},${shot.p},${shot.k}`
  const hit = shotCache.get(key)
  if (hit) return hit
  const result = simulateShot(snap, fort, shot)
  shotCache.set(key, result)
  if (shotCache.size > SHOT_CACHE_MAX) shotCache.delete(shotCache.keys().next().value)
  return result
}

/** Uncached `runShot` (tests use it to prove two fresh simulations agree). */
export function simulateShot(snap, fort, shot) {
  const sim = new BirdseyeSim(snap, fort)
  sim.replaying = true
  sim.launch(shot)
  let points = 0, pops = 0
  while (!sim.done) {
    sim.step()
    for (const e of sim.events) {
      if (e.t === 'pop') { pops++; points += e.points } else if (e.t === 'break') points += e.points
    }
    sim.events.length = 0
  }
  const after = sim.snapshot()
  return { points, pops, ticks: sim.tick, snap: after, crowsLeft: sim.crowsLeft(), hash: hashSnap(after) }
}

/** Replay a solo fort's shot list in order. */
export function replayFort(fort, shots) {
  let snap = fortSnapshot(fort)
  const results = []
  for (const shot of shots) {
    const r = runShot(snap, fort, shot)
    results.push(r)
    snap = r.snap
  }
  const crowsLeft = snap.filter(s => s.kind === 'crow').length
  return { snap, results, crowsLeft, cleared: crowsLeft === 0 }
}

/**
 * Online duel: both seats throw at one fort, alternating from the room's
 * shot list. Returns the board to draw (`snap`), who has popped what, whose
 * bird is next and — once every scarecrow is down or both seats have thrown
 * DUEL_SHOTS_EACH birds — the winner.
 */
export function replayDuel(fortIndex, rawShots) {
  const fort = FORTS[fortIndex] || FORTS[0]
  let snap = fortSnapshot(fort)
  const pops = { X: 0, O: 0 }, points = { X: 0, O: 0 }, thrown = { X: 0, O: 0 }
  const records = []
  for (const { key, by, shot } of duelShots(rawShots)) {
    if (thrown[by] >= DUEL_SHOTS_EACH || snap.every(s => s.kind !== 'crow')) break
    const before = snap
    const r = runShot(snap, fort, shot)
    pops[by] += r.pops; points[by] += r.points; thrown[by]++
    records.push({ key, by, shot, before, after: r.snap, pops: r.pops, points: r.points })
    snap = r.snap
  }
  const crowsLeft = snap.filter(s => s.kind === 'crow').length
  const done = crowsLeft === 0 || (thrown.X >= DUEL_SHOTS_EACH && thrown.O >= DUEL_SHOTS_EACH)
  return {
    fort, snap, records, pops, points, thrown, crowsLeft, done,
    winner: done ? duelWinner(pops, points) : null,
    nextBird: (seat) => duelBird(fort, thrown[seat]),
    hash: hashSnap(snap),
  }
}
