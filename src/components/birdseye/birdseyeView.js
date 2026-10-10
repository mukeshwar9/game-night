// BIRDSEYE renderer + camera director (rendering only — the rules live in
// lib/birdseyeLogic.js). The 2D sim runs in the x/y plane; here x is
// down-range, y is up and z is sideways. Blocks are extruded across the flight
// line (each to its own width, so walls face the bird) and split into boards;
// birds and scarecrows are pixel billboards. Painter's sort + near-plane
// clipping on a half-resolution Canvas 2D — no WebGL. Every colour is read
// from the --c-* theme tokens.
import { BirdseyeSim } from '../../lib/birdseyeLogic'
import { BIRDS, MATS, SLING, VMAX, MIN_POWER, ANGLE_MIN, ANGLE_MAX, quantShot } from '../../lib/birdseyeCore'
import { BIRD_ART, CROW_ART, birdLayers } from './birdseyeArt'
import { AIM_CAM, MAX_PULL, sideCamGoal, pipCamGoal, pipVisible } from '../../lib/birdseyeCamera'

const DT = 1 / 60
const G = -10
const NEAR = 0.12
const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

// ── theme tokens ─────────────────────────────────────────────────────────────
let TOK = {}
let tokKey = null
const SPRITES = new Map()
function tok(n) {
  const key = document.documentElement.getAttribute('data-theme') || ''
  if (key !== tokKey) { TOK = {}; tokKey = key; SPRITES.clear() }
  if (!TOK[n]) {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--c-' + n).trim() || '128 128 128'
    TOK[n] = v.split(/\s+/).map(Number)
  }
  return TOK[n]
}
const rgb = (c, a) => (a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`)
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const mul = (a, k) => [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)]
function spec(c) {
  if (Array.isArray(c)) return c[0] === 'mix' ? mix(spec(c[1]), spec(c[2]), c[3]) : mul(spec(c[0]), c[1])
  if (c === 'white') return WHITE
  if (c === 'black') return [20, 20, 30]
  return tok(c)
}
const isDark = () => { const b = tok('bg'); return b[0] + b[1] + b[2] < 300 }

// ── vectors ──────────────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const damp = (k, dt) => 1 - Math.exp(-k * dt)
/** Convex hull (Andrew's monotone chain) of [x, z] points, counter-clockwise; null when degenerate. */
function hull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return null
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo = [], up = []
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
  lo.pop(); up.pop()
  const h = lo.concat(up)
  return h.length >= 3 ? h : null
}
// the sun sits behind-left of the sling and high: front faces and tops catch it, shadows fall away and to the side
const LIGHT = norm([-0.3, 0.8, 0.55])
const SHADOW_DX = -LIGHT[0] / LIGHT[1], SHADOW_DZ = -LIGHT[2] / LIGHT[1] // ground offset per metre of height
const WARM = [255, 238, 205]
const CLOUDS = [[10, 26, -80, 4], [60, 32, -90, 5], [120, 28, -70, 4.5], [170, 34, -95, 6], [30, 30, 60, 4], [95, 27, 70, 5]]
const FOG_K = 0.0055
// grass tufts and flowers scattered once, deterministically, so the field does not shimmer
const rnd = (() => { let a = 0x9e3779b9; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })()
const TUFTS = Array.from({ length: 90 }, () => {
  const z = (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 12)
  return { x: -6 + rnd() * 62, z, h: 0.28 + rnd() * 0.32, k: 0.75 + rnd() * 0.5, lean: (rnd() - 0.5) * 0.3 }
})
const FLOWERS = Array.from({ length: 26 }, () => ({ x: -4 + rnd() * 58, z: (rnd() < 0.5 ? -1 : 1) * (2 + rnd() * 11), c: rnd() < 0.5 ? 'white' : 'cta' }))

// ── sprites ──────────────────────────────────────────────────────────────────
function paint(layers, palSpec) {
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0
  for (const L of layers) {
    const dx = L.dx || 0, dy = L.dy || 0
    x0 = Math.min(x0, dx); y0 = Math.min(y0, dy)
    x1 = Math.max(x1, dx + Math.max(...L.art.map(r => r.length))); y1 = Math.max(y1, dy + L.art.length)
  }
  const w = x1 - x0 + 2, h = y1 - y0 + 2
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')
  const pal = {}; for (const k in palSpec) pal[k] = spec(palSpec[k])
  for (const L of layers) L.art.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.' || !pal[ch]) return
    g.fillStyle = rgb(pal[ch]); g.fillRect(x + (L.dx || 0) - x0 + 1, y + (L.dy || 0) - y0 + 1, 1, 1)
  }))
  // 1px dark outline: separation from any sky or fort, in any theme
  const d = g.getImageData(0, 0, w, h).data
  const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0
  g.fillStyle = rgb(mix(tok('text'), BLACK, 0.35), 0.85)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) g.fillRect(x, y, 1, 1)
  }
  return c
}

/** Sprite canvas for a bird id (or 'crow') in a view, frame 0/1. Exported for the HUD and rule art. */
export function birdseyeSprite(key, frame = 0, view = 'side') {
  tok('bg') // invalidates the cache on a theme change
  const id = `${key}|${frame}|${view}`
  let c = SPRITES.get(id)
  if (!c) {
    c = key === 'crow' ? paint(CROW_ART.layers, CROW_ART.pal) : paint(birdLayers(key, view, frame), BIRD_ART[key].pal)
    SPRITES.set(id, c)
  }
  return c
}

/** A soft, self-shaded cloud (bright top, shadowed belly), painted once per theme. */
function cloudSprite(sky, dark) {
  tok('bg') // invalidates the cache on a theme change
  let c = SPRITES.get('cloud')
  if (c) return c
  c = document.createElement('canvas'); c.width = 96; c.height = 40
  const g = c.getContext('2d')
  const lit = mix(WHITE, sky, dark ? 0.55 : 0.1), belly = mix(lit, tok('p4'), dark ? 0.2 : 0.3)
  const puffs = [[48, 24, 17], [30, 25, 12], [66, 25, 13], [40, 15, 12], [58, 16, 11], [18, 28, 8], [78, 28, 8]]
  for (const [x, y, r] of puffs) {
    const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.4, r * 0.1, x, y, r)
    gr.addColorStop(0, rgb(lit, 0.95)); gr.addColorStop(0.7, rgb(mix(lit, belly, 0.45), 0.85)); gr.addColorStop(1, rgb(belly, 0))
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  }
  SPRITES.set('cloud', c)
  return c
}

export class BirdseyeView {
  constructor(canvas, { fort, onEvent, res = 0.5 } = {}) {
    this.cv = canvas
    this.ctx = canvas.getContext('2d')
    this.res = res
    this.onEvent = onEvent || (() => {})
    this.camMode = 'chase' // chase | beak | side
    this.comfort = { reduce: false, fov: 78, crash: true }
    this.peek = false
    this.fort = fort
    this.parts = []
    this.texts = []
    this.speedLines = Array.from({ length: 46 }, (_, i) => ({ a: (i * 2.399) % (Math.PI * 2), r: (i * 0.618) % 1, s: 0.6 + ((i * 0.37) % 0.8) }))
    this.cam = { pos: [...AIM_CAM.pos], target: [...AIM_CAM.target], fov: AIM_CAM.fov }
    this.pip = null // the side picture-in-picture: set by the arena to a <canvas>
    this.pipRes = 0.8 // the pip is its own small canvas at this fraction of its CSS size
    this.pipOn = false
    this.lod = false // true while painting the picture-in-picture (skips scenery and HUD)
    this.quality = 1 // drops to 0 when frames run long: no tufts, texture detail or vignette
    this.frameMs = 0
    this.drawMs = 0
    this.trauma = 0
    this.hitStop = 0
    this.timeScale = 1
    this.acc = 0
    this.lastTrail = null
    this.phase = 'idle'
  }

  // ── board & shot lifecycle ───────────────────────────────────────────────
  /** Show `snap` of the current fort; `bird` loads the sling (null = nothing to aim). */
  board(snap, bird) {
    if (this.trail?.length) this.lastTrail = this.trail.slice()
    this.snap = snap
    this.sim = new BirdseyeSim(snap, this.fort)
    this.bird = bird || null
    this.phase = bird ? 'aim' : 'idle'
    this.aim = { ang: 0.6, pow: 0, active: false }
    this.trail = []
    this.slow = null
    this.timeScale = 1
    this.hitStop = 0
    this.acc = 0
    this.cut = null
    this.replay = false
    this.snapCam = true
  }

  setFort(fort) { this.fort = fort; this.lastTrail = null }

  /** Screen-space pull (pixels): dx > 0 = pulled left, dy > 0 = pulled down; h = view height. */
  setAim(dx, dy, h) {
    if (this.phase !== 'aim') return
    this.aim.ang = Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, Math.atan2(dy, dx)))
    this.aim.pow = Math.max(0, Math.min(1, Math.hypot(dx, dy) / (h * 0.3)))
    this.aim.active = true
  }

  cancelAim() { if (this.aim) { this.aim.active = false; this.aim.pow = 0 } }

  /** Let go: a weak pull is a free cancel, anything else flies. Returns the quantised shot or null. */
  release() {
    if (this.phase !== 'aim' || !this.bird) return null
    if (this.aim.pow < MIN_POWER) { this.cancelAim(); return null }
    const shot = quantShot(this.bird, this.aim.ang, this.aim.pow)
    this.fire(shot)
    return shot
  }

  /** Fly `shot` from the current board (live) or from `before` (a recorded replay). */
  fire(shot, { replay = false, before = null, cam = null } = {}) {
    if (before) { if (this.trail?.length) this.lastTrail = this.trail.slice(); this.sim = new BirdseyeSim(before, this.fort); this.snap = before }
    this.before = this.snap
    this.sim.replaying = replay
    this.sim.launch(shot)
    this.replay = replay
    this.replayCam = cam
    this.phase = 'fly'
    this.aim && (this.aim.active = false)
    this.trail = []
    this.points = 0
    this.pops = 0
    this.slow = null
    this.cut = null
    this.parts.length = 0
    this.texts.length = 0
    this.hitStop = 0
    this.acc = 0
    if (this.activeCam === 'beak') this.snapCam = true
    this.onEvent({ t: 'launch', power: shot.p / 1000, replay })
  }

  canAbility() { return this.phase === 'fly' && !this.replay && this.sim.canUseAbility() }

  ability() {
    if (!this.canAbility()) return false
    if (this.sim.useAbility()) { this.onEvent({ t: 'ability' }); return true }
    return false
  }

  get activeCam() { return this.replay && this.replayCam ? this.replayCam : this.camMode }

  // ── simulation drive ─────────────────────────────────────────────────────
  update(dt) {
    dt = Math.min(dt, 0.05)
    if (this.phase === 'fly' || this.phase === 'impact') {
      if (this.slow) {
        this.slow.t += dt
        const T = this.slow.t
        this.timeScale = this.comfort.reduce ? 0.5 : (T < 1.1 ? 0.22 : T < 1.7 ? 0.22 + (T - 1.1) / 0.6 * 0.78 : 1)
      }
      if (this.hitStop > 0) this.hitStop -= dt // hit-stop: the world holds still for a beat on impact
      else this.acc += dt * this.timeScale
      let n = 0
      while (this.acc >= DT && n < 4 && this.phase !== 'done') { this.simStep(); this.acc -= DT; n++ }
      if (n === 4) this.acc = 0
    }
    this.updateParts(dt * (this.phase === 'aim' || this.phase === 'idle' ? 1 : this.timeScale))
    this.updateCam(dt)
    this.trauma = Math.max(0, this.trauma - dt * 1.6)
  }

  simStep() {
    const sim = this.sim
    sim.step()
    const b = sim.bird
    if (b && sim.hitTick < 0 && sim.tick % 2 === 0) { const p = b.getPosition(); this.trail.push([p.x, p.y]) }
    // the approach: slow-mo + crash cam when the bird is ~2 m from the fort
    if (!this.slow && b && sim.hitTick < 0) {
      const p = b.getPosition(), v = b.getLinearVelocity()
      for (const o of sim.bodies) {
        const op = o.getPosition(), u = o.getUserData()
        const dx = op.x - p.x, dy = op.y - p.y
        if (Math.hypot(dx, dy) - Math.hypot(u.w, u.h) / 2 < 2.2 && dx * v.x + dy * v.y > 0) { this.startSlow([p.x, p.y, 0]); break }
      }
    }
    for (const e of sim.events) this.onSimEvent(e)
    sim.events.length = 0
    if (sim.done && this.phase !== 'done') {
      this.phase = 'done'
      this.timeScale = 1
      const snap = sim.snapshot()
      this.onEvent({
        t: 'settled', live: !this.replay, shot: { ...sim.shot }, points: this.points, pops: this.pops,
        before: this.before, snap, crowsLeft: sim.crowsLeft(),
      })
    }
  }

  startSlow(at) {
    this.slow = { t: 0, at }
    this.phase = 'impact'
    if (this.comfort.crash && this.activeCam === 'chase') { this.cut = 'crash'; this.snapCam = true }
  }

  /** A soft dust or smoke puff that swells and fades. */
  puff(x, y, n, col, size, up = 1) {
    const R = Math.random
    for (let i = 0; i < n && this.parts.length < 220; i++) {
      const life = 0.7 + R() * 0.6
      this.parts.push({ p: [x + (R() - 0.5) * 0.8, y, (R() - 0.5) * 1.2], v: [(R() - 0.5) * 2.2, up * (0.5 + R() * 1.1), (R() - 0.5) * 2.2], life, life0: life, col, s: size * (0.7 + R() * 0.6), puff: true, nog: true })
    }
  }

  onSimEvent(e) {
    const R = Math.random
    const dust = mix(tok('kam0'), WHITE, 0.55)
    if (e.t === 'hit') {
      if (!this.slow) this.startSlow([e.x, e.y, 0])
      if (this.comfort.crash && this.activeCam === 'beak') { this.cut = 'crash'; this.snapCam = true }
      this.trauma = Math.min(1, this.trauma + 0.55)
      this.hitStop = Math.min(0.12, Math.max(this.hitStop, 0.075))
      for (let i = 0; i < 14; i++) this.parts.push({ p: [e.x, e.y, (R() - 0.5) * 0.6], v: [(R() - 0.5) * 6, R() * 6, (R() - 0.5) * 6], life: 1.4, col: 'feather', s: 0.12 })
      this.onEvent({ t: 'hit' })
    } else if (e.t === 'break' || e.t === 'pop') {
      const col = e.t === 'pop' ? tok('kam3') : spec(MATS[e.mat].tone)
      const glass = e.t === 'break' && MATS[e.mat].glass
      const spread = Math.min(e.zw || 1, 2.4)
      for (let i = 0; i < (e.t === 'pop' ? 26 : 18); i++) {
        const along = (R() - 0.5) * Math.max(e.w, e.h)
        this.parts.push({ p: [e.x + along * Math.cos(e.a), e.y + along * Math.sin(e.a), (R() - 0.5) * spread * 2], v: [e.vx * 0.4 + (R() - 0.5) * 7, e.vy * 0.4 + R() * 7, (R() - 0.5) * 7], life: 1.6 + R(), col, s: e.t === 'pop' ? 0.09 : 0.08 + R() * 0.16, glass, line: !glass && e.t === 'break' && i % 3 === 0 })
      }
      if (e.t === 'pop') this.puff(e.x, e.y + 0.3, 5, mix(tok('kam3'), WHITE, 0.5), 0.55, 1.3)
      else if (!glass) this.puff(e.x, e.y, 4, e.mat === 'stone' ? mix(tok('structure'), WHITE, 0.45) : dust, 0.5)
      if (e.t === 'pop') { this.parts.push({ p: [e.x, e.y + 0.4, 0], v: [e.vx * 0.3 + 1, 8, 0.5], life: 2.2, col: 'hat', s: 0.35 }); this.pops++ }
      this.points += e.points
      this.texts.push({ p: [e.x, e.y + 0.6, 0], txt: '+' + e.points, t: 0, big: e.t === 'pop' })
      this.trauma = Math.min(1, this.trauma + (e.t === 'pop' ? 0.35 : 0.2))
      this.hitStop = Math.min(0.12, Math.max(this.hitStop, e.t === 'pop' ? 0.05 : 0.025))
      this.onEvent({ t: e.t, glass, points: e.points })
    } else if (e.t === 'thud') {
      this.trauma = Math.min(1, this.trauma + Math.min(0.3, e.n / 80))
      if (e.y < 1.6) this.puff(e.x, Math.max(0.1, e.y - 0.3), Math.min(6, 2 + (e.n / 12) | 0), dust, 0.45)
      this.onEvent({ t: 'thud', n: e.n })
    } else if (e.t === 'ability') {
      for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; this.parts.push({ p: [e.x, e.y, 0], v: [Math.cos(a) * 5, Math.sin(a) * 5, Math.sin(a * 3) * 2], life: 0.6, col: 'ring', s: 0.08, nog: true }) }
      this.texts.push({ p: [e.x, e.y + 0.8, 0], txt: e.name + '!', t: 0, big: true })
    }
  }

  updateParts(dt) {
    for (const p of this.parts) {
      p.life -= dt
      if (!p.nog) p.v[1] -= 12 * dt
      p.p = add(p.p, sc(p.v, dt))
      if (p.puff) { p.v[0] *= 1 - 1.5 * dt; p.v[1] *= 1 - 1.2 * dt; p.v[2] *= 1 - 1.5 * dt }
      if (p.p[1] < 0.05 && !p.nog) { p.p[1] = 0.05; p.v[1] *= -0.3; p.v[0] *= 0.6; p.v[2] *= 0.6 }
    }
    this.parts = this.parts.filter(p => p.life > 0)
    for (const t of this.texts) t.t += dt
    this.texts = this.texts.filter(t => t.t < 1.4)
  }

  // ── cameras ──────────────────────────────────────────────────────────────
  birdState() {
    if (this.phase === 'aim' || this.phase === 'idle') {
      const a = this.aim || { ang: 0.6, pow: 0 }, pull = MAX_PULL * a.pow
      return { p: [SLING.x - Math.cos(a.ang) * pull, SLING.y - Math.sin(a.ang) * pull, 0], v: [Math.cos(a.ang), Math.sin(a.ang), 0], speed: 0 }
    }
    const b = this.sim.bird
    if (!b) { const t = this.trail[this.trail.length - 1] || [0, 2]; return { p: [t[0], t[1], 0], v: [1, 0, 0], speed: 0, gone: true } }
    const p = b.getPosition(), v = b.getLinearVelocity()
    return { p: [p.x, p.y, 0], v: [v.x, v.y, 0], speed: Math.hypot(v.x, v.y) }
  }

  fortCenter() {
    let x = 0, y = 0, n = 0
    for (const b of this.sim.bodies) { const p = b.getPosition(); x += p.x; y += p.y; n++ }
    return n ? [x / n, y / n, 0] : [38, 2, 0]
  }

  updateCam(dt) {
    const bs = this.birdState()
    const resting = this.phase === 'aim' || this.phase === 'idle'
    const mode = resting ? (this.peek ? 'side' : 'aim') : (this.cut === 'crash' ? 'crash' : this.activeCam)
    let pos, target, fov, k
    if (mode === 'aim') {
      pos = AIM_CAM.pos; target = AIM_CAM.target; fov = AIM_CAM.fov; k = 4
    } else if (mode === 'side') {
      const g = sideCamGoal({ phase: this.phase, birdX: bs.p[0], fortX: this.fortCenter()[0], aspect: (this.cv.width / this.cv.height) || 0.7 })
      pos = g.pos; target = g.target; fov = g.fov; k = 3
    } else if (mode === 'chase') {
      const v = len(bs.v) > 0.5 ? norm(bs.v) : [1, 0, 0]
      pos = add(bs.p, add(sc(v, -5.2), [0, 1.3, 1.6])); target = add(bs.p, sc(v, 5)); fov = 62; k = 6
      if (bs.gone || this.phase === 'done') { const fc = this.fortCenter(); pos = [fc[0] - 9, 4.5, 7]; target = fc; k = 1.5 }
    } else if (mode === 'beak') {
      const v = len(bs.v) > 0.5 ? norm(bs.v) : [1, 0, 0]
      this.beakDir = this.beakDir ? norm(lerp3(this.beakDir, v, damp(8, dt))) : v
      pos = add(bs.p, [0, 0.12, 0]); target = add(pos, this.beakDir); fov = this.comfort.fov; k = 1000
      if (bs.gone || this.phase === 'done') { const fc = this.fortCenter(); pos = [fc[0] - 8, 3.5, 6]; target = fc; fov = 60; k = 1.5 }
    } else {
      const s = this.slow || { t: 0, at: bs.p }
      const fc = this.fortCenter()
      const orbit = (this.comfort.reduce ? 0 : 0.18) * Math.min(s.t, 6)
      const off = [-3.2, 1.4, 8.6], c = Math.cos(orbit), sn = Math.sin(orbit)
      pos = add(s.at, [off[0] * c - off[2] * sn, off[1], off[0] * sn + off[2] * c])
      target = lerp3(s.at, fc, Math.min(1, s.t * 0.6)); fov = 54; k = 2.5
      if (this.phase === 'done') { pos = [fc[0] - 11, 5.5, 10.5]; target = fc; k = 1.2 }
    }
    const cam = this.cam
    if (this.snapCam) { cam.pos = pos; cam.target = target; cam.fov = fov; this.snapCam = false }
    else { const t = damp(k, dt); cam.pos = lerp3(cam.pos, pos, t); cam.target = lerp3(cam.target, target, t); cam.fov += (fov - cam.fov) * damp(4, dt) }
    cam.mode = mode
    cam.speed = bs.speed
  }

  // ── render ───────────────────────────────────────────────────────────────
  frame(dt) {
    if (!this.sim) return
    const t0 = performance.now()
    this.update(dt)
    const r = this.cv.getBoundingClientRect()
    const w = Math.max(40, Math.round(r.width * this.res)), h = Math.max(40, Math.round(r.height * this.res))
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h }
    this.draw()
    this.pipOn = !!this.pip && pipVisible({ cam: this.activeCam, phase: this.phase, peek: this.peek })
    if (this.pipOn) this.drawPip()
    // quality governor: sustained slow frames switch the extras (tufts, texture, vignette) off for good
    this.drawMs += (performance.now() - t0 - this.drawMs) * 0.06
    if (this.quality > 0) { this.slowFrames = this.drawMs > 11 ? (this.slowFrames || 0) + 1 : 0; if (this.slowFrames > 90) this.quality = 0 }
  }

  /** The side picture-in-picture: the same world through a fixed side-on camera, painted into its own small canvas. */
  drawPip() {
    const pv = this.pip, r = pv.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) return // still hidden: it shows from the next frame
    const w = Math.round(r.width * this.pipRes), h = Math.round(r.height * this.pipRes)
    if (pv.width !== w || pv.height !== h) { pv.width = w; pv.height = h }
    if (!this.pipCtx || this.pipCtx.canvas !== pv) this.pipCtx = pv.getContext('2d')
    const keep = { cv: this.cv, ctx: this.ctx, cam: this.cam, B: this.B, trauma: this.trauma }
    const goal = pipCamGoal(w / h)
    this.cv = pv; this.ctx = this.pipCtx; this.lod = true; this.trauma = 0
    this.cam = { pos: goal.pos, target: goal.target, fov: goal.fov, mode: 'side', speed: 0 }
    try { this.draw() } finally {
      this.cv = keep.cv; this.ctx = keep.ctx; this.cam = keep.cam; this.B = keep.B; this.trauma = keep.trauma; this.lod = false
    }
  }

  basis() {
    const c = this.cam
    let pos = c.pos
    if (this.trauma > 0 && !this.comfort.reduce) {
      const s = this.trauma * this.trauma * 0.25, t = performance.now() / 1000
      pos = add(pos, [Math.sin(t * 61) * s, Math.sin(t * 47 + 1) * s, Math.sin(t * 53 + 2) * s])
    }
    const f = norm(sub(c.target, c.pos))
    let r = cross(f, [0, 1, 0]); if (len(r) < 1e-6) r = [0, 0, 1]; r = norm(r)
    const H = this.cv.height, W = this.cv.width
    return { p: pos, f, r, u: cross(r, f), F: (H / 2) / Math.tan(c.fov * Math.PI / 360), W, H }
  }

  toC(p) { const B = this.B, d = sub(p, B.p); return [dot(d, B.r), dot(d, B.u), dot(d, B.f)] }
  pr(c) { const B = this.B; return [B.W / 2 + B.F * c[0] / c[2], B.H / 2 - B.F * c[1] / c[2]] }

  /** Clip a world polygon at the near plane and project it; null when fully behind. */
  poly(pts3, fill, stroke, a) {
    const c = pts3.map(p => this.toC(p)), out = []
    for (let i = 0; i < c.length; i++) {
      const A = c[i], Bb = c[(i + 1) % c.length], ia = A[2] > NEAR, ib = Bb[2] > NEAR
      if (ia) out.push(A)
      if (ia !== ib) out.push(lerp3(A, Bb, (NEAR - A[2]) / (Bb[2] - A[2])))
    }
    if (out.length < 3) return null
    let z = 0; for (const o of out) z += o[2]
    return { z: z / out.length, pts: out.map(o => this.pr(o)), fill, stroke, a }
  }

  draw() {
    const g = this.ctx, B = this.basis(), W = B.W, H = B.H
    this.B = B
    g.imageSmoothingEnabled = false
    const lod = this.lod, hq = this.quality > 0 && !lod
    const dark = isDark()
    // sky: zenith down to a hazy horizon (warm in daylight); the same haze fogs everything far away
    const hz = this.pr(this.toC(add(B.p, [B.f[0] * 1000, 0, B.f[2] * 1000])))
    const hy = Number.isFinite(hz[1]) ? hz[1] : H / 2
    const sky1 = dark ? tok('deep') : mix(tok('tint-p4'), WHITE, 0.2)
    const sky2 = dark ? mix(tok('deep'), tok('p4'), 0.35) : mix(tok('tint-p4'), tok('p4'), 0.25)
    const haze = dark ? mix(sky1, tok('p4'), 0.2) : mix(sky1, WARM, 0.35)
    this.haze = haze
    const grd = g.createLinearGradient(0, Math.min(hy, H) - H, 0, Math.max(0, hy))
    grd.addColorStop(0, rgb(sky2)); grd.addColorStop(0.65, rgb(mix(sky2, sky1, 0.7))); grd.addColorStop(1, rgb(haze))
    g.fillStyle = grd; g.fillRect(0, 0, W, H)
    const list = []
    // two ranges of hills, the far one lost in haze
    if (!lod) {
      const hill = dark ? mix(tok('deep'), tok('p1'), 0.25) : mix(tok('tint-p1'), tok('p1'), 0.35)
      const far = [[-40, 0, -90], [10, 14, -95], [40, 6, -95], [80, 20, -100], [130, 8, -100], [190, 16, -100], [260, 0, -100]]
      const near = [[-40, 0, -64], [0, 6, -66], [30, 3, -66], [62, 9, -68], [100, 4, -66], [150, 8, -68], [210, 3, -66], [260, 0, -64]]
      for (const [pts, col] of [[far, mix(hill, haze, 0.45)], [near, mix(mul(hill, 0.92), haze, 0.2)]]) {
        for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const pp = this.poly([[a[0], 0, a[2]], a, b, [b[0], 0, b[2]]], col); if (pp) this.fillPoly(pp) }
      }
      this.drawBackdrop(sky1, dark)
    }
    // ground: field, crop furrows (they converge on the vanishing point), faint cross bands
    const gnd = dark ? mix(tok('surface'), tok('p1'), 0.3) : mix(tok('tint-p1'), tok('p1'), 0.34)
    const gnd2 = dark ? mix(tok('surface'), tok('p1'), 0.4) : mix(tok('tint-p1'), tok('p1'), 0.46)
    const G0 = this.poly([[-60, 0, -80], [260, 0, -80], [260, 0, 80], [-60, 0, 80]], gnd); if (G0) this.fillPoly(G0)
    const furrow = mix(gnd2, tok('kam0'), 0.35)
    if (!lod) {
      for (const sgn of [-1, 1]) for (let z = 4; z < 34; z += 2.4) { const s = this.poly([[-20, 0.001, sgn * z], [150, 0.001, sgn * z], [150, 0.001, sgn * (z + 0.9)], [-20, 0.001, sgn * (z + 0.9)]], furrow); if (s) this.fillPoly(s) }
    }
    for (let x = -20; x < 140; x += 6) { const s = this.poly([[x, 0.0005, -30], [x + 3, 0.0005, -30], [x + 3, 0.0005, 30], [x, 0.0005, 30]], gnd2, null, 0.35); if (s) this.fillPoly(s) }
    const dirt = mix(gnd2, tok('kam0'), 0.25)
    const lane = this.poly([[-2, 0.001, -1.2], [46, 0.001, -1.2], [46, 0.001, 1.2], [-2, 0.001, 1.2]], dirt); if (lane) this.fillPoly(lane)
    if (!lod) {
      // the lane's worn edges
      for (const z of [-1.2, 1.2]) { const e = this.poly([[-2, 0.0015, z - 0.12], [46, 0.0015, z - 0.12], [46, 0.0015, z + 0.12], [-2, 0.0015, z + 0.12]], mul(dirt, 0.82)); if (e) this.fillPoly(e) }
      if (hy > -H * 0.3 && hy < H) { // the field melts into the horizon
        const fh = g.createLinearGradient(0, hy - H * 0.02, 0, hy + H * 0.2)
        fh.addColorStop(0, rgb(haze, 0.55)); fh.addColorStop(1, rgb(haze, 0))
        g.fillStyle = fh; g.fillRect(0, Math.max(0, hy - H * 0.02), W, H * 0.22)
      }
    }
    this.drawShadows(g, dark)
    // fence: posts every 4 m with two rails (the strongest speed cue in flight)
    const post = mul(tok('kam0'), dark ? 0.9 : 0.8)
    if (!lod) for (let x = -4; x < 60; x += 4) for (const z of [-4.5, 4.5]) {
      const pp = this.poly([[x, 0, z], [x + 0.18, 0, z], [x + 0.18, 1.1, z], [x, 1.1, z]], post); if (pp) list.push(pp)
      if (x < 56) for (const ry of [0.5, 0.9]) { const rl = this.poly([[x, ry, z], [x + 4, ry, z], [x + 4, ry + 0.09, z], [x, ry + 0.09, z]], mul(post, 1.15)); if (rl) list.push(rl) }
    }
    if (hq) { // grass tufts and wildflowers: texture and parallax on an otherwise flat field
      const blade = mix(gnd, tok('p1'), 0.55)
      for (const t of TUFTS) for (let k = -1; k <= 1; k++) {
        const col = mul(blade, t.k * (0.85 + k * 0.1)), w = 0.035
        const pts = k === 0
          ? [[t.x, 0, t.z - w], [t.x, 0, t.z + w], [t.x, t.h, t.z + t.lean]]
          : [[t.x + k * 0.07 - w, 0, t.z], [t.x + k * 0.07 + w, 0, t.z], [t.x + k * 0.07 + t.lean * k, t.h * (1 - Math.abs(k) * 0.2), t.z]]
        const pp = this.poly(pts, col); if (pp) list.push(pp)
      }
      for (const f of FLOWERS) this.dotAt(list, [f.x, 0.14, f.z], 0.05, f.c === 'white' ? WHITE : tok('cta'), 1)
    }
    // the sling: a post and a Y fork
    const wood = mul(tok('kam0'), 0.9)
    this.boxFaces(list, [SLING.x, 0.75, 0], 0.22, 1.5, 0.11, 0, wood, 1, 1, { mat: 'wood', seed: 3 })
    for (const s of [-1, 1]) this.prong(list, [SLING.x, 1.95, s * 0.36], s * 0.35, wood)
    // fort
    let bi = 0
    for (const b of this.sim.bodies) {
      const u = b.getUserData(), p = b.getPosition(), a = b.getAngle()
      bi++
      if (u.type === 'block') {
        const m = MATS[u.mat], zw = u.zw || 0.6
        const n = Math.max(1, Math.round(zw * 2 / m.seg)), seg = (zw * 2) / n, gap = m.glass ? 0.12 : 0.05
        for (let i = 0; i < n; i++) {
          const shade = 1 + ((i * 7) % 3 - 1) * 0.05 // per-board tone jitter
          this.boxFaces(list, [p.x, p.y, -zw + seg * (i + 0.5)], u.w, u.h, seg / 2 - gap / 2, a, mul(tok(m.tone), shade), m.glass ? 0.62 : 1, u.hp / m.hp, hq ? { mat: u.mat, seed: bi * 7 + i } : null)
        }
      } else {
        this.billboard(list, 'crow', [p.x, p.y, 0], u.h * 1.25, a)
      }
    }
    // birds
    const bs = this.birdState(), cm = this.cam.mode
    const flap = Math.floor(performance.now() / 90) % 2
    if ((this.phase === 'aim' || this.phase === 'idle') && this.bird) {
      const def = BIRDS[this.bird]
      const view = this.birdView([Math.cos(this.aim.ang), Math.sin(this.aim.ang), 0])
      this.billboard(list, this.bird, bs.p, def.r * 3.6, 0, 0, view, -0.28 * this.aim.pow)
      for (const s of [-1, 1]) {
        const a3 = this.toC([SLING.x, 2.35, s * 0.62]), b3 = this.toC(add(bs.p, [-0.15, 0, 0]))
        if (a3[2] > NEAR && b3[2] > NEAR) list.push({ z: (a3[2] + b3[2]) / 2, line: [this.pr(a3), this.pr(b3)], col: mul(tok('kam2'), 0.8), w: lod ? 1 : 2 })
      }
      if (this.lastTrail) for (let i = 0; i < this.lastTrail.length; i += 3) this.dotAt(list, [this.lastTrail[i][0], this.lastTrail[i][1], 0], 0.05, tok('text'), 0.28)
      if (this.aim.active && this.aim.pow > MIN_POWER) {
        const v = VMAX * this.aim.pow, vx = Math.cos(this.aim.ang) * v, vy = Math.sin(this.aim.ang) * v
        // the pip shows the whole arc; the main view only the first stretch of it
        const tEnd = lod ? 5 : 0.85, dtp = lod ? 0.12 : 0.06
        for (let t = dtp; t < tEnd; t += dtp) {
          const y = bs.p[1] + vy * t + 0.5 * G * t * t
          if (lod && y < 0) break
          this.dotAt(list, [bs.p[0] + vx * t + 0.5 * (this.fort.wind || 0) * t * t, y, 0], lod ? 0.22 : 0.07, tok('cta'), lod ? 0.9 : 1 - t)
        }
      }
    } else {
      for (const b of this.sim.birds) {
        const def = b.getUserData().def, p = b.getPosition(), v = b.getLinearVelocity()
        if (cm === 'beak' && b === this.sim.bird) continue
        const tucked = def.ability === 'DIVE' && this.sim.abilityUsed && this.sim.hitTick < 0
        let view = this.birdView([v.x, v.y, 0])
        if (tucked) view = view === 'back' ? 'backtuck' : 'tuck'
        // squash & stretch: stretch off the sling, squash on impact
        const age = (this.sim.tick - this.sim.launchTick) / 60
        let st = 0.32 * Math.exp(-age * 9)
        if (this.sim.hitTick >= 0) st = -0.3 * Math.exp(-((this.sim.tick - this.sim.hitTick) / 60) * 10)
        if (tucked) st = Math.max(st, 0.18)
        const flying = this.sim.hitTick < 0 && Math.hypot(v.x, v.y) > 1
        this.billboard(list, def.id, [p.x, p.y, 0], def.r * 3.6, 0, flying && !tucked ? flap : 0, view, st)
      }
    }
    if (this.trail.length && (cm === 'side' || this.phase === 'done' || this.replay)) {
      for (let i = 0; i < this.trail.length; i += 2) this.dotAt(list, [this.trail[i][0], this.trail[i][1], 0], lod ? 0.2 : 0.06, tok('text'), lod ? 0.75 : 0.5)
    } else if (cm === 'chase' && this.phase === 'fly' && hq) {
      // a short contrail so the bird's speed and heading read against the sky
      const n = this.trail.length
      for (let i = Math.max(0, n - 12); i < n; i++) { const k = (i - (n - 12)) / 12; this.dotAt(list, [this.trail[i][0], this.trail[i][1], 0], 0.05 + k * 0.07, WHITE, Math.max(0, k) * 0.45) }
    }
    // debris: splinters, chips, dust puffs
    for (const pt of this.parts) {
      const c = this.toC(pt.p); if (c[2] <= NEAR) continue
      const col = Array.isArray(pt.col) ? pt.col : pt.col === 'feather' ? tok(BIRDS[this.sim.shot?.b || 'pip'].tone) : pt.col === 'ring' ? tok('cta') : mul(tok('kam0'), 0.55)
      if (pt.puff) {
        const grow = 1 + (1 - pt.life / pt.life0) * 2.2
        list.push({ z: c[2], dot: this.pr(c), r: Math.min(H * 0.1, Math.max(1, B.F * pt.s * grow / c[2])), col, a: Math.max(0, pt.life / pt.life0) * 0.42 })
      } else if (pt.line) {
        const e = this.toC(add(pt.p, sc(pt.v, 0.05)))
        if (e[2] > NEAR) list.push({ z: c[2], line: [this.pr(c), this.pr(e)], col, w: 1 })
      } else {
        list.push({ z: c[2], sq: this.pr(c), r: Math.min(H * 0.025, Math.max(1, B.F * pt.s / c[2])), col, a: Math.min(1, pt.life * 1.5) * (pt.glass ? 0.7 : 1) })
      }
    }
    // aerial perspective: far fort boards and fence posts drift toward the haze colour
    for (const it of list) if (it.pts && it.fill && it.z > 12) {
      const t = 1 - Math.exp(-it.z * FOG_K)
      it.fill = mix(it.fill, haze, t)
      if (it.stroke) it.stroke = mix(it.stroke, haze, t)
    }
    list.sort((a, b) => b.z - a.z)
    for (const it of list) {
      if (it.pts) this.fillPoly(it)
      else if (it.img) this.drawImg(it)
      else if (it.line) { g.strokeStyle = rgb(it.col); g.lineWidth = it.w; g.beginPath(); g.moveTo(...it.line[0]); g.lineTo(...it.line[1]); g.stroke() }
      else if (it.dot) { g.fillStyle = rgb(it.col, it.a); g.beginPath(); g.arc(it.dot[0], it.dot[1], it.r, 0, 7); g.fill() }
      else if (it.sq) { g.fillStyle = rgb(it.col, it.a); g.fillRect(it.sq[0] - it.r, it.sq[1] - it.r, it.r * 2, it.r * 2) }
    }
    if (lod) return
    // target chevrons: scarecrows hidden behind a wall stay readable
    if (cm !== 'crash' && this.phase !== 'done') {
      for (const o of this.sim.bodies) {
        if (o.getUserData().type !== 'crow') continue
        const q = o.getPosition(), c = this.toC([q.x, q.y + 1.0, 0])
        if (c[2] <= NEAR) continue
        const sp = this.pr(c), k = Math.max(2, Math.min(5, B.F * 0.18 / c[2]))
        g.fillStyle = rgb(tok('bg'), 0.8); g.beginPath(); g.moveTo(sp[0] - k - 1, sp[1] - k - 1); g.lineTo(sp[0] + k + 1, sp[1] - k - 1); g.lineTo(sp[0], sp[1] + 1); g.fill()
        g.fillStyle = rgb(tok('cta')); g.beginPath(); g.moveTo(sp[0] - k, sp[1] - k); g.lineTo(sp[0] + k, sp[1] - k); g.lineTo(sp[0], sp[1]); g.fill()
      }
    }
    if (hq && cm !== 'beak') { // soft vignette: pulls the eye to the middle of the shot
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.6)
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,8,20,0.3)')
      g.fillStyle = vg; g.fillRect(0, 0, W, H)
    }
    // floating points
    g.textAlign = 'center'
    for (const t of this.texts) {
      const c = this.toC(add(t.p, [0, t.t * 1.2, 0])); if (c[2] <= NEAR) continue
      const s = this.pr(c), size = Math.round(Math.max(6, Math.min(14, (t.big ? 9 : 7) * (H / 300))))
      g.font = `${size}px 'Press Start 2P', monospace`
      g.fillStyle = rgb(tok('bg'), 0.85 * (1 - t.t / 1.4)); g.fillText(t.txt, s[0] + 1, s[1] + 1)
      g.fillStyle = rgb(t.big ? tok('cta') : tok('text'), 1 - t.t / 1.4); g.fillText(t.txt, s[0], s[1])
    }
    if (cm === 'beak' && this.phase !== 'done' && this.sim.bird) this.drawBeak(B)
    else if (cm === 'chase' && this.phase === 'fly' && !this.comfort.reduce) this.drawSpeedLines(B, 0.45)
    if (this.slow && this.slow.t < 1.7 && this.phase !== 'done') this.drawLetterbox(B)
  }

  /** Cast shadows on the field: every board, scarecrow and bird, all painted as one layer so overlaps do not double up. */
  drawShadows(g, dark) {
    const tint = dark ? [0, 4, 14] : [14, 24, 36]
    const groundPoly = (pts2) => { const pp = this.poly(pts2.map(([x, z]) => [x, 0.003, z]), null); return pp && pp.pts }
    const blob = (cx, cz, rx, rz) => {
      const pts = []
      for (let i = 0; i < 14; i++) { const t = i / 14 * Math.PI * 2; pts.push([cx + rx * Math.cos(t), cz + rz * Math.sin(t)]) }
      return groundPoly(pts)
    }
    const paths = []
    for (const b of this.sim.bodies) {
      const u = b.getUserData(), p = b.getPosition(), a = b.getAngle()
      if (u.type === 'block') {
        const ca = Math.cos(a), sa = Math.sin(a), hw = u.w / 2, hh = u.h / 2, zw = u.zw || 0.6
        const pts = []
        for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
          const x = p.x + lx * ca - ly * sa, y = Math.max(0, p.y + lx * sa + ly * ca)
          for (const z of [-zw, zw]) { pts.push([x, z]); pts.push([x + SHADOW_DX * y, z + SHADOW_DZ * y]) }
        }
        const h = hull2(pts); if (h) { const pp = groundPoly(h); if (pp) paths.push(pp) }
      } else {
        const h = Math.max(0, p.y - u.h / 2), pp = blob(p.x + SHADOW_DX * h, SHADOW_DZ * h, 0.5, 0.34); if (pp) paths.push(pp)
      }
    }
    g.fillStyle = rgb(tint, dark ? 0.34 : 0.24)
    g.beginPath()
    for (const pts of paths) { pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath() }
    g.fill()
    // birds in flight: a blob that slides along the field and fades with height
    const flyers = (this.phase === 'aim' || this.phase === 'idle') ? (this.bird ? [{ y: this.birdState().p[1], x: this.birdState().p[0], r: BIRDS[this.bird].r }] : [])
      : this.sim.birds.map(b => { const q = b.getPosition(); return { x: q.x, y: q.y, r: b.getUserData().def.r } })
    for (const f of flyers) {
      const pp = blob(f.x + SHADOW_DX * f.y, SHADOW_DZ * f.y, f.r * 1.5 + f.y * 0.02, f.r * 1.1 + f.y * 0.015)
      if (!pp) continue
      g.fillStyle = rgb(tint, (dark ? 0.3 : 0.26) / (1 + Math.max(0, f.y) * 0.07))
      g.beginPath(); pp.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.fill()
    }
  }

  dotAt(list, p, size, col, a) {
    const c = this.toC(p)
    if (c[2] > NEAR) list.push({ z: c[2], dot: this.pr(c), r: Math.max(1, this.B.F * size / c[2]), col, a })
  }

  // far farm silhouettes, softened toward the sky (aerial perspective)
  drawBackdrop(sky, dark) {
    const g = this.ctx, B = this.B, t = performance.now() / 1000
    const haze = (c) => mix(c, sky, dark ? 0.45 : 0.4)
    const sun = this.toC(add(B.p, [300, 160, -260]))
    if (sun[2] > 1) {
      const q = this.pr(sun), r = B.H * 0.045, warm = mix(tok('cta'), WHITE, 0.5)
      const gl = g.createRadialGradient(q[0], q[1], r * 0.4, q[0], q[1], r * 5)
      gl.addColorStop(0, rgb(warm, 0.55)); gl.addColorStop(1, rgb(warm, 0))
      g.fillStyle = gl; g.fillRect(q[0] - r * 5, q[1] - r * 5, r * 10, r * 10)
      g.fillStyle = rgb(mix(warm, WHITE, 0.5)); g.beginPath(); g.arc(q[0], q[1], r, 0, 7); g.fill()
    }
    const drift = this.comfort.reduce ? 0 : t * 0.6
    const cloud = cloudSprite(sky, dark)
    for (const [x, y, z, s] of CLOUDS) {
      const cx = ((x + drift + 60) % 260) - 60
      const c = this.toC([cx, y, z]); if (c[2] <= 1) continue
      const q = this.pr(c), w = B.F * s * 4.2 / c[2], h = w * cloud.height / cloud.width
      g.imageSmoothingEnabled = true
      g.drawImage(cloud, q[0] - w / 2, q[1] - h / 2, w, h)
      g.imageSmoothingEnabled = false
    }
    const P = (pts, col) => { const it = this.poly(pts, haze(col)); if (it) this.fillPoly(it) }
    const red = mul(tok('kam2'), 0.85), roof = mul(tok('kam0'), 0.7), silo = mix(tok('structure'), WHITE, 0.25)
    P([[66, 0, -58], [80, 0, -58], [80, 8, -58], [66, 8, -58]], red)
    P([[65, 8, -58], [81, 8, -58], [73, 13, -58]], roof)
    P([[71, 0, -57.9], [75, 0, -57.9], [75, 5, -57.9], [71, 5, -57.9]], mul(red, 0.7))
    P([[82, 0, -60], [86, 0, -60], [86, 15, -60], [82, 15, -60]], silo)
    P([[82, 15, -60], [86, 15, -60], [85, 17, -60], [83, 17, -60]], mul(silo, 0.85))
    P([[50, 0, -46], [53, 0, -46], [52.2, 14, -46], [50.8, 14, -46]], mul(tok('kam0'), 0.9))
    const hub = [51.5, 14, -45.9], ang = this.comfort.reduce ? 0.3 : t * 0.8
    for (let k = 0; k < 4; k++) {
      const a = ang + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), L = 7, Wd = 0.9
      P([[hub[0] - sa * Wd / 2, hub[1] + ca * Wd / 2, hub[2]], [hub[0] + sa * Wd / 2, hub[1] - ca * Wd / 2, hub[2]], [hub[0] + ca * L + sa * Wd / 2, hub[1] + sa * L - ca * Wd / 2, hub[2]], [hub[0] + ca * L - sa * Wd / 2, hub[1] + sa * L + ca * Wd / 2, hub[2]]], mix(tok('card'), WHITE, 0.4))
    }
    for (let x = -30; x < 200; x += 9) { const h = 4 + ((x * 7) % 5 + 5) % 5; P([[x, 0, -70], [x + 4, 0, -70], [x + 2, h, -70]], mul(tok('p1'), 0.75)) }
  }

  fillPoly(it) {
    const g = this.ctx
    g.beginPath(); it.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath()
    g.fillStyle = it.a != null && it.a < 1 ? rgb(it.fill, it.a) : rgb(it.fill); g.fill()
    if (it.stroke) { g.strokeStyle = rgb(it.stroke); g.lineWidth = 1; g.stroke() }
    if (it.det) this.drawDetail(it)
  }

  /** Box centred `c`, w×h in the sim plane, half-depth `dz`, rotated `a` about z. */
  boxFaces(list, c, w, h, dz, a, col, alpha = 1, hpFrac = 1, det = null) {
    const ca = Math.cos(a), sa = Math.sin(a), hw = w / 2, hh = h / 2
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca])
    const v = [...corners.map(([x, y]) => [x, y, c[2] - dz]), ...corners.map(([x, y]) => [x, y, c[2] + dz])]
    this.pushFaces(list, v, col, alpha, hpFrac, det)
  }

  // a sling prong: a thin box leaning sideways (in y/z) to open the fork
  prong(list, c, tilt, col) {
    const hw = 0.09, hh = 0.45, dz = 0.09
    const P = (x, y, z) => [c[0] + x, c[1] + y * Math.cos(tilt), c[2] - y * Math.sin(tilt) + z]
    const co = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
    this.pushFaces(list, [...co.map(([x, y]) => P(x, y, -dz)), ...co.map(([x, y]) => P(x, y, dz))], col, 1, 1)
  }

  pushFaces(list, v, col, alpha, hpFrac, det = null) {
    const F = [[4, 5, 6, 7], [1, 0, 3, 2], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    const glass = det && MATS[det.mat]?.glass
    const edge = glass ? mix(col, WHITE, 0.5) : mul(col, 0.55)
    for (const f of F) {
      const a = v[f[0]], b = v[f[1]], c = v[f[2]]
      const n = norm(cross(sub(b, a), sub(c, a)))
      const ctr = sc(add(add(v[f[0]], v[f[1]]), add(v[f[2]], v[f[3]])), 0.25)
      if (dot(n, sub(this.B.p, ctr)) <= 0) continue // back face
      // warm sun on the lit faces, a cool sky tint in the shade
      const l = Math.max(0, dot(n, LIGHT)), k = 0.56 + 0.5 * l, sh = 1 - l
      let fc = [Math.min(255, col[0] * k * (0.96 + 0.06 * l) + sh * 2), Math.min(255, col[1] * k * (0.98 + 0.03 * l) + sh * 6), Math.min(255, col[2] * k * (1.03 - 0.07 * l) + sh * 14)]
      if (hpFrac < 0.6) fc = mix(fc, BLACK, 0.12) // damaged
      const it = this.poly(f.map(i => v[i]), fc, edge, alpha)
      if (!it) continue
      if (det && it.pts.length === 4) it.det = { mat: det.mat, seed: det.seed + f[0], side: n[1] < 0.5, dmg: hpFrac < 0.6, lit: l }
      list.push(it)
    }
  }

  /** Surface detail on a large board face: planks, mortar, glass glare, straw, cracks, and bevel shading. */
  drawDetail(it) {
    const g = this.ctx, P = it.pts, d = it.det
    const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], bx = P[3][0] - P[0][0], by = P[3][1] - P[0][1]
    if (Math.abs(ax * by - ay * bx) < 40) return // too small to read
    const aLong = Math.hypot(ax, ay) >= Math.hypot(bx, by)
    // L = long axis, S = short axis; Q(s, t) walks the face
    const Lx = aLong ? ax : bx, Ly = aLong ? ay : by, Sx = aLong ? bx : ax, Sy = aLong ? by : ay
    const Q = (s, t) => [P[0][0] + Lx * s + Sx * t, P[0][1] + Ly * s + Sy * t]
    const seed = d.seed, fr = (k) => ((seed * 0.6180339 + k * 0.3819) % 1 + 1) % 1
    const strip = (u0, u1, v0, v1, col, a) => {
      const p = [Q(u0, v0), Q(u1, v0), Q(u1, v1), Q(u0, v1)]
      g.fillStyle = rgb(col, a); g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.fill()
    }
    const line = (s0, t0, s1, t1) => { const a = Q(s0, t0), b = Q(s1, t1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]) }
    // bevel: a lit top edge and a shaded foot on the faces that stand upright
    if (d.side) {
      // the screen-vertical axis: whichever of S/L points more up or down
      const vertS = Math.abs(Sy) >= Math.abs(Ly)
      const vy = vertS ? Sy : Ly, k = vy > 0 ? 1 : 0 // the vertical parameter that is the foot
      const along = (a0, a1, col, al) => (vertS ? strip(0, 1, a0, a1, col, al) : strip(a0, a1, 0, 1, col, al))
      if (k) { along(0.86, 1, BLACK, 0.16); along(0, 0.09, WHITE, 0.1 + 0.1 * d.lit) } else { along(0, 0.14, BLACK, 0.16); along(0.91, 1, WHITE, 0.1 + 0.1 * d.lit) }
    }
    g.lineWidth = 1
    const m = d.mat
    if (m === 'wood') {
      g.strokeStyle = rgb(BLACK, 0.2); g.beginPath()
      const n = 2 + (seed % 2)
      for (let i = 0; i < n; i++) { const t = 0.16 + (i + 0.5) / n * 0.68 + (fr(i) - 0.5) * 0.12, s0 = fr(i + 3) * 0.12, s1 = 1 - fr(i + 5) * 0.14; line(s0, t, s1, t + (fr(i + 7) - 0.5) * 0.04) }
      g.stroke()
      g.strokeStyle = rgb(WHITE, 0.1); g.beginPath(); line(0.04, 0.1 + fr(2) * 0.1, 0.9, 0.1 + fr(2) * 0.1); g.stroke()
      if (seed % 3 === 0) { const k = Q(0.2 + fr(9) * 0.6, 0.3 + fr(4) * 0.4); g.fillStyle = rgb(BLACK, 0.3); g.fillRect(k[0] - 1, k[1] - 1, 2, 2) }
    } else if (m === 'stone') {
      g.strokeStyle = rgb(BLACK, 0.26); g.beginPath()
      line(0.5 + (fr(1) - 0.5) * 0.3, 0, 0.5 + (fr(1) - 0.5) * 0.3, 1); line(0, 0.5, 1, 0.5)
      g.stroke()
      for (let i = 0; i < 5; i++) { const q = Q(fr(i + 11), fr(i + 17)); g.fillStyle = rgb(i % 2 ? WHITE : BLACK, 0.16); g.fillRect(q[0], q[1], 1, 1) }
    } else if (m === 'glass') {
      const j = fr(2) * 0.25
      strip(0.12 + j, 0.2 + j, 0, 1, WHITE, 0.3)
      const q = [Q(0.3 + j, 0), Q(0.34 + j, 0), Q(0.5 + j, 1), Q(0.46 + j, 1)]
      g.fillStyle = rgb(WHITE, 0.2); g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.fill()
    } else if (m === 'hay') {
      g.strokeStyle = rgb(BLACK, 0.2); g.beginPath()
      for (let i = 0; i < 6; i++) { const s = fr(i) * 0.9, t = fr(i + 20); line(s, t, s + 0.1, Math.min(1, t + (fr(i + 30) - 0.5) * 0.35)) }
      g.stroke()
      g.strokeStyle = rgb(WHITE, 0.16); g.beginPath()
      for (let i = 0; i < 4; i++) { const s = fr(i + 40) * 0.9, t = fr(i + 50); line(s, t, s + 0.12, t) }
      g.stroke()
    }
    if (d.dmg && m !== 'hay') { // cracks once a board is badly hurt
      g.strokeStyle = rgb(BLACK, 0.5); g.beginPath()
      let s = 0.15 + fr(6) * 0.4, t = 0; const a = Q(s, t); g.moveTo(a[0], a[1])
      for (let i = 1; i <= 4; i++) { s += (fr(i + 60) - 0.4) * 0.22; t = i / 4; const q = Q(s, t); g.lineTo(q[0], q[1]) }
      g.stroke()
    }
  }

  /** Which side of a bird the camera sees: its back (chase/aim) or side-on. */
  birdView(dir) {
    const l = Math.hypot(dir[0], dir[1]) || 1
    return (this.B.f[0] * dir[0] + this.B.f[1] * dir[1]) / l > 0.55 ? 'back' : 'side'
  }

  billboard(list, key, p, h, ang = 0, frame = 0, view = 'side', st = 0) {
    if (this.lod) h *= 2.3 // the small side view needs fat sprites to read
    const top = this.toC(add(p, [-Math.sin(ang) * h / 2, Math.cos(ang) * h / 2, 0]))
    const bot = this.toC(add(p, [Math.sin(ang) * h / 2, -Math.cos(ang) * h / 2, 0]))
    const c = this.toC(p)
    if (c[2] <= NEAR || top[2] <= NEAR || bot[2] <= NEAR) return
    const T = this.pr(top), Bt = this.pr(bot), C = this.pr(c)
    const sh = Math.hypot(T[0] - Bt[0], T[1] - Bt[1])
    if (sh < 0.5 || sh > 4000) return
    const rot = -Math.atan2(Bt[0] - T[0], -(Bt[1] - T[1]))
    const back = view === 'back' || view === 'backtuck'
    list.push({ z: c[2] - 0.01, img: birdseyeSprite(key, frame, view), at: C, h: sh, rot, sx: back ? 1 - st * 0.6 : 1 + st, sy: back ? 1 + st : 1 - st * 0.6 })
  }

  drawImg(it) {
    const g = this.ctx, im = it.img
    const w = im.width * it.h / im.height * it.sx, h = it.h * it.sy
    g.save(); g.translate(it.at[0], it.at[1]); g.rotate(it.rot); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore()
  }

  drawSpeedLines(B, k) {
    const g = this.ctx, sp = this.cam.speed || 0
    if (sp < 6) return
    g.strokeStyle = rgb(isDark() ? tok('text') : WHITE, Math.min(0.55, (sp - 6) / 30) * k * 1.4)
    g.lineWidth = 1
    const R = Math.hypot(B.W, B.H) / 2
    g.beginPath()
    for (const l of this.speedLines) {
      l.r += sp * 0.0016 * l.s; if (l.r > 1) l.r = 0.25 + (l.s % 0.2)
      const r0 = R * l.r, r1 = r0 + R * 0.08 * l.s * (sp / 20)
      g.moveTo(B.W / 2 + Math.cos(l.a) * r0, B.H / 2 + Math.sin(l.a) * r0)
      g.lineTo(B.W / 2 + Math.cos(l.a) * r1, B.H / 2 + Math.sin(l.a) * r1)
    }
    g.stroke()
  }

  // first person: speed lines, a comfort vignette that tightens with speed,
  // and the beak + brow feathers fixed on screen as a rest frame (no roll)
  drawBeak(B) {
    const g = this.ctx, W = B.W, H = B.H
    if (!this.comfort.reduce) this.drawSpeedLines(B, 1)
    const sp = this.cam.speed || 0
    const tight = this.comfort.reduce ? 0.55 : Math.min(0.45, sp / 70)
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.62 - tight * 0.5), W / 2, H / 2, Math.hypot(W, H) / 2)
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, rgb(BLACK, 0.55 + tight * 0.4))
    g.fillStyle = vg; g.fillRect(0, 0, W, H)
    const px = Math.max(2, Math.round(W / 48))
    const bk = tok('kam7'), bk2 = mul(bk, 0.78), fe = tok(BIRDS[this.sim.shot?.b || 'pip'].tone), fe2 = mul(fe, 0.75)
    const cx = Math.round(W / 2 / px), by = Math.round(H / px)
    const wob = this.comfort.reduce ? 0 : Math.round(Math.sin(performance.now() / 70) * 0.6)
    g.fillStyle = rgb(bk)
    for (let row = 0; row < 9; row++) { const half = 9 - row; g.fillRect((cx - half) * px, (by - row - 1 + wob) * px, half * 2 * px, px) }
    g.fillStyle = rgb(bk2)
    for (let row = 0; row < 9; row++) { const half = 9 - row; g.fillRect(cx * px, (by - row - 1 + wob) * px, half * px, px) }
    g.fillStyle = rgb(fe)
    for (let i = 0; i < 7; i++) { g.fillRect(0, (by - 1 - i) * px, (7 - i) * px * 2, px); g.fillRect(W - (7 - i) * px * 2, (by - 1 - i) * px, (7 - i) * px * 2, px) }
    g.fillStyle = rgb(fe2)
    for (let i = 0; i < 4; i++) { g.fillRect(0, (by - 1 - i) * px, (4 - i) * px * 2, px); g.fillRect(W - (4 - i) * px * 2, (by - 1 - i) * px, (4 - i) * px * 2, px) }
    g.fillStyle = rgb(WHITE, 0.6)
    g.fillRect(W / 2 - 3 * px, H / 2, px * 2, 1); g.fillRect(W / 2 + px, H / 2, px * 2, 1)
  }

  drawLetterbox(B) {
    const g = this.ctx, t = this.slow.t, k = t < 0.25 ? t / 0.25 : t > 1.4 ? Math.max(0, (1.7 - t) / 0.3) : 1
    const h = B.H * 0.07 * k
    g.fillStyle = rgb(BLACK, 0.85); g.fillRect(0, 0, B.W, h); g.fillRect(0, B.H - h, B.W, h)
  }
}
