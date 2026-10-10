// bamboozleDraw.js — paints a BAMBOOZLE garden onto a 2D canvas.
//
// Rendering only: it reads a sim (bamboozleSim.js) and draws it; it never
// changes one. Everything is shaded in code (bamboo with nodes and a cut tip,
// mossy boulders that crack, raked sand, a wooden frame), with colours passed
// through the theme palette (bamboozlePalette.js) so the garden follows the
// app theme. Dodgers are the players' own avatars (bamboozleSprites.js),
// stood up with depth, a hop cycle and a cast shadow.
//
// The logical canvas is VIEW × VIEW; the caller scales it to the screen.
import { HOLD, HINT_VOLLEYS, STONE_HP, RADIUS, POLE_W, tipPoint } from './bamboozleLogic'
import { GRAB_BREAK, GRAB_MAX, coverTiles } from './bamboozleSim'

/** Logical canvas side, and where the tiles sit inside it. */
export const VIEW = 360
export const RAIL = 38
export const ARENA = { x: 42, y: 42, s: 276 }
const TAU = Math.PI * 2

/** @param {number[]} c @param {number} [a] */
const rgb = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
/** @param {number[]} c @param {number[]} d @param {number} t */
const mix = (c, d, t) => [0, 1, 2].map((i) => Math.round(c[i] + (d[i] - c[i]) * t))

/** Tile units to canvas pixels. @param {number} n */
export const cellOf = (n) => ARENA.s / n
export const ax = (n, x) => ARENA.x + x * cellOf(n)
export const ay = (n, y) => ARENA.y + y * cellOf(n)

/** A tiny seeded generator so a boulder keeps its shape from frame to frame. @param {number} a */
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Effects ───────────────────────────────────────────────────────────────

/**
 * Particles and shake. Created once per round by the page and fed the sim's
 * events; positions are in tile units.
 */
export function createFx() {
  return { parts: /** @type {any[]} */ ([]), shake: 0, rand: Math.random, struck: /** @type {Record<number, number>} */ ({}) }
}

/** @param {ReturnType<typeof createFx>} fx @param {number} x @param {number} y @param {number} k @param {number[]} col */
function puff(fx, x, y, k, col) {
  for (let i = 0; i < k; i++) {
    const a = fx.rand() * TAU
    const v = 0.6 + fx.rand() * 2.2
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + fx.rand() * 0.3, max: 0.65, rgb: col, s: 0.05 + fx.rand() * 0.08 })
  }
}

/** @param {ReturnType<typeof createFx>} fx @param {number} x @param {number} y @param {number} k */
function stars(fx, x, y, k) {
  for (let i = 0; i < k; i++) {
    const a = fx.rand() * TAU
    fx.parts.push({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.5, max: 0.5, rgb: [255, 236, 130], star: true, s: 0.09 })
  }
}

/**
 * Turn sim events into effects.
 * @param {ReturnType<typeof createFx>} fx @param {import('./bamboozleSim').Sim} sim @param {{ type: string, [k: string]: any }[]} events
 * @param {{ reduced?: boolean }} [opts]
 */
export function feedFx(fx, sim, events, { reduced = false } = {}) {
  const n = sim.n
  for (const e of events) {
    if (e.type === 'impact') {
      if (!reduced) fx.shake = 1
      for (const lane of e.lanes) {
        const [tx, ty] = tipPoint(n, lane, 1)
        puff(fx, tx, ty, 7, [226, 214, 180])
        if (lane.len < n) puff(fx, tx, ty, 5, [120, 128, 110])
        if (lane.stoneId != null) fx.struck[lane.stoneId] = sim.clock
      }
    } else if (e.type === 'hit') {
      if (!reduced) fx.shake = Math.max(fx.shake, 0.7)
      stars(fx, e.x, e.y, 8)
    } else if (e.type === 'out') stars(fx, e.x, e.y, 12)
    else if (e.type === 'crack') puff(fx, e.c + 0.5, e.r + 0.5, 16, [120, 128, 110])
    else if (e.type === 'land') puff(fx, e.c + 0.5, e.r + 0.5, 8, [226, 214, 180])
    else if (e.type === 'coin') puff(fx, e.x, e.y, 6, [240, 200, 60])
    else if (e.type === 'throw' || e.type === 'free') puff(fx, e.x, e.y, 5, [226, 214, 180])
  }
}

