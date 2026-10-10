// quiverDraw.js — canvas painter for QUIVER. Draws a state-shaped scene (the
// host's sim, or a decoded snapshot) and owns the purely visual layer: the lit
// wheel, arrows, shadows, particles, call-outs, the wheel's recoil. None of that
// is game state, so it is rebuilt by comparing one scene with the last and is
// identical on the host and the guest.
//
// Every textured object (cloth, wheel, light layer, shadows, hub, arrows, prizes)
// is painted once to an offscreen canvas per theme and reused with drawImage, so
// a frame is about thirty images and at most MAX_PARTS particles, no blur filters.
// Colours come from quiverPalette.js, which derives them from the --c-* tokens.

import {
  TABLE_W as W, TABLE_H as H, CENTER, WHEEL_R as R, ARROW_LEN, WHEELS, CLINK_WIDTH, QUIVER, WHEEL_SECONDS, SUDDEN_SECONDS,
  wheelAngle, sightAngle, norm,
} from './quiverLogic'
import { TOKENS, parseTriplet, makePalette, mix, shade, tint, onColor } from './quiverPalette'

const TAU = Math.PI * 2
const CX = CENTER.x
const CY = CENTER.y
const MAX_PARTS = 220
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const outCubic = (x) => 1 - (1 - clamp01(x)) ** 3
const outBack = (x) => { const t = clamp01(x) - 1; return 1 + 2.70158 * t * t * t + 1.70158 * t * t }
const rnd = (a, b) => a + Math.random() * (b - a)
const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`

/** Read the theme tokens off an element (the canvas) and derive the painter's palette. */
export function readPalette(el) {
  const cs = getComputedStyle(el)
  const tokens = {}
  for (const k of TOKENS) tokens[k] = parseTriplet(cs.getPropertyValue(`--c-${k}`))
  const pal = makePalette(tokens)
  pal.font = cs.fontFamily || 'monospace'
  return pal
}

export const seatColor = (pal, i) => pal.seat[i] ?? pal.seat[0]

// ── sprites ─────────────────────────────────────────────────────────────────

function sprite(w, h, paint, k = 3) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * k)
  c.height = Math.ceil(h * k)
  const x = c.getContext('2d')
  x.scale(k, k)
  paint(x, w, h)
  c.lw = w
  c.lh = h
  return c
}

function starPath(x, n, ro, ri) {
  x.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2
    const r = i % 2 ? ri : ro
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  x.closePath()
}

/** A bevelled metal star. */
function gem(x, n, ro, ri, c) {
  x.save(); x.translate(1.2, 1.8); starPath(x, n, ro, ri); x.fillStyle = 'rgba(0,0,0,0.45)'; x.fill(); x.restore()
  starPath(x, n, ro, ri)
  const o = x.createLinearGradient(-ro, -ro, ro, ro)
  o.addColorStop(0, rgba(tint(c, 0.65))); o.addColorStop(0.5, rgba(c)); o.addColorStop(1, rgba(shade(c, 0.5)))
  x.fillStyle = o; x.fill()
  x.strokeStyle = rgba(shade(c, 0.36)); x.lineWidth = 1.2; x.lineJoin = 'round'; x.stroke()
  starPath(x, n, ro * 0.62, ri * 0.62)
  const i2 = x.createLinearGradient(-ro, -ro, ro, ro)
  i2.addColorStop(0, rgba(tint(c, 0.85))); i2.addColorStop(1, rgba(shade(c, 0.78)))
  x.fillStyle = i2; x.fill()
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.ellipse(-ro * 0.28, -ro * 0.34, ro * 0.16, ro * 0.08, -0.7, 0, TAU); x.fill()
}

/** An arrow drawn pointing left: steel head at the left end, fletching at the right. */
function arrowSprite(pal, c, flat) {
  const L = ARROW_LEN + 20
  const Hh = 22
  return sprite(L, Hh, (x) => {
    const m = Hh / 2
    let q = x.createLinearGradient(0, m - 5, 0, m + 5)
    q.addColorStop(0, 'rgb(250,252,255)'); q.addColorStop(0.5, 'rgb(170,178,194)'); q.addColorStop(1, 'rgb(70,76,92)')
    x.fillStyle = flat ? 'rgb(0,0,0)' : q
    x.beginPath(); x.moveTo(0, m); x.lineTo(13, m - 4.6); x.lineTo(10.5, m); x.lineTo(13, m + 4.6); x.closePath(); x.fill()          // broadhead
    q = x.createLinearGradient(0, m - 2, 0, m + 2)
    q.addColorStop(0, rgba(shade(pal.wood, 0.5))); q.addColorStop(0.35, rgba(tint(pal.wood, 0.2))); q.addColorStop(1, rgba(shade(pal.wood, 0.4)))
    x.fillStyle = flat ? 'rgb(0,0,0)' : q; x.fillRect(10, m - 1.7, L - 13, 3.4)                                                    // wooden shaft
    if (!flat) {
      x.fillStyle = rgba(shade(pal.wood, 0.28)); x.fillRect(10, m - 2, 3, 4)
      x.fillStyle = rgba(shade(c, 0.5)); x.fillRect(L - 24, m - 2, 2.2, 4); x.fillRect(L - 5, m - 2, 2.2, 4)
    }
    x.fillStyle = flat ? 'rgb(0,0,0)' : rgba(tint(c, 0.28))
    x.beginPath(); x.moveTo(L - 22, m - 1.6); x.quadraticCurveTo(L - 17, m - 10, L - 6, m - 8.5); x.lineTo(L - 4, m - 1.6); x.closePath(); x.fill()   // upper vane
    x.fillStyle = flat ? 'rgb(0,0,0)' : rgba(shade(c, 0.68))
    x.beginPath(); x.moveTo(L - 22, m + 1.6); x.quadraticCurveTo(L - 17, m + 10, L - 6, m + 8.5); x.lineTo(L - 4, m + 1.6); x.closePath(); x.fill()   // lower vane
    if (flat) return
    x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 0.6
    for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(L - 19 + k * 3, m - 2); x.lineTo(L - 15 + k * 3, m - 7.6); x.stroke() }
    x.strokeStyle = 'rgba(0,0,0,0.3)'
    for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(L - 19 + k * 3, m + 2); x.lineTo(L - 15 + k * 3, m + 7.6); x.stroke() }
    x.fillStyle = rgba(tint(c, 0.6)); x.fillRect(L - 3.5, m - 2.2, 3.5, 4.4)                                                       // nock
  })
}

function buildKit(pal) {
  const kit = {}
  const D = R * 2 + 16
  kit.table = sprite(W, H, (x) => {
    const gr = x.createRadialGradient(CX - 50, CY - 120, 20, CX, CY, 420)
    gr.addColorStop(0, rgba(pal.clothA)); gr.addColorStop(0.5, rgba(pal.clothB)); gr.addColorStop(1, rgba(pal.clothC))
    x.fillStyle = gr; x.fillRect(0, 0, W, H)
    for (let i = 0; i < 5200; i++) {                                   // woven grain
      x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.07)'
      x.fillRect(Math.random() * W, Math.random() * H, 1.2, 0.6)
    }
    x.strokeStyle = rgba(pal.mote, 0.12); x.lineWidth = 1; x.setLineDash([2, 5])
    x.beginPath(); x.arc(CX, CY, R + ARROW_LEN + 22, 0, TAU); x.stroke(); x.setLineDash([])
    const v = x.createRadialGradient(CX, CY, 150, CX, CY, 360)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${pal.vignette})`)
    x.fillStyle = v; x.fillRect(0, 0, W, H)
  }, 2)

  kit.wheel = sprite(D, D, (x) => {
    x.translate(D / 2, D / 2)
    x.fillStyle = rgba(shade(pal.wood, 0.3)); x.beginPath()            // bark, slightly ragged
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * TAU
      const rr = R + Math.sin(i * 2.7) * 0.9 + Math.sin(i * 0.9) * 0.8
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    x.closePath(); x.fill()
    const wd = x.createRadialGradient(-6, -4, 2, 0, 0, R - 4)
    wd.addColorStop(0, rgba(tint(pal.wood, 0.12))); wd.addColorStop(0.6, rgba(shade(pal.wood, 0.93))); wd.addColorStop(1, rgba(shade(pal.wood, 0.76)))
    x.fillStyle = wd; x.beginPath(); x.arc(0, 0, R - 4.5, 0, TAU); x.fill()
    x.save(); x.beginPath(); x.arc(0, 0, R - 4.5, 0, TAU); x.clip()
    for (let r = 5; r < R - 5; r += 3.1 + Math.random() * 2.4) {         // growth rings, each a wobbly loop
      const p1 = Math.random() * 6
      const p2 = Math.random() * 6
      const am = 0.5 + Math.random() * 1.3
      x.strokeStyle = rgba(shade(pal.wood, 0.48), 0.18 + Math.random() * 0.3); x.lineWidth = 0.6 + Math.random() * 1.1
      x.beginPath()
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * TAU
        const rr = r + Math.sin(a * 3 + p1) * am + Math.sin(a * 7 + p2) * am * 0.4
        x.lineTo(Math.cos(a) * rr - 2, Math.sin(a) * rr - 1)
      }
      x.closePath(); x.stroke()
    }
    for (let k = 0; k < 4; k++) {                                       // drying cracks
      let a = Math.random() * 7
      x.strokeStyle = rgba(shade(pal.wood, 0.26), 0.55); x.lineWidth = 1.1; x.beginPath(); x.moveTo(Math.cos(a) * 3, Math.sin(a) * 3)
      for (let r = 8; r < 26 + Math.random() * 30; r += 6) { a += (Math.random() - 0.5) * 0.16; x.lineTo(Math.cos(a) * r, Math.sin(a) * r) }
      x.stroke()
    }
    x.globalCompositeOperation = 'multiply'                             // paint soaks into the grain
    x.strokeStyle = rgba(pal.ring1, 0.85); x.lineWidth = R * 0.14; x.beginPath(); x.arc(0, 0, R * 0.7, 0, TAU); x.stroke()
    x.strokeStyle = rgba(pal.ring2, 0.75); x.lineWidth = R * 0.1; x.beginPath(); x.arc(0, 0, R * 0.36, 0, TAU); x.stroke()
    x.fillStyle = rgba(pal.ring1, 0.5); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R * 0.62, -0.22, 0.22); x.closePath(); x.fill()
    x.globalCompositeOperation = 'source-over'
    for (let k = 0; k < 90; k++) {
      x.fillStyle = `rgba(255,240,210,${Math.random() * 0.12})`
      const a = Math.random() * 7
      const r = Math.random() * R
      x.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2.5, 0.7)
    }
    x.restore()
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU
      x.strokeStyle = rgba(shade(pal.wood, 0.2), 0.6); x.lineWidth = 1.4; x.beginPath()
      x.moveTo(Math.cos(a) * (R - 9), Math.sin(a) * (R - 9)); x.lineTo(Math.cos(a) * (R - 5), Math.sin(a) * (R - 5)); x.stroke()
    }
  })

  kit.light = sprite(D, D, (x) => {                                     // fixed lighting laid over the turning wood
    x.translate(D / 2, D / 2); x.beginPath(); x.arc(0, 0, R + 1, 0, TAU); x.clip()
    const hi = x.createRadialGradient(-R * 0.45, -R * 0.55, 0, -R * 0.45, -R * 0.55, R * 1.25)
    hi.addColorStop(0, 'rgba(255,250,235,0.34)'); hi.addColorStop(0.55, 'rgba(255,250,235,0.04)'); hi.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = hi; x.fillRect(-D, -D, D * 2, D * 2)
    const lo = x.createRadialGradient(R * 0.5, R * 0.6, 0, R * 0.5, R * 0.6, R * 1.2)
    lo.addColorStop(0, 'rgba(20,8,0,0.34)'); lo.addColorStop(1, 'rgba(20,8,0,0)')
    x.fillStyle = lo; x.fillRect(-D, -D, D * 2, D * 2)
    const bev = x.createLinearGradient(-R, -R, R, R)
    bev.addColorStop(0, 'rgba(255,236,200,0.75)'); bev.addColorStop(0.5, 'rgba(255,236,200,0)'); bev.addColorStop(1, 'rgba(0,0,0,0.6)')
    x.strokeStyle = bev; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, R - 1.5, 0, TAU); x.stroke()
  })

  kit.shadow = sprite(D + 60, D + 60, (x, w) => {
    const s = x.createRadialGradient(w / 2, w / 2, R * 0.55, w / 2, w / 2, R + 26)
    s.addColorStop(0, `rgba(0,0,0,${pal.shadow})`); s.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = s; x.fillRect(0, 0, w, w)
  })

  kit.hub = sprite(26, 26, (x) => {
    x.translate(13, 13)
    const m = x.createRadialGradient(-3, -4, 1, 0, 0, 11)
    m.addColorStop(0, 'rgb(255,255,255)'); m.addColorStop(0.35, 'rgb(186,192,204)'); m.addColorStop(1, 'rgb(58,62,74)')
    x.fillStyle = m; x.beginPath(); x.arc(0, 0, 10.5, 0, TAU); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1; x.stroke()
  })

  kit.arrow = pal.seat.map((c) => arrowSprite(pal, c, false))
  kit.arrowShadow = arrowSprite(pal, pal.ink, true)
  kit.star = sprite(34, 34, (x) => { x.translate(17, 17); gem(x, 5, 12.5, 5.6, pal.star) })
  kit.gold = sprite(52, 52, (x) => {
    x.translate(26, 26); gem(x, 8, 19, 11.5, pal.gold)
    x.font = `9px ${pal.font ?? 'monospace'}`; x.textAlign = 'center'
    x.fillStyle = rgba(shade(pal.gold, 0.3)); x.fillText('3', 1, 5)
    x.fillStyle = 'rgba(255,246,210,0.9)'; x.fillText('3', 0.4, 4.2)
  })
  kit.bomb = sprite(40, 44, (x) => {
    x.translate(20, 25)
    const b = x.createRadialGradient(-4, -5, 1, 0, 0, 13)
    b.addColorStop(0, 'rgb(150,156,172)'); b.addColorStop(0.3, 'rgb(58,60,72)'); b.addColorStop(1, 'rgb(8,8,12)')
    x.fillStyle = b; x.beginPath(); x.arc(0, 0, 12, 0, TAU); x.fill()
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.ellipse(-4.5, -5.5, 2.6, 1.5, -0.7, 0, TAU); x.fill()
    const cap = x.createLinearGradient(-4, 0, 4, 0)
    cap.addColorStop(0, rgba(shade(pal.brass, 0.7))); cap.addColorStop(0.5, rgba(tint(pal.brass, 0.5))); cap.addColorStop(1, rgba(shade(pal.brass, 0.6)))
    x.fillStyle = cap; x.fillRect(-4, -15.5, 8, 5)
    x.strokeStyle = 'rgb(214,196,160)'; x.lineWidth = 1.8; x.lineCap = 'round'
    x.beginPath(); x.moveTo(0, -15); x.quadraticCurveTo(2, -22, 9, -20); x.stroke()
  })
  kit.flip = sprite(34, 34, (x) => {
    x.translate(17, 17)
    const t = x.createRadialGradient(-4, -5, 1, 0, 0, 14)
    t.addColorStop(0, 'rgb(255,255,255)'); t.addColorStop(0.3, rgba(tint(pal.flip, 0.35))); t.addColorStop(1, rgba(shade(pal.flip, 0.5)))
    x.fillStyle = t; x.beginPath(); x.arc(0, 0, 12.5, 0, TAU); x.fill(); x.strokeStyle = rgba(shade(pal.flip, 0.25)); x.lineWidth = 1.4; x.stroke()
    x.strokeStyle = 'rgb(255,255,255)'; x.lineWidth = 2.6; x.lineCap = 'round'; x.beginPath(); x.arc(0, 0, 6.5, 0.7, 5.1); x.stroke()
    x.fillStyle = 'rgb(255,255,255)'; x.beginPath(); x.moveTo(6.5, -7.5); x.lineTo(-1, -9); x.lineTo(4, -1.5); x.closePath(); x.fill()
  })
  kit.glint = sprite(24, 24, (x) => {
    x.translate(12, 12)
    const q = x.createRadialGradient(0, 0, 0, 0, 0, 11)
    q.addColorStop(0, 'rgba(255,255,255,1)'); q.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = q; x.beginPath(); x.moveTo(0, -11)
    x.quadraticCurveTo(1.4, -1.4, 11, 0); x.quadraticCurveTo(1.4, 1.4, 0, 11); x.quadraticCurveTo(-1.4, 1.4, -11, 0); x.quadraticCurveTo(-1.4, -1.4, 0, -11)
    x.fill()
  })
  return kit
}

