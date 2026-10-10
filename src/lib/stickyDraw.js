// stickyDraw.js — canvas painter for STICKY FINGERS. Draws a state-shaped scene
// (the host's sim, or a decoded snapshot) and owns the purely visual layer:
// particles, floating +N text, the arm wobble, the safe's spinning dial. None of
// that is game state, so it is rebuilt by comparing one scene with the last and
// is identical on the host and the guest.
//
// Colours come from the page's --c-* tokens (src/index.css), so every theme
// restyles the table; the felt, rim, metal and outline are mixed from them.

import { TABLE_W as W, TABLE_H as H, ROUND_SECONDS, SAFE_RADIUS, lastCallActive } from './stickyLogic'

const TAU = Math.PI * 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

// ── palette ─────────────────────────────────────────────────────────────────

const TOKENS = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger', 'structure', 'deep']
const FALLBACK = [128, 128, 128]

function parseTriplet(raw) {
  const m = String(raw).trim().split(/[\s,]+/).map(Number)
  return m.length >= 3 && m.every(Number.isFinite) ? [m[0], m[1], m[2]] : null
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round)
const BLACK = [0, 0, 0]

/** Every colour the painter uses, as [r, g, b] triplets, from the element's theme. */
export function readPalette(el) {
  const cs = getComputedStyle(el)
  const pal = {}
  for (const k of TOKENS) pal[k] = parseTriplet(cs.getPropertyValue(`--c-${k}`)) ?? FALLBACK
  // The lightest of card / text: card is bright in light themes and dark in
  // dark ones, text the other way round, so highlights use whichever is lighter.
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11
  pal.light = lum(pal.card) >= lum(pal.text) ? pal.card : pal.text
  pal.gold = mix(pal.cta, pal.light, 0.22)
  pal.goldHi = mix(pal.cta, pal.light, 0.55)
  pal.felt1 = mix(pal.deep, pal.win, 0.45)
  pal.felt2 = mix(pal.felt1, BLACK, 0.34)
  pal.rim = pal.structure
  pal.metal = mix(pal.structure, pal.card, 0.35)
  pal.ink = mix(pal.deep, BLACK, 0.86)
  pal.font = cs.fontFamily || 'monospace'
  return pal
}

const PLAYER_KEYS = ['p1', 'p2', 'p3', 'p4']
export const playerKey = (i) => PLAYER_KEYS[i] ?? 'p1'

// ── stage: the visual-only state ────────────────────────────────────────────

function rnd(a, b) { return a + Math.random() * (b - a) }

function makeNoise() {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const n = c.getContext('2d')
  for (let i = 0; i < 1400; i++) {
    n.fillStyle = Math.random() < 0.5 ? 'rgb(255 255 255 / .05)' : 'rgb(0 0 0 / .06)'
    n.fillRect(Math.random() * 96, Math.random() * 96, 1, rnd(1, 3))
  }
  return c
}

export function createStage() {
  return {
    t: 0, shake: 0, flash: 0,
    fx: [], floats: [],
    players: [],               // { shown, dial, pop, score, dyed }
    hands: {},                 // 'p:k' → { wob, wv, px, py, loot, stun }
    loot: new Map(),           // id → { x, y, kind, z, holders }
    noise: null,
    lastCall: false, sudden: false,
  }
}

function burst(st, reduced, x, y, kind, key, n, sp = 160) {
  const count = reduced ? Math.ceil(n / 3) : n
  for (let i = 0; i < count; i++) {
    const a = rnd(0, TAU)
    const v = rnd(0.3, 1) * sp
    st.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.35, 0.8), kind, key, size: rnd(2.5, 5.5), rot: rnd(0, TAU), vr: rnd(-8, 8) })
  }
}
const floatText = (st, x, y, text, key) => st.floats.push({ x, y, text, key, life: 0 })

/**
 * Advance the visual layer by `dt` seconds toward `scene`. Safe to call every
 * animation frame; a page that keeps a stage per round never needs to reset it.
 */