/** @param {ReturnType<typeof createFx>} fx @param {number} dt */
export function stepFx(fx, dt) {
  fx.shake = Math.max(0, fx.shake - dt * 4)
  for (const q of fx.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92 }
  fx.parts = fx.parts.filter((q) => q.life > 0)
}

// ── The garden ────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   sim: import('./bamboozleSim').Sim,
 *   P: import('./bamboozlePalette').Palette,
 *   fx: ReturnType<typeof createFx>,
 *   seatRgb: number[][],
 *   sprites: (Record<string, any> | null)[],
 *   ghosts?: { id: string, x: number, y: number, hearts: number, out: boolean, sprites: Record<string, any> | null, rgb: number[] }[],
 *   hints?: boolean,
 *   reduced?: boolean,
 *   dim?: boolean,
 * }} Scene
 */

/**
 * Draw one frame.
 * @param {CanvasRenderingContext2D} ctx @param {Scene} S
 */
export function drawGarden(ctx, S) {
  const { sim, fx, reduced } = S
  const t = sim.clock
  ctx.clearRect(0, 0, VIEW, VIEW)
  ctx.save()
  if (fx.shake > 0 && !reduced) {
    const m = fx.shake * fx.shake * 9
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m)
  }
  drawYard(ctx, S, t)
  drawPoles(ctx, S, t)
  drawFrameLip(ctx, S)
  ctx.restore()
}

/** @param {CanvasRenderingContext2D} ctx */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Local frame for a lane: origin on the yard edge at the lane centre, +y pointing into the yard. */
function sideXf(ctx, n, side, i) {
  const o = ARENA
  const m = (i + 0.5) * cellOf(n)
  if (side === 0) ctx.translate(o.x + m, o.y)
  else if (side === 1) { ctx.translate(o.x + o.s, o.y + m); ctx.rotate(Math.PI / 2) }
  else if (side === 2) { ctx.translate(o.x + m, o.y + o.s); ctx.rotate(Math.PI) }
  else { ctx.translate(o.x, o.y + m); ctx.rotate(-Math.PI / 2) }
}

