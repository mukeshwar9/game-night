// Canvas renderer for FENDER BENDER (rendering only — no rules). It draws a
// state-shaped view from src/lib/fenderLogic.js: shaded asphalt, animated
// water, kerbs, vehicles with gloss and shadows, lights at night, and particle
// effects for bumps, crashes, wrecks and splashes.
//
// Every colour is derived from the --c-* theme tokens by lib/fenderPalette.js
// and rebuilt when the theme changes, so the road, water and traffic follow the
// theme. Only fixed physical materials (glass, tyres, brake lights, fire) are
// literal rgb values. Traffic vehicles and shadows are drawn once into
// offscreen sprites at 3x and blitted, so detail costs one image draw each.
import {
  W, H, ROAD_L, ROAD_R, LANES, LANE_W, HORN_COOLDOWN, HORN_RADIUS, SQUEEZE_AT, MAX_PLAYERS,
} from '../lib/fenderLogic'
import { buildPalette, PALETTE_TOKENS } from '../lib/fenderPalette'
import { isReducedMotion } from '../hooks/useMotionPref'
import { canvasPixelRatio } from '../lib/platform'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const TAU = Math.PI * 2
const LAMP_GAP = 250
const MAX_PARTS = 700
const MAX_MARKS = 500

// Cheap integer hash → [0, 1): stable decoration positions along the scroll.
const hash = (n) => {
  let x = Math.imul(n | 0, 374761393) ^ 0x9e3779b9
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rgbStr = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const mix = (c, k) => {
  const t = k > 0 ? 255 : 0
  const a = Math.abs(k)
  return `rgb(${c.map((v) => Math.round(v + (t - v) * a)).join(',')})`
}

// Fixed physical materials, as rgb triplets (not theme colours).
const BLACK = '0,0,0'
const TYRE = 'rgb(13,13,15)'
const HEADLAMP = 'rgb(255,246,207)'
const SPLASH = [235, 245, 250]
const CHAR = [34, 32, 30]

let sharedTexture = null
function roadTexture() {
  if (sharedTexture) return sharedTexture
  const tex = document.createElement('canvas')
  tex.width = tex.height = 128
  const t = tex.getContext('2d')
  const r = mulberry(11)
  for (let i = 0; i < 2600; i++) {
    const v = r() > 0.5 ? 255 : 0
    t.fillStyle = `rgba(${v},${v},${v},${0.025 + r() * 0.06})`
    t.fillRect(r() * 128, r() * 128, 1 + r() * 1.6, 1 + r() * 1.6)
  }
  t.strokeStyle = 'rgba(0,0,0,.16)'
  t.lineWidth = 0.8
  for (let i = 0; i < 5; i++) {
    let x = r() * 128
    let y = r() * 128
    t.beginPath(); t.moveTo(x, y)
    for (let j = 0; j < 5; j++) { x += (r() - 0.5) * 26; y += r() * 20; t.lineTo(x, y) }
    t.stroke()
  }
  sharedTexture = tex
  return tex
}

function readTokens() {
  const cs = getComputedStyle(document.documentElement)
  const T = {}
  for (const k of PALETTE_TOKENS) {
    const v = cs.getPropertyValue(`--c-${k}`).trim().split(/\s+/).map(Number)
    T[k] = v.length === 3 && v.every(Number.isFinite) ? v : [128, 128, 128]
  }
  return T
}

/** @param {HTMLCanvasElement} canvas  sized by the renderer to W × H court px */
export function createFenderRenderer(canvas) {
  const home = canvas.getContext('2d')
  let g = home
  const dpr = Math.min(2, canvasPixelRatio() || 1)
  canvas.width = W * dpr
  canvas.height = H * dpr

  let S = null            // the view being drawn
  let P = null            // palette
  let themeId = null
  let fontFamily = 'monospace'
  let night = false
  let noFx = false        // true while a sprite is being baked
  let clock = 0
  let scroll = 0
  let shake = 0
  let reduce = false
  let parts = []
  let marks = []
  let sinkers = []
  let wrecks = []
  let boats = []
  let boatT = 2
  let texPat = null
  const carFx = Array.from({ length: MAX_PLAYERS }, () => ({ sq: 0 }))
  const sprites = new Map()

  function rebuild() {
    themeId = document.documentElement.getAttribute('data-theme') || ''
    P = buildPalette(readTokens())
    const ff = getComputedStyle(document.documentElement).getPropertyValue('--font-pixel').trim()
    fontFamily = ff ? `${ff}, monospace` : 'monospace'
    texPat = null
    for (const k of [...sprites.keys()]) if (!k.startsWith('sh')) sprites.delete(k)
  }

  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r) }

  // ── sprite cache ───────────────────────────────────────────────────────────
  function offscreen(w, h, fn) {
    const c = document.createElement('canvas')
    const k = 3
    c.width = Math.ceil(w * k); c.height = Math.ceil(h * k)
    const old = g
    g = c.getContext('2d')
    g.scale(k, k); g.translate(w / 2, h / 2)
    noFx = true
    try { fn() } finally { noFx = false; g = old }
    return c
  }
  function sprite(key, w, h, fn) {
    let s = sprites.get(key)
    if (!s) { s = { c: offscreen(w, h, fn), w, h }; sprites.set(key, s) }
    return s
  }
  function blit(s, x, y, ang, sx, sy) {
    g.save(); g.translate(x, y)
    if (ang) g.rotate(ang)
    if (sx) g.scale(sx, sy || sx)
    g.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h)
    g.restore()
  }
  function shadow(x, y, w, h, ang, r, tall = 1) {
    if (noFx) return
    const s = sprite(`sh${w}x${h}`, w + 30, h + 30, () => {
      g.shadowColor = `rgb(${BLACK})`; g.shadowBlur = 20; g.shadowOffsetX = 3000
      g.fillStyle = `rgb(${BLACK})`
      rr(-w / 2 - 1000, -h / 2, w, h, r); g.fill()
    })
    g.save()
    g.globalAlpha = night ? 0.5 : 0.26; blit(s, x, y + 1, ang, 0.94)
    g.globalAlpha = night ? 0.6 : 0.4; blit(s, x + 4.5 * tall, y + 6.5 * tall, ang, 1 + 0.05 * tall)
    g.restore()
  }

  // ── particles ──────────────────────────────────────────────────────────────
  function emit(p) {
    if (parts.length < MAX_PARTS) parts.push({ vx: 0, vy: 0, life: 0.6, grow: 0, rot: 0, vr: 0, drift: 0.5, a: 1, ...p, max: p.life || 0.6 })
  }
  function smoke(x, y, dark, n = 1, sz = 6) {
    for (let i = 0; i < n; i++) {
      emit({ type: 'smoke', x: x + (Math.random() - 0.5) * 6, y, vx: (Math.random() - 0.5) * 26, vy: 30 + Math.random() * 40,
        size: sz * (0.7 + Math.random() * 0.6), grow: 22, life: 0.7 + Math.random() * 0.5,
        shade: dark ? 30 + Math.random() * 30 : 170 + Math.random() * 50, a: dark ? 0.55 : 0.35 })
    }
  }
  function sparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const v = 120 + Math.random() * 260
      emit({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.18 + Math.random() * 0.25, size: 1.6, drift: 0 })
    }
  }
  function debris(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const v = 60 + Math.random() * 200
      emit({ type: 'debris', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, col, drift: 0.8 })
    }
  }
  function explode(x, y) {
    emit({ type: 'flash', x, y, size: 16, grow: 260, life: 0.22, drift: 0 })
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU
      const v = 30 + Math.random() * 130
      emit({ type: 'fire', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 7 + Math.random() * 7, grow: 14, life: 0.35 + Math.random() * 0.4 })
    }
    smoke(x, y, true, 12, 10); sparks(x, y, 26); debris(x, y, 12, CHAR)
    shake = Math.max(shake, 0.45)
  }
  function splash(x, y) {
    for (let i = 0; i < 3; i++) emit({ type: 'ring', x, y, size: 4, grow: 70 + i * 26, life: 0.7 + i * 0.25, drift: 0.35, col: SPLASH })
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI * Math.random()
      const v = 60 + Math.random() * 170
      emit({ type: 'drop', x, y, vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, size: 1.5 + Math.random() * 2, drift: 0.35 })
    }
    shake = Math.max(shake, 0.25)
  }

  /** A sim event, `{ k, i, p? }`, drawn as effects. `view` supplies car positions. */
  function event(e, view) {
    const c = view?.cars?.[e.i]
    if (!c) return
    const hard = e.k === 'hit'
    if (e.k === 'bump' || e.k === 'hit' || e.k === 'crash') carFx[e.i].sq = 0.2
    const col = P.cars[e.i] || P.cars[0]
    if (e.k === 'horn') {
      for (let i = 0; i < 3; i++) emit({ type: 'ring', x: c.x, y: c.y, size: 14, grow: ((HORN_RADIUS - 14) / 0.34) * (1 - i * 0.22), life: 0.34, drift: 0, col: P.glow, lw: 4 - i })
    } else if (e.k === 'bump' || e.k === 'hit') {
      sparks(c.x, c.y, hard ? 18 : 6)
      if (hard) { smoke(c.x, c.y + 10, false, 4, 4); debris(c.x, c.y, 3, col) }
      shake = Math.max(shake, hard ? 0.2 : 0.08)
    } else if (e.k === 'crash') {
      sparks(c.x, c.y - 10, 16); debris(c.x, c.y - 8, 5, col); smoke(c.x, c.y, false, 3)
      shake = Math.max(shake, 0.22)
    } else if (e.k === 'wreck') {
      explode(c.x, c.y)
      wrecks.push({ x: c.x, y: c.y, i: e.i, ang: clamp(c.vx / 300, -0.8, 0.8), t: 0 })
    } else if (e.k === 'fell') {
      const dir = c.x < W / 2 ? -1 : 1
      sinkers.push({ x: c.x, y: c.y, vx: dir * 70 + c.vx * 0.3, i: e.i, ang: clamp(c.vx / 400, -0.5, 0.5), vr: dir * 2.4, t: 0, wet: false })
    }
  }

  // ── vehicle parts ──────────────────────────────────────────────────────────
  function glass(x, y, w, h, taper) {
    g.beginPath()
    g.moveTo(x - w / 2 + taper, y); g.lineTo(x + w / 2 - taper, y); g.lineTo(x + w / 2, y + h); g.lineTo(x - w / 2, y + h)
    g.closePath()
    const gr = g.createLinearGradient(x - w / 2, y, x + w / 2, y + h)
    gr.addColorStop(0, night ? 'rgb(12,18,32)' : 'rgb(22,34,46)')
    gr.addColorStop(0.45, night ? 'rgb(27,42,68)' : 'rgb(56,83,106)')
    gr.addColorStop(0.55, night ? 'rgb(16,26,44)' : 'rgb(28,44,58)')
    gr.addColorStop(1, 'rgb(10,15,22)')
    g.fillStyle = gr; g.fill()
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 0.8; g.stroke()
    g.beginPath()
    g.moveTo(x - w * 0.28, y + h * 0.2); g.lineTo(x - w * 0.08, y + h * 0.2); g.lineTo(x - w * 0.2, y + h * 0.85); g.lineTo(x - w * 0.36, y + h * 0.85)
    g.closePath(); g.fillStyle = 'rgba(255,255,255,.16)'; g.fill()
  }
  function paintFill(w, base) {
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0)
    gr.addColorStop(0, mix(base, -0.5)); gr.addColorStop(0.14, mix(base, -0.08)); gr.addColorStop(0.42, mix(base, 0.3))
    gr.addColorStop(0.6, mix(base, 0.12)); gr.addColorStop(0.88, mix(base, -0.14)); gr.addColorStop(1, mix(base, -0.55))
    return gr
  }
  function lamps(w, h, brake) {
    g.fillStyle = HEADLAMP
    rr(-w / 2 + 2, -h / 2 + 1.5, w * 0.26, 3.2, 1.2); g.fill()
    rr(w / 2 - 2 - w * 0.26, -h / 2 + 1.5, w * 0.26, 3.2, 1.2); g.fill()
    g.save()
    if (brake || night) { g.shadowColor = 'rgb(255,42,26)'; g.shadowBlur = brake ? 12 : 6 }
    g.fillStyle = brake ? 'rgb(255,74,53)' : 'rgb(163,23,18)'
    rr(-w / 2 + 2, h / 2 - 4.2, w * 0.28, 3, 1.2); g.fill()
    rr(w / 2 - 2 - w * 0.28, h / 2 - 4.2, w * 0.28, 3, 1.2); g.fill()
    g.restore()
  }
  function wheels(w, h, steer) {
    g.fillStyle = TYRE
    for (const [sx, sy, st] of [[-1, -1, steer], [1, -1, steer], [-1, 1, 0], [1, 1, 0]]) {
      g.save(); g.translate(sx * (w / 2 - 0.5), sy * h * 0.29); g.rotate(st)
      rr(-2.6, -4.6, 5.2, 9.2, 1.6); g.fill(); g.restore()
    }
  }
  function beams(x, y, w, h, ang) {
    if (!night || noFx) return
    g.save(); g.translate(x, y); g.rotate(ang); g.globalCompositeOperation = 'lighter'
    const gr = g.createLinearGradient(0, -h / 2, 0, -h / 2 - 92)
    gr.addColorStop(0, 'rgba(255,240,190,.34)'); gr.addColorStop(1, 'rgba(255,240,190,0)')
    g.fillStyle = gr; g.beginPath()
    g.moveTo(-w / 2 + 2, -h / 2); g.lineTo(w / 2 - 2, -h / 2); g.lineTo(w / 2 + 22, -h / 2 - 92); g.lineTo(-w / 2 - 22, -h / 2 - 92)
    g.closePath(); g.fill(); g.restore()
  }
  function gloss(w, h, r) {
    const sp = g.createLinearGradient(0, -h / 2, 0, h / 2)
    sp.addColorStop(0, 'rgba(255,255,255,.36)'); sp.addColorStop(0.22, 'rgba(255,255,255,.06)')
    sp.addColorStop(0.75, 'rgba(255,255,255,0)'); sp.addColorStop(1, 'rgba(0,0,0,.3)')
    g.fillStyle = sp; rr(-w / 2 + 1.2, -h / 2 + 1.2, w - 2.4, h - 2.4, r); g.fill()
    g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(-w * 0.2, -h * 0.37, w * 0.1, h * 0.06, -0.3, 0, TAU); g.fill()
    g.fillStyle = 'rgba(16,16,20,.8)'; rr(-w * 0.36, -h / 2 - 0.7, w * 0.72, 2.2, 1); g.fill(); rr(-w * 0.36, h / 2 - 1.5, w * 0.72, 2.2, 1); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 0.7; g.beginPath()
    for (const yy of [0.02, 0.22]) {
      g.moveTo(-w / 2 + 0.8, h * yy); g.lineTo(-w * 0.37, h * yy)
      g.moveTo(w / 2 - 0.8, h * yy); g.lineTo(w * 0.37, h * yy)
    }
    g.stroke()
  }

  function drawCar(x, y, w, h, ang, base, o = {}) {
    shadow(x, y, w, h, ang, w * 0.36); beams(x, y, w, h, ang)
    g.save(); g.translate(x, y); g.rotate(ang)
    if (o.scale) g.scale(o.scale, o.scale)
    if (o.sx) g.scale(o.sx, o.sy)
    if (o.alpha != null) g.globalAlpha = o.alpha
    const lean = clamp(o.lean || 0, -1, 1)
    g.transform(1 - Math.abs(lean) * 0.05, 0, lean * 0.05, 1, 0, 0)
    wheels(w, h, o.steer || 0)
    rr(-w / 2, -h / 2, w, h, w * 0.36); g.fillStyle = paintFill(w, base); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke()
    if (!o.burnt) gloss(w, h, w * 0.33)
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 0.8; g.beginPath()
    g.moveTo(-w * 0.3, -h * 0.44); g.lineTo(-w * 0.24, -h * 0.24); g.moveTo(w * 0.3, -h * 0.44); g.lineTo(w * 0.24, -h * 0.24); g.stroke()
    if (o.stripe) {
      g.fillStyle = 'rgba(255,255,255,.82)'
      g.fillRect(-w * 0.16, -h / 2 + 2, w * 0.1, h - 4); g.fillRect(w * 0.06, -h / 2 + 2, w * 0.1, h - 4)
    }
    glass(0, -h * 0.24, w * 0.82, h * 0.17, w * 0.1)
    rr(-w * 0.37, -h * 0.07, w * 0.74, h * 0.27, 2.5); g.fillStyle = mix(base, o.burnt ? -0.2 : 0.2); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke()
    g.fillStyle = 'rgb(13,20,28)'; g.fillRect(-w * 0.44, -h * 0.05, w * 0.06, h * 0.23); g.fillRect(w * 0.38, -h * 0.05, w * 0.06, h * 0.23)
    g.save(); g.scale(1, -1); glass(0, -h * 0.34, w * 0.76, h * 0.12, w * 0.08); g.restore()
    g.fillStyle = mix(base, -0.3); g.fillRect(-w / 2 - 2.2, -h * 0.2, 2.6, 3); g.fillRect(w / 2 - 0.4, -h * 0.2, 2.6, 3)
    if (!o.burnt) lamps(w, h, o.brake)
    if (o.label) {
      g.beginPath(); g.arc(0, h * 0.065, w * 0.25, 0, TAU); g.fillStyle = 'rgba(255,255,255,.94)'; g.fill()
      g.fillStyle = 'rgb(20,22,26)'; g.font = `7px ${fontFamily}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(o.label, 0.5, h * 0.075)
    }
    if (o.dents) {
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.beginPath()
      for (let k = 0; k < o.dents * 3; k++) {
        const hx = (hash(k * 7 + 1) - 0.5) * w * 0.8
        const hy = -h * 0.46 + hash(k * 13 + 5) * h * 0.2
        g.moveTo(hx, hy); g.lineTo(hx + 4, hy + 3); g.lineTo(hx + 2, hy + 6)
      }
      g.stroke()
    }
    g.restore()
  }
  function drawVan(t) {
    const { x, y, w, h } = t
    const base = P.paints[t.tint % 8]
    shadow(x, y, w, h, 0, 5, 1.35); beams(x, y, w, h, 0)
    g.save(); g.translate(x, y); wheels(w, h, 0)
    rr(-w / 2, -h / 2, w, h, 5); g.fillStyle = paintFill(w, base); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke(); gloss(w, h, 4)
    glass(0, -h * 0.4, w * 0.84, h * 0.13, w * 0.08)
    rr(-w * 0.42, -h * 0.24, w * 0.84, h * 0.7, 2); g.fillStyle = mix(base, 0.16); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.stroke()
    g.beginPath()
    for (let k = 1; k < 5; k++) { const yy = -h * 0.24 + k * h * 0.14; g.moveTo(-w * 0.38, yy); g.lineTo(w * 0.38, yy) }
    g.strokeStyle = 'rgba(0,0,0,.14)'; g.stroke()
    g.fillStyle = mix(base, -0.3); g.fillRect(-w / 2 - 2.4, -h * 0.34, 2.8, 3.4); g.fillRect(w / 2 - 0.4, -h * 0.34, 2.8, 3.4)
    lamps(w, h, false); g.restore()
  }
  function drawBus(t) {
    const { x, y, w, h } = t
    const base = P.bus[t.tint % 2]
    shadow(x, y, w, h, 0, 6, 1.7); beams(x, y, w, h, 0)
    g.save(); g.translate(x, y); g.fillStyle = TYRE
    for (const sy of [-0.3, 0.22, 0.34]) { rr(-w / 2 - 0.5, sy * h - 5, 5, 10, 1.5); g.fill(); rr(w / 2 - 4.5, sy * h - 5, 5, 10, 1.5); g.fill() }
    rr(-w / 2, -h / 2, w, h, 6); g.fillStyle = paintFill(w, base); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke(); gloss(w, h, 5)
    glass(0, -h * 0.47, w * 0.86, h * 0.07, w * 0.05)
    rr(-w * 0.38, -h * 0.37, w * 0.76, h * 0.82, 3); g.fillStyle = mix([236, 236, 230], night ? -0.35 : 0); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.stroke()
    g.fillStyle = 'rgb(16,26,36)'
    for (let k = 0; k < 6; k++) { const yy = -h * 0.34 + k * h * 0.13; g.fillRect(-w * 0.47, yy, w * 0.07, h * 0.09); g.fillRect(w * 0.4, yy, w * 0.07, h * 0.09) }
    g.fillStyle = mix([150, 154, 158], night ? -0.3 : 0)
    for (const yy of [-0.2, 0.2]) { rr(-w * 0.2, yy * h - 8, w * 0.4, 16, 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke() }
    g.fillStyle = mix(base, 0.1); g.fillRect(-w * 0.38, -h * 0.01, w * 0.76, 3)
    lamps(w, h, false); g.restore()
  }
  function drawTruck(gh, i) {
    const { x, y, w, h } = gh
    const pc = P.cars[i]
    shadow(x, y, w, h, 0, 4, 1.7); beams(x, y, w, h, 0)
    g.save(); g.translate(x, y); g.fillStyle = TYRE
    for (const sy of [-0.36, 0.2, 0.36]) { rr(-w / 2 - 0.5, sy * h - 5, 5, 10, 1.5); g.fill(); rr(w / 2 - 4.5, sy * h - 5, 5, 10, 1.5); g.fill() }
    rr(-w * 0.46, -h / 2, w * 0.92, h * 0.26, 4); g.fillStyle = paintFill(w, pc); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke()
    glass(0, -h * 0.45, w * 0.78, h * 0.1, w * 0.07)
    rr(-w / 2, -h * 0.21, w, h * 0.71, 2.5); g.fillStyle = paintFill(w, [205, 208, 212]); g.fill()
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.stroke()
    g.beginPath()
    for (let k = 1; k < 7; k++) { const yy = -h * 0.21 + k * h * 0.1; g.moveTo(-w * 0.46, yy); g.lineTo(w * 0.46, yy) }
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.stroke()
    g.lineWidth = 3; g.strokeStyle = rgbStr(pc); rr(-w / 2 + 2.5, -h * 0.21 + 2.5, w - 5, h * 0.71 - 5, 2); g.stroke()
    g.fillStyle = rgbStr(pc); g.font = `7px ${fontFamily}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(`P${i + 1}`, 0, h * 0.16)
    const on = Math.floor(clock * 6) % 2
    g.save()
    if (on) { g.shadowColor = 'rgb(255,176,32)'; g.shadowBlur = 14 }
    g.fillStyle = on ? 'rgb(255,194,58)' : 'rgb(138,90,16)'; rr(-5, -h * 0.36, 10, 4, 2); g.fill()
    g.restore()
    lamps(w, h, false); g.restore()
  }

  // ── scenery ────────────────────────────────────────────────────────────────
  function drawWater(x0, x1) {
    if (x1 - x0 < 1) return
    const far = x0 < W / 2
    const gr = g.createLinearGradient(x0, 0, x1, 0)
    gr.addColorStop(far ? 0 : 1, rgbStr(P.waterDeep)); gr.addColorStop(far ? 1 : 0, rgbStr(P.waterLite))
    g.fillStyle = gr; g.fillRect(x0, 0, x1 - x0, H)
    g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, H); g.clip(); g.lineCap = 'round'
    const ws = scroll * 0.4
    const k0 = Math.floor(-ws / 18) - 2
    const k1 = k0 + Math.ceil(H / 18) + 4
    for (let k = k0; k <= k1; k++) {
      for (let j = 0; j < 2; j++) {
        const hx = hash(k * 31 + j * 17 + (far ? 3 : 9))
        const yy = k * 18 + ws + Math.sin(clock * 1.6 + k) * 2.5
        const xx = x0 + hx * (x1 - x0)
        const len = 6 + hash(k * 5 + j) * 12
        g.strokeStyle = `rgba(255,255,255,${night ? 0.1 : 0.26})`; g.lineWidth = 1.4
        g.beginPath()
        g.moveTo(xx - len / 2 + Math.sin(clock * 2 + k) * 2, yy)
        g.quadraticCurveTo(xx, yy - 3, xx + len / 2 + Math.sin(clock * 2 + k) * 2, yy)
        g.stroke()
      }
    }
    g.restore()
  }
  function drawKerb(x, side, hazard) {
    const kw = 7
    const kx = side < 0 ? x - kw : x
    if (side > 0) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + kw, 0, 9, H) }
    const gr = g.createLinearGradient(kx, 0, kx + kw, 0)
    gr.addColorStop(side < 0 ? 0 : 1, rgbStr(P.kerbB)); gr.addColorStop(side < 0 ? 1 : 0, rgbStr(P.kerbA))
    g.fillStyle = gr; g.fillRect(kx, 0, kw, H)
    for (let y = (scroll % 34) - 34; y < H; y += 34) {
      if (hazard) {
        g.fillStyle = rgbStr(P.danger); g.fillRect(kx, y, kw, 17)
        g.fillStyle = 'rgb(23,24,28)'; g.fillRect(kx, y + 17, kw, 17)
      } else { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(kx, y, kw, 2) }
    }
    g.fillStyle = night ? 'rgba(220,230,255,.35)' : 'rgba(255,255,255,.7)'
    g.fillRect(side < 0 ? kx + kw - 2 : kx + 0.5, 0, 1.4, H)
  }
  function drawRoad() {
    const L = S.roadL
    const Rr = S.roadR
    const squeezing = L > ROAD_L + 0.5 || Rr < ROAD_R - 0.5
    drawWater(0, L - 7); drawWater(Rr + 7, W)
    g.fillStyle = rgbStr(P.asphalt); g.fillRect(L, 0, Rr - L, H)
    g.save(); g.beginPath(); g.rect(L, 0, Rr - L, H); g.clip()
    for (let l = 0; l < LANES; l++) {
      const cx = ROAD_L + (l + 0.5) * LANE_W
      const gr = g.createLinearGradient(cx - LANE_W / 2, 0, cx + LANE_W / 2, 0)
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.3, 'rgba(0,0,0,.13)'); gr.addColorStop(0.5, 'rgba(0,0,0,.03)')
      gr.addColorStop(0.7, 'rgba(0,0,0,.13)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr; g.fillRect(cx - LANE_W / 2, 0, LANE_W, H)
    }
    if (!texPat) texPat = g.createPattern(roadTexture(), 'repeat')
    g.save(); g.translate(0, scroll % 128); g.fillStyle = texPat; g.fillRect(ROAD_L, -128, ROAD_R - ROAD_L, H + 256); g.restore()
    // patches, manholes and lane arrows drift past with the scroll
    const k0 = Math.floor((-120 - scroll) / 170)
    const k1 = Math.ceil((H + 120 - scroll) / 170)
    for (let k = k0; k <= k1; k++) {
      const hv = hash(k)
      const yy = k * 170 + scroll
      const lane = Math.floor(hash(k * 3 + 1) * LANES)
      const cx = ROAD_L + (lane + 0.5) * LANE_W
      if (hv < 0.34) {
        g.fillStyle = 'rgba(0,0,0,.2)'; rr(cx - 20, yy, 40 + hash(k + 9) * 10, 54, 4); g.fill()
        g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; g.stroke()
      } else if (hv < 0.52) {
        g.fillStyle = mix(P.asphalt, -0.4); g.beginPath(); g.arc(cx + 12, yy, 8, 0, TAU); g.fill()
        g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.2; g.stroke()
        g.beginPath(); g.moveTo(cx + 6, yy); g.lineTo(cx + 18, yy); g.moveTo(cx + 12, yy - 6); g.lineTo(cx + 12, yy + 6); g.stroke()
      } else if (hv < 0.7) {
        g.fillStyle = `rgba(${P.line},.5)`; g.beginPath()
        g.moveTo(cx, yy - 22); g.lineTo(cx + 9, yy - 6); g.lineTo(cx + 3, yy - 6); g.lineTo(cx + 3, yy + 20)
        g.lineTo(cx - 3, yy + 20); g.lineTo(cx - 3, yy - 6); g.lineTo(cx - 9, yy - 6); g.closePath(); g.fill()
      }
    }
    g.fillStyle = `rgba(${P.line},.9)`
    for (let l = 1; l < LANES; l++) {
      const x = ROAD_L + l * LANE_W
      for (let y = (scroll % 56) - 56; y < H; y += 56) { rr(x - 1.8, y, 3.6, 28, 1); g.fill() }
    }
    g.fillStyle = rgbStr(P.edge); g.fillRect(L + 4, 0, 2.6, H); g.fillRect(Rr - 6.6, 0, 2.6, H)
    for (const m of marks) {
      g.strokeStyle = `rgba(8,8,10,${(0.5 * m.life) / m.max})`; g.lineWidth = 3; g.lineCap = 'round'
      g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x2, m.y2); g.stroke()
    }
    // the squeeze is announced: both edges flash for three seconds before it starts
    if (S.t > SQUEEZE_AT - 3 && S.t < SQUEEZE_AT && Math.floor(S.t * 6) % 2) {
      g.fillStyle = `rgba(${P.danger},.34)`; g.fillRect(ROAD_L, 0, 16, H); g.fillRect(ROAD_R - 16, 0, 16, H)
    }
    g.restore()
    drawKerb(L, -1, squeezing); drawKerb(Rr, 1, squeezing)
  }
  function drawParts() {
    for (const p of parts) {
      const k = p.life / p.max
      if (p.type === 'smoke') {
        g.fillStyle = `rgba(${p.shade},${p.shade},${p.shade},${p.a * k})`; g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill()
      } else if (p.type === 'fire') {
        g.save(); g.globalCompositeOperation = 'lighter'
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
        gr.addColorStop(0, `rgba(255,240,170,${k})`); gr.addColorStop(0.5, `rgba(255,130,30,${k * 0.8})`); gr.addColorStop(1, 'rgba(200,30,0,0)')
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill(); g.restore()
      } else if (p.type === 'flash') {
        g.save(); g.globalCompositeOperation = 'lighter'
        g.fillStyle = `rgba(255,236,180,${k * 0.8})`; g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill(); g.restore()
      } else if (p.type === 'spark') {
        g.strokeStyle = `rgba(255,${(190 + 60 * k) | 0},90,${k})`; g.lineWidth = p.size
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); g.stroke()
      } else if (p.type === 'debris') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, k * 2)
        g.fillStyle = rgbStr(p.col); g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6); g.restore()
      } else if (p.type === 'ring') {
        g.strokeStyle = `rgba(${p.col},${k * 0.85})`; g.lineWidth = (p.lw || 2) * (0.4 + k)
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.stroke()
      } else if (p.type === 'drop') {
        g.fillStyle = `rgba(225,242,250,${k})`; g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill()
      }
    }
  }
  const lampYs = () => {
    const out = []
    for (let y = (scroll % LAMP_GAP) - LAMP_GAP; y < H + 60; y += LAMP_GAP) out.push(y)
    return out
  }
  function lampGlow() {
    if (!night) return
    g.save(); g.globalCompositeOperation = 'lighter'
    for (const y of lampYs()) {
      for (const sx of [S.roadL + 34, S.roadR - 34]) {
        const gr = g.createRadialGradient(sx, y, 4, sx, y, 92)
        gr.addColorStop(0, `rgba(${P.glow},.3)`); gr.addColorStop(1, `rgba(${P.glow},0)`)
        g.fillStyle = gr; g.fillRect(sx - 92, y - 92, 184, 184)
      }
    }
    g.restore()
  }
  function lampPosts() {
    for (const y of lampYs()) {
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? S.roadL - 4 : S.roadR + 4
        const x1 = x0 - side * 38
        if (!night) { g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + 5, y + 8); g.lineTo(x1 + 9, y + 14); g.stroke() }
        g.strokeStyle = night ? 'rgb(91,94,104)' : 'rgb(124,127,134)'; g.lineWidth = 2.6; g.lineCap = 'round'
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke()
        g.fillStyle = 'rgb(58,60,66)'; g.beginPath(); g.arc(x0, y, 3.4, 0, TAU); g.fill()
        g.fillStyle = night ? 'rgb(255,240,196)' : 'rgb(217,219,214)'; rr(x1 - 5, y - 2.6, 10, 5.2, 2); g.fill()
        if (night) {
          g.save(); g.globalCompositeOperation = 'lighter'
          g.fillStyle = `rgba(${P.glow},.5)`; g.beginPath(); g.arc(x1, y, 8, 0, TAU); g.fill(); g.restore()
        }
      }
    }
  }
  function drawBoats() {
    for (const b of boats) {
      g.save(); g.translate(b.x + Math.sin(clock * 1.4 + b.y * 0.02) * 1.5, b.y)
      g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.2
      g.beginPath(); g.moveTo(-4, 8); g.lineTo(-9, 30); g.moveTo(4, 8); g.lineTo(9, 30); g.stroke()
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(2, 3, 6, 12, 0, 0, TAU); g.fill()
      g.fillStyle = rgbStr(b.col); g.beginPath()
      g.moveTo(0, -12); g.quadraticCurveTo(6, -4, 5, 10); g.lineTo(-5, 10); g.quadraticCurveTo(-6, -4, 0, -12); g.fill()
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 0.8; g.stroke()
      g.fillStyle = 'rgb(242,239,230)'; rr(-3, -3, 6, 8, 1.5); g.fill()
      g.restore()
    }
  }
  function wind(running) {
    if (!running) return
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath()
    for (let k = 0; k < 7; k++) {
      const x = S.roadL + hash(k * 13 + 2) * (S.roadR - S.roadL)
      const y = ((clock * (700 + hash(k) * 500) + hash(k + 40) * H * 2) % (H + 120)) - 60
      g.moveTo(x, y); g.lineTo(x, y + 34 + hash(k + 7) * 30)
    }
    g.stroke()
  }

  // ── per-frame animation ────────────────────────────────────────────────────
  function animate(dt, running) {
    const sv = running ? 260 + 90 * Math.min(1, S.t / 40) : 90
    for (const f of carFx) f.sq = Math.max(0, f.sq - dt)
    boatT -= dt
    if (boatT <= 0) {
      boatT = 5 + Math.random() * 6
      const left = Math.random() < 0.5
      const bw = left ? S.roadL - 7 : W - S.roadR - 7
      if (bw > 22) boats.push({ x: left ? bw / 2 : W - bw / 2, y: -30, v: 26 + Math.random() * 20, col: [P.danger, P.line, P.cars[0], P.cars[2]][(Math.random() * 4) | 0] })
    }
    for (const b of boats) b.y += b.v * dt
    boats = boats.filter((b) => b.y < H + 40 && b.x > 0)
    scroll += sv * dt; clock += dt; shake = Math.max(0, shake - dt)
    for (const p of parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += (p.vy + sv * p.drift) * dt; p.size += p.grow * dt; p.rot += p.vr * dt
      if (p.type === 'drop') p.vy += 520 * dt
      if (p.type === 'smoke') p.vx *= 0.98
    }
    parts = parts.filter((p) => p.life > 0 && p.y < H + 60)
    for (const m of marks) { m.life -= dt; m.y += sv * dt; m.y2 += sv * dt }
    marks = marks.filter((m) => m.life > 0 && m.y < H + 20)
    for (const s of sinkers) {
      s.t += dt; s.x += s.vx * dt; s.vx *= 0.94; s.y += sv * 0.25 * dt; s.ang += s.vr * dt
      if (!s.wet && s.t > 0.16) { s.wet = true; splash(s.x, s.y) }
      if (s.wet && Math.random() < dt * 9) {
        emit({ type: 'ring', x: s.x + (Math.random() - 0.5) * 14, y: s.y + (Math.random() - 0.5) * 14, size: 1.5, grow: 12, life: 0.5, drift: 0.25, col: SPLASH, lw: 1.2 })
      }
    }
    sinkers = sinkers.filter((s) => s.t < 1.5)
    for (const w of wrecks) {
      w.t += dt; w.y += sv * 0.62 * dt
      if (Math.random() < dt * 26) smoke(w.x, w.y - 6, true, 1, 6)
      if (w.t < 1.6 && Math.random() < dt * 22) emit({ type: 'fire', x: w.x + (Math.random() - 0.5) * 10, y: w.y - 6 + (Math.random() - 0.5) * 10, vy: -20, size: 5 + Math.random() * 5, grow: 6, life: 0.3 })
    }
    wrecks = wrecks.filter((w) => w.y < H + 60)
    if (!running) return
    S.cars.forEach((c) => {
      if (!c.alive) return
      if (c.hp === 2 && Math.random() < dt * 9) smoke(c.x, c.y - 14, false, 1, 4)
      if (c.hp === 1) {
        if (Math.random() < dt * 24) smoke(c.x, c.y - 14, true, 1, 5)
        if (Math.random() < dt * 14) emit({ type: 'fire', x: c.x + (Math.random() - 0.5) * 8, y: c.y - 15, vy: 10, size: 4 + Math.random() * 3, grow: 4, life: 0.22 })
      }
      if (c.vy < -90 && Math.random() < dt * 16) emit({ type: 'smoke', x: c.x + (Math.random() - 0.5) * 8, y: c.y + 19, vy: 60, size: 2.5, grow: 10, life: 0.35, shade: 200, a: 0.22 })
      const slide = c.stun > 0 || c.inv > 0.75 || Math.abs(c.vx) > 190
      if (slide && Math.hypot(c.vx, c.vy) > 40) {
        for (const sx of [-8, 8]) marks.push({ x: c.x + sx, y: c.y + 12, x2: c.x + sx - c.vx * dt * 1.2, y2: c.y + 17, life: 2.2, max: 2.2 })
      }
    })
    if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS)
    for (const gh of S.ghosts) if (gh && Math.random() < dt * 10) emit({ type: 'smoke', x: gh.x + 10, y: gh.y - gh.h * 0.2, vy: 30, size: 3, grow: 12, life: 0.5, shade: 60, a: 0.35 })
  }

  // ── a frame ────────────────────────────────────────────────────────────────
  /**
   * @param {object} view  state-shaped (cars, traffic, ghosts, roadL, roadR, t, opts)
   * @param {number} dt    seconds since the last frame
   * @param {{running?: boolean, enter?: number, mySeat?: number}} ui
   *   running: the road is moving fast; enter: 0..1 cars rolling in from below
   */
  function draw(view, dt, ui = {}) {
    S = view
    reduce = isReducedMotion()
    if (!P || themeId !== (document.documentElement.getAttribute('data-theme') || '')) rebuild()
    night = P.dark
    const running = ui.running !== false
    animate(Math.min(dt, 0.05), running)
    g = home
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (shake > 0 && !reduce) g.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16)
    drawRoad(); lampGlow(); drawBoats()
    for (const s of sinkers) {
      const k = Math.min(1, s.t / 1.1)
      if (s.wet) { g.save(); g.beginPath(); g.rect(0, 0, S.roadL - 7, H); g.rect(S.roadR + 7, 0, W, H); g.clip() }
      drawCar(s.x, s.y, 22, 36, s.ang, P.cars[s.i], { scale: 1 - k * 0.45, alpha: 1 - k * k, stripe: true, label: String(s.i + 1) })
      if (s.wet) {
        g.restore()
        g.fillStyle = `rgba(${P.waterDeep},${k * 0.55})`; g.beginPath(); g.arc(s.x, s.y, 22 * (1 - k * 0.4), 0, TAU); g.fill()
      }
    }
    for (const w of wrecks) drawCar(w.x, w.y, 22, 36, w.ang, CHAR, { burnt: true })
    for (const t of S.traffic) {
      const tall = t.kind === 'bus' ? 1.7 : t.kind === 'van' ? 1.35 : 1
      const bob = reduce ? 0 : Math.sin(clock * 9 + t.tint) * 0.35
      shadow(t.x, t.y, t.w, t.h, 0, 5, tall); beams(t.x, t.y, t.w, t.h, 0)
      const sp = sprite(`${t.kind}${t.tint % 8}${night ? 'n' : 'd'}`, t.w + 14, t.h + 14, () => {
        const o = { ...t, x: 0, y: 0 }
        if (t.kind === 'bus') drawBus(o)
        else if (t.kind === 'van') drawVan(o)
        else drawCar(0, 0, t.w, t.h, 0, P.paints[t.tint % 8])
      })
      blit(sp, t.x, t.y + bob)
      if (night) {
        g.save(); g.globalCompositeOperation = 'lighter'
        const gr = g.createLinearGradient(0, t.y + t.h / 2, 0, t.y + t.h / 2 + 26)
        gr.addColorStop(0, 'rgba(255,40,20,.3)'); gr.addColorStop(1, 'rgba(255,40,20,0)')
        g.fillStyle = gr; g.fillRect(t.x - t.w / 2 + 1, t.y + t.h / 2, t.w - 2, 26); g.restore()
      }
    }
    S.ghosts.forEach((gh, i) => { if (gh) drawTruck(gh, i) })
    const enter = ui.enter > 0 ? ui.enter * ui.enter * 170 : 0
    S.cars.forEach((c, i) => {
      if (!c.alive) return
      if (S.opts?.horn !== false) {
        g.beginPath()
        g.arc(c.x, c.y + enter, 24, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - c.cd / HORN_COOLDOWN))
        g.lineWidth = 3; g.strokeStyle = `rgba(${P.glow},${c.cd > 0 ? 0.4 : 0.95})`; g.stroke()
      }
      if (ui.mySeat === i) {
        g.beginPath(); g.arc(c.x, c.y + enter, 28, 0, TAU)
        g.lineWidth = 1.5; g.setLineDash([3, 4]); g.strokeStyle = `rgba(${P.glow},.8)`; g.stroke(); g.setLineDash([])
      }
      const blink = c.inv > 0 && Math.floor(c.inv * 14) % 2
      const f = carFx[i]
      const sq = reduce ? 0 : f.sq > 0 ? Math.sin((f.sq / 0.2) * Math.PI) * 0.16 : 0
      drawCar(c.x, c.y + enter + (reduce ? 0 : Math.sin(clock * 38 + i * 2) * 0.3), 22, 36,
        clamp(c.vx / 520, -0.45, 0.45) + (c.stun > 0 && !reduce ? Math.sin(clock * 30) * 0.12 : 0), P.cars[i],
        { stripe: true, label: String(i + 1), steer: clamp(c.vx / 300, -0.45, 0.45), lean: c.vx / 260, brake: c.vy > 90,
          dents: 3 - c.hp, alpha: blink ? 0.45 : 1, sx: 1 + sq, sy: 1 - sq })
    })
    drawParts(); lampPosts(); if (!reduce) wind(running)
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75)
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, night ? 'rgba(0,0,10,.5)' : 'rgba(0,0,0,.2)')
    g.fillStyle = vg; g.fillRect(-20, -20, W + 40, H + 40)
  }

  function reset() {
    parts = []; marks = []; sinkers = []; wrecks = []; shake = 0
    for (const f of carFx) f.sq = 0
  }

  return { draw, event, reset, dispose() { sprites.clear(); parts = [] } }
}
