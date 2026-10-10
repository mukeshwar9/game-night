// Canvas drawing for LAZY SUSAN (rendering only — no rules; those live in
// lib/lazySusanLogic.js). The table, plate, food and chopsticks are shaded
// and animated on one 360×640 canvas; every colour comes from the player's
// theme tokens through lib/lazySusanTheme.js, re-derived when the theme or
// font changes. The drawer owns the short-lived effects (jabs, crumbs, score
// pops, banners) and turns the round's log into them.
import { TUNING, gateHot, seatAnglesFor } from '../lib/lazySusanLogic'
import { derivePalette, readTokens } from '../lib/lazySusanTheme'
import { canvasPixelRatio } from '../lib/platform'

export const W = 360
export const H = 640
const CX = 180
const CY = 320
const RT = 92   // radius the food rides at
const RP = 132  // plate radius
const RH = 34   // hub radius
const TAU = Math.PI * 2

/** Where each seat's score card sits ([x, y, rotation°]) for 2, 3 and 4 players. */
export const HUD = {
  2: [[74, 612, 0], [286, 28, 180]],
  3: [[74, 612, 0], [296, 28, 180], [64, 28, 180]],
  4: [[64, 612, 0], [296, 612, 0], [296, 28, 180], [64, 28, 180]],
}