// ── stage: the visual-only state ────────────────────────────────────────────

export function createStage() {
  return {
    t: 0, shake: 0, flash: 0, intro: 0, bannerT: 0,
    kx: 0, ky: 0, kvx: 0, kvy: 0,                  // the wheel's recoil spring
    wheelKey: null, started: false,
    parts: [], floats: [], bounces: [], ghosts: [],
    wobble: new Map(),                             // pin id → seconds since it stuck or was struck
    seen: new Set(), seenOrder: [],                // result / fly ids already shown
    flyIds: new Set(),
    prevPins: [], lastTheta: 0,
    motes: Array.from({ length: 16 }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(3, 9), vy: rnd(-7, -2), f: rnd(0.3, 1.1), s: rnd(0.7, 2) })),
    kit: null, kitFor: null,
  }
}

function emit(st, reduced, kind, x, y, n, o = {}) {
  const count = reduced ? Math.ceil(n * 0.3) : n
  for (let i = 0; i < count && st.parts.length < MAX_PARTS; i++) {
    const a = o.dir == null ? rnd(0, TAU) : o.dir + (Math.random() - 0.5) * (o.spread ?? 1.2)
    const sp = (o.speed ?? 120) * (0.35 + Math.random())
    st.parts.push({
      k: kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0,
      life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.7), s: (o.size ?? 2) * (0.6 + Math.random() * 0.9),
      c: o.color, rot: rnd(0, 6), vr: rnd(-10, 10), grav: o.grav ?? 420,
    })
  }
}
const ring = (st, x, y, c, r1 = 34) => st.parts.push({ k: 'ring', x, y, vx: 0, vy: 0, t: 0, life: 0.38, s: r1, c, rot: 0, vr: 0, grav: 0 })
const kick = (st, reduced, a, f) => { if (!reduced) { st.kvx -= Math.cos(a) * f; st.kvy -= Math.sin(a) * f } }
const float = (st, text, a, c, big = true) => st.floats.push({ t: 0, text, x: CX + Math.cos(a) * (R + 70), y: CY + Math.sin(a) * (R + 70), c, big })
const fling = (st, o, a, out) => st.bounces.push({ t: 0, o, a, vx: (Math.random() - 0.5) * 260, s: Math.random() < 0.5 ? -1 : 1, out })

