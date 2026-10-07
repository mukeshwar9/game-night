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
const LIGHT = norm([-0.45, 0.85, 0.55])
const CLOUDS = [[10, 26, -80, 4], [60, 32, -90, 5], [120, 28, -70, 4.5], [170, 34, -95, 6], [30, 30, 60, 4], [95, 27, 70, 5]]

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
    this.cam = { pos: [-8, 4, 2.5], target: [16, 2.5, -1.6], fov: 54 }
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

  onSimEvent(e) {
    const R = Math.random
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
        this.parts.push({ p: [e.x + along * Math.cos(e.a), e.y + along * Math.sin(e.a), (R() - 0.5) * spread * 2], v: [e.vx * 0.4 + (R() - 0.5) * 7, e.vy * 0.4 + R() * 7, (R() - 0.5) * 7], life: 1.6 + R(), col, s: e.t === 'pop' ? 0.09 : 0.08 + R() * 0.16, glass })
      }
      if (e.t === 'pop') { this.parts.push({ p: [e.x, e.y + 0.4, 0], v: [e.vx * 0.3 + 1, 8, 0.5], life: 2.2, col: 'hat', s: 0.35 }); this.pops++ }
      this.points += e.points
      this.texts.push({ p: [e.x, e.y + 0.6, 0], txt: '+' + e.points, t: 0, big: e.t === 'pop' })
      this.trauma = Math.min(1, this.trauma + (e.t === 'pop' ? 0.35 : 0.2))
      this.hitStop = Math.min(0.12, Math.max(this.hitStop, e.t === 'pop' ? 0.05 : 0.025))
      this.onEvent({ t: e.t, glass, points: e.points })
    } else if (e.t === 'thud') {
      this.trauma = Math.min(1, this.trauma + Math.min(0.3, e.n / 80))
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
      if (p.p[1] < 0.05 && !p.nog) { p.p[1] = 0.05; p.v[1] *= -0.3; p.v[0] *= 0.6; p.v[2] *= 0.6 }
    }
    this.parts = this.parts.filter(p => p.life > 0)
    for (const t of this.texts) t.t += dt
    this.texts = this.texts.filter(t => t.t < 1.4)
  }

  // ── cameras ──────────────────────────────────────────────────────────────
  birdState() {
    if (this.phase === 'aim' || this.phase === 'idle') {
      const a = this.aim || { ang: 0.6, pow: 0 }, pull = 1.3 * a.pow
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
      pos = [-8, 4, 2.5]; target = [16, 2.5, -1.6]; fov = 54; k = 4
    } else if (mode === 'side') {
      // framed by horizontal span, so a narrow phone canvas still sees what it should:
      // tracking the bird (±10 m), the whole sling-to-fort line (±25 m), the settled fort (±12 m)
      const hw = this.phase === 'done' ? 12 : resting ? 25 : 10
      const z = Math.max(40, hw / (Math.tan(14 * Math.PI / 180) * ((this.cv.width / this.cv.height) || 0.7)))
      const x = this.phase === 'done' ? Math.max(14, Math.min(40, this.fortCenter()[0])) : resting ? 21.5 : Math.max(10, Math.min(37, bs.p[0] + 4))
      const ty = this.phase === 'done' ? z * Math.tan(14 * Math.PI / 180) * 0.1 : Math.max(4.5, z * Math.tan(14 * Math.PI / 180) * 0.45) // a settled fort sits high: the result panel covers the bottom
      pos = [x, ty + 1, z]; target = [x, ty, 0]; fov = 28; k = 3
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
    this.update(dt)
    const r = this.cv.getBoundingClientRect()
    const w = Math.max(40, Math.round(r.width * this.res)), h = Math.max(40, Math.round(r.height * this.res))
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h }
    this.draw()
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
    const dark = isDark()
    // sky
    const hz = this.pr(this.toC(add(B.p, [B.f[0] * 1000, 0, B.f[2] * 1000])))
    const hy = Number.isFinite(hz[1]) ? hz[1] : H / 2
    const sky1 = dark ? tok('deep') : mix(tok('tint-p4'), WHITE, 0.2)
    const sky2 = dark ? mix(tok('deep'), tok('p4'), 0.35) : mix(tok('tint-p4'), tok('p4'), 0.25)
    const grd = g.createLinearGradient(0, Math.min(hy, H) - H, 0, Math.max(0, hy))
    grd.addColorStop(0, rgb(sky2)); grd.addColorStop(1, rgb(sky1))
    g.fillStyle = grd; g.fillRect(0, 0, W, H)
    const list = []
    // far hills, then the farm backdrop
    const hill = dark ? mix(tok('deep'), tok('p1'), 0.25) : mix(tok('tint-p1'), tok('p1'), 0.35)
    const hills = [[-40, 0, -90], [10, 14, -95], [40, 6, -95], [80, 20, -100], [130, 8, -100], [190, 16, -100], [260, 0, -100]]
    for (let i = 0; i < hills.length - 1; i++) { const a = hills[i], b = hills[i + 1]; const pp = this.poly([[a[0], 0, a[2]], a, b, [b[0], 0, b[2]]], hill); if (pp) this.fillPoly(pp) }
    this.drawBackdrop(sky1, dark)
    // ground: field, crop furrows (they converge on the vanishing point), faint cross bands
    const gnd = dark ? mix(tok('surface'), tok('p1'), 0.28) : mix(tok('tint-p1'), tok('p1'), 0.18)
    const gnd2 = dark ? mix(tok('surface'), tok('p1'), 0.36) : mix(tok('tint-p1'), tok('p1'), 0.28)
    const G0 = this.poly([[-60, 0, -80], [260, 0, -80], [260, 0, 80], [-60, 0, 80]], gnd); if (G0) this.fillPoly(G0)
    const furrow = mix(gnd2, tok('kam0'), 0.35)
    for (const sgn of [-1, 1]) for (let z = 4; z < 34; z += 2.4) { const s = this.poly([[-20, 0.001, sgn * z], [150, 0.001, sgn * z], [150, 0.001, sgn * (z + 0.9)], [-20, 0.001, sgn * (z + 0.9)]], furrow); if (s) this.fillPoly(s) }
    for (let x = -20; x < 140; x += 6) { const s = this.poly([[x, 0.0005, -30], [x + 3, 0.0005, -30], [x + 3, 0.0005, 30], [x, 0.0005, 30]], gnd2, null, 0.35); if (s) this.fillPoly(s) }
    const lane = this.poly([[-2, 0.001, -1.2], [46, 0.001, -1.2], [46, 0.001, 1.2], [-2, 0.001, 1.2]], mix(gnd2, tok('kam0'), 0.25)); if (lane) this.fillPoly(lane)
    // fence: posts every 4 m with two rails (the strongest speed cue in flight)
    const post = mul(tok('kam0'), dark ? 0.9 : 0.8)
    for (let x = -4; x < 60; x += 4) for (const z of [-4.5, 4.5]) {
      const pp = this.poly([[x, 0, z], [x + 0.18, 0, z], [x + 0.18, 1.1, z], [x, 1.1, z]], post); if (pp) list.push(pp)
      if (x < 56) for (const ry of [0.5, 0.9]) { const rl = this.poly([[x, ry, z], [x + 4, ry, z], [x + 4, ry + 0.09, z], [x, ry + 0.09, z]], mul(post, 1.15)); if (rl) list.push(rl) }
    }
    // the sling: a post and a Y fork
    const wood = mul(tok('kam0'), 0.9)
    this.boxFaces(list, [SLING.x, 0.75, 0], 0.22, 1.5, 0.11, 0, wood)
    for (const s of [-1, 1]) this.prong(list, [SLING.x, 1.95, s * 0.36], s * 0.35, wood)
    // fort
    for (const b of this.sim.bodies) {
      const u = b.getUserData(), p = b.getPosition(), a = b.getAngle()
      if (u.type === 'block') {
        const m = MATS[u.mat], zw = u.zw || 0.6
        const n = Math.max(1, Math.round(zw * 2 / m.seg)), seg = (zw * 2) / n, gap = m.glass ? 0.12 : 0.05
        for (let i = 0; i < n; i++) {
          const shade = 1 + ((i * 7) % 3 - 1) * 0.05 // per-board tone jitter
          this.boxFaces(list, [p.x, p.y, -zw + seg * (i + 0.5)], u.w, u.h, seg / 2 - gap / 2, a, mul(tok(m.tone), shade), m.glass ? 0.62 : 1, u.hp / m.hp)
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
        if (a3[2] > NEAR && b3[2] > NEAR) list.push({ z: (a3[2] + b3[2]) / 2, line: [this.pr(a3), this.pr(b3)], col: mul(tok('kam2'), 0.8), w: 2 })
      }
      if (this.lastTrail) for (let i = 0; i < this.lastTrail.length; i += 3) this.dotAt(list, [this.lastTrail[i][0], this.lastTrail[i][1], 0], 0.05, tok('text'), 0.28)
      if (this.aim.active && this.aim.pow > MIN_POWER) {
        const v = VMAX * this.aim.pow, vx = Math.cos(this.aim.ang) * v, vy = Math.sin(this.aim.ang) * v
        for (let t = 0.06; t < 0.85; t += 0.06) this.dotAt(list, [bs.p[0] + vx * t + 0.5 * (this.fort.wind || 0) * t * t, bs.p[1] + vy * t + 0.5 * G * t * t, 0], 0.07, tok('cta'), 1 - t)
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
      for (let i = 0; i < this.trail.length; i += 2) this.dotAt(list, [this.trail[i][0], this.trail[i][1], 0], 0.06, tok('text'), 0.5)
    }
    // debris
    for (const pt of this.parts) {
      const c = this.toC(pt.p); if (c[2] <= NEAR) continue
      const col = Array.isArray(pt.col) ? pt.col : pt.col === 'feather' ? tok(BIRDS[this.sim.shot?.b || 'pip'].tone) : pt.col === 'ring' ? tok('cta') : mul(tok('kam0'), 0.55)
      list.push({ z: c[2], sq: this.pr(c), r: Math.min(H * 0.025, Math.max(1, B.F * pt.s / c[2])), col, a: Math.min(1, pt.life * 1.5) * (pt.glass ? 0.7 : 1) })
    }
    list.sort((a, b) => b.z - a.z)
    for (const it of list) {
      if (it.pts) this.fillPoly(it)
      else if (it.img) this.drawImg(it)
      else if (it.line) { g.strokeStyle = rgb(it.col); g.lineWidth = it.w; g.beginPath(); g.moveTo(...it.line[0]); g.lineTo(...it.line[1]); g.stroke() }
      else if (it.dot) { g.fillStyle = rgb(it.col, it.a); g.beginPath(); g.arc(it.dot[0], it.dot[1], it.r, 0, 7); g.fill() }
      else if (it.sq) { g.fillStyle = rgb(it.col, it.a); g.fillRect(it.sq[0] - it.r, it.sq[1] - it.r, it.r * 2, it.r * 2) }
    }
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
      const q = this.pr(sun), r = B.H * 0.045
      g.fillStyle = rgb(mix(tok('cta'), WHITE, 0.55), 0.25); g.beginPath(); g.arc(q[0], q[1], r * 1.8, 0, 7); g.fill()
      g.fillStyle = rgb(mix(tok('cta'), WHITE, 0.45)); g.beginPath(); g.arc(q[0], q[1], r, 0, 7); g.fill()
    }
    const drift = this.comfort.reduce ? 0 : t * 0.6
    for (const [x, y, z, s] of CLOUDS) {
      const cx = ((x + drift + 60) % 260) - 60
      for (const [ox, oy, k] of [[0, 0, 1], [s * 0.8, s * 0.15, 0.75], [-s * 0.8, s * 0.1, 0.7], [s * 0.3, s * 0.45, 0.65]]) {
        const c = this.toC([cx + ox, y + oy, z]); if (c[2] <= 1) continue
        const q = this.pr(c), r = B.F * s * k / c[2]
        g.fillStyle = rgb(mix(WHITE, sky, dark ? 0.6 : 0.15), 0.9); g.beginPath(); g.ellipse(q[0], q[1], r * 1.4, r * 0.8, 0, 0, 7); g.fill()
      }
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
  }

  /** Box centred `c`, w×h in the sim plane, half-depth `dz`, rotated `a` about z. */
  boxFaces(list, c, w, h, dz, a, col, alpha = 1, hpFrac = 1) {
    const ca = Math.cos(a), sa = Math.sin(a), hw = w / 2, hh = h / 2
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca])
    const v = [...corners.map(([x, y]) => [x, y, c[2] - dz]), ...corners.map(([x, y]) => [x, y, c[2] + dz])]
    this.pushFaces(list, v, col, alpha, hpFrac)
  }

  // a sling prong: a thin box leaning sideways (in y/z) to open the fork
  prong(list, c, tilt, col) {
    const hw = 0.09, hh = 0.45, dz = 0.09
    const P = (x, y, z) => [c[0] + x, c[1] + y * Math.cos(tilt), c[2] - y * Math.sin(tilt) + z]
    const co = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
    this.pushFaces(list, [...co.map(([x, y]) => P(x, y, -dz)), ...co.map(([x, y]) => P(x, y, dz))], col, 1, 1)
  }

  pushFaces(list, v, col, alpha, hpFrac) {
    const F = [[4, 5, 6, 7], [1, 0, 3, 2], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    const edge = mul(col, 0.55)
    for (const f of F) {
      const a = v[f[0]], b = v[f[1]], c = v[f[2]]
      const n = norm(cross(sub(b, a), sub(c, a)))
      const ctr = sc(add(add(v[f[0]], v[f[1]]), add(v[f[2]], v[f[3]])), 0.25)
      if (dot(n, sub(this.B.p, ctr)) <= 0) continue // back face
      let fc = mul(col, 0.62 + 0.42 * Math.max(0, dot(n, LIGHT)))
      if (hpFrac < 0.6) fc = mix(fc, BLACK, 0.12) // damaged
      const it = this.poly(f.map(i => v[i]), fc, edge, alpha)
      if (it) list.push(it)
    }
  }

  /** Which side of a bird the camera sees: its back (chase/aim) or side-on. */
  birdView(dir) {
    const l = Math.hypot(dir[0], dir[1]) || 1
    return (this.B.f[0] * dir[0] + this.B.f[1] * dir[1]) / l > 0.55 ? 'back' : 'side'
  }

  billboard(list, key, p, h, ang = 0, frame = 0, view = 'side', st = 0) {
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