export function updateStage(st, scene, dt, reduced = false) {
  if (!st.noise) st.noise = makeNoise()
  st.t += dt
  if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 22)
  if (st.flash > 0) st.flash -= dt
  const shake = (v) => { if (!reduced) st.shake = Math.max(st.shake, v) }

  scene.players.forEach((p) => {
    const v = st.players[p.i] ?? (st.players[p.i] = { shown: p.score, dial: 0, pop: 0, score: p.score, dyed: 0 })
    const delta = p.score - v.score
    if (delta > 0) {
      v.pop = 1
      v.dial += 2.2
      burst(st, reduced, p.mouth.x, p.mouth.y, 'star', delta >= 5 ? 'p3' : 'cta', 6 + delta * 2, 150)
      floatText(st, p.safe.x, p.safe.y, `+${delta}`, playerKey(p.i))
    } else if (delta < 0) {
      v.pop = 1
      v.dial += 2.2
      burst(st, reduced, p.safe.x, p.safe.y, 'blob', 'danger', 18, 220)
      floatText(st, p.safe.x, p.safe.y, `${delta}`, 'danger')
      shake(7)
    } else if (p.dyed > v.dyed + 0.5) {
      // a dye pack that cost nothing (score already 0) still goes off
      burst(st, reduced, p.safe.x, p.safe.y, 'blob', 'danger', 14, 200)
      floatText(st, p.safe.x, p.safe.y, 'DYED', 'danger')
      shake(5)
    }
    v.score = p.score
    v.dyed = p.dyed
    v.shown += (p.score - v.shown) * Math.min(1, dt * 10)
    if (v.pop > 0) v.pop = Math.max(0, v.pop - dt * 3.2)
    v.dial *= Math.pow(0.02, dt)
  })

  // Loot arrivals, landings, tugs (a second hand piling on), who wins them, snaps, and quiet disappearances.
  const seen = new Set()
  for (const l of scene.loot) {
    seen.add(l.id)
    const was = st.loot.get(l.id)
    let landedAt = was?.landedAt
    if (was && was.z > 0 && l.z <= 0) {
      burst(st, reduced, l.x, l.y, 'star', l.kind === 'gem' ? 'p3' : 'cta', 5, 90)
      landedAt = st.t
    }
    if (was && was.holders < 2 && l.holders.length === 2) {
      burst(st, reduced, l.x, l.y, 'dot', 'light', 8, 120)
      floatText(st, l.x, l.y - 18, 'TUG!', 'cta')
      shake(3)
    } else if (was && was.holders === 2 && l.holders.length === 1) {
      const key = playerKey(l.holders[0] >> 1)
      burst(st, reduced, l.x, l.y, 'star', key, 12, 170)
      floatText(st, l.x, l.y - 18, 'MINE!', key)
      shake(4)
    }
    st.loot.set(l.id, { x: l.x, y: l.y, kind: l.kind, z: l.z, holders: l.holders.length, landedAt })
  }
  for (const [id, was] of st.loot) {
    if (seen.has(id)) continue
    st.loot.delete(id)
    const nearSafe = scene.players.some((p) => Math.hypot(was.x - p.safe.x, was.y - p.safe.y) < SAFE_RADIUS + 26)
    if (nearSafe) continue
    if (was.holders === 2) {                       // nobody let go: the item snapped
      burst(st, reduced, was.x, was.y, 'paper', 'danger', 14, 200)
      floatText(st, was.x, was.y - 10, 'SNAP!', 'danger')
      shake(6)
    } else burst(st, reduced, was.x, was.y, 'dot', 'dim', 8, 90)
  }
  scene.players.forEach((p) => p.hands.forEach((h, k) => {
    const key = `${p.i}:${k}`
    const m = st.hands[key] ?? (st.hands[key] = { wob: 0, wv: 0, px: h.x, py: h.y, loot: null, stun: 0 })
    const vx = (h.x - m.px) / Math.max(dt, 1e-3)
    const vy = (h.y - m.py) / Math.max(dt, 1e-3)
    // arm wobble: a damped spring kicked by sideways motion
    const side = (-Math.sin(p.ang) * vx + Math.cos(p.ang) * vy) * 0.012
    m.wv += (-m.wob * 90 - m.wv * 9 - clamp(side, -40, 40) * 30) * dt
    m.wob = clamp(m.wob + m.wv * dt, -2.5, 2.5)
    m.px = h.x
    m.py = h.y
    if (m.loot != null && h.loot == null && h.stun > m.stun && scene.loot.some((l) => l.id === m.loot)) {
      burst(st, reduced, h.x, h.y, 'star', 'light', 6, 140)
      floatText(st, h.x, h.y - 8, 'SLIP!', playerKey(p.i))
    }
    m.loot = h.loot
    m.stun = h.stun
  }))

  if (lastCallActive(scene) && !st.lastCall) st.lastCall = true
  if (!lastCallActive(scene)) st.lastCall = false
  if (scene.sudden && !st.sudden) {
    floatText(st, W / 2, H / 2 - 40, 'TIE: NEXT COIN WINS', 'cta')
  }
  st.sudden = !!scene.sudden

  for (const f of st.fx) {
    f.life += dt
    f.x += f.vx * dt
    f.y += f.vy * dt
    const d = Math.pow(0.04, dt)
    f.vx *= d
    f.vy *= d
    if (f.kind === 'paper') f.vy += 120 * dt
    f.rot += f.vr * dt
  }
  st.fx = st.fx.filter((f) => f.life < f.max)
  for (const f of st.floats) { f.life += dt; f.y -= 26 * dt }
  st.floats = st.floats.filter((f) => f.life < 1.1)
}

