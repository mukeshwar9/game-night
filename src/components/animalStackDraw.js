// Canvas drawing for ANIMAL STACK (rendering only — no rules).
// Pixel-art look: the scene is drawn at ~1/2.5 resolution on an offscreen
// canvas and scaled up without smoothing. Every colour comes from the --c-*
// theme tokens, read once per theme change.
import { PIECES, ISLAND } from '../lib/animalStackLogic'

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

/** Draw animal `k` centred at art-pixel (x, y), angle `a`, `s` art px per metre. */
function drawAnimal(ctx, k, x, y, a, s, opts = {}) {
  const def = PIECES[k]
  if (!def) return
  const c = Math.cos(a), sn = Math.sin(a)
  const tr = ([vx, vy]) => [x + (vx * c - vy * sn) * s, y - (vx * sn + vy * c) * s]
  ctx.globalAlpha = opts.alpha ?? 1
  for (const part of def.parts) { polyPath(ctx, part.map(tr)); ctx.fillStyle = col(def.tone); ctx.fill() }
  ctx.lineWidth = Math.max(1, s * 0.07)
  ctx.strokeStyle = 'rgb(0 0 0 / .38)'
  for (const part of def.parts) { polyPath(ctx, part.map(tr)); ctx.stroke() }
  const e = Math.max(1, Math.round(s * 0.1))
  for (const ev of def.eyes) {
    const [px, py] = tr(ev)
    ctx.fillStyle = 'rgb(10 10 20)'
    ctx.fillRect(Math.round(px - e / 2), Math.round(py - e / 2), e, e)
    if (e > 1) { ctx.fillStyle = 'rgb(255 255 255 / .9)'; ctx.fillRect(Math.round(px - e / 2), Math.round(py - e / 2), 1, 1) }
  }
  if (opts.outline) {
    ctx.lineWidth = Math.max(1, s * 0.09)
    ctx.strokeStyle = col(opts.outline)
    if (opts.dash) ctx.setLineDash(opts.dash)
    for (const part of def.parts) { polyPath(ctx, part.map(tr)); ctx.stroke() }
    ctx.setLineDash([])
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
 * scene: { items: [{k,x,y,a,outline?}], hover?: {k,x,y,a,player}, view: {bottom, ppm},
 *          best?: number, shake?: [dx,dy], t: ms, particles?: [{x,y,life,c}] }
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
  for (const it of scene.items) drawAnimal(o, it.k, X(it.x), Y(it.y), it.a, s, it.outline ? { outline: it.outline } : undefined)
  if (h) drawAnimal(o, h.k, X(h.x), Y(h.y), h.a, s, { outline: PLAYER_TOKENS[h.player || 0], alpha: 0.92, dash: [2, 1] })
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
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
  for (const part of def.parts) for (const [x, y] of part) {
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y)
  }
  const s = Math.min(off.width / ((maxx - minx) * 1.15), off.height / ((maxy - miny) * 1.15))
  drawAnimal(o, k, off.width / 2 - ((minx + maxx) / 2) * s, off.height / 2 + ((miny + maxy) / 2) * s, 0, s)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, 0, 0, off.width * PIX * dpr, off.height * PIX * dpr)
}