function remember(st, id) {
  if (st.seen.has(id)) return false
  st.seen.add(id)
  st.seenOrder.push(id)
  if (st.seenOrder.length > 96) st.seen.delete(st.seenOrder.shift())
  return true
}

/** A local press, shown at once on the guest before the host's arrow arrives. */
export function pressed(st, seat) { st.ghosts.push({ seat, t: 0 }) }

function onResult(st, scene, pal, r, reduced) {
  const p = scene.players[r.o]
  if (!p) return
  const phi = p.phi
  const ix = CX + Math.cos(phi) * R
  const iy = CY + Math.sin(phi) * R
  const ex = CX + Math.cos(phi) * (R + 16)
  const ey = CY + Math.sin(phi) * (R + 16)
  const spark = pal.spark
  if (r.kind === 'clink') {
    fling(st, r.o, phi, false)
    if (!reduced) st.shake = Math.max(st.shake, 0.28)
    kick(st, reduced, phi, 260)
    emit(st, reduced, 'spark', ix + Math.cos(phi) * 30, iy + Math.sin(phi) * 30, 22, { speed: 260, life: 0.35, size: 2.2, color: spark, grav: 300 })
    ring(st, ix + Math.cos(phi) * 30, iy + Math.sin(phi) * 30, tint(spark, 0.4), 30)
    float(st, scene.coop ? 'CLINK! -1 HEART' : 'CLINK -1', phi, pal.c.danger)
    const th = st.lastTheta
    for (const pin of st.prevPins) if (Math.abs(norm(norm(pin.a + th) - phi)) < CLINK_WIDTH) st.wobble.set(pin.id, 0)
    return
  }
  if (r.kind === 'bomb') {
    for (const pin of st.prevPins) fling(st, pin.o, norm(pin.a + st.lastTheta), true)
    st.shake = reduced ? 0 : 0.45
    st.flash = 0.35
    kick(st, reduced, phi, 520)
    emit(st, reduced, 'spark', ex, ey, 44, { speed: 380, life: 0.6, size: 3, color: [255, 170, 70], grav: 200 })
    emit(st, reduced, 'smoke', ex, ey, 12, { speed: 70, life: 1.0, size: 12, color: [70, 70, 80], grav: -40 })
    ring(st, ex, ey, tint(spark, 0.4), 120)
    fling(st, r.o, phi, false)
    float(st, 'BOOM!', phi, pal.c.danger)
    return
  }
  // The arrow stuck: chips and dust from the entry point, a recoil, then the prize.
  kick(st, reduced, phi, 150)
  emit(st, reduced, 'chip', ix, iy, 9, { dir: phi, spread: 1.7, speed: 150, life: 0.5, size: 2.4, color: pal.chip })
  emit(st, reduced, 'dust', ix, iy, 6, { dir: phi, spread: 2.2, speed: 50, life: 0.6, size: 3, color: tint(pal.wood, 0.4), grav: -20 })
  st.wobble.set(r.id, 0)
  if (r.kind === 'star') {
    emit(st, reduced, 'spark', ex, ey, 16, { speed: 190, life: 0.5, size: 2.4, color: pal.star, grav: 240 })
    ring(st, ex, ey, pal.star)
    float(st, '+1', phi, pal.star)
  } else if (r.kind === 'gold') {
    emit(st, reduced, 'spark', ex, ey, 40, { speed: 280, life: 0.8, size: 3, color: pal.gold, grav: 260 })
    ring(st, ex, ey, tint(pal.gold, 0.3), 60)
    st.flash = 0.25
    float(st, 'GOLD +3', phi, pal.gold)
  } else if (r.kind === 'flip') {
    emit(st, reduced, 'spark', ex, ey, 14, { speed: 160, life: 0.5, size: 2.2, color: pal.flip, grav: 0 })
    ring(st, CX, CY, pal.flip, R + 30)
    float(st, 'REVERSE', phi, pal.flip)
  } else if (r.kind === 'shave') {
    emit(st, reduced, 'spark', ix, iy, 12, { speed: 150, life: 0.4, size: 2, color: pal.shave, grav: 0 })
    float(st, 'CLOSE SHAVE +1', phi, pal.shave)
  }
}