function drawYard(ctx, S, t) {
  const { sim, P, fx } = S
  const { K, KA } = P
  const v = sim.view
  const n = sim.n
  const c = cellOf(n)
  const o = ARENA
  const danger = P.pal.danger
  const card = P.pal.card
  const ink = P.pal.text

  // frame
  const fx0 = o.x - RAIL
  const fs = o.s + RAIL * 2
  ctx.fillStyle = K(40, 50, 30, 0.22)
  rr(ctx, fx0 + 3, o.y - RAIL + 6, fs, fs, 12); ctx.fill()
  let g = ctx.createLinearGradient(fx0, 0, fx0 + fs, 0)
  g.addColorStop(0, K(86, 66, 44)); g.addColorStop(0.5, K(112, 88, 58)); g.addColorStop(1, K(78, 60, 40))
  ctx.fillStyle = g
  rr(ctx, fx0, o.y - RAIL, fs, fs, 12); ctx.fill()
  ctx.strokeStyle = K(40, 28, 16, 0.35); ctx.lineWidth = 1
  for (let i = 0; i < 9; i++) {
    ctx.beginPath()
    ctx.moveTo(fx0 + 8, o.y - RAIL + 6 + i * (fs / 9))
    ctx.bezierCurveTo(fx0 + fs * 0.3, o.y - RAIL + i * (fs / 9), fx0 + fs * 0.7, o.y - RAIL + 10 + i * (fs / 9), fx0 + fs - 8, o.y - RAIL + 4 + i * (fs / 9))
    ctx.stroke()
  }
  // slots the poles rest in
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < n; i++) {
      ctx.save(); sideXf(ctx, n, s, i)
      ctx.fillStyle = K(30, 20, 10, 0.55)
      rr(ctx, -c * 0.4, -RAIL + 3, c * 0.8, RAIL - 3, 5); ctx.fill()
      ctx.restore()
    }
  }
  // the wall about to fire glows and flashes warning teeth
  if (v.phase === 'warn') {
    const u = 1 - v.left / v.len
    const pulse = 0.5 + 0.5 * Math.sin(t * (16 + 22 * u))
    for (const s of v.sides) {
      ctx.save(); sideXf(ctx, n, s, (n - 1) / 2)
      ctx.fillStyle = rgb(danger, 0.3 + 0.5 * pulse)
      rr(ctx, -o.s / 2, -RAIL + 2, o.s, RAIL - 4, 6); ctx.fill()
      ctx.fillStyle = rgb(card, 0.9)
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath(); ctx.moveTo(k * 38 - 7, -RAIL + 8); ctx.lineTo(k * 38 + 7, -RAIL + 8); ctx.lineTo(k * 38, -RAIL + 19); ctx.fill()
      }
      ctx.restore()
    }
  }
  // sand floor
  ctx.save()
  rr(ctx, o.x, o.y, o.s, o.s, 4); ctx.clip()
  for (let r = 0; r < n; r++) {
    for (let q = 0; q < n; q++) {
      const x = o.x + q * c
      const y = o.y + r * c
      const odd = (q + r) % 2
      ctx.fillStyle = odd ? K(226, 216, 186) : K(234, 226, 198)
      ctx.fillRect(x, y, c, c)
      ctx.strokeStyle = K(150, 130, 90, 0.16); ctx.lineWidth = 1
      for (let k = 1; k < 6; k++) {
        ctx.beginPath()
        if (odd) { ctx.moveTo(x + 4, y + (k * c) / 6); ctx.lineTo(x + c - 4, y + (k * c) / 6) }
        else { ctx.moveTo(x + (k * c) / 6, y + 4); ctx.lineTo(x + (k * c) / 6, y + c - 4) }
        ctx.stroke()
      }
      ctx.strokeStyle = K(120, 104, 70, 0.28)
      ctx.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1)
    }
  }
  // the read the game is about: for the first few volleys safe tiles are tinted green, exposed ones red
  if (S.hints !== false && v.phase === 'warn' && v.k < HINT_VOLLEYS) {
    const u = 1 - v.left / v.len
    const safe = coverTiles(sim)
    const isSafe = (q, r) => safe.some(([a, b]) => a === q && b === r)
    ctx.fillStyle = rgb(danger, 0.1 + 0.1 * u)
    for (let r = 0; r < n; r++) {
      for (let q = 0; q < n; q++) {
        if (v.stones.some((s) => s.c === q && s.r === r) || isSafe(q, r)) continue
        ctx.fillRect(o.x + q * c, o.y + r * c, c, c)
      }
    }
    ctx.fillStyle = rgb(P.pal.win, 0.28)
    for (const [q, r] of safe) { rr(ctx, o.x + q * c + 5, o.y + r * c + 5, c - 10, c - 10, 8); ctx.fill() }
  }
  g = ctx.createLinearGradient(0, o.y, 0, o.y + 16)
  g.addColorStop(0, K(60, 44, 20, 0.35)); g.addColorStop(1, K(60, 44, 20, 0))
  ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.s, 16)
  g = ctx.createLinearGradient(o.x, 0, o.x + 14, 0)
  g.addColorStop(0, K(60, 44, 20, 0.28)); g.addColorStop(1, K(60, 44, 20, 0))
  ctx.fillStyle = g; ctx.fillRect(o.x, o.y, 14, o.s)

  // landing rings for boulders that have not landed yet
  for (const st of v.pending) {
    const left = Math.max(0, st.landAt - sim.t)
    const u = 1 - Math.min(1, left)
    const cx = ax(n, st.c + 0.5)
    const cy = ay(n, st.r + 0.5)
    ctx.fillStyle = K(40, 50, 30, 0.12 + 0.3 * u)
    ctx.beginPath(); ctx.ellipse(cx, cy, c * 0.42 * (0.4 + 0.6 * u), c * 0.36 * (0.4 + 0.6 * u), 0, 0, TAU); ctx.fill()
    ctx.strokeStyle = rgb(ink, 0.55); ctx.lineWidth = 2
    if (!S.reduced) { ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 30 }
    ctx.beginPath(); ctx.arc(cx, cy, c * 0.4, 0, TAU); ctx.stroke(); ctx.setLineDash([])
  }

  // coin
  const coin = sim.view.coin && sim.coinTaken !== v.k ? sim.view.coin : null
  if (coin) {
    const cx = ax(n, coin.c + 0.5)
    const cy = ay(n, coin.r + 0.5)
    const w = S.reduced ? 1 : Math.abs(Math.cos(t * 5))
    const bob = S.reduced ? 0 : Math.sin(t * 4) * 2
    ctx.fillStyle = K(40, 50, 30, 0.25); ctx.beginPath(); ctx.ellipse(cx, cy + 9, 8, 3.5, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = K(176, 128, 20); ctx.beginPath(); ctx.ellipse(cx, cy + bob, 9 * w + 1.5, 9, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = K(244, 204, 70); ctx.beginPath(); ctx.ellipse(cx, cy + bob - 1, 7.5 * w + 1, 7.5, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = K(255, 250, 210, 0.9); ctx.fillRect(cx - 1.5 * w, cy + bob - 5, 2 * w + 0.5, 7)
  }

  // boulders and dodgers, back to front
  /** @type {[number, number, any, number][]} */
  const ents = []
  for (const st of v.solid) ents.push([st.r + 0.5, 0, st, 0])
  for (const p of sim.players) if (!p.out || p.outT < 0.7) ents.push([p.y, 1, p, 0])
  for (const gh of S.ghosts || []) ents.push([gh.y, 2, gh, 0])
  ents.sort((a, b) => a[0] - b[0])
  for (const [, kind, e] of ents) {
    if (kind === 0) drawBoulder(ctx, S, e, t)
    else if (kind === 1) {
      const sp = S.sprites[e.i]
      if (sp) drawAvatar(ctx, S, e, sp, t)
      else drawBlob(ctx, S, e, t)
    } else drawGhost(ctx, S, e, t)
  }

  // arms and a wriggle meter between a grabber and their rival
  for (const p of sim.players) {
    if (p.grab == null || p.out) continue
    const q = sim.players[p.grab]
    const x0 = ax(n, p.x)
    const y0 = ay(n, p.y) - cellOf(n) * 0.16
    const x1 = ax(n, q.x)
    const y1 = ay(n, q.y) - cellOf(n) * 0.16
    const nx = -(y1 - y0)
    const ny = x1 - x0
    const m = Math.hypot(nx, ny) || 1
    ctx.lineCap = 'round'
    for (const sgn of [-1, 1]) {
      ctx.strokeStyle = K(30, 34, 24, 0.85); ctx.lineWidth = 5.5
      ctx.beginPath(); ctx.moveTo(x0 + (nx / m) * 4 * sgn, y0 + (ny / m) * 4 * sgn); ctx.lineTo(x1 + (nx / m) * 5 * sgn, y1 + (ny / m) * 5 * sgn); ctx.stroke()
      ctx.strokeStyle = rgb(S.seatRgb[p.i] || P.pal.p1); ctx.lineWidth = 3; ctx.stroke()
    }
    const need = 1 - Math.min(1, q.struggle / GRAB_BREAK)
    const left = 1 - p.grabT / GRAB_MAX
    const mx = ax(n, q.x)
    const my = ay(n, q.y) - cellOf(n) * 0.75
    ctx.fillStyle = K(252, 253, 246, 0.95); rr(ctx, mx - 17, my - 5, 34, 9, 3); ctx.fill()
    ctx.strokeStyle = rgb(ink, 0.6); ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = rgb(danger); ctx.fillRect(mx - 15, my - 3, 30 * need, 2.5)
    ctx.fillStyle = rgb(S.seatRgb[p.i] || P.pal.p1); ctx.fillRect(mx - 15, my + 0.5, 30 * Math.max(0, left), 1.8)
  }

  // dust, chips, stars
  for (const q of fx.parts) {
    const a = Math.max(0, q.life / q.max)
    const x = ax(n, q.x)
    const y = ay(n, q.y)
    const s = q.s * c
    ctx.fillStyle = rgb(q.star ? q.rgb : KA(q.rgb[0], q.rgb[1], q.rgb[2]), a)
    if (q.star) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(q.life * 9)
      ctx.fillRect(-s, -s * 0.3, s * 2, s * 0.6); ctx.fillRect(-s * 0.3, -s, s * 0.6, s * 2)
      ctx.restore()
    } else { ctx.beginPath(); ctx.arc(x, y, s * (1.6 - a * 0.6), 0, TAU); ctx.fill() }
  }
  ctx.restore()
}

function drawPoles(ctx, S, t) {
  const { sim, P } = S
  const { K } = P
  const v = sim.view
  const n = sim.n
  const c = cellOf(n)
  const o = ARENA
  ctx.save()
  rr(ctx, o.x - RAIL + 3, o.y - RAIL + 3, o.s + RAIL * 2 - 6, o.s + RAIL * 2 - 6, 10); ctx.clip()
  const warnU = v.phase === 'warn' ? 1 - v.left / v.len : 0
  const w = c * POLE_W
  for (let pass = 0; pass < 2; pass++) {
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < n; i++) {
        const lane = v.lanes.find((l) => l.side === s && l.i === i)
        const hot = v.phase === 'warn' && v.sides.includes(s)
        let tip = -3
        if (lane) tip = -3 + (lane.len * c - (lane.len < n ? 1 : 3) + 3) * v.ext
        if (lane && v.phase === 'hold' && !S.reduced) tip += Math.sin(v.left * 70) * 1.6 * (v.left / HOLD)
        if (hot) tip = -3 - 9 * Math.min(1, warnU * 1.6) + (S.reduced ? 0 : Math.sin(t * 60 + i * 2) * 1.5 * warnU)
        ctx.save(); sideXf(ctx, n, s, i)
        if (pass === 0) {
          if (tip > 4) { ctx.fillStyle = K(40, 50, 30, 0.26); ctx.fillRect(-w / 2 + 5, 0, w, tip - 6) }
        } else drawPole(ctx, P, w, tip)
        ctx.restore()
      }
    }
  }
  ctx.restore()
}

