// Canvas drawing for ANIMAL STACK (rendering only — no rules).
// Pixel-art look: the scene is drawn at ~1/2.5 resolution on an offscreen
// canvas and scaled up without smoothing. Every colour comes from the --c-*
// theme tokens, read once per theme change.
import { PIECES, ISLAND } from '../lib/animalStackLogic'
import { ART, hullBounds, parseRgb, pixelate, rolePalette } from './animalStackArt'

const TOKENS = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger',
  'structure', 'kam0', 'kam1', 'kam2', 'kam3', 'kam4', 'kam5', 'kam6', 'kam7']
export const PLAYER_TOKENS = ['p1', 'p2', 'p3', 'p4']
export const PLAYER_GLYPHS = ['●', '▲', '■', '◆']

let tok = {}
let tokTheme = null
function tokens() {
  const theme = document.documentElement.getAttribute('data-theme') || ''
  if (theme !== tokTheme || !tok.bg) {
    const cs = getComputedStyle(document.documentElement)
    tok = {}
    for (const n of TOKENS) tok[n] = cs.getPropertyValue(`--c-${n}`).trim() || '128 128 128'
    tokTheme = theme
  }
  return tok
}
const col = (n, a) => `rgb(${tokens()[n]}${a == null ? '' : ` / ${a}`})`

function polyPath(ctx, pts) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

// ─── Sprites ─────────────────────────────────────────────────────────────────
// Each animal is rendered once per (theme, scale) into a small pixel sprite:
// hull filled in its tone, ART details clipped inside, then snapped to a
// crisp palette with a one-pixel inner outline (animalStackArt.pixelate).
// Per frame the sprite is only rotated and blitted without smoothing, which
// keeps the chunky pixel look at any angle. Eyes are drawn live on top so
// the animals can blink and look scared while the tower wobbles.
const sprites = new Map()
let spriteTheme = null

function paletteFor(tone) {
  const t = tokens()
  return rolePalette(parseRgb(t[tone]), { bg: parseRgb(t.bg), text: parseRgb(t.text), beak: parseRgb(t.kam7), blush: parseRgb(t.kam4) })
}

