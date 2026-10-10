// Canvas stage for STEADY HAND (rendering and input only — the rules are in
// lib/dartsLogic.js). One scene owns the board, the darts in flight and stuck,
// the aim reticle, the hit effects and the camera. The page feeds it the
// replayed room state; every dart in `state.log` is animated once, the same on
// every screen, and a dart thrown on this phone starts flying at release
// instead of waiting for the room.
//
// The board is painted from the active theme's --c-* tokens (singles from text
// and card, scoring rings from danger and win, the surround from card and
// border, wire from structure) so it changes with the theme like every other
// screen. The sisal grain, wire glints and brass barrels are materials and stay
// the same on every theme.
import {
  RADII, SECTORS, UNIT,
  segmentAt, finishSegments, describeThrow, shakeRadius, shakeOffset, aimStart, clampAim, sweepAt, gauss,
  toThrow, SCATTER_MM,
} from '../lib/dartsLogic'
import { mulberry32 } from '../lib/detMath'
import { canvasPixelRatio } from '../lib/platform'
import { isReducedMotion } from '../hooks/useMotionPref'
import { sounds } from '../lib/sounds'

const TAU = Math.PI * 2
const REF_W = 348
const PX_PER_MM = 0.69 // at the reference width, zoom 1
const MIN_HOLD_MS = 220
const FLIGHT_MS = 360
const FLIGHT_REDUCED_MS = 200
const PENDING_TIMEOUT_MS = 4500
const PULL_DARTS_MS = 1100
const TOKENS = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'cta', 'win', 'danger', 'deep', 'structure', 'p1', 'p2', 'p3', 'p4']
const FALLBACK = { bg: [20, 24, 20], surface: [30, 36, 30], card: [40, 46, 40], border: [80, 90, 80], text: [230, 235, 225], dim: [150, 160, 150], cta: [220, 180, 60], win: [90, 190, 110], danger: [210, 70, 70], deep: [14, 18, 14], structure: [120, 130, 120], p1: [90, 180, 90], p2: [160, 110, 220], p3: [220, 90, 150], p4: [60, 150, 215] }

// Materials: the same on every theme. Triplets, never hex strings.
const STEEL = [223, 228, 232]
const BRASS_HI = [246, 227, 164]
const BRASS_MID = [199, 154, 61]
const BRASS_LO = [109, 79, 23]
const SHAFT = [42, 42, 44]
const INK = [8, 12, 9]

const rgb = (a, alpha = 1) => `rgba(${a[0]},${a[1]},${a[2]},${alpha})`
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const lighten = (a, t) => mix(a, [255, 255, 255], t)
const lum = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]

function readTokens() {
  const cs = getComputedStyle(document.documentElement)
  const out = {}
  for (const n of TOKENS) {
    const v = cs.getPropertyValue(`--c-${n}`).trim().split(/\s+/).map(Number)
    out[n] = v.length === 3 && v.every(Number.isFinite) ? v : FALLBACK[n]
  }
  return out
}

function wedge(g, i, r0, r1) {
  const a0 = -Math.PI / 2 + (i - 0.5) * (TAU / 20)
  const a1 = a0 + TAU / 20
  g.beginPath()
  g.arc(0, 0, r1, a0, a1)
  g.arc(0, 0, r0, a1, a0, true)
  g.closePath()
}