// ── drawing ─────────────────────────────────────────────────────────────────

function hash01(n) {
  let t = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B)
  t ^= t >>> 13
  t = Math.imul(t, 0xC2B2AE35)
  t ^= t >>> 16
  return (t >>> 0) / 4294967296
}

/**
 * Paint one frame.
 * @param {CanvasRenderingContext2D} ctx   transform already set to table units
 * @param {object} st       stage from createStage()
 * @param {object} scene    state-shaped scene
 * @param {object} pal      readPalette()
 * @param {{ rotated?: boolean, flipSeat?: (i: number) => boolean, names?: string[], reduced?: boolean }} [opts]
 */
export function drawScene(ctx, st, scene, pal, opts = {}) {
  const { rotated = false, flipSeat = () => false, names = [], reduced = false } = opts
  const col = (k, a = 1) => `rgb(${pal[k][0]} ${pal[k][1]} ${pal[k][2]} / ${a})`
  const font = (px) => `${px}px ${pal.font}`

  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }
  function star(x, y, r, rot) {
    ctx.beginPath()
    for (let i = 0; i < 8; i++) { const a = rot + (i * TAU) / 8; const q = i % 2 ? r * 0.42 : r; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q) }
    ctx.closePath()
  }
  const shadow = (x, y, rx, ry, a) => { ctx.beginPath(); ctx.ellipse(x + 2, y + 5, rx, ry, 0, 0, TAU); ctx.fillStyle = `rgb(0 0 0 / ${a})`; ctx.fill() }
  // Text always faces the viewer, whichever way the table is turned.
  function upright(x, y, extraTurn, fn) {
    ctx.save(); ctx.translate(x, y)
    if (rotated !== !!extraTurn) ctx.rotate(Math.PI)
    fn(); ctx.restore()
  }
  function label(text, x, y, px, fill, lineW = 4, extraTurn = false) {
    upright(x, y, extraTurn, () => {
      ctx.font = font(px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.lineWidth = lineW; ctx.strokeStyle = col('ink', 0.9); ctx.lineJoin = 'round'; ctx.strokeText(text, 0, 0)
      ctx.fillStyle = fill; ctx.fillText(text, 0, 0)
    })
  }

  const hit = (st.shake > 0 && !reduced) ? [(Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake] : [0, 0]
  ctx.save()
  ctx.translate(hit[0], hit[1])

  // ── table ──
  const g = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 380)
  g.addColorStop(0, col('felt1')); g.addColorStop(1, col('felt2'))
  rr(0, 0, W, H, 22); ctx.fillStyle = g; ctx.fill()
  ctx.save(); rr(0, 0, W, H, 22); ctx.clip()
  if (st.noise) { ctx.fillStyle = ctx.createPattern(st.noise, 'repeat'); ctx.fillRect(0, 0, W, H) }
  scene.players.forEach((p) => {
    const hg = ctx.createRadialGradient(p.safe.x, p.safe.y, 10, p.safe.x, p.safe.y, 150)
    hg.addColorStop(0, col(playerKey(p.i), 0.3)); hg.addColorStop(1, col(playerKey(p.i), 0))
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H)
  })
  ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; ctx.strokeStyle = col('light', 0.28); rr(9, 9, W - 18, H - 18, 15); ctx.stroke(); ctx.setLineDash([])
  const v = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 400)
  v.addColorStop(0, 'rgb(0 0 0 / 0)'); v.addColorStop(1, 'rgb(0 0 0 / .32)')
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
  ctx.restore()
  ctx.lineWidth = 5; ctx.strokeStyle = col('rim'); rr(2.5, 2.5, W - 5, H - 5, 20); ctx.stroke()
  ctx.lineWidth = 1; ctx.strokeStyle = col('light', 0.55); rr(1, 1, W - 2, H - 2, 21); ctx.stroke()

  // ── clock ──
  {
    const x = W / 2; const y = H / 2; const r = 34
    ctx.save()
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, TAU); ctx.fillStyle = 'rgb(0 0 0 / .14)'; ctx.fill()
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col('light', 0.1); ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = col('light', 0.3); ctx.stroke()
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4)); ctx.lineTo(x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8))
      ctx.strokeStyle = col('light', 0.35); ctx.lineWidth = 1.5; ctx.stroke()
    }
    const hot = lastCallActive(scene) || scene.sudden
    const frac = scene.sudden ? 1 : clamp(scene.time / ROUND_SECONDS, 0, 1)
    ctx.beginPath(); ctx.arc(x, y, r - 1, -Math.PI / 2, -Math.PI / 2 + TAU * frac)
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = col(hot ? 'cta' : 'light', hot ? 1 : 0.85); ctx.stroke()
    ctx.restore()
    label(scene.sudden ? 'TIE' : String(Math.max(0, Math.ceil(scene.time))), x + 1, y + 1, 14, col('light', 0.95), 3)
    if (lastCallActive(scene) && !scene.sudden) label('x2', x + 1, y + 18, 6, col('cta'), 2)
  }

  // ── loot lying on the felt ──
  const holders = (l) => l.holders.map((k) => scene.players[k >> 1]?.hands[k & 1]).filter(Boolean)

  function billShape(w, h, key) {
    ctx.beginPath()
    rr(-w / 2, -h / 2, w, h, 3)
    ctx.fillStyle = col(key); ctx.fill()
    ctx.fillStyle = 'rgb(255 255 255 / .16)'; ctx.fillRect(-w / 2 + 2, -h / 2 + 1.5, w - 4, h * 0.36)
    ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.75); ctx.stroke()
    ctx.lineWidth = 1; ctx.strokeStyle = col('light', 0.6); rr(-w / 2 + 3.5, -h / 2 + 3.5, w - 7, h - 7, 1.5); ctx.stroke()
    ctx.beginPath(); ctx.arc(0, 0, h * 0.27, 0, TAU); ctx.fillStyle = col('light', 0.85); ctx.fill()
    star(0, 0, h * 0.2, 0); ctx.fillStyle = col(key); ctx.fill()
  }
  function coin(l, s, spin) {
    const r = l.r * s
    ctx.beginPath(); ctx.arc(0, 2.5, r, 0, TAU); ctx.fillStyle = col('ink', 0.55); ctx.fill()
    // gold: the theme's accent, lifted toward the highlight so a dark-gold token still shines
    const cg = ctx.createRadialGradient(-r * 0.4, -r * 0.5, 1, 0, 0, r * 1.2)
    cg.addColorStop(0, col('light')); cg.addColorStop(0.22, col('goldHi')); cg.addColorStop(0.6, col('gold')); cg.addColorStop(1, col('cta'))
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = cg; ctx.fill()
    ctx.fillStyle = 'rgb(0 0 0 / .16)'; ctx.beginPath(); ctx.arc(0, 0, r, 0.3, Math.PI - 0.3); ctx.fill()
    ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.75); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke()
    ctx.lineWidth = 1; ctx.strokeStyle = col('ink', 0.35); ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, TAU); ctx.stroke()
    star(0, 0, r * 0.42, spin * 0.2); ctx.fillStyle = col('ink', 0.6); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip()
    const gx = ((spin * 14) % (r * 6)) - r * 3
    ctx.rotate(-0.6); ctx.fillStyle = 'rgb(255 255 255 / .5)'; ctx.fillRect(gx, -r * 2, 4, r * 4); ctx.fillRect(gx + 7, -r * 2, 1.5, r * 4)
    ctx.restore()
  }
  function stretched(l, hs) {
    const a = hs[0]; const b = hs[1]
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    const d = Math.max(34, Math.hypot(b.x - a.x, b.y - a.y) + 14)
    ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(ang)
    const jit = l.strain > 0.6 && !reduced ? (Math.random() - 0.5) * 2 * (l.strain - 0.6) * 5 : 0
    ctx.translate(0, jit)
    const h = 20 - l.strain * 5
    billShape(d, h, l.strain > 0.75 ? 'danger' : 'win')
    if (l.strain > 0.35) {
      ctx.beginPath(); ctx.moveTo(0, -h / 2)
      for (let i = 1; i <= 4; i++) ctx.lineTo((i % 2 ? 2.5 : -2.5) * l.strain, -h / 2 + (h * l.strain * i) / 4)
      ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.9); ctx.stroke()
    }
    ctx.restore()
  }
  const RAD = { coin: 12, bill: 15, gem: 13, dye: 15 }
  // A tug: a ring in the two contenders' colours with the clock to the snap running round it.
  function contestRing(l, r) {
    const pa = playerKey(l.holders[0] >> 1)
    const pb = playerKey(l.holders[1] >> 1)
    const spin = reduced ? 0 : st.t * 3
    ctx.save()
    ctx.lineWidth = 3; ctx.lineCap = 'butt'
    ctx.beginPath(); ctx.arc(l.x, l.y, r + 7, spin, spin + Math.PI); ctx.strokeStyle = col(pa, 0.9); ctx.stroke()
    ctx.beginPath(); ctx.arc(l.x, l.y, r + 7, spin + Math.PI, spin + TAU); ctx.strokeStyle = col(pb, 0.9); ctx.stroke()
    ctx.beginPath(); ctx.arc(l.x, l.y, r + 11.5, -Math.PI / 2, -Math.PI / 2 + TAU * l.strain)
    ctx.lineWidth = 2.5; ctx.strokeStyle = col(l.strain > 0.66 ? 'danger' : 'light', 0.95); ctx.stroke()
    ctx.restore()
  }
  function drawLoot(l) {
    const hs = holders(l)
    if (hs.length === 2 && l.kind === 'bill') { stretched(l, hs); contestRing(l, 20); return }
    const r = RAD[l.kind] ?? 12
    const spin = st.t * 2.4 + l.id * 1.7
    const rot = (hash01(l.id) - 0.5) * 0.6
    const drop = clamp(l.z, 0, 1)
    const was = st.loot.get(l.id)
    const sq = was && drop === 0 && was.landedAt != null && st.t - was.landedAt < 0.2 ? Math.sin(((st.t - was.landedAt) / 0.2) * Math.PI) * 0.18 : 0
    const s = 1 + drop * 0.9 + sq
    const blink = l.ttl < 1.6 && !hs.length && l.z <= 0 ? (Math.sin(l.ttl * 26) > 0 ? 0.35 : 1) : 1
    ctx.save(); ctx.globalAlpha = blink * (1 - drop * 0.25)
    shadow(l.x, l.y + drop * 10, r * (1 - drop * 0.5), r * 0.55 * (1 - drop * 0.5), 0.3 * (1 - drop * 0.6))
    const strained = hs.length === 2 && l.strain > 0.4 && !reduced ? (l.strain - 0.4) * 5 : 0
    ctx.translate(l.x + (strained ? (Math.random() - 0.5) * 2 * strained : 0), l.y - drop * 46 + (strained ? (Math.random() - 0.5) * 2 * strained : 0))
    if (l.kind === 'coin') coin({ r }, s, spin)
    else if (l.kind === 'gem') {
      const q = r * s
      ctx.rotate(Math.sin(spin * 0.7) * 0.12)
      const gem = () => { ctx.beginPath(); ctx.moveTo(0, q); ctx.lineTo(-q, -q * 0.2); ctx.lineTo(-q * 0.55, -q * 0.8); ctx.lineTo(q * 0.55, -q * 0.8); ctx.lineTo(q, -q * 0.2); ctx.closePath() }
      gem(); ctx.fillStyle = col('p3'); ctx.fill()
      ctx.fillStyle = 'rgb(255 255 255 / .45)'; ctx.beginPath(); ctx.moveTo(-q * 0.55, -q * 0.8); ctx.lineTo(-q * 0.25, -q * 0.2); ctx.lineTo(-q, -q * 0.2); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgb(255 255 255 / .22)'; ctx.beginPath(); ctx.moveTo(-q * 0.25, -q * 0.2); ctx.lineTo(q * 0.25, -q * 0.2); ctx.lineTo(0, q); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgb(0 0 0 / .2)'; ctx.beginPath(); ctx.moveTo(q * 0.25, -q * 0.2); ctx.lineTo(q, -q * 0.2); ctx.lineTo(0, q); ctx.closePath(); ctx.fill()
      gem(); ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.8); ctx.stroke()
      const tw = (Math.sin(spin * 3) + 1) / 2
      star(q * 0.7, -q * 0.9, 2 + tw * 4, spin); ctx.fillStyle = col('light', 0.5 + tw * 0.5); ctx.fill()
    } else {
      ctx.rotate(rot + Math.sin(spin * 1.3) * 0.07); ctx.scale(s, s)
      if (l.kind === 'bill') billShape(34, 20, 'win')
      else {
        // dye pack: a banded stack with a blinking light — the tell to read before you grab
        billShape(34, 20, 'win'); ctx.fillStyle = col('light'); ctx.fillRect(-5, -10, 10, 20)
        ctx.strokeStyle = col('ink', 0.75); ctx.lineWidth = 1.2; ctx.strokeRect(-5, -10, 10, 20)
        const on = Math.sin(st.t * 14 + l.id) > 0
        ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fillStyle = col('danger', on ? 1 : 0.35); ctx.fill()
        if (on) { ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fillStyle = col('danger', 0.25); ctx.fill() }
        ctx.beginPath(); ctx.moveTo(5, -4); ctx.quadraticCurveTo(13, -14, 15, -5); ctx.strokeStyle = col('danger', 0.9); ctx.lineWidth = 1.3; ctx.stroke()
      }
    }
    ctx.restore()
    if (hs.length === 2) contestRing(l, r)
  }
  scene.loot.forEach((l) => { if (!l.holders.length) drawLoot(l) })

  // ── arms and gloves ──
  function arm(p, h, k) {
    const mx = p.mouth.x; const my = p.mouth.y
    const d = Math.hypot(h.x - mx, h.y - my)
    if (d < 4 && !h.active) return
    const m = st.hands[`${p.i}:${k}`]
    const wob = m ? m.wob : 0
    const stretch = clamp(Math.hypot(h.x - p.safe.x, h.y - p.safe.y) / p.reach, 0, 1)
    const w = 12 - stretch * 6.5
    const nx = -(h.y - my) / (d || 1); const ny = (h.x - mx) / (d || 1)
    const cx = (mx + h.x) / 2 + nx * wob * 14; const cy = (my + h.y) / 2 + ny * wob * 14
    const path = () => { ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(cx, cy, h.x, h.y) }
    const key = playerKey(p.i)
    ctx.lineCap = 'round'
    ctx.save(); ctx.translate(3, 6); path(); ctx.lineWidth = w + 2; ctx.strokeStyle = 'rgb(0 0 0 / .2)'; ctx.stroke(); ctx.restore()
    path(); ctx.lineWidth = w + 3; ctx.strokeStyle = col('ink', 0.85); ctx.stroke()
    path(); ctx.lineWidth = w; ctx.strokeStyle = col(key); ctx.stroke()
    ctx.setLineDash([3, 9]); ctx.lineDashOffset = -d * 0.5
    path(); ctx.lineWidth = w; ctx.strokeStyle = 'rgb(255 255 255 / .22)'; ctx.stroke(); ctx.setLineDash([])
    path(); ctx.lineWidth = Math.max(1, w * 0.22); ctx.strokeStyle = 'rgb(255 255 255 / .35)'; ctx.stroke()
    const ang = d > 6 ? Math.atan2(h.y - cy, h.x - cx) : p.ang
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang)
    const closed = h.loot != null
    const gr = 10.5
    ctx.fillStyle = col('ink', 0.85); ctx.beginPath(); ctx.arc(0, 0, gr + 1.6, 0, TAU); ctx.fill()
    if (!closed) for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(9 + (i === 0 ? 2.5 : 0), i * 6.5, 5.6, 0, TAU); ctx.fill() }
    ctx.fillStyle = col(p.dyed > 0 ? 'danger' : 'light')
    if (!closed) for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.arc(9 + (j === 0 ? 2.5 : 0), j * 6.5, 4.2, 0, TAU); ctx.fill() }
    ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill()
    ctx.fillStyle = col(key); ctx.fillRect(-gr - 1, -gr * 0.75, 5, gr * 1.5)
    if (closed) { ctx.strokeStyle = col('ink', 0.5); ctx.lineWidth = 1.2; for (let q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(4, q * 4.5); ctx.lineTo(9, q * 4.5); ctx.stroke() } }
    ctx.restore()
    if (h.stun > 0) for (let i = 0; i < 3; i++) { const sa = st.t * 9 + (i * TAU) / 3; star(h.x + Math.cos(sa) * 15, h.y - 12 + Math.sin(sa) * 5, 3.5, sa); ctx.fillStyle = col('cta'); ctx.fill() }
  }
  scene.players.forEach((p) => p.hands.forEach((h, k) => arm(p, h, k)))

  scene.loot.forEach((l) => { if (l.holders.length) drawLoot(l) })

  // ── safes ──
  scene.players.forEach((p) => {
    const vis = st.players[p.i] ?? { shown: p.score, dial: 0, pop: 0 }
    const s = p.safe
    const pop = vis.pop > 0 ? Math.sin(vis.pop * Math.PI) * 0.14 : 0
    const key = playerKey(p.i)
    shadow(s.x, s.y + 4, 34, 24, 0.3)
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(p.ang - Math.PI / 2); ctx.scale(1 + pop, 1 + pop)
    const w = 62; const h = 50
    ctx.fillStyle = col('ink', 0.9); rr(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 9); ctx.fill()
    rr(-w / 2, -h / 2, w, h, 7); ctx.fillStyle = col(key); ctx.fill()
    ctx.fillStyle = 'rgb(255 255 255 / .28)'; rr(-w / 2 + 2, -h / 2 + 2, w - 4, 9, 5); ctx.fill()
    ctx.fillStyle = 'rgb(0 0 0 / .22)'; rr(-w / 2 + 2, h / 2 - 12, w - 4, 10, 5); ctx.fill()
    ctx.lineWidth = 1.5; ctx.strokeStyle = col('ink', 0.55); rr(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 4); ctx.stroke()
    ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((c) => { ctx.beginPath(); ctx.arc(c[0] * (w / 2 - 10), c[1] * (h / 2 - 10), 2, 0, TAU); ctx.fillStyle = col('ink', 0.6); ctx.fill() })
    ctx.fillStyle = col('ink', 0.92); rr(-15, h / 2 - 9, 30, 11, 5); ctx.fill()
    ctx.fillStyle = col('cta', clamp(0.25 + pop * 4, 0, 1)); rr(-12, h / 2 - 6, 24, 5, 2.5); ctx.fill()
    ctx.beginPath(); ctx.arc(0, -3, 12, 0, TAU); ctx.fillStyle = col('metal'); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.8); ctx.stroke()
    ctx.save(); ctx.translate(0, -3); ctx.rotate(vis.dial)
    for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillStyle = col('light', 0.75); ctx.fillRect(-0.7, -11, 1.4, 3) }
    ctx.fillStyle = col('light'); ctx.fillRect(-1.5, -9, 3, 9); ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fillStyle = col('ink', 0.85); ctx.fill()
    ctx.restore()
    if (p.dyed > 0) { ctx.fillStyle = col('danger', clamp(0.4 + 0.3 * Math.sin(st.t * 22), 0, 1)); rr(-w / 2, -h / 2, w, h, 7); ctx.fill() }
    ctx.restore()

    // score window beside the safe, turned for a person sitting across the table
    const ox = s.x < 120 ? 50 : s.x > 240 ? -50 : 54
    const oy = scene.players.length === 2 ? 0 : s.y < H / 2 ? 4 : -4
    upright(s.x + ox, s.y + oy, flipSeat(p.i), () => {
      ctx.fillStyle = col('ink', 0.9); rr(-19, -12, 38, 24, 6); ctx.fill()
      ctx.fillStyle = col('light'); rr(-17, -10, 34, 20, 4); ctx.fill()
      ctx.fillStyle = col(key); ctx.fillRect(-17, 7, 34, 3)
      ctx.fillStyle = col('ink'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = font(11)
      ctx.fillText(String(Math.round(vis.shown)), 1, -1)
    })
    const name = names[p.i]
    if (name) {
      const top = s.y < H / 2
      label(name, s.x, s.y + (top ? 40 : -40), 6, col(key), 3, flipSeat(p.i))
    }
  })

  // ── particles and floats ──
  st.fx.forEach((f) => {
    const a = 1 - f.life / f.max
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = a
    ctx.fillStyle = col(f.key)
    if (f.kind === 'star') { star(0, 0, f.size, 0); ctx.fill() }
    else if (f.kind === 'paper') ctx.fillRect(-f.size, -f.size * 0.6, f.size * 2, f.size * 1.2)
    else { ctx.beginPath(); ctx.arc(0, 0, f.size * (f.kind === 'blob' ? 1.5 : 0.8), 0, TAU); ctx.fill() }
    ctx.restore()
  })
  st.floats.forEach((f) => {
    const a = clamp(1.1 - f.life, 0, 1)
    const sc = 1 + Math.max(0, 0.25 - f.life) * 2
    ctx.save(); ctx.globalAlpha = a
    upright(clamp(f.x, 40, W - 40), f.y - 26, false, () => {
      ctx.scale(sc, sc)
      ctx.font = font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.lineWidth = 4; ctx.strokeStyle = col('ink', 0.9); ctx.lineJoin = 'round'; ctx.strokeText(f.text, 0, 0)
      ctx.fillStyle = col(f.key === 'text' ? 'light' : f.key); ctx.fillText(f.text, 0, 0)
    })
    ctx.restore()
  })

  // ── overlay: count-in, last call ──
  if (scene.phase === 'count') {
    const n = Math.ceil(scene.count - 0.4)
    let part = (scene.count - 0.4) % 1
    if (part < 0) part += 1
    ctx.fillStyle = 'rgb(0 0 0 / .28)'; rr(0, 0, W, H, 22); ctx.fill()
    const sc = 1 + (reduced ? 0 : part * 0.5)
    upright(W / 2 + 2, H / 2 + 2, false, () => {
      ctx.scale(sc, sc)
      ctx.font = font(n >= 1 ? 44 : 26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const t = n >= 1 ? String(n) : 'GRAB!'
      ctx.lineWidth = 8; ctx.strokeStyle = col('ink', 0.9); ctx.lineJoin = 'round'; ctx.strokeText(t, 0, 0)
      ctx.fillStyle = col('cta'); ctx.fillText(t, 0, 0)
    })
  }
  if (lastCallActive(scene) && scene.phase === 'play') {
    const pulse = 0.25 + (reduced ? 0 : 0.2 * Math.sin(st.t * 9))
    ctx.lineWidth = 10; ctx.strokeStyle = col('cta', pulse); rr(5, 5, W - 10, H - 10, 18); ctx.stroke()
    if (scene.time > 10 - 1.6) label('LAST CALL x2', W / 2, H / 2 - 62, 13, col('cta'), 5)
  }
  if (st.flash > 0) { ctx.fillStyle = col('danger', clamp(st.flash * 0.9, 0, 1)); rr(0, 0, W, H, 22); ctx.fill() }
  ctx.restore()
}