function drawPole(ctx, P, w, tip) {
  const { K } = P
  const h = w * 0.44
  const base = -RAIL - 8
  const body = tip - h
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
  g.addColorStop(0, K(84, 108, 40)); g.addColorStop(0.18, K(128, 156, 62)); g.addColorStop(0.42, K(190, 208, 116))
  g.addColorStop(0.52, K(214, 226, 150)); g.addColorStop(0.7, K(150, 176, 76)); g.addColorStop(1, K(72, 96, 36))
  ctx.fillStyle = g; ctx.fillRect(-w / 2, base, w, body - base)
  ctx.fillStyle = K(255, 255, 230, 0.35); ctx.fillRect(-w * 0.06, base, w * 0.07, body - base)
  for (let y = body - 14; y > base; y -= 52) {
    ctx.fillStyle = K(52, 72, 24, 0.85); ctx.fillRect(-w / 2 - 1, y, w + 2, 2.4)
    ctx.fillStyle = K(226, 236, 170, 0.7); ctx.fillRect(-w / 2 - 1, y + 2.4, w + 2, 1.4)
    ctx.fillStyle = K(52, 72, 24, 0.3); ctx.fillRect(-w / 2, y - 3, w, 3)
  }
  // a slanted, fire-hardened cut point
  const tg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
  tg.addColorStop(0, K(176, 160, 104)); tg.addColorStop(0.5, K(240, 230, 186)); tg.addColorStop(1, K(150, 134, 84))
  ctx.fillStyle = tg
  ctx.beginPath(); ctx.moveTo(-w / 2, body); ctx.lineTo(w / 2, body); ctx.lineTo(w * 0.06, tip); ctx.lineTo(-w * 0.06, tip); ctx.closePath(); ctx.fill()
  ctx.fillStyle = K(86, 62, 34)
  ctx.beginPath(); ctx.moveTo(-w * 0.2, tip - h * 0.34); ctx.lineTo(w * 0.2, tip - h * 0.34); ctx.lineTo(w * 0.06, tip); ctx.lineTo(-w * 0.06, tip); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = K(40, 52, 20, 0.7); ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(-w / 2, base); ctx.lineTo(-w / 2, body); ctx.lineTo(-w * 0.06, tip); ctx.lineTo(w * 0.06, tip); ctx.lineTo(w / 2, body); ctx.lineTo(w / 2, base); ctx.stroke()
}