/** The board face, painted once per theme and size onto its own canvas. */
function paintBoard(T, k) {
  const pad = 34
  const size = Math.ceil((RADII.edge + pad) * 2 * k)
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  g.translate(size / 2, size / 2)
  g.scale(k, k)
  const rnd = mulberry32(20241010)
  const light = lum(T.bg) > 140
  const rim = light ? T.text : mix(T.card, T.border, 0.35)
  const numCol = light ? T.card : T.text

  let gr = g.createRadialGradient(-60, -80, 40, 0, 0, RADII.edge + pad)
  gr.addColorStop(0, rgb(lighten(rim, 0.12)))
  gr.addColorStop(1, rgb(mix(rim, [0, 0, 0], 0.45)))
  g.fillStyle = gr
  g.beginPath(); g.arc(0, 0, RADII.edge + pad - 4, 0, TAU); g.fill()
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1.2
  g.beginPath(); g.arc(0, 0, RADII.edge + pad - 6, 0, TAU); g.stroke()

  gr = g.createRadialGradient(-50, -70, 20, 0, 0, RADII.edge)
  gr.addColorStop(0, rgb(lighten(rim, 0.06)))
  gr.addColorStop(1, rgb(mix(rim, [0, 0, 0], 0.3)))
  g.fillStyle = gr
  g.beginPath(); g.arc(0, 0, RADII.edge, 0, TAU); g.fill()

  for (let i = 0; i < 20; i++) {
    const dark = i % 2 === 0
    g.fillStyle = rgb(dark ? T.danger : T.win)
    wedge(g, i, RADII.doubleIn, RADII.doubleOut); g.fill()
    wedge(g, i, RADII.trebleIn, RADII.trebleOut); g.fill()
    g.fillStyle = rgb(dark ? T.text : T.card)
    wedge(g, i, RADII.trebleOut, RADII.doubleIn); g.fill()
    wedge(g, i, RADII.outerBull, RADII.trebleIn); g.fill()
  }
  g.fillStyle = rgb(T.win)
  g.beginPath(); g.arc(0, 0, RADII.outerBull, 0, TAU); g.fill()
  g.fillStyle = rgb(T.danger)
  g.beginPath(); g.arc(0, 0, RADII.bull, 0, TAU); g.fill()

  // Sisal: fine radial fibres and speckle, clipped to the playing face.
  g.save()
  g.beginPath(); g.arc(0, 0, RADII.doubleOut, 0, TAU); g.clip()
  for (let i = 0; i < 5200; i++) {
    const a = rnd() * TAU
    const r = Math.sqrt(rnd()) * RADII.doubleOut
    const l = 1.5 + rnd() * 4
    g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.09)'
    g.lineWidth = 0.35
    g.beginPath()
    g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    g.lineTo(Math.cos(a + 0.004 * gauss(rnd)) * (r + l), Math.sin(a + 0.004 * gauss(rnd)) * (r + l))
    g.stroke()
  }
  // Old holes around the trebles.
  for (let i = 0; i < 90; i++) {
    const a = rnd() * TAU
    const r = 40 + rnd() * 125
    g.fillStyle = 'rgba(0,0,0,.28)'
    g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.5 + rnd() * 0.5, 0, TAU); g.fill()
  }
  gr = g.createRadialGradient(-70, -95, 10, 0, 0, RADII.doubleOut * 1.15)
  gr.addColorStop(0, 'rgba(255,244,214,.20)')
  gr.addColorStop(0.55, 'rgba(255,255,255,0)')
  gr.addColorStop(1, 'rgba(0,0,0,.34)')
  g.fillStyle = gr
  g.fillRect(-RADII.doubleOut, -RADII.doubleOut, RADII.doubleOut * 2, RADII.doubleOut * 2)
  g.restore()

  // Wire spider: shadow, steel, glint.
  const wires = (dx, dy, colour, w) => {
    g.save()
    g.translate(dx, dy)
    g.strokeStyle = colour; g.lineWidth = w; g.lineCap = 'round'
    for (const r of [RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut]) {
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke()
    }
    for (let i = 0; i < 20; i++) {
      const a = (i - 0.5) * (TAU / 20)
      g.beginPath()
      g.moveTo(Math.sin(a) * RADII.outerBull, -Math.cos(a) * RADII.outerBull)
      g.lineTo(Math.sin(a) * (RADII.doubleOut + 3), -Math.cos(a) * (RADII.doubleOut + 3))
      g.stroke()
    }
    g.restore()
  }
  wires(0.9, 1.3, 'rgba(0,0,0,.55)', 1.5)
  wires(0, 0, rgb(mix(T.structure, [200, 205, 210], 0.55)), 1.25)
  wires(-0.25, -0.3, 'rgba(255,255,255,.75)', 0.45)

  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = '300 31px "Helvetica Neue", Helvetica, Arial, sans-serif'
  SECTORS.forEach((n, i) => {
    const a = (i * TAU) / 20
    g.save()
    g.translate(Math.sin(a) * 198, -Math.cos(a) * 198)
    g.rotate(a)
    g.fillStyle = light ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.8)'
    g.fillText(String(n), 1, 1.4)
    g.fillStyle = rgb(numCol)
    g.fillText(String(n), 0, 0)
    g.restore()
  })
  g.strokeStyle = rgb(light ? T.card : T.border, 0.6); g.lineWidth = 1
  g.beginPath(); g.arc(0, 0, RADII.edge - 5, 0, TAU); g.stroke()
  return { canvas: c, half: RADII.edge + pad }
}

// A dart drawn along +x with its point at the origin.
function paintDart(g, L, colour, shadow) {
  if (shadow) {
    g.strokeStyle = 'rgba(0,0,0,.34)'; g.lineCap = 'round'
    g.lineWidth = L * 0.07
    g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.94, 0); g.stroke()
    g.lineWidth = L * 0.2
    g.beginPath(); g.moveTo(L * 0.76, 0); g.lineTo(L * 0.95, 0); g.stroke()
    return
  }
  g.lineCap = 'butt'
  g.strokeStyle = rgb(STEEL); g.lineWidth = Math.max(1, L * 0.022)
  g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.2, 0); g.stroke()
  const bw = L * 0.085
  const gr = g.createLinearGradient(0, -bw / 2, 0, bw / 2)
  gr.addColorStop(0, rgb(BRASS_HI)); gr.addColorStop(0.35, rgb(BRASS_MID)); gr.addColorStop(1, rgb(BRASS_LO))
  g.fillStyle = gr
  g.beginPath(); g.roundRect(L * 0.18, -bw / 2, L * 0.33, bw, bw * 0.3); g.fill()
  g.strokeStyle = 'rgba(60,40,8,.55)'; g.lineWidth = Math.max(0.6, L * 0.008)
  for (let i = 0; i < 6; i++) {
    const x = L * (0.23 + i * 0.045)
    g.beginPath(); g.moveTo(x, -bw / 2); g.lineTo(x, bw / 2); g.stroke()
  }
  g.strokeStyle = rgb(SHAFT); g.lineWidth = L * 0.03
  g.beginPath(); g.moveTo(L * 0.5, 0); g.lineTo(L * 0.74, 0); g.stroke()
  const flight = () => {
    g.beginPath()
    g.moveTo(L * 0.66, 0); g.lineTo(L * 0.79, -L * 0.115); g.lineTo(L, -L * 0.115)
    g.lineTo(L * 0.93, 0); g.lineTo(L, L * 0.115); g.lineTo(L * 0.79, L * 0.115)
    g.closePath()
  }
  flight(); g.fillStyle = rgb(colour); g.fill()
  g.save(); flight(); g.clip()
  g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(L * 0.6, -L * 0.13, L * 0.5, L * 0.13)
  g.restore()
  flight(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = Math.max(0.7, L * 0.012); g.stroke()
  g.beginPath(); g.moveTo(L * 0.68, 0); g.lineTo(L * 0.95, 0); g.stroke()
}