/** Advance the visual layer by `dt` seconds toward `scene`. Safe to call every animation frame. */
export function updateStage(st, scene, dt, reduced, pal) {
  st.t += dt
  const th = wheelAngle(scene)
  const key = `${scene.wheel}:${scene.sudden}`
  const first = !st.started
  st.started = true

  if (st.wheelKey !== key) {
    if (!first) {
      for (const pin of st.prevPins) fling(st, pin.o, norm(pin.a + st.lastTheta), true)
      st.floats = []
    }
    st.wheelKey = key
    st.intro = 0
    st.bannerT = 0
  }

  // Results the host has resolved since we last looked (once each, even if we
  // never saw the arrow in the air: the peer-to-peer channel may drop snapshots).
  for (const r of scene.results) {
    if (!remember(st, `r${r.id}`)) continue
    if (!first) onResult(st, scene, pal, r, reduced)
  }
  // New arrows in the air: a puff at the muzzle, and the local ghost is retired.
  const flying = new Set()
  for (const f of scene.fly) {
    flying.add(f.id)
    if (st.flyIds.has(f.id)) continue
    const p = scene.players[f.o]
    const gi = st.ghosts.findIndex((g) => g.seat === f.o)
    if (gi >= 0) st.ghosts.splice(gi, 1)
    if (!p || first) continue
    emit(st, reduced, 'dust', p.seat.x - Math.cos(p.phi) * 30, p.seat.y - Math.sin(p.phi) * 30, 5, {
      dir: p.phi + Math.PI, spread: 1.4, speed: 60, life: 0.3, size: 1.6, color: tint(pal.seat[f.o] ?? pal.seat[0], 0.5), grav: 0,
    })
  }
  st.flyIds = flying
  for (const pin of scene.pins) if (!st.wobble.has(pin.id)) st.wobble.set(pin.id, 0.5)
  if (st.wobble.size > 48) {
    const live = new Set(scene.pins.map((x) => x.id))
    for (const id of st.wobble.keys()) if (!live.has(id)) st.wobble.delete(id)
  }
  st.prevPins = scene.pins
  st.lastTheta = th

  // Particles, floats, tumbling arrows, the recoil spring, shake and flash.
  for (let i = st.parts.length - 1; i >= 0; i--) {
    const q = st.parts[i]
    q.t += dt
    if (q.t >= q.life) { st.parts.splice(i, 1); continue }
    q.vy += q.grav * dt
    q.vx *= 1 - 1.6 * dt
    q.vy *= 1 - 1.6 * dt
    q.x += q.vx * dt
    q.y += q.vy * dt
    q.rot += q.vr * dt
  }
  for (const f of st.floats) f.t += dt
  st.floats = st.floats.filter((f) => f.t < 1)
  for (const b of st.bounces) b.t += dt
  st.bounces = st.bounces.filter((b) => b.t < 1)
  for (const g of st.ghosts) g.t += dt
  st.ghosts = st.ghosts.filter((g) => g.t < 0.4)
  for (const [id, w] of st.wobble) st.wobble.set(id, w + dt)
  st.kvx += (-420 * st.kx - 17 * st.kvx) * dt
  st.kvy += (-420 * st.ky - 17 * st.kvy) * dt
  st.kx += st.kvx * dt
  st.ky += st.kvy * dt
  if (st.shake > 0) st.shake -= dt
  if (st.flash > 0) st.flash -= dt
  st.intro += dt
  st.bannerT += dt
}