function sprite(k, s) {
  tokens()
  if (spriteTheme !== tokTheme || sprites.size > 240) { sprites.clear(); spriteTheme = tokTheme }
  const key = `${k}|${s.toFixed(2)}`
  let sp = sprites.get(key)
  if (sp) return sp
  const def = PIECES[k]
  const art = ART[def.id] || { details: [] }
  const pal = paletteFor(def.tone)
  const [minx, miny, maxx, maxy] = hullBounds(def)
  const w = Math.ceil((maxx - minx) * s) + 2, h = Math.ceil((maxy - miny) * s) + 2
  const ax = 1 - minx * s, ay = 1 + maxy * s
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  const rgb = (r) => `rgb(${(pal[r] || pal.base).join(' ')})`
  g.setTransform(s, 0, 0, -s, ax, ay)
  g.fillStyle = rgb('base')
  for (const part of def.parts) { polyPath(g, part); g.fill() }
  g.globalCompositeOperation = 'source-atop'
  const used = new Set(['base'])
  for (const d of art.details) {
    used.add(d.r)
    if (d.l) {
      g.strokeStyle = rgb(d.r); g.lineWidth = d.w; g.lineCap = 'round'; g.lineJoin = 'round'
      g.beginPath(); d.l.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke()
      continue
    }
    g.fillStyle = rgb(d.r)
    if (d.e) { g.beginPath(); g.ellipse(d.e[0], d.e[1], d.e[2], d.e[3], 0, 0, Math.PI * 2); g.fill() } else { polyPath(g, d.p); g.fill() }
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  const img = g.getImageData(0, 0, w, h)
  pixelate(img.data, w, h, [...used].map(r => pal[r] || pal.base), pal.dark)
  g.putImageData(img, 0, 0)
  sp = { c, ax, ay, pal, masks: {} }
  sprites.set(key, sp)
  return sp
}

/** The sprite's silhouette flat-filled with a theme token (player ring). */
function spriteMask(sp, token) {
  if (sp.masks[token]) return sp.masks[token]
  const m = document.createElement('canvas')
  m.width = sp.c.width; m.height = sp.c.height
  const g = m.getContext('2d')
  g.drawImage(sp.c, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = col(token); g.fillRect(0, 0, m.width, m.height)
  sp.masks[token] = m
  return m
}

/**
 * Draw animal `k` centred at art-pixel (x, y), angle `a`, `s` art px per metre.
 * opts: alpha, outline (player token for a ring), pulse (0-1 ring strength),
 * t (ms, drives blinking), seed (per-animal blink phase), speed (m/s).
 */
function drawAnimal(ctx, k, x, y, a, s, opts = {}) {
  const def = PIECES[k]
  if (!def) return
  const sp = sprite(k, s)
  ctx.save()
  ctx.globalAlpha = opts.alpha ?? 1
  ctx.translate(x, y)
  ctx.rotate(-a)
  if (opts.outline) {
    const m = spriteMask(sp, opts.outline)
    ctx.globalAlpha = (opts.alpha ?? 1) * (opts.pulse ?? 1)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(m, dx - sp.ax, dy - sp.ay)
    ctx.globalAlpha = opts.alpha ?? 1
  }
  ctx.drawImage(sp.c, -sp.ax, -sp.ay)
  ctx.restore()

  // Eyes: pupils look the way the animal faces; a blink every few seconds;
  // wide eyes while it is flying or sliding fast.
  const c = Math.cos(a), sn = Math.sin(a)
  const e = Math.max(1, Math.round(s * 0.08))
  const scared = (opts.speed ?? 0) > 1.6
  const big = ART[def.id]?.bigEyes || scared
  const phase = ((opts.t ?? 0) + (opts.seed ?? 0) * 1733) % 4100
  const blink = !scared && opts.t != null && phase < 120
  const face = c >= 0 ? 1 : -1
  ctx.globalAlpha = opts.alpha ?? 1
  for (const [vx, vy] of def.eyes) {
    const px = Math.round(x + (vx * c - vy * sn) * s), py = Math.round(y - (vx * sn + vy * c) * s)
    const sz = big ? e + 2 : e + (e > 1 ? 1 : 0)
    const x0 = px - Math.floor(sz / 2), y0 = py - Math.floor(sz / 2)
    if (blink) {
      ctx.fillStyle = `rgb(${sp.pal.pupil.join(' ')})`
      ctx.fillRect(x0, py, sz, 1)
      continue
    }
    if (big || e > 1) { ctx.fillStyle = `rgb(${sp.pal.eye.join(' ')})`; ctx.fillRect(x0, y0, sz, sz) }
    const pe = scared ? 1 : Math.min(e, sz)
    ctx.fillStyle = `rgb(${sp.pal.pupil.join(' ')})`
    if (scared) { ctx.fillRect(px, py, 1, 1); continue }
    const front = ART[def.id]?.bigEyes
    const pxl = front ? x0 + Math.floor((sz - pe) / 2) : face > 0 ? x0 + sz - pe : x0
    ctx.fillRect(pxl, y0 + sz - pe, pe, pe)
  }
  ctx.globalAlpha = 1
}

/** Camera: 6.8 m across; follow the tower so the hover piece sits near the top. */
export function viewFor(width, height, top, hoverRadius = 0.8) {
  const ppm = width / 6.8
  const visible = height / ppm
  const hoverY = top + hoverRadius + 0.45
  return { ppm, bottom: Math.max(-2.1, hoverY + 1.4 - visible) }
}

/**
 * scene: { items: [{k,x,y,a,outline?,speed?}], hover?: {k,x,y,a,player}, view: {bottom, ppm},
 *          best?: number, shake?: [dx,dy], t: ms, still?: bool (reduced motion),
 *          particles?: [{x,y,life,c}], floats?: [{x,y,text,life,c}] }
 */
export function drawScene(canvas, scene) {
  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth, H = canvas.clientHeight
  if (!W || !H) return
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  }
  const PIX = 2.5
  const aw = Math.ceil(W / PIX), ah = Math.ceil(H / PIX)
  const off = canvas._off || (canvas._off = document.createElement('canvas'))
  if (off.width !== aw || off.height !== ah) { off.width = aw; off.height = ah }
  const o = off.getContext('2d')
  o.imageSmoothingEnabled = false
  const { view } = scene
  const s = view.ppm / PIX
  const [shx, shy] = scene.shake || [0, 0]
  const X = (x) => aw / 2 + x * s + shx
  const Y = (y) => ah - (y - view.bottom) * s + shy

  o.fillStyle = col('bg'); o.fillRect(0, 0, aw, ah)
  o.fillStyle = col('dim', 0.25)
  for (let i = 0; i < 40; i++) {
    const sy = ((i * 53 + view.bottom * s * 0.4) % ah + ah) % ah
    o.fillRect((i * 97) % aw, Math.floor(sy), 1, 1)
  }
  // height ruler, one tick per metre
  o.fillStyle = col('dim', 0.5)
  const y0 = Math.floor(view.bottom), y1 = Math.ceil(view.bottom + ah / s)
  for (let m = Math.max(0, y0); m <= y1; m++) o.fillRect(0, Math.round(Y(m)), m % 5 === 0 ? 6 : 3, 1)
  if (scene.best) {
    o.fillStyle = col('cta', 0.8)
    const by = Math.round(Y(scene.best))
    for (let bx = 0; bx < aw; bx += 4) o.fillRect(bx, by, 2, 1)
  }
  // water
  const wy = Y(-0.45)
  o.fillStyle = col('kam6', 0.35); o.fillRect(0, Math.round(wy), aw, ah)
  o.fillStyle = col('kam6', 0.7)
  const t = (scene.t || 0) / 400
  for (let wx = 0; wx < aw; wx += 3) o.fillRect(wx, Math.round(wy + Math.sin(wx / 7 + t) * 1.2), 2, 1)
  // island
  polyPath(o, ISLAND.map(([x, y]) => [X(x), Y(y)]))
  o.fillStyle = col('kam0'); o.fill()
  o.fillStyle = col('win'); o.fillRect(Math.round(X(-2.6)), Math.round(Y(0)), Math.round(5.2 * s), Math.max(1, Math.round(0.12 * s)))
  // drop guide
  const h = scene.hover
  if (h) {
    o.fillStyle = col(PLAYER_TOKENS[h.player || 0], 0.55)
    const gx = Math.round(X(h.x))
    for (let gy = Math.round(Y(h.y)); gy < Math.round(wy); gy += 4) o.fillRect(gx, gy, 1, 2)
  }
  const now = scene.t || 0
  scene.items.forEach((it, i) => drawAnimal(o, it.k, X(it.x), Y(it.y), it.a, s, { outline: it.outline, t: now, seed: i, speed: it.speed }))
  if (h) {
    const pulse = scene.still ? 1 : 0.65 + 0.35 * Math.sin(now / 170)
    drawAnimal(o, h.k, X(h.x), Y(h.y), h.a, s, { outline: PLAYER_TOKENS[h.player || 0], pulse, alpha: 0.95, t: now, seed: 99 })
  }
  for (const p of scene.particles || []) {
    o.fillStyle = col(p.c || 'text', Math.max(0, p.life))
    o.fillRect(Math.round(X(p.x)), Math.round(Y(p.y)), 1, 1)
  }

  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, 0, 0, aw * PIX * dpr, ah * PIX * dpr)
  ctx.scale(dpr, dpr)
  ctx.font = '7px "Press Start 2P", monospace'
  ctx.fillStyle = col('dim', 0.9)
  for (let mm = Math.max(5, Math.ceil(y0 / 5) * 5); mm <= y1; mm += 5) ctx.fillText(`${mm}M`, 8, (Y(mm) + 3) * PIX)
  if (scene.best) {
    ctx.fillStyle = col('cta')
    ctx.fillText(`BEST ${scene.best.toFixed(1)}M`, W - 96, (Y(scene.best) - 3) * PIX)
  }
  // floating callouts (+0.6M, NEW BEST!) rise and fade over the tower
  ctx.textAlign = 'center'
  for (const f of scene.floats || []) {
    const fx = Math.max(40, Math.min(W - 40, X(f.x) * PIX)), fy = (Y(f.y) - (1 - f.life) * 10) * PIX
    ctx.fillStyle = col('bg', Math.min(1, f.life * 2) * 0.85)
    ctx.fillText(f.text, fx + 1, fy + 1)
    ctx.fillStyle = col(f.c || 'text', Math.min(1, f.life * 2))
    ctx.fillText(f.text, fx, fy)
  }
  ctx.textAlign = 'start'
}

/** Small pixel portrait of animal `k` (NEXT preview, icons). */
export function drawThumb(canvas, k) {
  const def = PIECES[k]
  if (!def) return
  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth || 44, H = canvas.clientHeight || 34
  canvas.width = W * dpr; canvas.height = H * dpr
  const PIX = 2
  const off = document.createElement('canvas')
  off.width = Math.ceil(W / PIX); off.height = Math.ceil(H / PIX)
  const o = off.getContext('2d')
  o.imageSmoothingEnabled = false
  const [minx, miny, maxx, maxy] = hullBounds(def)
  const s = Math.min(off.width / ((maxx - minx) * 1.15), off.height / ((maxy - miny) * 1.15))
  drawAnimal(o, k, off.width / 2 - ((minx + maxx) / 2) * s, off.height / 2 + ((miny + maxy) / 2) * s, 0, s)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, 0, 0, off.width * PIX * dpr, off.height * PIX * dpr)
}