// A seat's shape, so colour is never the only cue (matches the seat cards).
function seatShape(g, i, x, y, r) {
  g.beginPath()
  if (i === 0) g.arc(x, y, r, 0, TAU)
  else if (i === 1) g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7)
  else if (i === 2) { g.moveTo(x, y - r * 1.1); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath() }
  else { g.moveTo(x, y - r * 1.15); g.lineTo(x + r * 1.05, y); g.lineTo(x, y + r * 1.15); g.lineTo(x - r * 1.05, y); g.closePath() }
}

/**
 * Create the scene on `canvas`. Callbacks: `onThrow(shot)` (a dart released on
 * this phone; return false or a promise of false when it was not saved) and
 * `onPhase({ phase, seg, held })` for the status line and the THROW button.
 */
export function createDartsScene(canvas, { onThrow, onPhase } = {}) {
  const ctx = canvas.getContext('2d')
  let W = REF_W
  let H = 420
  let dpr = 1
  let T = readTokens()
  let themeKey = document.documentElement.getAttribute('data-theme') || ''
  let board = null
  let boardKey = ''
  let raf = 0
  let destroyed = false

  const props = { state: null, myUid: null, controls: false, ctrl: 'aim', factor: 1, flip: false, showFinish: true, steady: false }
  const cam = { x: 0, y: 0, z: 1 }
  const camT = { x: 0, y: 0, z: 1 }
  let shake = 0
  let phase = 'idle' // idle | aim | sweepX | sweepY | botaim
  let t0 = 0
  let aim = { x: 0, y: 0 }
  let lock = { x: 0, y: 0 }
  let bot = null
  let pointer = null
  let aimKey = null
  let stuck = [] // { x, y, ang, uid, t, seq }
  let clearAt = 0
  let flights = [] // { seq, x, y, ang, t0, dur, uid, entry, landed, popped, local, born }
  let particles = []
  let popups = []
  let confetti = []
  let flash = null
  let processed = 0
  let lastVisitNo = -1
  let lastLeg = -1
  let lastTurn = null
  let pendingSeq = new Set()
  let camHold = 0

  const vc = () => ({ x: W / 2, y: Math.min(176 * (W / REF_W), H * 0.41) })
  const pxPerMm = () => PX_PER_MM * (W / REF_W)
  const hand = () => ({ x: W / 2, y: H - 88 * Math.min(1.15, H / 420) })
  const reduced = () => isReducedMotion()
  const seatIdx = (uid) => Math.max(0, props.state ? props.state.seats.indexOf(uid) : 0)
  const seatRgb = (uid) => T[['p1', 'p2', 'p3', 'p4'][seatIdx(uid)]]
  const worldToScreen = (x, y) => {
    const k = pxPerMm() * cam.z
    const c = vc()
    return [c.x + (x - cam.x) * k, c.y + (y - cam.y) * k]
  }
  const emitPhase = () => {
    const seg = phase === 'aim' || phase === 'botaim' ? segmentAt(aim.x, aim.y) : null
    onPhase?.({ phase, seg })
  }
  const setPhase = (p) => { phase = p; t0 = performance.now(); emitPhase() }

  function ensureBoard() {
    const k = pxPerMm() * 1.75 * Math.min(dpr, 2.5)
    const key = `${themeKey}|${Math.round(k * 100)}`
    if (key !== boardKey) { board = paintBoard(T, k); boardKey = key }
  }

  function refreshTheme() {
    const key = document.documentElement.getAttribute('data-theme') || ''
    if (key !== themeKey || !board) { themeKey = key; T = readTokens(); boardKey = '' }
  }

  // ---- Throw feel ---------------------------------------------------------
  const wobble = (now) => {
    if (props.ctrl !== 'aim' || phase !== 'aim') return { x: 0, y: 0, r: 0 }
    const t = (now - t0) / 1000
    const r = shakeRadius(t, props.factor, props.steady)
    return { ...shakeOffset(t, r), r }
  }

  function release(x, y, local = true) {
    const state = props.state
    if (!state || !props.myUid || state.turnUid !== props.myUid) { setPhase('idle'); return }
    const shot = toThrow(x + gauss() * SCATTER_MM, y + gauss() * SCATTER_MM)
    const seq = state.count
    if (pendingSeq.has(seq) || flights.some((f) => f.seq === seq)) { setPhase('idle'); return }
    pendingSeq.add(seq)
    startFlight({ seq, x: shot.x / UNIT, y: shot.y / UNIT, uid: props.myUid, entry: null, local })
    setPhase('settle')
    const res = onThrow?.(shot)
    if (res && typeof res.then === 'function') {
      res.then((ok) => { if (ok === false) dropPending(seq) }, () => dropPending(seq))
    } else if (res === false) dropPending(seq)
  }

  function dropPending(seq) {
    pendingSeq.delete(seq)
    const f = flights.find((it) => it.seq === seq && !it.entry)
    if (f) f.born = -Infinity
    const s = stuck.findIndex((d) => d.seq === seq)
    if (s >= 0) stuck.splice(s, 1)
    if (phase === 'settle') setPhase('idle')
  }

  function startFlight({ seq, x, y, uid, entry, local }) {
    const now = performance.now()
    if (clearAt) { stuck = []; clearAt = 0 }
    const dur = reduced() ? FLIGHT_REDUCED_MS : FLIGHT_MS
    flights.push({
      seq, x, y, uid, entry, local, t0: now, dur, born: now, landed: false, popped: false,
      ang: Math.PI / 2 - 0.42 + Math.random() * 0.5,
    })
    camT.z = reduced() ? 1.15 : 1.75
    camT.x = x * 0.86
    camT.y = y * 0.86
    sounds.dartThrow()
  }

  function land(f, now) {
    f.landed = true
    const seg = segmentAt(f.x, f.y)
    stuck.push({ x: f.x, y: f.y, ang: f.ang, uid: f.uid, t: now, seq: f.seq })
    flash = { seg, t0: now }
    camHold = now + 550
    const big = seg.ring === 'T' || seg.ring === 'B'
    shake = reduced() ? 0 : big ? 9 : 5
    if (!reduced()) {
      for (let i = 0; i < 12; i++) {
        particles.push({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 90, t0: now, life: 420 + Math.random() * 200, s: 1.5 + Math.random() * 2, c: [226, 208, 160] })
      }
    }
    if (seg.v) sounds.dartThud(big); else sounds.dartMiss()
    maybePopup(f, now)
  }

  function maybePopup(f, now) {
    if (f.popped || !f.landed || !f.entry) return
    f.popped = true
    const state = props.state
    const mode = state?.cfg.mode ?? 'x01'
    const cap = describeThrow(f.entry, mode)
    const tone = cap.tone === 'bad' ? T.danger : cap.tone === 'good' ? lighten(T.cta, 0.35) : cap.tone === 'miss' ? [185, 192, 180] : [255, 255, 255]
    popups.push({ x: f.x, y: f.y, text: cap.text, sub: cap.sub, big: cap.big, c: tone, t0: now })
    if (f.entry.bust) sounds.bust()
    if (f.entry.legEnd && !f.entry.matchEnd) popups.push({ x: 0, y: -40, text: 'LEG!', sub: null, big: true, c: lighten(T.win, 0.35), t0: now + 200 })
    if (f.entry.matchEnd || f.entry.out) celebrate(now)
  }

  function celebrate(now) {
    if (reduced()) return
    for (let n = 0; n < 70; n++) {
      confetti.push({ x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.45, vx: (Math.random() - 0.5) * 380, vy: -160 - Math.random() * 300, r: 0, vr: (Math.random() - 0.5) * 12, c: lighten(T[['p1', 'p2', 'p3', 'p4'][n % 4]], 0.2), t0: now })
    }
  }

  // ---- Room state → scene -------------------------------------------------
  function sync() {
    const s = props.state
    if (!s) return
    const now = performance.now()
    if (s.count < processed || (lastLeg >= 0 && s.leg < lastLeg)) {
      // A rematch or a new room: nothing from before applies.
      stuck = []; flights = []; particles = []; popups = []; confetti = []; pendingSeq = new Set(); processed = 0; lastVisitNo = -1; lastLeg = -1
    }
    if (processed === 0 && s.count > 0 && lastVisitNo === -1) {
      // Joined or reloaded mid-visit: the darts already in the board are stuck.
      for (const e of s.log) {
        if (e.visitNo === s.visitNo && !e.skip && e.leg === s.leg) {
          stuck.push({ x: e.x / UNIT, y: e.y / UNIT, ang: Math.PI / 2 - 0.2, uid: e.uid, t: 0, seq: e.seq })
        }
      }
      processed = s.count
    }
    for (const e of s.log.slice(processed)) {
      const local = flights.find((f) => f.seq === e.seq)
      if (local) {
        local.entry = e
        pendingSeq.delete(e.seq)
        maybePopup(local, now)
      } else if (e.skip) {
        popups.push({ x: 0, y: -30, text: 'TIMED OUT', sub: 'DARTS MISSED', big: false, c: [185, 192, 180], t0: now })
        sounds.dartMiss()
      } else {
        startFlight({ seq: e.seq, x: e.x / UNIT, y: e.y / UNIT, uid: e.uid, entry: e, local: false })
      }
    }
    processed = s.count
    if (s.visitNo !== lastVisitNo) {
      if (lastVisitNo !== -1 && stuck.length) clearAt = now + PULL_DARTS_MS
      lastVisitNo = s.visitNo
    }
    if (s.leg !== lastLeg) {
      if (lastLeg !== -1) clearAt = now + PULL_DARTS_MS * 1.5
      lastLeg = s.leg
    }
    if (s.turnUid !== lastTurn) {
      lastTurn = s.turnUid
      if (phase !== 'idle' && phase !== 'settle') setPhase('idle')
      aim = { x: aim.x * 0.5, y: aim.y * 0.5 }
    }
    if (s.over && !confetti.length && processed > 0) celebrate(now)
  }

  // ---- Frame --------------------------------------------------------------
  function update(now, dt) {
    for (const f of flights) {
      if (!f.landed && now - f.t0 >= f.dur) land(f, now)
      if (!f.entry && !f.popped && now - f.born > PENDING_TIMEOUT_MS && f.landed) { f.popped = true }
    }
    flights = flights.filter((f) => !(f.landed && (f.popped || now - f.t0 > f.dur + 2500)) && f.born !== -Infinity)
    if (clearAt && now >= clearAt) { stuck = []; clearAt = 0 }
    if (phase === 'settle' && !flights.some((f) => !f.landed) && now - t0 > 250) {
      // The flight is done; back to idle (the next dart, or another seat's turn).
      setPhase('idle')
    }
    if (phase === 'sweepX') lock.x = sweepAt((now - t0) / 1000, 'x', props.factor)
    if (phase === 'sweepY') lock.y = sweepAt((now - t0) / 1000, 'y', props.factor)
    if (phase === 'botaim' && bot) {
      const e = Math.min(1, (now - t0) / bot.ms)
      const sm = e * e * (3 - 2 * e)
      aim = { x: bot.from.x + (bot.to.x - bot.from.x) * sm, y: bot.from.y + (bot.to.y - bot.from.y) * sm }
      if (e >= 1) { const b = bot; bot = null; b.done(); }
    }
    const zAim = reduced() ? 1.15 : 1.5
    if (phase === 'aim' || phase === 'botaim') { camT.z = zAim; camT.x = aim.x * 0.72; camT.y = aim.y * 0.72 }
    else if (!flights.some((f) => !f.landed) && now >= camHold) { camT.z = 1; camT.x = 0; camT.y = 0 }
    const f = 1 - Math.exp(-dt * (reduced() ? 30 : 7.5))
    cam.x += (camT.x - cam.x) * f
    cam.y += (camT.y - cam.y) * f
    cam.z += (camT.z - cam.z) * f
    shake *= Math.exp(-dt * 14)
    if (shake < 0.1) shake = 0
  }

  function drawDart(x, y, ang, L, colour, alpha = 1) {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.save(); ctx.translate(x + L * 0.1, y + L * 0.14); ctx.rotate(ang + 0.12); paintDart(ctx, L, colour, true); ctx.restore()
    ctx.translate(x, y); ctx.rotate(ang); paintDart(ctx, L, colour, false)
    ctx.restore()
  }

  function drawWedge(i, r0, r1) { wedge(ctx, i, r0, r1) }

  function drawOverlays(now) {
    const s = props.state
    if (!s) return
    const pulse = 0.5 + 0.5 * Math.sin(now / 170)
    if (s.cfg.mode === 'turf') {
      s.turf.forEach((t, i) => {
        if (!t) return
        const colour = seatRgb(t.owner)
        ctx.fillStyle = rgb(colour, 0.5)
        drawWedge(i, RADII.outerBull, RADII.doubleOut); ctx.fill()
        const a = (i * TAU) / 20
        seatShape(ctx, seatIdx(t.owner), Math.sin(a) * 132, -Math.cos(a) * 132, 7)
        ctx.fillStyle = rgb(lighten(colour, 0.25)); ctx.fill()
        ctx.strokeStyle = rgb([255, 255, 255]); ctx.lineWidth = 1.6; ctx.stroke()
        if (t.lock) {
          ctx.strokeStyle = rgb(lighten(T.cta, 0.2)); ctx.lineWidth = 5
          const a0 = -Math.PI / 2 + (i - 0.5) * (TAU / 20)
          ctx.beginPath(); ctx.arc(0, 0, RADII.doubleOut + 5, a0 + 0.03, a0 + TAU / 20 - 0.03); ctx.stroke()
        }
      })
    } else if (!s.over && s.phase === 'main' && props.showFinish && s.dartsLeft > 0 && s.turnUid) {
      ctx.fillStyle = rgb(lum(T.cta) > 110 ? T.cta : [255, 214, 90], 0.3 + pulse * 0.45)
      for (const f of finishSegments(s.scores[s.turnUid])) {
        if (f.ring === 'B') { ctx.beginPath(); ctx.arc(0, 0, RADII.bull, 0, TAU); ctx.fill() }
        else if (f.ring === 'O') { ctx.beginPath(); ctx.arc(0, 0, RADII.outerBull, 0, TAU); ctx.arc(0, 0, RADII.bull, 0, TAU, true); ctx.fill() }
        else if (f.ring === 'T') { drawWedge(f.idx, RADII.trebleIn, RADII.trebleOut); ctx.fill() }
        else if (f.ring === 'D') { drawWedge(f.idx, RADII.doubleIn, RADII.doubleOut); ctx.fill() }
        else { drawWedge(f.idx, RADII.trebleOut, RADII.doubleIn); ctx.fill(); drawWedge(f.idx, RADII.outerBull, RADII.trebleIn); ctx.fill() }
      }
    }
    if (s.phase === 'shoot') {
      ctx.strokeStyle = rgb(lighten(T.cta, 0.3), 0.4 + pulse * 0.5); ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(0, 0, RADII.outerBull + 6, 0, TAU); ctx.stroke()
    }
    if (flash && now - flash.t0 < 420) {
      const a = 1 - (now - flash.t0) / 420
      ctx.fillStyle = `rgba(255,255,255,${a * 0.55})`
      const g = flash.seg
      if (g.ring === 'B') { ctx.beginPath(); ctx.arc(0, 0, RADII.bull, 0, TAU); ctx.fill() }
      else if (g.ring === 'O') { ctx.beginPath(); ctx.arc(0, 0, RADII.outerBull, 0, TAU); ctx.fill() }
      else if (g.ring === 'T') { drawWedge(g.idx, RADII.trebleIn, RADII.trebleOut); ctx.fill() }
      else if (g.ring === 'D') { drawWedge(g.idx, RADII.doubleIn, RADII.doubleOut); ctx.fill() }
      else if (g.ring === 'S') { drawWedge(g.idx, RADII.outerBull, RADII.doubleOut); ctx.fill() }
    }
  }

  function cross(x, y) {
    ctx.beginPath()
    ctx.moveTo(x - 11, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 11, y)
    ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 11)
    ctx.stroke()
  }

  function drawReticle(now, wob) {
    const s = props.state
    if (!s || !s.turnUid) return
    const colour = seatRgb(s.turnUid)
    const k = pxPerMm() * cam.z
    if (phase === 'aim' || phase === 'botaim') {
      const [x, y] = worldToScreen(aim.x + wob.x, aim.y + wob.y)
      const [ax, ay] = worldToScreen(aim.x, aim.y)
      if (phase === 'aim') {
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4])
        ctx.beginPath(); ctx.arc(ax, ay, Math.max(3, 30 * 0.26 * k), 0, TAU); ctx.stroke(); ctx.setLineDash([])
        ctx.strokeStyle = rgb(lighten(colour, 0.35), 0.95); ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(ax, ay, Math.max(4, wob.r * k), 0, TAU); ctx.stroke()
      }
      ctx.strokeStyle = rgb(INK, 0.9); ctx.lineWidth = 4; cross(x, y)
      ctx.strokeStyle = 'rgb(255,255,255)'; ctx.lineWidth = 2; cross(x, y)
      ctx.fillStyle = rgb(lighten(colour, 0.3)); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill()
    } else if (phase === 'sweepX' || phase === 'sweepY') {
      const c = vc()
      const [sx] = worldToScreen(lock.x, 0)
      const [, sy] = worldToScreen(0, lock.y)
      const span = 185 * k
      ctx.strokeStyle = rgb(INK, 0.8); ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(sx, c.y - span); ctx.lineTo(sx, c.y + span); ctx.stroke()
      ctx.strokeStyle = phase === 'sweepX' ? 'rgb(255,255,255)' : rgb(lighten(colour, 0.4)); ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(sx, c.y - span); ctx.lineTo(sx, c.y + span); ctx.stroke()
      if (phase === 'sweepY') {
        ctx.strokeStyle = rgb(INK, 0.8); ctx.lineWidth = 5
        ctx.beginPath(); ctx.moveTo(c.x - span, sy); ctx.lineTo(c.x + span, sy); ctx.stroke()
        ctx.strokeStyle = 'rgb(255,255,255)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(c.x - span, sy); ctx.lineTo(c.x + span, sy); ctx.stroke()
        ctx.fillStyle = rgb(lighten(colour, 0.3)); ctx.beginPath(); ctx.arc(sx, sy, 4, 0, TAU); ctx.fill()
      }
    }
  }

  function drawHand(now, wob) {
    const s = props.state
    if (!s || s.over || !s.turnUid) return
    const colour = seatRgb(s.turnUid)
    const h = hand()
    const inFlight = flights.some((f) => !f.landed)
    const spare = Math.max(0, s.dartsLeft - (inFlight || phase === 'settle' ? 0 : 1))
    for (let i = 0; i < spare; i++) drawDart(W - 30 - i * 18, H - 62, Math.PI / 2 - 0.08 + i * 0.05, 58, colour, 0.9)
    if (inFlight || phase === 'settle') return
    const bob = Math.sin(now / 420) * 2
    drawDart(h.x + wob.x * 0.5, h.y + bob + wob.y * 0.5 - (phase === 'aim' ? 8 : 0), Math.PI / 2 + wob.x * 0.004, 124, colour)
  }

  function drawFlights(now) {
    const h = hand()
    for (const f of flights) {
      if (f.landed) continue
      const t = Math.min(1, (now - f.t0) / f.dur)
      const e = 1 - (1 - t) ** 1.6
      const [ex, ey] = worldToScreen(f.x, f.y)
      const colour = seatRgb(f.uid)
      const pos = (u) => {
        const ee = 1 - (1 - u) ** 1.6
        return [h.x + (ex - h.x) * ee, h.y + (ey - h.y) * ee - Math.sin(Math.PI * u) * 46, ee]
      }
      const toL = 46 * Math.sqrt(cam.z)
      for (let i = 3; i >= 1; i--) {
        const [px, py, ee] = pos(Math.max(0, t - i * 0.05))
        drawDart(px, py, Math.PI / 2 + (f.ang - Math.PI / 2) * ee, 124 + (toL - 124) * ee, colour, 0.1)
      }
      drawDart(h.x + (ex - h.x) * e, h.y + (ey - h.y) * e - Math.sin(Math.PI * t) * 46, Math.PI / 2 + (f.ang - Math.PI / 2) * e, 124 + (toL - 124) * e, colour)
    }
  }

  function render(now, dt) {
    refreshTheme()
    ensureBoard()
    update(now, dt)
    const wob = wobble(now)
    const c = vc()
    const light = lum(T.bg) > 140
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Wall and spotlight.
    let gr = ctx.createRadialGradient(c.x - cam.x * 4, c.y - 70, 30, c.x, c.y, 360 * (W / REF_W))
    gr.addColorStop(0, rgb(lighten(T.surface, light ? 0.5 : 0.1)))
    gr.addColorStop(0.5, rgb(T.deep))
    gr.addColorStop(1, rgb(mix(T.bg, [0, 0, 0], light ? 0.3 : 0.55)))
    ctx.fillStyle = gr
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 0.06
    ctx.fillStyle = rgb(T.text)
    for (let x = -20 - ((cam.x * 0.2) % 29); x < W; x += 29) ctx.fillRect(x, 0, 1.5, H)
    ctx.globalAlpha = 1

    // The board, in millimetres.
    const k = pxPerMm() * cam.z
    const ox = c.x - cam.x * k + (Math.random() - 0.5) * shake
    const oy = c.y - cam.y * k + (Math.random() - 0.5) * shake
    ctx.save()
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy)
    ctx.fillStyle = 'rgba(0,0,0,.45)'
    ctx.beginPath(); ctx.arc(10, 18, RADII.edge + 26, 0, TAU); ctx.fill()
    ctx.drawImage(board.canvas, -board.half, -board.half, board.half * 2, board.half * 2)
    drawOverlays(now)
    ctx.restore()

    // Stuck darts in screen space so their size stays readable.
    const L = 46 * Math.sqrt(cam.z)
    for (const d of stuck) {
      const [x, y] = worldToScreen(d.x, d.y)
      const jolt = d.t ? Math.sin((now - d.t) / 28) * Math.exp(-(now - d.t) / 120) * 0.09 : 0
      drawDart(x, y, d.ang + jolt, L, seatRgb(d.uid))
    }
    drawReticle(now, wob)
    drawFlights(now)

    particles = particles.filter((p) => now - p.t0 < p.life)
    for (const p of particles) {
      const a = 1 - (now - p.t0) / p.life
      const t = (now - p.t0) / 1000
      const [x, y] = worldToScreen(p.x, p.y)
      ctx.fillStyle = rgb(p.c, a)
      ctx.fillRect(x + p.vx * t, y + p.vy * t + 60 * t * t, p.s, p.s)
    }

    // Vignette, then the hand and its spare darts over it.
    gr = ctx.createRadialGradient(c.x, c.y, 150 * (W / REF_W), c.x, c.y, 330 * (W / REF_W))
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(1, light ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.6)')
    ctx.fillStyle = gr
    ctx.fillRect(0, 0, W, H)
    drawHand(now, wob)

    // Popups.
    popups = popups.filter((p) => now - p.t0 < 1100)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const p of popups) {
      const t = Math.max(0, (now - p.t0) / 1100)
      const [x, y] = worldToScreen(p.x, p.y)
      const sc = t < 0.12 ? 0.6 + (t / 0.12) * 0.5 : 1.1 - Math.min(0.1, t - 0.12)
      ctx.save()
      ctx.translate(Math.max(50, Math.min(W - 50, x)), Math.max(26, y - 28 - t * 26))
      ctx.scale(sc, sc)
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1
      ctx.font = `${p.big ? 17 : 12}px "Press Start 2P", monospace`
      ctx.lineWidth = 5; ctx.strokeStyle = rgb(INK, 0.92); ctx.lineJoin = 'round'
      ctx.strokeText(p.text, 0, 0)
      ctx.fillStyle = rgb(p.c)
      ctx.fillText(p.text, 0, 0)
      if (p.sub) {
        ctx.font = '8px "Press Start 2P", monospace'
        ctx.strokeText(p.sub, 0, 18)
        ctx.fillStyle = 'rgb(244,241,228)'
        ctx.fillText(p.sub, 0, 18)
      }
      ctx.restore()
    }
    // Confetti.
    for (const q of confetti) {
      q.y += q.vy * dt; q.x += q.vx * dt; q.vy += 260 * dt; q.r += q.vr * dt
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.fillStyle = rgb(q.c); ctx.fillRect(-3, -2, 6, 4); ctx.restore()
    }
    confetti = confetti.filter((q) => q.y < H + 20)
  }

  let last = 0
  const frame = (now) => {
    if (destroyed) return
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
    last = now
    render(performance.now(), dt)
    raf = requestAnimationFrame(frame)
  }

  // ---- Input --------------------------------------------------------------
  const canThrow = () => !!props.controls && !!props.state && !props.state.over && props.state.turnUid === props.myUid
  const toCanvas = (e) => {
    const rect = canvas.getBoundingClientRect()
    const sc = W / (rect.width || W)
    let px = (e.clientX - rect.left) * sc
    let py = (e.clientY - rect.top) * sc
    if (props.flip) { px = W - px; py = H - py }
    return { px, py, sc }
  }

  function onDown(e) {
    e.preventDefault()
    if (!canThrow() || props.ctrl !== 'aim' || phase !== 'idle') return
    try { canvas.setPointerCapture(e.pointerId) } catch { /* the pointer is already gone */ }
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }
    const { px, py } = toCanvas(e)
    const k = pxPerMm() * cam.z
    const c = vc()
    aim = aimStart({ x: cam.x + (px - c.x) / k, y: cam.y + (py - c.y) / k })
    aimKey = null
    setPhase('aim')
  }
  function onMove(e) {
    if (!pointer || e.pointerId !== pointer.id || phase !== 'aim') return
    const flip = props.flip ? -1 : 1
    const { sc } = toCanvas(e)
    const g = (1.15 * sc) / (pxPerMm() * cam.z)
    aim = clampAim({ x: aim.x + (e.clientX - pointer.x) * g * flip, y: aim.y + (e.clientY - pointer.y) * g * flip })
    pointer.x = e.clientX
    pointer.y = e.clientY
    const seg = segmentAt(aim.x, aim.y)
    if (seg.key !== aimKey) { aimKey = seg.key; emitPhase() }
  }
  function onUp(e) {
    if (!pointer || e.pointerId !== pointer.id) return
    pointer = null
    if (phase !== 'aim') return
    if (e.type === 'pointercancel') { setPhase('idle'); return }
    if (performance.now() - t0 < MIN_HOLD_MS) { setPhase('idle'); onPhase?.({ phase: 'idle', seg: null, tooShort: true }); return }
    const w = wobble(performance.now())
    release(aim.x + w.x, aim.y + w.y)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  const onTheme = new MutationObserver(() => { boardKey = '' })
  onTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  raf = requestAnimationFrame(frame)

  return {
    /** Latest props from the page: { state, myUid, controls, ctrl, factor, flip, showFinish, steady }. */
    update(next) {
      const prevState = props.state
      Object.assign(props, next)
      if (props.state !== prevState) sync()
      if (!canThrow() && (phase === 'aim' || phase === 'sweepX' || phase === 'sweepY')) { pointer = null; setPhase('idle') }
    },
    resize(w, h, ratio = globalThis.devicePixelRatio || 1) {
      W = Math.max(200, Math.round(w))
      H = Math.max(260, Math.round(h))
      dpr = Math.min(3, canvasPixelRatio(ratio) || 1)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      boardKey = ''
    },
    /** One-button throw: start the sweep, lock across, then lock down and throw. */
    press() {
      if (!canThrow() || props.ctrl !== 'one') return phase
      if (phase === 'idle') { lock = { x: 0, y: 0 }; setPhase('sweepX') }
      else if (phase === 'sweepX') setPhase('sweepY')
      else if (phase === 'sweepY') release(lock.x, lock.y)
      return phase
    },
    /** Slide the crosshair to `target` (mm) over `ms`, then throw `shot` (stored form). */
    aimThenThrow(target, shot, ms = 750) {
      return new Promise((resolve) => {
        if (!props.state || props.state.over) { resolve(false); return }
        bot = {
          from: { ...aim }, to: target, ms,
          done: () => {
            setPhase('settle')
            const seq = props.state.count
            pendingSeq.add(seq)
            startFlight({ seq, x: shot.x / UNIT, y: shot.y / UNIT, uid: props.state.turnUid, entry: null, local: true })
            Promise.resolve(onThrow?.(shot)).then((ok) => { if (ok === false) dropPending(seq); resolve(ok !== false) }, () => { dropPending(seq); resolve(false) })
          },
        }
        setPhase('botaim')
      })
    },
    cancelBot() { bot = null; if (phase === 'botaim') setPhase('idle') },
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      onTheme.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    },
    get phase() { return phase },
  }
}