// ── drawing ─────────────────────────────────────────────────────────────────

function put(g, s, x, y, ang = 0, sc = 1, alpha = 1) {
  g.save(); g.translate(x, y)
  if (ang) g.rotate(ang)
  if (sc !== 1) g.scale(sc, sc)
  if (alpha !== 1) g.globalAlpha = alpha
  g.drawImage(s, -s.lw / 2, -s.lh / 2, s.lw, s.lh)
  g.restore()
}

/** tipX, tipY is where the point is; ang is the direction from the tip toward the flights. */
function drawArrow(g, s, tipX, tipY, ang, alpha = 1, sc = 1) {
  g.save(); g.translate(tipX, tipY); g.rotate(ang)
  if (sc !== 1) g.scale(sc, sc)
  if (alpha !== 1) g.globalAlpha = alpha
  g.drawImage(s, 0, -s.lh / 2, s.lw, s.lh)
  g.restore()
}

function drawItem(g, kit, pal, st, it, th, idx, wx, wy, dirSign, reduced) {
  const a = it.a + th
  const pop = outBack((st.intro - 0.22 - idx * 0.06) / 0.32)
  if (pop <= 0) return
  const ph = it.id * 1.7
  const bob = 1 + Math.sin(st.t * 3 + ph) * 0.05
  const x = wx + Math.cos(a) * (R + 16)
  const y = wy + Math.sin(a) * (R + 16)
  g.strokeStyle = rgba(pal.brass); g.lineWidth = 2.5; g.beginPath()                       // brass peg
  g.moveTo(wx + Math.cos(a) * (R - 2), wy + Math.sin(a) * (R - 2)); g.lineTo(x, y); g.stroke()
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 5 * dirSign, y + 8 * dirSign, 10 * pop, 5 * pop, 0, 0, TAU); g.fill()
  if (it.kind === 'star') put(g, kit.star, x, y, Math.sin(st.t * 1.7 + ph) * 0.14, pop * bob)
  if (it.kind === 'gold') {
    g.save(); g.globalCompositeOperation = pal.blend; g.translate(x, y); g.rotate(st.t * 0.9)
    for (let k = 0; k < 8; k++) {
      g.rotate(Math.PI / 4); g.fillStyle = rgba(pal.gold, pal.light ? 0.22 : 0.16)
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-4, -30 * pop); g.lineTo(4, -30 * pop); g.closePath(); g.fill()
    }
    g.restore()
    put(g, kit.gold, x, y, Math.sin(st.t * 1.3) * 0.1, pop * (1 + Math.sin(st.t * 5) * 0.06))
  }
  if (it.kind === 'bomb') {
    put(g, kit.bomb, x, y - 2, Math.sin(st.t * 2.2 + ph) * 0.1, pop * bob)
    const fl = 0.6 + 0.4 * Math.abs(Math.sin(st.t * 23 + ph))
    g.save(); g.globalCompositeOperation = pal.blend; put(g, kit.glint, x + 9 * pop, y - 22 * pop, st.t * 9, 0.55 * fl); g.restore()
    if (!reduced && Math.random() < 0.3) emit(st, reduced, 'spark', x + 9 * pop, y - 22 * pop, 1, { speed: 60, life: 0.3, size: 1.4, color: [255, 190, 90], grav: 160 })
  }
  if (it.kind === 'flip') put(g, kit.flip, x, y, -st.t * 1.4 * dirSign, pop * bob)
  const gl = (st.t * 0.55 + ph) % 2.6                                                   // idle glint sweep
  if (gl < 0.35 && it.kind !== 'bomb') {
    g.save(); g.globalCompositeOperation = pal.blend
    put(g, kit.glint, x - 4, y - 5, gl * 4, Math.sin((gl / 0.35) * Math.PI) * 0.7)
    g.restore()
  }
}