function drawFrameLip(ctx, S) {
  const { K } = S.P
  const o = ARENA
  const fx0 = o.x - RAIL
  const fy = o.y - RAIL
  const fs = o.s + RAIL * 2
  ctx.save()
  ctx.beginPath(); ctx.roundRect(fx0, fy, fs, fs, 12); ctx.roundRect(fx0 + 7, fy + 7, fs - 14, fs - 14, 7); ctx.clip('evenodd')
  const g = ctx.createLinearGradient(0, fy, 0, fy + fs)
  g.addColorStop(0, K(126, 100, 66)); g.addColorStop(1, K(72, 54, 36))
  ctx.fillStyle = g; ctx.fillRect(fx0, fy, fs, fs)
  ctx.fillStyle = K(255, 240, 210, 0.22); ctx.fillRect(fx0, fy, fs, 2.5)
  ctx.restore()
  ctx.strokeStyle = K(46, 34, 22); ctx.lineWidth = 1.5
  rr(ctx, fx0, fy, fs, fs, 12); ctx.stroke()
}

function drawBoulder(ctx, S, st, t) {
  const { sim, P, fx } = S
  const { K } = P
  const n = sim.n
  const c = cellOf(n)
  const cx = ax(n, st.c + 0.5)
  const cy = ay(n, st.r + 0.5)
  const since = st.landAt > 0 ? sim.t - st.landAt : 9
  const rise = Math.max(0, Math.min(1, since * 3.5))
  const pop = rise < 1 ? 1 + 0.25 * Math.sin(rise * Math.PI) * (1 - rise) : 1
  const sc = (0.2 + 0.8 * Math.min(1, rise * 1.3)) * pop
  const hit = fx.struck[st.id] != null ? sim.clock - fx.struck[st.id] : 9
  const jx = hit < 0.3 && !S.reduced ? Math.sin(t * 90) * 2 * (1 - hit / 0.3) : 0
  const rnd = mulberry(st.shape)
  /** @type {[number, number][]} */
  const pts = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU
    const r = c * (0.38 + rnd() * 0.07)
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.94])
  }
  const shape = () => {
    ctx.beginPath()
    for (let i = 0; i <= 9; i++) {
      const p = pts[i % 9]
      const q = pts[(i + 1) % 9]
      const mx = (p[0] + q[0]) / 2
      const my = (p[1] + q[1]) / 2
      if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my)
    }
    ctx.closePath()
  }
  ctx.save(); ctx.translate(cx + jx, cy)
  ctx.save(); ctx.translate(5, 7); ctx.scale(sc, sc); ctx.fillStyle = K(40, 50, 30, 0.3); shape(); ctx.fill(); ctx.restore()
  ctx.scale(sc, sc)
  const g = ctx.createRadialGradient(-c * 0.14, -c * 0.16, c * 0.04, 0, 0, c * 0.5)
  g.addColorStop(0, K(196, 200, 184)); g.addColorStop(0.55, K(142, 150, 134)); g.addColorStop(1, K(92, 100, 90))
  ctx.fillStyle = g; shape(); ctx.fill()
  ctx.save(); shape(); ctx.clip()
  ctx.fillStyle = K(86, 132, 54, 0.9); ctx.beginPath(); ctx.ellipse(-c * 0.16, -c * 0.26, c * 0.3, c * 0.17, -0.5, 0, TAU); ctx.fill()
  ctx.fillStyle = K(126, 170, 80, 0.8); ctx.beginPath(); ctx.ellipse(-c * 0.2, -c * 0.29, c * 0.16, c * 0.08, -0.5, 0, TAU); ctx.fill()
  ctx.fillStyle = K(40, 50, 40, 0.22); ctx.beginPath(); ctx.ellipse(c * 0.12, c * 0.3, c * 0.4, c * 0.14, 0.2, 0, TAU); ctx.fill()
  const lost = st.max > 9 ? 0 : Math.max(0, Math.min(3, STONE_HP - st.hp))
  ctx.strokeStyle = K(30, 36, 30, 0.85); ctx.lineWidth = 1.6; ctx.lineJoin = 'round'
  const cracks = [
    [[-0.02, -0.4], [0.05, -0.16], [-0.06, 0.02], [0.04, 0.2]],
    [[0.4, -0.05], [0.18, 0], [0.1, 0.14], [-0.12, 0.18]],
    [[-0.4, 0.12], [-0.2, 0.06], [-0.1, -0.12]],
  ]
  for (let k = 0; k < lost; k++) {
    ctx.beginPath()
    cracks[k].forEach(([x, y], i) => (i ? ctx.lineTo(x * c, y * c) : ctx.moveTo(x * c, y * c)))
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = K(40, 46, 40, 0.8); ctx.lineWidth = 1.6; shape(); ctx.stroke()
  ctx.restore()
}