/** Which seat a point on the canvas belongs to when several people share the phone. */
export function seatAtPoint(n, x, y) {
  if (n === 2) return y > CY ? 0 : 1
  if (n === 3) return y > CY ? 0 : (x > CX ? 1 : 2)
  return y > CY ? (x < CX ? 0 : 1) : (x > CX ? 2 : 3)
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const easeOut = (t) => 1 - (1 - t) * (1 - t)
const backOut = (t) => { const c = 1.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u }

export function createDrawer(canvas) {
  const ctx = canvas.getContext('2d')
  let pal = derivePalette(readTokens())
  let FONT = '"Press Start 2P", ui-monospace, monospace'
  let bg = null
  let n = 2
  let angles = seatAnglesFor(2)
  let reduced = false
  let flip = false
  let upright = false // one viewer: every card reads the right way up

  const fx = { parts: [], pops: [], fly: [], banner: null, shake: 0, time: 0 }
  let seatFx = []
  const seen = new Set()
  let primed = false
  let prevPlate = 0
  let prevRush = false
  let prevPhase = ''
  let prevCount = 99

  const P = (k) => pal.P[k]
  const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a == null ? 1 : a})`
  const col = (k, a) => rgb(P(k), a)
  const seatColor = (i) => pal.seats[i % 4]

  function resize() {
    const dpr = Math.min(3, canvasPixelRatio())
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function makeBackground() {
    bg = document.createElement('canvas')
    bg.width = W * 2
    bg.height = H * 2
    const b = bg.getContext('2d')
    b.scale(2, 2)
    const g = b.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, col('tableA')); g.addColorStop(0.55, col('tableB')); g.addColorStop(1, col('tableC'))
    b.fillStyle = g; b.fillRect(0, 0, W, H)
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let px = 0; px < W; px += 72) {            // planks
      b.fillStyle = rgb(P('grain'), 0.03 + rnd() * 0.07); b.fillRect(px, 0, 72, H)
      b.fillStyle = col('grain', 0.28); b.fillRect(px, 0, 1, H)
      b.fillStyle = col('lampHi', 0.3); b.fillRect(px + 1, 0, 1, H)
    }
    for (let i = 0; i < 150; i++) {                 // grain
      const x = rnd() * W
      const y = rnd() * H
      const len = 40 + rnd() * 160
      const wob = (rnd() - 0.5) * 7
      b.strokeStyle = rgb(P('grain'), 0.04 + rnd() * 0.1); b.lineWidth = 0.5 + rnd() * 0.9
      b.beginPath(); b.moveTo(x, y); b.bezierCurveTo(x + wob, y + len * 0.33, x - wob, y + len * 0.66, x + wob * 0.4, y + len); b.stroke()
    }
    for (let k = 0; k < 5; k++) {                   // knots
      const kx = rnd() * W
      const ky = rnd() * H
      for (let r = 9; r > 1; r -= 2) {
        b.strokeStyle = rgb(P('grain'), 0.06 + (9 - r) * 0.02); b.lineWidth = 0.8
        b.beginPath(); b.ellipse(kx, ky, r * 0.7, r * 1.5, 0, 0, TAU); b.stroke()
      }
    }
    const v = b.createRadialGradient(CX - 50, CY - 120, 80, CX, CY, 430)   // a warm lamp, top left
    v.addColorStop(0, col('lampHi', 0.3)); v.addColorStop(0.5, col('lampHi', 0)); v.addColorStop(1, col('shadow', 0.34))
    b.fillStyle = v; b.fillRect(0, 0, W, H)
  }

  function setTheme(tokens = readTokens()) {
    pal = derivePalette(tokens)
    try {
      const f = getComputedStyle(document.documentElement).getPropertyValue('--font-pixel').trim()
      if (f) FONT = `${f}, ui-monospace, monospace`
    } catch { /* keep the default face */ }
    makeBackground()
  }

  function setLayout(players, opts = {}) {
    n = players
    angles = seatAnglesFor(players)
    flip = !!opts.flip
    reduced = !!opts.reduced
    seatFx = angles.map(() => ({ jab: -1, hit: false, flash: 0, pop: 0, shown: 0, jabAt: -9 }))
  }

  const station = (i, r) => [CX + Math.cos(angles[i]) * r, CY + Math.sin(angles[i]) * r]
  const hudRot = (i) => (upright ? (flip ? 180 : 0) : HUD[n][i][2])

  function burst(x, y, count, color, kind, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU
      const v = (0.4 + Math.random()) * (speed || 70)
      fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.4, size: 1.5 + Math.random() * 2.5, color, kind })
    }
  }

  function jab(i, hit) {
    const s = seatFx[i]
    if (!s) return
    s.jab = 0
    s.hit = !!hit
    s.jabAt = fx.time
  }

  function pop(i, text, color, big) {
    const p = station(i, RT + 46)
    fx.pops.push({ x: p[0], y: p[1], text, color, t: 0, rot: hudRot(i), big: !!big })
  }

  function banner(text, color) { fx.banner = { text, t: 0, color } }

  /** Turns log entries not seen before into effects; returns them for sounds. */
  function consume(log) {
    if (!primed) {
      log.forEach((e) => seen.add(e.key))
      primed = true
      return []
    }
    const fresh = []
    for (const e of log) {
      if (seen.has(e.key)) continue
      seen.add(e.key)
      fresh.push(e)
      const i = e.seat
      if (i < 0 || i >= n) continue
      const st = station(i, RT)
      const s = seatFx[i]
      const fromTouch = fx.time - s.jabAt < 0.25
      if (e.kind === 'eat') {
        if (!fromTouch) jab(i, true)
        s.pop = 1
        pop(i, `+${e.delta}`, e.gold ? pal.gold : seatColor(i), e.delta > 1)
        burst(st[0], st[1], e.gold ? 18 : 8, e.gold ? P('goldHi') : P('fB'), e.gold ? 'star' : 'crumb', 80)
        fx.fly.push({ type: e.piece, gold: e.gold, seat: i, t: 0 })
      } else if (e.kind === 'hot') {
        if (!fromTouch) jab(i, true)
        s.flash = 1
        fx.shake = Math.max(fx.shake, 0.8)
        pop(i, e.delta < 0 ? `HOT! ${e.delta}` : 'HOT!', pal.danger, true)
        burst(st[0], st[1], 14, P('chA'), 'fire', 90)
        fx.fly.push({ type: 'chili', gold: false, seat: i, t: 0 })
      } else {
        if (!fromTouch) jab(i, false)
        s.flash = 1
        fx.shake = Math.max(fx.shake, 0.5)
        pop(i, e.delta < 0 ? String(e.delta) : 'MISS', pal.danger, false)
        burst(st[0], st[1], 6, P('grain'), 'spark', 60)
      }
    }
    return fresh
  }

  /** A claim that lost the race: say so, no penalty. */
  function taken(i) { pop(i, 'TAKEN', pal.ink, false) }

  // ─── Update ───────────────────────────────────────────────────────────────

  function update(dt, view, model) {
    fx.time += dt
    const stunned = model.stunned ?? []
    seatFx.forEach((s, i) => {
      if (s.jab >= 0) { s.jab += dt; if (s.jab > 0.32) s.jab = -1 }
      s.flash = Math.max(0, s.flash - dt * 2.6)
      s.pop = Math.max(0, s.pop - dt * 4)
      s.shown += ((model.scores[i] ?? 0) - s.shown) * Math.min(1, dt * 12)
      if (stunned[i] && Math.random() < dt * 22) {
        const p = station(i, RT + 70)
        fx.parts.push({ x: p[0] + (Math.random() - 0.5) * 20, y: p[1], vx: (Math.random() - 0.5) * 14, vy: -26, life: 0, max: 0.8, size: 5, color: P('hi'), kind: 'steam' })
      }
    })
    fx.fly = fx.fly.filter((f) => { f.t += dt; return f.t < 0.3 })
    fx.parts = fx.parts.filter((p) => {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt
      if (p.kind === 'conf') p.vy += 420 * dt
      else if (p.kind !== 'steam') { p.vx *= 0.94; p.vy *= 0.94 }
      return p.life < p.max
    })
    fx.pops = fx.pops.filter((p) => { p.t += dt; return p.t < 0.9 })
    if (fx.banner) { fx.banner.t += dt; if (fx.banner.t > 1.5) fx.banner = null }
    fx.shake = Math.max(0, fx.shake - dt * 3)
  }

  /** Plate-level moments every client sees the same way: new plate, rush, win. */
  function moments(view, model) {
    const out = []
    if (view.plate !== prevPlate) {
      if (prevPlate > 0 && view.plate > prevPlate && model.twists?.turn) { banner('THE TURN', pal.ink); out.push('turn') }
      prevPlate = view.plate
    }
    if (view.rush && !prevRush) { banner('LAST BITE x2', pal.gold); out.push('last') }
    prevRush = view.rush
    if (view.phase === 'count') {
      const c = Math.ceil(view.count - 0.2)
      if (c < prevCount && c >= 1 && c <= 3) out.push(`tick${c}`)
      if (c < 1 && prevCount >= 1) out.push('go')
      prevCount = c
    }
    if (view.phase === 'over' && prevPhase !== 'over' && model.winnerSeat >= 0) {
      const ws = model.winnerSeat
      for (let k = 0; k < 60; k++) {
        fx.parts.push({
          x: CX + (Math.random() - 0.5) * 200, y: CY - 40 + (Math.random() - 0.5) * 60,
          vx: (Math.random() - 0.5) * 240, vy: -80 - Math.random() * 220, life: 0, max: 1.4 + Math.random(),
          size: 3 + Math.random() * 3, color: Math.random() < 0.6 ? seatColor(ws) : P('goldHi'), kind: 'conf',
        })
      }
      out.push('win')
    }
    prevPhase = view.phase
    return out
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  function drawPlate(view) {
    ctx.save(); ctx.translate(CX + 7, CY + 12)      // contact shadow
    const sh = ctx.createRadialGradient(0, 0, RP - 12, 0, 0, RP + 30)
    sh.addColorStop(0, col('shadow', 0.5)); sh.addColorStop(1, col('shadow', 0))
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, RP + 30, 0, TAU); ctx.fill(); ctx.restore()

    ctx.save(); ctx.translate(CX, CY)
    const wd = ctx.createRadialGradient(-40, -50, 20, 0, 0, RP + 12)   // the turntable's wooden base
    wd.addColorStop(0, col('baseA')); wd.addColorStop(1, col('baseB'))
    ctx.fillStyle = wd; ctx.beginPath(); ctx.arc(0, 0, RP + 11, 0, TAU); ctx.fill()
    ctx.save(); ctx.rotate(view.th)
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = col('shadow', 0.3); ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.arc(0, 0, RP + 2 + i, i * 0.7, i * 0.7 + 1.2 + (i % 3) * 0.5); ctx.stroke()
    }
    ctx.restore()
    ctx.strokeStyle = col('lampHi', 0.4); ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(0, 0, RP + 10, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke()

    const pc = ctx.createRadialGradient(-26, -34, 10, 0, 0, RP)         // porcelain
    pc.addColorStop(0, col('pl0')); pc.addColorStop(0.62, col('pl1')); pc.addColorStop(0.9, col('pl2')); pc.addColorStop(1, col('pl3'))
    ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, RP, 0, TAU); ctx.fill()
    ctx.save(); ctx.rotate(view.th)                                      // the painted rim turns with the plate
    ctx.strokeStyle = col('paintA', 0.6); ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(0, 0, RP - 6, 0, TAU); ctx.stroke()
    for (let k = 0; k < 16; k++) {
      ctx.save(); ctx.rotate((k * TAU) / 16); ctx.translate(0, -(RP - 14))
      ctx.fillStyle = k % 4 === 0 ? col('paintB', 0.55) : col('paintA', 0.5)
      ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 2, 0.5, 0, TAU); ctx.fill(); ctx.restore()
    }
    ctx.strokeStyle = col('paintA', 0.22); ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(0, 0, RT + 26, 0, TAU); ctx.stroke()
    ctx.restore()
    const well = ctx.createRadialGradient(0, 0, RH + 4, 0, 0, RT + 24)   // the shallow well the food rides in
    well.addColorStop(0, col('well', 0.16)); well.addColorStop(0.25, col('well', 0)); well.addColorStop(0.85, col('well', 0)); well.addColorStop(1, col('well', 0.2))
    ctx.fillStyle = well; ctx.beginPath(); ctx.arc(0, 0, RT + 24, 0, TAU); ctx.fill()
    ctx.restore()
  }

  function drawGates(view, model) {
    angles.forEach((ang, i) => {
      const hot = gateHot(view, ang)
      const away = model.online?.[i] === false
      ctx.save(); ctx.translate(CX, CY)
      ctx.strokeStyle = rgb(seatColor(i), away ? 0.06 : hot ? 0.42 : 0.17); ctx.lineWidth = 46; ctx.lineCap = 'butt'
      ctx.beginPath(); ctx.arc(0, 0, RT, ang - TUNING.window, ang + TUNING.window); ctx.stroke()
      ctx.strokeStyle = rgb(seatColor(i), away ? 0.3 : 0.9); ctx.lineWidth = 2.5
      ;[-1, 1].forEach((e) => {
        const a = ang + e * TUNING.window
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * (RT - 23), Math.sin(a) * (RT - 23)); ctx.lineTo(Math.cos(a) * (RT + 23), Math.sin(a) * (RT + 23)); ctx.stroke()
      })
      ctx.restore()
    })
  }

  function drawHub(view) {
    ctx.save(); ctx.translate(CX, CY)
    ctx.fillStyle = col('shadow', 0.25); ctx.beginPath(); ctx.arc(3, 5, RH + 2, 0, TAU); ctx.fill()
    const rim = ctx.createRadialGradient(-10, -12, 4, 0, 0, RH)
    rim.addColorStop(0, col('pl0')); rim.addColorStop(1, col('pl3'))
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, RH, 0, TAU); ctx.fill()
    const soy = ctx.createRadialGradient(-8, -10, 2, 0, 0, RH - 6)
    soy.addColorStop(0, col('soyA')); soy.addColorStop(0.5, col('soyB')); soy.addColorStop(1, col('soyC'))
    ctx.fillStyle = soy; ctx.beginPath(); ctx.arc(0, 0, RH - 6, 0, TAU); ctx.fill()
    ctx.strokeStyle = col('hi', 0.55); ctx.lineWidth = 2.2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.arc(0, 0, RH - 11, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke()
    ctx.fillStyle = col('hi', 0.5); ctx.beginPath(); ctx.arc(-13, -3, 1.6, 0, TAU); ctx.fill()
    // three chevrons on the hub rim show which way the plate is turning
    const dir = view.cur >= 0 ? 1 : -1
    const strength = clamp(Math.abs(view.cur) / 1.2, 0, 1)
    ctx.rotate(view.th)
    ctx.strokeStyle = rgb(pal.ink, 0.25 + 0.5 * strength); ctx.lineWidth = 2.4; ctx.lineJoin = 'round'
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.rotate((i * TAU) / 3); ctx.translate(0, -(RH + 9)); ctx.scale(dir, 1)
      ctx.beginPath(); ctx.moveTo(-4, -4.5); ctx.lineTo(3, 0); ctx.lineTo(-4, 4.5); ctx.stroke(); ctx.restore()
    }
    ctx.restore()
  }

  function shapeDumpling() {
    const g = ctx.createLinearGradient(0, -12, 0, 12)
    g.addColorStop(0, col('fA')); g.addColorStop(0.55, col('fB')); g.addColorStop(1, col('fC'))
    ctx.fillStyle = g; ctx.strokeStyle = col('fLine', 0.55); ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-18, 5); ctx.bezierCurveTo(-18, -12, 18, -12, 18, 5); ctx.bezierCurveTo(10, 11, -10, 11, -18, 5); ctx.closePath(); ctx.fill(); ctx.stroke()
    const sear = ctx.createLinearGradient(0, 3, 0, 11)                  // the pan-fried underside
    sear.addColorStop(0, col('sear', 0)); sear.addColorStop(1, col('sear', 0.75))
    ctx.fillStyle = sear; ctx.beginPath(); ctx.moveTo(-18, 5); ctx.bezierCurveTo(-10, 11, 10, 11, 18, 5); ctx.bezierCurveTo(10, 7, -10, 7, -18, 5); ctx.fill()
    ctx.strokeStyle = col('fLine', 0.6); ctx.lineWidth = 0.9           // pleats
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 4.2, -7.6 + Math.abs(i) * 0.9); ctx.quadraticCurveTo(i * 4.2 + 2.4, -4, i * 4.4 + 1, -1.5); ctx.stroke() }
    ctx.strokeStyle = col('hi', 0.85); ctx.lineWidth = 1.6; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-11, -1); ctx.quadraticCurveTo(-4, -6, 4, -5); ctx.stroke()
  }
  function shapeBun() {
    ctx.fillStyle = col('steam'); ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill()          // bamboo steamer ring
    ctx.strokeStyle = col('fLine', 0.8); ctx.lineWidth = 1; ctx.stroke()
    ctx.strokeStyle = col('hi', 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 18, Math.PI, Math.PI * 1.6); ctx.stroke()
    ctx.fillStyle = col('fB'); ctx.beginPath(); ctx.arc(0, 0, 16.5, 0, TAU); ctx.fill()
    const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, 15)
    g.addColorStop(0, col('bunA')); g.addColorStop(0.7, col('bunB')); g.addColorStop(1, col('bunC'))
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14.5, 0, TAU); ctx.fill()
    ctx.strokeStyle = col('fLine', 0.5); ctx.lineWidth = 0.9                              // twisted top
    for (let i = 0; i < 7; i++) { ctx.save(); ctx.rotate((i * TAU) / 7); ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.quadraticCurveTo(5, -5, 3.5, -10.5); ctx.stroke(); ctx.restore() }
    ctx.fillStyle = col('danger'); ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill()
    ctx.fillStyle = col('hi', 0.8); ctx.beginPath(); ctx.ellipse(-6, -7, 3.4, 1.8, -0.7, 0, TAU); ctx.fill()
  }
  function shapeChili() {
    const g = ctx.createLinearGradient(-6, -8, 8, 8)
    g.addColorStop(0, col('chA')); g.addColorStop(0.5, col('danger')); g.addColorStop(1, col('chC'))
    ctx.fillStyle = g; ctx.strokeStyle = col('chC', 0.8); ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-15, -4); ctx.bezierCurveTo(-8, -13, 9, -9, 19, 6); ctx.bezierCurveTo(8, 3, -4, 6, -14, 5); ctx.bezierCurveTo(-18, 3, -18, -1, -15, -4); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = col('hi', 0.8); ctx.lineWidth = 1.7; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-9, -4.5); ctx.quadraticCurveTo(0, -7.5, 8, -2.5); ctx.stroke()
    ctx.fillStyle = col('win'); ctx.strokeStyle = col('stemB'); ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(-13, -5); ctx.quadraticCurveTo(-17, -3, -15, 3); ctx.lineTo(-18, 2); ctx.quadraticCurveTo(-22, -4, -24, -9); ctx.lineTo(-21, -10); ctx.quadraticCurveTo(-18, -7, -13, -5); ctx.fill(); ctx.stroke()
  }
  function drawFood(kind, gold) {
    if (gold) {
      const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, 30)
      halo.addColorStop(0, col('gold', 0.85)); halo.addColorStop(1, col('gold', 0))
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(fx.time * 10) * 2, 0, TAU); ctx.fill()
    }
    if (kind === 'bun') shapeBun(); else if (kind === 'chili') shapeChili(); else shapeDumpling()
    if (gold) {
      for (let i = 0; i < 4; i++) {
        const a = fx.time * 2.4 + (i * TAU) / 4
        const r = 24 + Math.sin(fx.time * 6 + i) * 3
        ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(fx.time * 3)
        ctx.fillStyle = col('goldHi', 0.95)
        ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(1.2, -1.2); ctx.lineTo(4.5, 0); ctx.lineTo(1.2, 1.2); ctx.lineTo(0, 4.5); ctx.lineTo(-1.2, 1.2); ctx.lineTo(-4.5, 0); ctx.lineTo(-1.2, -1.2); ctx.closePath(); ctx.fill(); ctx.restore()
      }
    }
  }

  function drawPieces(view) {
    view.pieces.forEach((p) => {
      const x = CX + Math.cos(p.a) * RT
      const y = CY + Math.sin(p.a) * RT
      const sc = p.born < 0.3 ? backOut(clamp(p.born / 0.3, 0, 1)) : 1
      ctx.save(); ctx.globalAlpha = p.fade
      ctx.fillStyle = col('shadow', 0.3); ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 17 * sc, 12 * sc, p.a + Math.PI / 2, 0, TAU); ctx.fill()
      ctx.translate(x, y); ctx.rotate(p.a + Math.PI / 2); ctx.scale(sc, sc)
      if (p.kind === 'chili') {                       // a heat shimmer keeps the hazard readable without colour
        ctx.strokeStyle = rgb(pal.danger, 0.3 + 0.2 * Math.sin(fx.time * 9)); ctx.lineWidth = 1.5; ctx.setLineDash([3, 4])
        ctx.beginPath(); ctx.arc(0, 0, 23, 0, TAU); ctx.stroke(); ctx.setLineDash([])
      }
      drawFood(p.kind, p.gold)
      ctx.restore()
    })
  }

  function stickPath(tx, ty, bx, by, wt, wb) {
    const dx = bx - tx
    const dy = by - ty
    const l = Math.sqrt(dx * dx + dy * dy)
    const nx = -dy / l
    const ny = dx / l
    ctx.beginPath(); ctx.moveTo(tx + nx * wt, ty + ny * wt); ctx.lineTo(bx + nx * wb, by + ny * wb); ctx.lineTo(bx - nx * wb, by - ny * wb); ctx.lineTo(tx - nx * wt, ty - ny * wt); ctx.closePath()
  }
  function drawSticks(i, stunned) {
    const s = seatFx[i]
    const ang = angles[i]
    let j = 0
    if (s.jab >= 0) j = s.jab < 0.08 ? easeOut(s.jab / 0.08) : 1 - easeOut(clamp((s.jab - 0.08) / 0.24, 0, 1))
    const rest = RT + 60
    const reach = s.hit ? 50 : 40
    const tipY = rest - j * reach + Math.sin(fx.time * 2.2 + i * 1.7) * 1.2
    const spread = 10 - j * 6.5
    const jit = stunned ? Math.sin(fx.time * 70) * 2 : 0
    const rot = ang - Math.PI / 2
    const c = Math.cos(-rot)
    const sn = Math.sin(-rot)
    const ox = 4 * c - 7 * sn
    const oy = 4 * sn + 7 * c
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(rot)
    ;[-1, 1].forEach((e) => {                                              // shadows first
      ctx.fillStyle = col('shadow', 0.28); stickPath(e * spread + jit + ox, tipY + oy, e * 23 + jit + ox, tipY + 150 + oy, 2.2, 5); ctx.fill()
    })
    ;[-1, 1].forEach((e) => {
      const tx = e * spread + jit
      const bx = e * 23 + jit
      const by = tipY + 150
      const g = ctx.createLinearGradient(tx, tipY, bx, by)
      g.addColorStop(0, col('stA')); g.addColorStop(0.16, col('stB')); g.addColorStop(1, col('stC'))
      ctx.fillStyle = g; stickPath(tx, tipY, bx, by, 2.2, 5.2); ctx.fill()
      const f0 = 0.56
      const f1 = 0.68                                                      // a lacquer band in the seat colour
      ctx.fillStyle = rgb(seatColor(i)); stickPath(tx + (bx - tx) * f0, tipY + (by - tipY) * f0, tx + (bx - tx) * f1, tipY + (by - tipY) * f1, 2.2 + 3 * f0, 2.2 + 3 * f1); ctx.fill()
      ctx.fillStyle = col('goldHi', 0.95)
      ;[f0 - 0.012, f1].forEach((f) => { stickPath(tx + (bx - tx) * f, tipY + (by - tipY) * f, tx + (bx - tx) * (f + 0.012), tipY + (by - tipY) * (f + 0.012), 2.2 + 3 * f, 2.2 + 3 * f); ctx.fill() })
      ctx.strokeStyle = col('hi', 0.4); ctx.lineWidth = 0.9
      ctx.beginPath(); ctx.moveTo(tx - 0.6, tipY + 4); ctx.lineTo(bx - 1.6, by - 4); ctx.stroke()
      if (stunned) { ctx.fillStyle = col('danger', 0.35); stickPath(tx, tipY, bx, by, 2.2, 5.2); ctx.fill() }
    })
    ctx.restore()
  }

  function drawFly() {
    fx.fly.forEach((f) => {
      const k = clamp((f.t - 0.06) / 0.24, 0, 1)
      const e = easeOut(k)
      ctx.save(); ctx.translate(CX, CY); ctx.rotate(angles[f.seat] - Math.PI / 2); ctx.translate(0, RT + 8 + e * 44)
      ctx.globalAlpha = 1 - k * k; ctx.scale(1 - e * 0.35, 1 - e * 0.35); ctx.rotate(Math.PI)
      drawFood(f.type, f.gold); ctx.restore()
    })
  }

  function drawFlash() {
    seatFx.forEach((s, i) => {
      if (s.flash <= 0) return
      ctx.save(); ctx.translate(CX, CY); ctx.rotate(angles[i] - Math.PI / 2)
      const g = ctx.createLinearGradient(0, RT - 10, 0, RT + 260)
      g.addColorStop(0, rgb(pal.danger, 0)); g.addColorStop(1, rgb(pal.danger, 0.5 * s.flash))
      ctx.fillStyle = g; ctx.fillRect(-420, RT - 10, 840, 520); ctx.restore()
    })
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }
  function glass(x, y, w, h, r, a) {
    ctx.save(); ctx.shadowColor = col('shadow', 0.22); ctx.shadowBlur = 14; ctx.shadowOffsetY = 6
    ctx.fillStyle = rgb(P('glass'), a || 0.42); rr(x, y, w, h, r); ctx.fill(); ctx.restore()
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, col('glassHi', 0.55)); g.addColorStop(0.5, col('glassHi', 0))
    ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill()
    ctx.strokeStyle = col('glassHi', 0.85); ctx.lineWidth = 1; rr(x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke()
  }

  function drawHud(model) {
    HUD[n].forEach((h, i) => {
      const s = seatFx[i]
      const away = model.online?.[i] === false
      const sc = 1 + s.pop * 0.12
      ctx.save(); ctx.globalAlpha = away ? 0.45 : 1
      ctx.translate(h[0], h[1]); ctx.rotate((hudRot(i) * Math.PI) / 180); ctx.scale(sc, sc)
      glass(-56, -20, 112, 40, 12, 0.5)
      ctx.fillStyle = rgb(seatColor(i)); ctx.beginPath(); ctx.arc(-40, -3, 8, 0, TAU); ctx.fill()
      ctx.strokeStyle = col('glassHi', 0.9); ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = rgb(pal.ink); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
      ctx.font = `7px ${FONT}`; ctx.fillText(String(model.names?.[i] ?? `P${i + 1}`).slice(0, 7), -27, -3)
      ctx.textAlign = 'right'; ctx.font = `15px ${FONT}`; ctx.fillText(String(model.scores[i] ?? 0), 34, -2)
      ctx.font = `6px ${FONT}`; ctx.fillStyle = rgb(pal.ink, 0.75); ctx.textAlign = 'left'; ctx.fillText(`/${model.target}`, 36, 1)
      ctx.fillStyle = rgb(pal.ink, 0.14); rr(-48, 10, 96, 4, 2); ctx.fill()
      ctx.fillStyle = rgb(seatColor(i)); rr(-48, 10, Math.max(4, 96 * clamp(s.shown / model.target, 0, 1)), 4, 2); ctx.fill()
      ctx.restore()
    })
  }

  function label(text, x, y, size, color, rot, alpha) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate((rot * Math.PI) / 180)
    ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.font = `${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'; ctx.strokeStyle = col('outline', 0.95); ctx.lineWidth = Math.max(3, size * 0.32); ctx.strokeText(text, 0, 0)
    ctx.fillStyle = rgb(color); ctx.fillText(text, 0, 0); ctx.restore()
  }

  function drawOverlays(view, model) {
    fx.parts.forEach((p) => {
      const k = 1 - p.life / p.max
      ctx.save(); ctx.globalAlpha = p.kind === 'steam' ? k * 0.4 : k
      ctx.fillStyle = rgb(p.color)
      if (p.kind === 'conf') { ctx.translate(p.x, p.y); ctx.rotate(p.life * 9); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2) }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'steam' ? p.size * (1.6 - k) : p.size * k, 0, TAU); ctx.fill() }
      ctx.restore()
    })
    fx.pops.forEach((p) => {
      const k = p.t / 0.9
      const rise = easeOut(clamp(k * 1.6, 0, 1)) * 16
      const dir = p.rot === 180 ? 1 : -1
      label(p.text, p.x, p.y + dir * rise, p.big ? 14 : 11, p.color, p.rot, k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3)
    })
    if (fx.banner) {
      const b = fx.banner
      const a = b.t < 1.1 ? 1 : 1 - (b.t - 1.1) / 0.4
      label(b.text, CX, CY - 60, 11, b.color, 0, a)
      if (model.mirrorBanner) label(b.text, CX, CY + 60, 11, b.color, 180, a)
    }
    if (view.phase === 'count') {
      const c = Math.ceil(view.count - 0.2)
      label(c >= 1 ? String(Math.min(3, c)) : 'GO!', CX, CY, c >= 1 ? 34 : 22, pal.ink, 0, 1)
      angles.forEach((_, i) => {
        if (!model.humans?.[i]) return
        const p = station(i, 215)
        label('TAP', p[0], p[1], 9, seatColor(i), hudRot(i), 0.9)
      })
    }
    if (view.phase === 'over' && model.winnerSeat >= 0) {
      glass(CX - 128, CY - 56, 256, 112, 18, 0.72)
      label(`${String(model.names?.[model.winnerSeat] ?? 'P').slice(0, 9)} WINS`, CX, CY - 22, 16, seatColor(model.winnerSeat), 0, 1)
      label(model.scores.join(' - '), CX, CY + 10, 11, pal.ink, 0, 1)
    }
  }

  /** One frame. `view` is lazySusanLogic.viewAt; `model` is per-seat display state. */
  function render(dt, view, model) {
    upright = !!model.upright
    update(dt, view, model)
    const moment = moments(view, model)
    ctx.save()
    if (flip) { ctx.translate(W, H); ctx.rotate(Math.PI) }
    ctx.save()
    if (fx.shake > 0 && !reduced) ctx.translate((Math.random() - 0.5) * fx.shake * 7, (Math.random() - 0.5) * fx.shake * 7)
    ctx.drawImage(bg, 0, 0, W, H)
    drawPlate(view); drawGates(view, model); drawHub(view); drawPieces(view)
    angles.forEach((_, i) => drawSticks(i, !!model.stunned?.[i]))
    drawFly(); drawFlash()
    ctx.restore()
    drawHud(model); drawOverlays(view, model)
    ctx.restore()
    return moment
  }

  setTheme()
  resize()
  setLayout(2)

  return {
    setTheme, setLayout, resize, consume, jab, taken, pop, banner, render,
    get flip() { return flip },
    palette: () => pal,
  }
}
