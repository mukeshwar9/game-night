// Canvas drawing for ANIMAL STACK (rendering only — no rules).
// The backdrop keeps a pixel-art look: it is drawn at ~1/2.5 resolution on an
// offscreen canvas and scaled up without smoothing. The animals are painted
// sprites drawn over it at full resolution. Every colour comes from the --c-*
// theme tokens, read once per theme change.
import { PIECES, ISLAND } from '../lib/animalStackLogic'
import { PIXELS, CELL } from '../lib/animalStackPixels'
import { lum, paintAnimal, parseRgb, rolePalette, SKINS } from './animalStackArt'
import { canvasPixelRatio } from '../lib/platform'

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
// Each animal's silhouette and colour roles come from its grid
// (lib/animalStackPixels.js), which is also its physics hull. paintAnimal
// shades it once per (theme, scale) into a sprite plus a soft contact shadow;
// per frame they are only rotated and blitted.
const sprites = new Map()
let spriteTheme = null

function paletteFor(tone) {
  const t = tokens()
  return rolePalette(parseRgb(t[tone]), { bg: parseRgb(t.bg), text: parseRgb(t.text), beak: parseRgb(t.kam7), blush: parseRgb(t.kam4) })
}

function toCanvas(w, h, rgba) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0)
  return c
}

/** Sprite for animal `k`, `n` device px per grid cell. */
function sprite(k, n) {
  tokens()
  if (spriteTheme !== tokTheme || sprites.size > 60) { sprites.clear(); spriteTheme = tokTheme }
  const key = `${k}|${n}`
  let sp = sprites.get(key)
  if (sp) return sp
  const id = PIECES[k].id
  const px = PIXELS[id]
  const art = paintAnimal(px.grid, paletteFor(px.tone), n, SKINS[id], { parts: px.parts, cell: CELL })
  // contact shadow in the theme's darker end
  const t = tokens()
  const [bg, text] = [parseRgb(t.bg), parseRgb(t.text)]
  const ink = lum(bg) < lum(text) ? bg : text
  const { shadow } = art
  const srgba = new Uint8ClampedArray(shadow.w * shadow.h * 4)
  for (let i = 0; i < shadow.alpha.length; i++) {
    srgba[i * 4] = ink[0]; srgba[i * 4 + 1] = ink[1]; srgba[i * 4 + 2] = ink[2]; srgba[i * 4 + 3] = shadow.alpha[i]
  }
  sp = {
    c: toCanvas(art.w, art.h, art.rgba), w: px.w, h: px.h, masks: {},
    shadow: toCanvas(shadow.w, shadow.h, srgba), pad: shadow.pad / n,
  }
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

// Even steps capped at 10 px per cell: smoothing upscales the rest, and few
// distinct scales means few paints.
const spriteScale = (cell, dpr) => Math.min(10, Math.max(4, 2 * Math.round(cell * dpr / 2)))

// Paint the animals not drawn yet one per idle slot, so a new animal or a
// theme change never stalls a frame painting several at once.
let warming = null
function warm(n) {
  const key = `${tokTheme}|${n}`
  if (warming === key || typeof requestIdleCallback !== 'function') return
  warming = key
  let k = 0
  const step = (deadline) => {
    if (warming !== key) return
    while (k < PIECES.length && deadline.timeRemaining() > 8) sprite(k++, n)
    if (k < PIECES.length) requestIdleCallback(step)
  }
  requestIdleCallback(step)
}

/** Soft contact shadow of animal `k`, cast a little below it. */
function drawShadow(ctx, k, x, y, a, cell, dpr) {
  if (!PIECES[k]) return
  const sp = sprite(k, spriteScale(cell, dpr))
  const p = sp.pad * cell
  const dw = sp.w * cell, dh = sp.h * cell
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.translate(x, y + cell * 0.9)
  ctx.rotate(-a)
  ctx.drawImage(sp.shadow, -dw / 2 - p, -dh / 2 - p, dw + 2 * p, dh + 2 * p)
  ctx.restore()
}

/**
 * Draw animal `k` centred at CSS px (x, y), angle `a`, `cell` CSS px per grid
 * cell. `dpr` picks the sprite scale. opts: alpha, outline (player token for
 * a ring), pulse (0-1 ring strength).
 */
function drawAnimal(ctx, k, x, y, a, cell, dpr, opts = {}) {
  if (!PIECES[k]) return
  const sp = sprite(k, spriteScale(cell, dpr))
  const dw = sp.w * cell, dh = sp.h * cell
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(x, y)
  ctx.rotate(-a)
  if (opts.outline) {
    const m = spriteMask(sp, opts.outline)
    ctx.globalAlpha = (opts.alpha ?? 1) * (opts.pulse ?? 1)
    const d = cell * 0.8
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      ctx.drawImage(m, -dw / 2 + dx * d, -dh / 2 + dy * d, dw, dh)
    }
  }
  ctx.globalAlpha = opts.alpha ?? 1
  ctx.drawImage(sp.c, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
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
  const dpr = canvasPixelRatio() || 1
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
  for (const p of scene.particles || []) {
    o.fillStyle = col(p.c || 'text', Math.max(0, p.life))
    o.fillRect(Math.round(X(p.x)), Math.round(Y(p.y)), 1, 1)
  }

  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, 0, 0, aw * PIX * dpr, ah * PIX * dpr)
  ctx.scale(dpr, dpr)
  // animals go on at full resolution, lowest first, each casting its contact
  // shadow onto whatever is already drawn beneath it
  const cell = view.ppm * CELL
  warm(spriteScale(cell, dpr))
  const items = [...scene.items].sort((p, q) => p.y - q.y)
  for (const it of items) {
    drawShadow(ctx, it.k, X(it.x) * PIX, Y(it.y) * PIX, it.a, cell, dpr)
    drawAnimal(ctx, it.k, X(it.x) * PIX, Y(it.y) * PIX, it.a, cell, dpr, { outline: it.outline })
  }
  if (h) {
    const pulse = scene.still ? 1 : 0.65 + 0.35 * Math.sin(now / 170)
    drawAnimal(ctx, h.k, X(h.x) * PIX, Y(h.y) * PIX, h.a, cell, dpr, { outline: PLAYER_TOKENS[h.player || 0], pulse, alpha: 0.95 })
  }
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

/** Small portrait of animal `k` (NEXT preview, icons). */
export function drawThumb(canvas, k) {
  const px = PIXELS[PIECES[k]?.id]
  if (!px) return
  const dpr = canvasPixelRatio() || 1
  const W = canvas.clientWidth || 44, H = canvas.clientHeight || 34
  canvas.width = W * dpr; canvas.height = H * dpr
  const cell = Math.min(W / px.w, H / px.h)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  drawAnimal(ctx, k, W / 2, H / 2, 0, cell, dpr)
}