const bannerText = (scene) => (scene.sudden > 0 ? 'SUDDEN DEATH' : scene.wheel >= WHEELS - 1 ? 'FINAL WHEEL' : `WHEEL ${scene.wheel + 1}`)

/**
 * Paint one frame. `g` must have its transform set so one unit is one table unit
 * (TABLE_W × TABLE_H). With `rotated` the whole table is drawn turned around,
 * but light and text keep their directions.
 */
export function drawScene(g, st, scene, pal, o = {}) {
  const { rotated = false, reduced = false, mySeats = null } = o
  if (st.kitFor !== pal) { st.kit = buildKit(pal); st.kitFor = pal }
  const kit = st.kit
  const th = wheelAngle(scene)
  const dirSign = rotated ? -1 : 1                                  // shadows keep falling toward the bottom right
  const spin = rotated ? Math.PI : 0

  g.drawImage(kit.table, 0, 0, W, H)
  g.save()
  if (st.shake > 0 && !reduced) {
    const am = (8 * st.shake) / 0.3
    g.translate((Math.random() - 0.5) * am, (Math.random() - 0.5) * am)
  }
  if (rotated) { g.translate(W, H); g.rotate(Math.PI) }

  // Dust drifting through the light: idle life.
  for (const m of st.motes) {
    const mx = (m.x + st.t * m.vx + Math.sin(st.t * m.f) * 8 + W * 4) % W
    const my = (m.y + st.t * m.vy + H * 4) % H
    g.fillStyle = rgba(pal.mote, 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(st.t * m.f * 2 + m.x)))
    g.beginPath(); g.arc(mx, my, m.s, 0, TAU); g.fill()
  }

  // Lanes: chalk dashes that march toward the wheel on a live lane; the quiver fanned beside each button.
  const n = scene.players.length
  const live = scene.phase === 'play'
  for (const p of scene.players) {
    const on = live && !p.out && p.ammo > 0 && p.stun <= 0
    const c = seatColor(pal, p.i)
    g.setLineDash([5, 8]); g.lineDashOffset = on && !reduced ? st.t * 26 : 0
    g.lineWidth = on ? 2.5 : 1.5; g.lineCap = 'round'; g.strokeStyle = rgba(tint(c, 0.25), on ? 0.85 : 0.2)
    g.beginPath()
    g.moveTo(p.seat.x - Math.cos(p.phi) * 40, p.seat.y - Math.sin(p.phi) * 40)
    g.lineTo(CX + Math.cos(p.phi) * (R + ARROW_LEN + 26), CY + Math.sin(p.phi) * (R + ARROW_LEN + 26))
    g.stroke(); g.setLineDash([])
    if (p.out) continue
    const nq = scene.sudden > 0 ? 1 : QUIVER[n]
    const back = p.phi + Math.PI
    for (let z = 0; z < nq; z++) {
      const fa = back + (z - (nq - 1) / 2) * 0.2
      const qx = p.seat.x + Math.cos(fa) * 52
      const qy = p.seat.y + Math.sin(fa) * 52
      if (z < p.ammo) drawArrow(g, kit.arrow[p.i], qx, qy, fa + Math.PI, 0.95, 0.42)
      else { g.fillStyle = rgba(pal.mote, 0.2); g.beginPath(); g.arc(qx - Math.cos(fa) * 8, qy - Math.sin(fa) * 8, 1.6, 0, TAU); g.fill() }
    }
  }

  // The wheel: shadow, wood, fixed light, hub. It pops in when a new wheel is dealt.
  const sc = outBack(st.intro / 0.5)
  const wx = CX + st.kx
  const wy = CY + st.ky
  put(g, kit.shadow, wx + 9 * dirSign, wy + 13 * dirSign, 0, sc)
  for (const pin of scene.pins) {
    const a = pin.a + th
    drawArrow(g, kit.arrowShadow, wx + Math.cos(a) * (R - 8) + 6 * dirSign, wy + Math.sin(a) * (R - 8) + 9 * dirSign, a, 0.3)
  }
  // A clock ring: what is left of this wheel's time.
  if (scene.phase === 'play' && !scene.pause) {
    const total = scene.sudden > 0 ? SUDDEN_SECONDS : WHEEL_SECONDS
    const frac = clamp01(scene.wt / total)
    const urgent = scene.wt <= 3
    g.save(); g.lineCap = 'round'; g.lineWidth = 3
    g.strokeStyle = rgba(urgent ? pal.c.danger : pal.mote, urgent ? 0.8 : 0.28)
    g.beginPath(); g.arc(wx, wy, R + 46, -Math.PI / 2, -Math.PI / 2 + TAU * frac); g.stroke()
    g.restore()
  }
  put(g, kit.wheel, wx, wy, th, sc)
  put(g, kit.light, wx, wy, spin, sc)
  g.save(); g.translate(wx, wy); g.scale(sc, sc)
  g.drawImage(kit.hub, -13, -13, 26, 26)
  g.rotate(th); g.strokeStyle = 'rgba(30,32,40,0.8)'; g.lineWidth = 2
  g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke()
  g.restore()
  if (st.flash > 0) {
    g.save(); g.globalCompositeOperation = pal.blend
    g.fillStyle = `rgba(255,230,170,${Math.min(0.5, st.flash * 1.6)})`
    g.beginPath(); g.arc(wx, wy, R + 60, 0, TAU); g.fill(); g.restore()
  }

  // Stuck arrows shiver, then settle.
  for (const pin of scene.pins) {
    const a = pin.a + th
    const w = st.wobble.get(pin.id) ?? 1
    const wob = reduced ? 0 : (pin.id % 2 ? -1 : 1) * 0.26 * Math.exp(-8 * w) * Math.sin(42 * w)
    drawArrow(g, kit.arrow[pin.o] ?? kit.arrow[0], wx + Math.cos(a) * (R - 8), wy + Math.sin(a) * (R - 8), a + wob)
  }
  scene.items.forEach((it, idx) => drawItem(g, kit, pal, st, it, th, idx, wx, wy, dirSign, reduced))

  // Underdog sight: where an arrow shot right now would land.
  for (const p of scene.players) {
    if (mySeats && !mySeats.includes(p.i)) continue
    const sa = sightAngle(scene, p.i)
    if (sa == null) continue
    const a = sa + th
    const sx = wx + Math.cos(a) * (R + 3)
    const sy = wy + Math.sin(a) * (R + 3)
    const pu = 1 + (reduced ? 0 : Math.sin(st.t * 9) * 0.18)
    const c = seatColor(pal, p.i)
    g.save(); g.globalCompositeOperation = pal.blend; g.fillStyle = rgba(c, 0.35)
    g.beginPath(); g.arc(sx, sy, 11 * pu, 0, TAU); g.fill(); g.restore()
    g.fillStyle = rgba(tint(c, 0.5)); g.strokeStyle = rgba(pal.c.text); g.lineWidth = 1.5
    g.beginPath(); g.arc(sx, sy, 4.5, 0, TAU); g.fill(); g.stroke()
  }

  // Arrows in the air: a streak, shrinking as they drop, the shadow closing in.
  for (const f of scene.fly) {
    const p = scene.players[f.o]
    if (!p) continue
    const u = clamp01((f.d0 - f.d) / Math.max(1, f.d0 - R))
    const hgt = 1 - u
    const tx = CX + Math.cos(p.phi) * f.d
    const ty = CY + Math.sin(p.phi) * f.d
    drawArrow(g, kit.arrowShadow, tx + (6 + hgt * 16) * dirSign, ty + (9 + hgt * 22) * dirSign, p.phi, 0.22, 1 + hgt * 0.25)
    const ex2 = tx + Math.cos(p.phi) * 120
    const ey2 = ty + Math.sin(p.phi) * 120
    const c = seatColor(pal, f.o)
    const tr = g.createLinearGradient(tx, ty, ex2, ey2)
    tr.addColorStop(0, rgba(tint(c, 0.5), 0.6)); tr.addColorStop(1, rgba(c, 0))
    g.save(); g.globalCompositeOperation = pal.blend; g.strokeStyle = tr; g.lineWidth = 7; g.lineCap = 'round'
    g.beginPath(); g.moveTo(tx + Math.cos(p.phi) * 20, ty + Math.sin(p.phi) * 20); g.lineTo(ex2, ey2); g.stroke(); g.restore()
    drawArrow(g, kit.arrow[f.o] ?? kit.arrow[0], tx, ty, p.phi, 1, 1 + hgt * 0.22)
  }
  // The guest's own press, until the host's arrow shows up.
  for (const gh of st.ghosts) {
    const p = scene.players[gh.seat]
    if (!p) continue
    const d0 = Math.hypot(p.seat.x - CX, p.seat.y - CY) - 34
    const d = Math.max(R, d0 - 900 * gh.t)
    drawArrow(g, kit.arrow[gh.seat] ?? kit.arrow[0], CX + Math.cos(p.phi) * d, CY + Math.sin(p.phi) * d, p.phi, 0.55 * (1 - gh.t / 0.4))
  }
  // Thrown-off arrows tumble away under gravity.
  for (const b of st.bounces) {
    const rr = R + (b.out ? 0 : 26) + b.t * 260
    const bx = wx + Math.cos(b.a) * rr + b.vx * b.t
    const by = wy + Math.sin(b.a) * rr + 520 * b.t * b.t
    const ang = b.a + b.s * b.t * 16
    drawArrow(g, kit.arrowShadow, bx + 10 * dirSign, by + 16 * dirSign, ang, 0.18 * (1 - b.t))
    drawArrow(g, kit.arrow[b.o] ?? kit.arrow[0], bx, by, ang, 1 - b.t * b.t)
  }
  // Particles.
  for (const q of st.parts) {
    const k = 1 - q.t / q.life
    if (q.k === 'chip') {
      g.save(); g.translate(q.x, q.y); g.rotate(q.rot)
      g.fillStyle = rgba(q.c, k); g.fillRect(-q.s, -q.s * 0.4, q.s * 2, q.s * 0.8)
      g.fillStyle = `rgba(255,240,210,${k * 0.6})`; g.fillRect(-q.s, -q.s * 0.4, q.s * 2, 0.6)
      g.restore()
    } else if (q.k === 'spark') {
      g.save(); g.globalCompositeOperation = pal.blend; g.strokeStyle = rgba(q.c, k); g.lineWidth = q.s * k + 0.4; g.lineCap = 'round'
      g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035); g.stroke(); g.restore()
    } else if (q.k === 'dust') {
      g.fillStyle = rgba(q.c, k * 0.4); g.beginPath(); g.arc(q.x, q.y, q.s * (1.6 - k * 0.6), 0, TAU); g.fill()
    } else if (q.k === 'smoke') {
      g.fillStyle = rgba(q.c, k * 0.4); g.beginPath(); g.arc(q.x, q.y, q.s * (2.4 - k * 1.4), 0, TAU); g.fill()
    } else if (q.k === 'ring') {
      g.save(); g.globalCompositeOperation = pal.blend; g.strokeStyle = rgba(q.c, k * 0.9); g.lineWidth = 5 * k + 0.5
      g.beginPath(); g.arc(q.x, q.y, 6 + q.s * outCubic(1 - k), 0, TAU); g.stroke(); g.restore()
    }
  }
  g.restore()

  // Text is always upright for the viewer, so it is placed through the same turn.
  const at = (x, y) => (rotated ? [W - x, H - y] : [x, y])
  const font = (px) => `${px}px ${pal.font}`
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round'
  for (const f of st.floats) {
    const ps = outBack(f.t / 0.22) * (f.big ? 1.15 : 1)
    const al = 1 - clamp01((f.t - 0.6) / 0.4)
    const [fx, fy] = at(f.x, f.y)
    g.save(); g.translate(Math.max(78, Math.min(W - 78, fx)), fy - outCubic(f.t) * 22); g.scale(ps, ps); g.globalAlpha = al
    g.font = font(11); g.lineWidth = 5; g.strokeStyle = rgba(pal.outline, 0.95); g.strokeText(f.text, 0, 0)
    g.fillStyle = rgba(pal.light ? shade(f.c, 0.72) : tint(f.c, 0.25)); g.fillText(f.text, 0, 0)
    g.restore()
  }
  if (scene.phase === 'count') {
    const c = Math.ceil(scene.count - 0.4)
    const big = c >= 1
    const txt = big ? String(c) : 'GO!'
    const pulse = outBack((1 - (scene.count % 1)) / 0.35)
    g.save(); g.translate(CX, CY - 150); g.scale(0.6 + pulse * 0.4, 0.6 + pulse * 0.4)
    g.font = font(big ? 44 : 26); g.lineWidth = 7; g.strokeStyle = rgba(pal.outline, 0.95); g.strokeText(txt, 0, 12)
    g.fillStyle = rgba(pal.bannerInk); g.fillText(txt, 0, 12)
    g.restore()
  } else if (scene.pause > 0 && scene.phase === 'play') {                // glass banner slides in and out
    const bi = outBack(st.bannerT / 0.3)
    const bo = clamp01(scene.pause / 0.2)
    const by = CY - 150 - (1 - Math.min(bi, 1)) * 30
    g.save(); g.globalAlpha = Math.min(1, bi) * bo
    g.fillStyle = rgba(pal.bannerBg, pal.light ? 0.72 : 0.3); g.strokeStyle = rgba(pal.c.border, 0.9); g.lineWidth = 1
    g.beginPath()
    if (g.roundRect) g.roundRect(CX - 120, by, 240, 44, 14); else g.rect(CX - 120, by, 240, 44)
    g.fill(); g.stroke()
    const txt = bannerText(scene)
    g.font = font(15)
    g.fillStyle = rgba(pal.outline, 0.8); g.fillText(txt, CX + 1.5, by + 30.5)
    g.fillStyle = rgba(pal.bannerInk); g.fillText(txt, CX, by + 29)
    g.restore()
  }
}

/** The pad's own face: label ink and the dome colour for a seat. */
export function padColors(pal, i) {
  const c = seatColor(pal, i)
  return { fill: c, ink: onColor(c), shadow: mix(c, [0, 0, 0], 0.55) }
}