/** The plain round fallback when an avatar could not be baked. */
function drawBlob(ctx, S, p, t) {
  const { sim, P } = S
  const { K } = P
  const n = sim.n
  const x = ax(n, p.x)
  const y = ay(n, p.y)
  const r = cellOf(n) * RADIUS
  const col = S.seatRgb[p.i] || P.pal.p1
  if (p.out) return
  ctx.fillStyle = K(40, 50, 30, 0.28); ctx.beginPath(); ctx.ellipse(x + 3, y + r * 0.75, r * 1.02, r * 0.5, 0, 0, TAU); ctx.fill()
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05)
  g.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.5))); g.addColorStop(0.5, rgb(col)); g.addColorStop(1, rgb(mix(col, [0, 0, 0], 0.35)))
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
  ctx.strokeStyle = rgb(mix(col, [0, 0, 0], 0.6)); ctx.lineWidth = 1.6; ctx.stroke()
  if (p.inv > 0 && Math.floor(t * 14) % 2 === 0) { ctx.fillStyle = K(252, 253, 246, 0.4); ctx.fill() }
}

/** The player's own avatar as a standing figure: lit front, a darker side for thickness, a cast shadow. */
function drawAvatar(ctx, S, p, sprites, t) {
  const { sim, P } = S
  const { K } = P
  const n = sim.n
  const c = cellOf(n)
  const k = (c * 0.62) / 22
  const r = c * RADIUS
  const col = S.seatRgb[p.i] || P.pal.p1
  const x = ax(n, p.x)
  const y = ay(n, p.y) + r * 0.55
  const moving = !p.out && Math.hypot(p.vx, p.vy) > 0.3
  if (p.fx < -0.25) p.flip = -1
  else if (p.fx > 0.25) p.flip = 1
  const flip = p.flip || 1
  const won = sim.over && !p.out && sim.winner === p.i
  const reduced = S.reduced
  const f = won && !reduced ? sprites[Math.floor(t * 6) % 2 ? 'cheer1' : 'cheer0']
    : moving && !reduced ? sprites[['idle', 'hop1', 'hop2', 'hop1'][Math.floor(p.walk * 1.7) % 4]]
      : sprites.idle
  let alpha = 1
  if (p.out) alpha = Math.max(0, 1 - p.outT / 0.7)
  else if (p.inv > 0 && Math.floor(t * 14) % 2 === 0 && p.squash <= 0) alpha = 0.45
  ctx.save(); ctx.translate(x, y); ctx.imageSmoothingEnabled = false
  // seat ring and contact shadow on the sand
  ctx.fillStyle = K(40, 50, 30, 0.3 * alpha); ctx.beginPath(); ctx.ellipse(1, 0, r * 1.05, r * 0.5, 0, 0, TAU); ctx.fill()
  ctx.strokeStyle = rgb(col, alpha); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * 0.6, 0, 0, TAU); ctx.stroke()
  // cast shadow: the silhouette laid over on the ground
  ctx.save(); ctx.globalAlpha = 0.2 * alpha; ctx.transform(1, 0, -0.75, 0.42, 0, 0); ctx.scale(flip, 1)
  ctx.drawImage(f.dark, -12 * k, -23 * k, 24 * k, 24 * k); ctx.restore()
  ctx.globalAlpha = alpha
  const sq = p.squash
  const breathe = moving || reduced ? 0 : Math.sin(t * 3 + p.i * 2) * 0.02
  if (p.out) ctx.rotate(Math.min(1, p.outT / 0.25) * 1.45 * flip)
  else if (sq > 0 && !reduced) ctx.rotate(Math.sin(t * 40) * 0.25 * sq)
  else if (moving) ctx.rotate(p.fx * 0.1)
  ctx.scale(flip * (1 + 0.3 * sq - breathe), 1 - 0.35 * sq + breathe)
  for (const d of [1.5, 1, 0.5]) ctx.drawImage(f.side, -12 * k + d * k * flip, -23 * k + d * k * 0.35, 24 * k, 24 * k)
  ctx.drawImage(f.lit, -12 * k, -23 * k, 24 * k, 24 * k)
  ctx.restore()
  ctx.imageSmoothingEnabled = true
  ctx.globalAlpha = 1
}

/** Another racer in their own copy of the garden: a faded figure, no collision. */
function drawGhost(ctx, S, gh, t) {
  const { sim } = S
  const n = sim.n
  const c = cellOf(n)
  const k = (c * 0.62) / 22
  const r = c * RADIUS
  const x = ax(n, gh.x)
  const y = ay(n, gh.y) + r * 0.55
  const f = gh.sprites ? gh.sprites.idle : null
  ctx.save(); ctx.translate(x, y); ctx.imageSmoothingEnabled = false
  const bob = S.reduced ? 0 : Math.sin(t * 3 + x) * 0.02
  ctx.globalAlpha = gh.out ? 0.18 : 0.5
  ctx.strokeStyle = rgb(gh.rgb, 0.8); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.58, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([])
  if (f) {
    ctx.scale(1, 1 + bob)
    ctx.drawImage(f.lit, -12 * k, -23 * k, 24 * k, 24 * k)
  } else {
    ctx.fillStyle = rgb(gh.rgb, 0.8); ctx.beginPath(); ctx.arc(0, -r * 0.6, r * 0.8, 0, TAU); ctx.fill()
  }
  ctx.restore()
  ctx.imageSmoothingEnabled = true
  ctx.globalAlpha = 1
}
