// Canvas drawing for REEF RUN (rendering only — no rules). Vector look: smooth
// terrain, gradient sprites, parallax water. Every colour comes from CSS tokens
// (--c-reef-* scene palette + the --c-* avatar/theme tokens), read once per
// data-theme change. Cosmetic state (bubbles, hit flash, animation clock) lives
// inside the object createReefRenderer returns.
import { fishSpec, FISH_SIZE } from '../lib/avatarFish'
import { ACCESSORY_TONES } from '../lib/avatarSprites'

/* ---------------------------------------------------------------- palette */

const REEF_NAMES = ['w0', 'w1', 'w2', 'w3', 'w4', 'far', 'farD', 'dark', 'bubble', 'ink', 'orange', 'orangeD', 'orangeL',
  'white', 'hi', 'pinkL', 'pink', 'pinkD', 'greyL', 'grey', 'greyD', 'rockL', 'rock', 'rockD', 'sand', 'sandD',
  'weedL', 'weed', 'weedD', 'coral', 'coralD', 'pearl', 'pearlD', 'gold', 'goldD', 'goldL', 'purple', 'purpleD',
  'red', 'redD', 'eel', 'eelD', 'lamp', 'lampL', 'abyss', 'hudBg']
const THEME_NAMES = ['p1', 'p2', 'cta', 'win', 'text', 'dim', 'av1', 'av2', 'av3', 'av4', 'surface']
const SKIN_NAMES = ['s1', 's2', 's3', 's4', 's5']
const FALLBACK = [128, 128, 128]

let pal = {}
let palTheme = null
const strCache = new Map()

function readVar(cs, name) {
  const v = cs.getPropertyValue(name).trim()
  if (!v) return null
  const p = v.split(/\s+/).map(Number)
  return p.length >= 3 && p.every(Number.isFinite) ? p : null
}

/** Re-read the tokens when data-theme changes (or while the stylesheet hasn't applied yet). */
function ensurePalette() {
  const theme = document.documentElement.getAttribute('data-theme') || ''
  if (theme === palTheme && pal.w0) return
  const cs = getComputedStyle(document.documentElement)
  const next = {}
  for (const n of REEF_NAMES) next[n] = readVar(cs, `--c-reef-${n}`) || FALLBACK
  for (const n of THEME_NAMES) next[n] = readVar(cs, `--c-${n}`) || FALLBACK
  SKIN_NAMES.forEach((n, i) => { next[n] = readVar(cs, `--c-skin-${i + 1}`) || FALLBACK })
  const loaded = !!readVar(cs, '--c-reef-w0')
  pal = next
  strCache.clear()
  palTheme = loaded ? theme : null
}

const rgbOf = n => pal[n] || FALLBACK
const rgbStr = a => `rgb(${Math.round(a[0])},${Math.round(a[1])},${Math.round(a[2])})`
function cached(key, make) {
  let s = strCache.get(key)
  if (s === undefined) { s = make(); strCache.set(key, s) }
  return s
}
/** Palette name -> css colour. */
const col = n => cached(n, () => rgbStr(rgbOf(n)))
/** Palette name -> css colour with alpha. */
const rgba = (n, a) => { const c = rgbOf(n); return `rgba(${c[0]},${c[1]},${c[2]},${a})` }
/** Blend palette names a -> b by k. */
const mix = (a, b, k) => cached(`${a}|${b}|${k}`, () => {
  const A = rgbOf(a), B = rgbOf(b)
  return rgbStr([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k])
})
const lit = (n, k = 0.35) => mix(n, 'hi', k)
const drk = (n, k = 0.35) => mix(n, 'ink', k)

/* --------------------------------------------------------------- constants */

const FONT = 'ui-rounded, "Segoe UI Rounded", "Arial Rounded MT Bold", Nunito, "Segoe UI", system-ui, sans-serif'
const TAU = Math.PI * 2
const LW = 160
const LH = 144

/** Sprite sizes in px (w, h) per entity kind. */
export const ENTITY_SIZE = {
  jelly: [12, 15], shark: [36, 19], eel: [24, 11], urchin: [13, 13], mine: [13, 13], angler: [24, 19],
  pearl: [7, 7], shell: [11, 9], star: [11, 11], heartB: [13, 13], anem: [16, 14], goal: [14, 26],
  heart: [7, 6], coral: [13, 14], fish: FISH_SIZE,
}

const THEME_LOOK = {
  reef: { sandy: true, bands: ['w0', 'w1', 'w2', 'w3'] },
  kelp: { sandy: true, bands: ['w1', 'w2', 'w2', 'w3'] },
  cave: { sandy: false, bands: ['w2', 'w3', 'w3', 'w4'] },
  trench: { sandy: false, bands: ['w3', 'w4', 'w4', 'w4'] },
  open: { sandy: true, bands: ['w0', 'w1', 'w1', 'w2'] },
}

const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997 / 997

/* ----------------------------------------------------------------- helpers */

function glow(g, color, blur) { g.shadowColor = color; g.shadowBlur = blur * g.getTransform().a }
function noGlow(g) { g.shadowBlur = 0; g.shadowColor = 'transparent' }
function ink(g, w = 0.45, a = 0.85) { g.strokeStyle = rgba('ink', a); g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke() }
function heartPath(g, cx, cy, s) {
  g.beginPath(); g.moveTo(cx, cy + s * 0.95)
  g.bezierCurveTo(cx - s * 1.4, cy, cx - s, cy - s * 1.15, cx, cy - s * 0.45)
  g.bezierCurveTo(cx + s, cy - s * 1.15, cx + s * 1.4, cy, cx, cy + s * 0.95); g.closePath()
}
function dot(g, x, y, r, a = 0.7) {
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = rgba('bubble', a * 0.25); g.fill()
  g.strokeStyle = rgba('bubble', a); g.lineWidth = 0.3; g.stroke()
}
/** Quadratic-smoothed polyline through the first n points of a flat [x0,y0,x1,y1,...] array. */
function smoothLine(g, p, n) {
  g.moveTo(p[0], p[1])
  for (let i = 1; i < n - 1; i++) g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2)
  g.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1])
}

/* ------------------------------------------------------------- fish sprite */

const specCache = new Map()
function specOf(id) {
  let s = specCache.get(id)
  if (!s) { s = fishSpec(id); if (specCache.size > 64) specCache.clear(); specCache.set(id, s) }
  return s
}

const DORSAL_PATHS = {}
function dorsalPath(style, sw) {
  if (style === 'long') {
    const D = new Path2D()
    D.moveTo(12, 3.8); D.bezierCurveTo(9.5, 0.2, 4.5, 0.2, 0.8, 1.6 + sw * 0.4); D.quadraticCurveTo(4.8, 2.6, 6.5, 5); D.closePath()
    return D
  }
  if (DORSAL_PATHS[style]) return DORSAL_PATHS[style]
  const D = new Path2D()
  switch (style) {
    case 'short': D.moveTo(7.8, 4.4); D.quadraticCurveTo(9.4, 0.9, 12, 3.9); break
    case 'spiky': D.moveTo(6.4, 4.8); D.lineTo(6.6, 1.3); D.lineTo(8.3, 3.6); D.lineTo(9.6, 0.4); D.lineTo(10.8, 3.4); D.lineTo(12.4, 1.2); D.lineTo(12.8, 4.4); break
    case 'bob': D.moveTo(6.6, 4.6); D.bezierCurveTo(6.8, 0.4, 12.6, 0.4, 12.8, 4.3); break
    case 'curly': D.moveTo(6.4, 4.7); D.quadraticCurveTo(5.6, 1.6, 7.8, 2); D.quadraticCurveTo(8.8, 3.4, 9.6, 1.8); D.quadraticCurveTo(10.6, 0.4, 11.8, 2); D.quadraticCurveTo(13, 3, 12.6, 4.6); break
    default: return null
  }
  D.closePath()
  DORSAL_PATHS[style] = D
  return D
}

let bodyPath = null
const getBodyPath = () => bodyPath || (bodyPath = (() => { const B = new Path2D(); B.ellipse(9.9, 8, 6.4, 4.8, 0, 0, TAU); return B })())

function paintFish(g, sp, T) {
  const sw = Math.sin(T * 0.22) * 1.1
  if (sp.fin2 && sp.fin2 !== 'none') {
    const D = dorsalPath(sp.fin2, sw)
    if (D) {
      const gr = g.createLinearGradient(0, 0, 0, 5); gr.addColorStop(0, lit(sp.finTone, 0.3)); gr.addColorStop(1, drk(sp.finTone, 0.15))
      g.fillStyle = gr; g.fill(D); g.strokeStyle = rgba('ink', 0.8); g.lineWidth = 0.4; g.lineJoin = 'round'; g.stroke(D)
    }
  }
  if (sp.acc === 'cape') {
    g.beginPath(); g.moveTo(9, 4); g.bezierCurveTo(6, 2.5 + sw * 0.3, 3, 1 + sw, 0, 2 + sw * 1.3); g.bezierCurveTo(3, 3.6 + sw, 6, 4.6, 8, 5.6); g.closePath()
    g.fillStyle = lit(ACCESSORY_TONES.cape || 'p2', 0.1); g.fill(); ink(g, 0.35)
  }
  // tail
  g.beginPath(); g.moveTo(5, 8); g.quadraticCurveTo(2.2, 5, 0.3, 2.6 + sw); g.quadraticCurveTo(1.8, 8, 0.3, 13.4 + sw); g.quadraticCurveTo(2.2, 11, 5, 8)
  const tg = g.createLinearGradient(0, 0, 5, 0); tg.addColorStop(0, lit(sp.fin, 0.25)); tg.addColorStop(1, drk(sp.fin, 0.2))
  g.fillStyle = tg; g.fill(); ink(g, 0.4)
  // body
  const B = getBodyPath()
  const bg = g.createLinearGradient(0, 3.2, 0, 12.8); bg.addColorStop(0, lit(sp.body, 0.3)); bg.addColorStop(0.55, col(sp.body)); bg.addColorStop(1, drk(sp.body, 0.25))
  g.fillStyle = bg; g.fill(B)
  g.save(); g.clip(B)
  const bl = g.createLinearGradient(0, 8.5, 0, 12.8); bl.addColorStop(0, rgba(sp.belly, 0)); bl.addColorStop(0.45, rgba(sp.belly, 0.9)); bl.addColorStop(1, col(sp.belly))
  g.fillStyle = bl; g.fillRect(3, 8.5, 14, 5)
  g.fillStyle = col(sp.band); g.strokeStyle = rgba('ink', 0.5); g.lineWidth = 0.3
  for (let i = 0; i < 3; i++) {
    const sx = i === 0 ? 6.6 : i === 1 ? 9.3 : 12.4, wd = i === 0 ? 1.1 : i === 1 ? 1.5 : 1.2
    g.beginPath(); g.moveTo(sx - wd / 2 + 0.6, 2.8); g.quadraticCurveTo(sx - wd / 2 - 0.5, 8, sx - wd / 2 + 0.6, 13.2)
    g.lineTo(sx + wd / 2 + 0.6, 13.2); g.quadraticCurveTo(sx + wd / 2 - 0.5, 8, sx + wd / 2 + 0.6, 2.8); g.closePath(); g.fill(); g.stroke()
  }
  g.fillStyle = rgba('hi', 0.28); g.beginPath(); g.ellipse(10.5, 5.2, 4.2, 1.1, -0.05, 0, TAU); g.fill()
  g.restore()
  g.strokeStyle = rgba('ink', 0.85); g.lineWidth = 0.45; g.stroke(B)
  // pectoral fin
  const pf = Math.sin(T * 0.3) * 0.5
  g.beginPath(); g.moveTo(10, 9.2); g.quadraticCurveTo(8, 11 + pf, 8.6, 12.2 + pf); g.quadraticCurveTo(10.6, 11.4, 11.2, 9.6); g.closePath()
  g.fillStyle = lit(sp.fin, 0.15); g.fill(); ink(g, 0.3)
  // eye + mouth
  g.beginPath(); g.arc(13.8, 6.9, 1.35, 0, TAU); g.fillStyle = col('hi'); g.fill(); ink(g, 0.3)
  g.beginPath(); g.arc(14.2, 7, 0.75, 0, TAU); g.fillStyle = col('ink'); g.fill()
  g.beginPath(); g.arc(14.45, 6.65, 0.28, 0, TAU); g.fillStyle = col('hi'); g.fill()
  g.beginPath(); g.moveTo(15.3, 9.1); g.quadraticCurveTo(15.8, 9.6, 16.2, 9.1); g.strokeStyle = rgba('ink', 0.8); g.lineWidth = 0.3; g.stroke()
  if (sp.cap) {
    g.beginPath(); g.moveTo(10.8, 4.4); g.bezierCurveTo(11, 1.6, 15, 1.4, 15.4, 4); g.lineTo(17.6, 4.6); g.quadraticCurveTo(15, 5.1, 10.8, 4.4); g.closePath()
    const cg = g.createLinearGradient(0, 1.5, 0, 5); cg.addColorStop(0, lit(sp.cap, 0.3)); cg.addColorStop(1, drk(sp.cap, 0.1)); g.fillStyle = cg; g.fill(); ink(g, 0.35)
  }
  if (sp.acc === 'glasses') {
    g.fillStyle = rgba('bubble', 0.25); g.beginPath(); g.arc(13.8, 6.9, 1.7, 0, TAU); g.fill()
    g.strokeStyle = col(ACCESSORY_TONES.glasses || 'text'); g.lineWidth = 0.55; g.stroke()
    g.beginPath(); g.moveTo(12, 6.6); g.lineTo(10.6, 6.1); g.stroke()
  }
  if (sp.acc === 'headphones') {
    const tone = ACCESSORY_TONES.headphones || 'dim'
    g.beginPath(); g.arc(12, 6.5, 3.6, Math.PI * 1.1, Math.PI * 1.85); g.strokeStyle = col(tone); g.lineWidth = 0.7; g.stroke()
    g.beginPath(); g.ellipse(10.4, 6.8, 1, 1.4, 0, 0, TAU); g.fillStyle = col(tone); g.fill(); ink(g, 0.3)
  }
  if (sp.acc === 'crown') {
    g.beginPath(); g.moveTo(10.6, 4.2); g.lineTo(10.8, 1.2); g.lineTo(12.2, 2.7); g.lineTo(13.1, 0.6); g.lineTo(14, 2.7); g.lineTo(15.3, 1.2); g.lineTo(15.4, 4.1); g.closePath()
    const cr = g.createLinearGradient(0, 0.6, 0, 4.2); cr.addColorStop(0, col('goldL')); cr.addColorStop(1, col('goldD'))
    glow(g, rgba('gold', 0.6), 3); g.fillStyle = cr; g.fill(); noGlow(g); ink(g, 0.3)
    g.beginPath(); g.arc(13.1, 3.1, 0.45, 0, TAU); g.fillStyle = col('red'); g.fill()
  }
}

/* ----------------------------------------------------------- entity sprites */

const VEC = {
  jelly(g, f, T) {
    const sq = 1 + Math.sin(T * 0.06 + 1) * 0.06
    g.lineCap = 'round'
    g.strokeStyle = rgba('pink', 0.55); g.lineWidth = 0.45
    for (let i = 0; i < 5; i++) {
      const x0 = 2 + i * 2
      g.beginPath(); g.moveTo(x0, 6.5)
      for (let y = 7; y <= 15; y++) g.lineTo(x0 + Math.sin(y * 0.7 + T * 0.08 + i) * 0.8 * (y - 6) / 8, y)
      g.stroke()
    }
    g.strokeStyle = rgba('pinkD', 0.7); g.lineWidth = 1
    for (let i = 0; i < 2; i++) {
      const x0 = i ? 7.2 : 4.8
      g.beginPath(); g.moveTo(x0, 6.5); g.quadraticCurveTo(x0 + Math.sin(T * 0.05 + x0) * 1.5, 10, x0 + Math.sin(T * 0.07 + x0) * 0.8, 13); g.stroke()
    }
    g.save(); g.translate(6, 6.5); g.scale(sq, 1 / sq)
    g.beginPath(); g.moveTo(-5.8, 0); g.bezierCurveTo(-6, -8.6, 6, -8.6, 5.8, 0)
    for (let i = 0; i < 6; i++) { const x = 5.8 - i * 1.93; g.quadraticCurveTo(x - 0.97, 1.3, x - 1.93, 0) }
    const rg = g.createRadialGradient(-1.5, -4, 0.5, 0, -2, 7); rg.addColorStop(0, rgba('pinkL', 0.95)); rg.addColorStop(0.5, rgba('pink', 0.8)); rg.addColorStop(1, rgba('pinkD', 0.75))
    glow(g, rgba('pink', 0.7), 4); g.fillStyle = rg; g.fill(); noGlow(g)
    g.strokeStyle = rgba('pinkD', 0.9); g.lineWidth = 0.4; g.stroke()
    g.fillStyle = rgba('hi', 0.6); g.beginPath(); g.ellipse(-2.2, -4.2, 1.4, 0.8, -0.5, 0, TAU); g.fill()
    g.restore()
  },
  shark(g, f, T) {
    const sw = Math.sin(T * 0.12) * 1.2
    g.beginPath(); g.moveTo(9, 9.2); g.quadraticCurveTo(5, 6, 1.2, 1 + sw); g.quadraticCurveTo(3.4, 7, 4.6, 9.9); g.quadraticCurveTo(3.2, 13, 1.6, 17.5 + sw); g.quadraticCurveTo(5.5, 13.5, 9, 10.8); g.closePath()
    g.fillStyle = col('grey'); g.fill(); ink(g, 0.4)
    g.beginPath(); g.moveTo(15.5, 5.6); g.quadraticCurveTo(18, 2.5, 19.6, 0.2); g.quadraticCurveTo(20.6, 3, 23, 5.2); g.closePath(); g.fillStyle = drk('grey', 0.15); g.fill(); ink(g, 0.4)
    const B = new Path2D(); B.moveTo(35.6, 10.2); B.bezierCurveTo(31, 4.2, 18, 3.6, 8.6, 9.2); B.bezierCurveTo(8.2, 9.8, 8.2, 10.4, 8.6, 10.8); B.bezierCurveTo(17, 15.8, 30, 16, 35.6, 10.2); B.closePath()
    const bg = g.createLinearGradient(0, 4, 0, 15.5); bg.addColorStop(0, drk('grey', 0.25)); bg.addColorStop(0.5, col('grey')); bg.addColorStop(0.6, col('greyL')); bg.addColorStop(1, col('hi'))
    g.fillStyle = bg; g.fill(B); g.strokeStyle = rgba('ink', 0.85); g.lineWidth = 0.5; g.stroke(B)
    g.beginPath(); g.moveTo(20, 12.6); g.quadraticCurveTo(19, 16.5, 17, 18.4); g.quadraticCurveTo(21.5, 16.4, 24.5, 13.2); g.closePath(); g.fillStyle = drk('grey', 0.1); g.fill(); ink(g, 0.4)
    g.strokeStyle = rgba('greyD', 0.9); g.lineWidth = 0.35
    for (let i = 0; i < 3; i++) { const x = 23.6 + i * 1.2; g.beginPath(); g.moveTo(x, 7.6); g.quadraticCurveTo(x - 0.6, 9.4, x, 11.2); g.stroke() }
    g.beginPath(); g.arc(30.4, 8.2, 0.9, 0, TAU); g.fillStyle = col('ink'); g.fill(); g.beginPath(); g.arc(30.65, 7.95, 0.3, 0, TAU); g.fillStyle = col('hi'); g.fill()
    g.beginPath(); g.moveTo(27, 12); g.quadraticCurveTo(31, 13.4, 34.2, 11.4); g.strokeStyle = col('ink'); g.lineWidth = 0.45; g.stroke()
    g.fillStyle = col('hi')
    for (let x = 28; x < 33.6; x += 1.1) { const y = 12.3 + Math.sin((x - 27) / 7.2 * Math.PI) * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.45, y + 0.7); g.lineTo(x + 0.9, y); g.fill() }
  },
  eel(g, f, T) {
    const c = x => 5.5 + Math.sin(x * 0.45 + T * 0.15) * 1.6 * (1 - x / 28)
    g.beginPath()
    for (let x = 0; x <= 19; x += 0.5) { const y = c(x) - (0.5 + (x / 19) * 2); x === 0 ? g.moveTo(x, y) : g.lineTo(x, y) }
    const c19 = c(19)
    g.quadraticCurveTo(24.5, c19 - 2.6, 23.6, c19 + 0.6); g.quadraticCurveTo(22, c19 + 3, 19, c19 + 2.5)
    for (let x = 19; x >= 0; x -= 0.5) g.lineTo(x, c(x) + 0.5 + (x / 19) * 2)
    g.closePath()
    const eg = g.createLinearGradient(0, 2, 0, 9); eg.addColorStop(0, lit('eel', 0.25)); eg.addColorStop(0.6, col('eel')); eg.addColorStop(1, col('eelD'))
    g.fillStyle = eg; g.fill(); ink(g, 0.4)
    g.fillStyle = rgba('eelD', 0.6)
    for (let x = 3; x < 18; x += 2.6) { g.beginPath(); g.arc(x, c(x) - 0.3, 0.35 + x / 40, 0, TAU); g.fill() }
    const hy = c19
    g.beginPath(); g.arc(21.2, hy - 1, 0.7, 0, TAU); g.fillStyle = col('lamp'); g.fill(); g.beginPath(); g.arc(21.4, hy - 1, 0.35, 0, TAU); g.fillStyle = col('ink'); g.fill()
    g.beginPath(); g.moveTo(20, hy + 1); g.lineTo(23.6, hy + 0.5); g.strokeStyle = col('ink'); g.lineWidth = 0.35; g.stroke()
  },
  urchin(g, f, T) {
    g.lineCap = 'round'; g.lineWidth = 0.45
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * TAU + Math.sin(T * 0.05 + i) * 0.06, r = 5.4 + (i % 2) * 0.8
      g.beginPath(); g.moveTo(6.5 + Math.cos(a) * 2.5, 6.5 + Math.sin(a) * 2.5); g.lineTo(6.5 + Math.cos(a) * r, 6.5 + Math.sin(a) * r)
      g.strokeStyle = i % 2 ? col('purpleD') : col('ink'); g.stroke()
    }
    const rg = g.createRadialGradient(5.3, 5.3, 0.4, 6.5, 6.5, 3.8); rg.addColorStop(0, lit('purple', 0.45)); rg.addColorStop(0.6, col('purple')); rg.addColorStop(1, col('purpleD'))
    g.beginPath(); g.arc(6.5, 6.5, 3.5, 0, TAU); g.fillStyle = rg; g.fill(); ink(g, 0.35)
    g.fillStyle = rgba('pinkL', 0.5)
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(i === 0 ? 5.4 : i === 1 ? 7.4 : i === 2 ? 6.2 : 8, i === 0 ? 5.6 : i === 1 ? 5.2 : i === 2 ? 7.6 : 7.3, 0.32, 0, TAU); g.fill() }
  },
  mine(g, f, T) {
    g.lineCap = 'round'
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, ca = Math.cos(a), sa = Math.sin(a)
      g.beginPath(); g.moveTo(6.5 + ca * 3.5, 6.5 + sa * 3.5); g.lineTo(6.5 + ca * 5.5, 6.5 + sa * 5.5); g.strokeStyle = col('greyD'); g.lineWidth = 0.9; g.stroke()
      g.beginPath(); g.arc(6.5 + ca * 5.6, 6.5 + sa * 5.6, 0.6, 0, TAU); g.fillStyle = col('grey'); g.fill()
    }
    const rg = g.createRadialGradient(5, 4.8, 0.5, 6.5, 6.5, 4.3); rg.addColorStop(0, col('greyL')); rg.addColorStop(0.45, col('grey')); rg.addColorStop(1, col('ink'))
    g.beginPath(); g.arc(6.5, 6.5, 4, 0, TAU); g.fillStyle = rg; g.fill(); ink(g, 0.35)
    g.beginPath(); g.ellipse(6.5, 6.5, 4, 1, 0, 0, Math.PI); g.strokeStyle = rgba('ink', 0.5); g.lineWidth = 0.3; g.stroke()
    const on = Math.floor(T / 30) % 2
    g.beginPath(); g.arc(6.5, 3.4, 0.7, 0, TAU); g.fillStyle = on ? col('red') : col('redD'); if (on) glow(g, col('red'), 5); g.fill(); noGlow(g)
  },
  angler(g, f, T) {
    g.beginPath(); g.moveTo(11, 6.4); g.quadraticCurveTo(14, -1, 19.5, 1.6); g.strokeStyle = col('greyD'); g.lineWidth = 0.5; g.stroke()
    const pulse = 0.8 + Math.sin(T * 0.1) * 0.2
    const lg = g.createRadialGradient(19.6, 1.8, 0, 19.6, 1.8, 7 * pulse); lg.addColorStop(0, rgba('lampL', 0.9)); lg.addColorStop(0.25, rgba('lamp', 0.35)); lg.addColorStop(1, rgba('lamp', 0))
    g.fillStyle = lg; g.fillRect(11, -6, 17, 16)
    g.beginPath(); g.arc(19.6, 1.8, 1.1, 0, TAU); g.fillStyle = col('lamp'); glow(g, col('lamp'), 6); g.fill(); noGlow(g)
    g.beginPath(); g.moveTo(4.5, 11.5); g.lineTo(0.3, 7.4); g.quadraticCurveTo(1.5, 11.5, 0.3, 15.8); g.closePath(); g.fillStyle = col('purpleD'); g.fill(); ink(g, 0.35)
    const B = new Path2D(); B.ellipse(10.5, 11.5, 7, 6.2, 0, 0, TAU)
    const bg = g.createRadialGradient(8.5, 9, 1, 10.5, 11.5, 7.5); bg.addColorStop(0, mix('purpleD', 'hi', 0.25)); bg.addColorStop(0.7, col('purpleD')); bg.addColorStop(1, col('ink'))
    g.fillStyle = bg; g.fill(B)
    g.save(); g.clip(B)
    g.beginPath(); g.moveTo(10, 13); g.quadraticCurveTo(15, 9.8, 18.2, 10.6); g.lineTo(18.2, 16.6); g.quadraticCurveTo(14, 17, 10, 13); g.fillStyle = col('dark'); g.fill()
    g.fillStyle = col('pearl')
    for (let i = 0; i < 6; i++) {
      const x = 11.5 + i * 1.1
      g.beginPath(); g.moveTo(x, 11.6 - i * 0.15); g.lineTo(x + 0.35, 13.4 - i * 0.1); g.lineTo(x + 0.7, 11.5 - i * 0.15); g.fill()
      g.beginPath(); g.moveTo(x + 0.2, 16.5); g.lineTo(x + 0.5, 14.8); g.lineTo(x + 0.85, 16.5); g.fill()
    }
    g.restore()
    g.strokeStyle = rgba('ink', 0.9); g.lineWidth = 0.45; g.stroke(B)
    g.beginPath(); g.arc(13.4, 8.4, 1, 0, TAU); g.fillStyle = col('bubble'); g.fill(); g.beginPath(); g.arc(13.6, 8.5, 0.45, 0, TAU); g.fillStyle = col('ink'); g.fill()
  },
  pearl(g, f, T) {
    const rg = g.createRadialGradient(2.6, 2.4, 0.2, 3.5, 3.5, 3.4); rg.addColorStop(0, col('hi')); rg.addColorStop(0.6, col('pearl')); rg.addColorStop(1, col('pearlD'))
    g.beginPath(); g.arc(3.5, 3.5, 3, 0, TAU); glow(g, rgba('hi', 0.6), 3); g.fillStyle = rg; g.fill(); noGlow(g)
    const tw = (Math.sin(T * 0.12 + 3.5) + 1) / 2; g.strokeStyle = rgba('hi', tw); g.lineWidth = 0.3
    g.beginPath(); g.moveTo(5.2, 0.4); g.lineTo(5.2, 3); g.moveTo(3.9, 1.7); g.lineTo(6.5, 1.7); g.stroke()
  },
  shell(g) {
    g.beginPath(); g.moveTo(5.5, 8.6)
    for (let i = 0; i <= 8; i++) { const a = Math.PI + i / 8 * Math.PI, r = 5.2 + (i % 2 ? 0.4 : 0); g.lineTo(5.5 + Math.cos(a) * r, 8.2 + Math.sin(a) * r * 1.4) }
    g.closePath()
    const sg = g.createLinearGradient(0, 1, 0, 9); sg.addColorStop(0, col('pinkL')); sg.addColorStop(1, col('coral')); g.fillStyle = sg; g.fill(); ink(g, 0.35)
    g.strokeStyle = rgba('coralD', 0.8); g.lineWidth = 0.3
    for (let i = 1; i < 8; i++) { const a = Math.PI + i / 8 * Math.PI; g.beginPath(); g.moveTo(5.5, 8.4); g.lineTo(5.5 + Math.cos(a) * 4.8, 8.2 + Math.sin(a) * 6.6); g.stroke() }
    g.beginPath(); g.ellipse(5.5, 8.5, 1.6, 0.5, 0, 0, TAU); g.fillStyle = col('coralD'); g.fill()
  },
  star(g, f, T) {
    g.save(); g.translate(5.5, 5.6); g.rotate(Math.sin(T * 0.04) * 0.18)
    g.beginPath()
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.2 : 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r) }
    g.closePath()
    const sg = g.createRadialGradient(-1, -1.5, 0.3, 0, 0, 5); sg.addColorStop(0, col('goldL')); sg.addColorStop(0.5, col('gold')); sg.addColorStop(1, col('goldD'))
    glow(g, rgba('gold', 0.8), 5); g.fillStyle = sg; g.fill(); noGlow(g); g.strokeStyle = col('goldD'); g.lineWidth = 0.4; g.lineJoin = 'round'; g.stroke()
    g.restore()
  },
  heartB(g, f, T) {
    const s = 1 + Math.sin(T * 0.08) * 0.04; g.save(); g.translate(6.5, 6.5); g.scale(s, s)
    const bg = g.createRadialGradient(-2, -2, 0.5, 0, 0, 6.2); bg.addColorStop(0, rgba('hi', 0.35)); bg.addColorStop(0.8, rgba('bubble', 0.12)); bg.addColorStop(1, rgba('bubble', 0.6))
    g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fillStyle = bg; g.fill(); g.strokeStyle = rgba('hi', 0.8); g.lineWidth = 0.4; g.stroke()
    heartPath(g, 0, 0.3, 2.6); g.fillStyle = col('red'); glow(g, rgba('red', 0.6), 3); g.fill(); noGlow(g)
    g.beginPath(); g.arc(0, 0, 4.8, Math.PI * 1.1, Math.PI * 1.45); g.strokeStyle = rgba('hi', 0.9); g.lineWidth = 0.5; g.lineCap = 'round'; g.stroke()
    g.restore()
  },
  heart(g, f) {
    heartPath(g, 3.5, 3.2, 3.1)
    if (f) { g.fillStyle = rgba('hi', 0.12); g.fill(); g.strokeStyle = rgba('hi', 0.4); g.lineWidth = 0.45; g.stroke(); return }
    const hg = g.createLinearGradient(0, 0, 0, 6); hg.addColorStop(0, lit('red', 0.4)); hg.addColorStop(1, col('redD')); g.fillStyle = hg; g.fill()
    g.fillStyle = rgba('hi', 0.55); g.beginPath(); g.ellipse(1.9, 1.7, 0.8, 0.5, -0.6, 0, TAU); g.fill()
  },
  anem(g, f, T) {
    const on = f >= 2
    g.lineCap = 'round'; g.lineWidth = 1
    for (let i = 0; i < 9; i++) {
      const bx = 2.6 + i * 1.35, h = 6 + ((i * 7) % 4), tx = bx + Math.sin(T * 0.05 + i) * 1.4, ty = 11.5 - h
      g.beginPath(); g.moveTo(bx, 11.5); g.quadraticCurveTo(bx + Math.sin(T * 0.05 + i + 1), 11.5 - h / 2, tx, ty); g.strokeStyle = on ? col('pink') : col('grey'); g.stroke()
      g.beginPath(); g.arc(tx, ty, 0.65, 0, TAU); g.fillStyle = on ? col('pinkL') : col('greyL'); if (on) glow(g, rgba('pink', 0.8), 3); g.fill(); noGlow(g)
    }
    g.beginPath(); g.ellipse(8, 12.3, 6, 1.9, 0, 0, TAU); g.fillStyle = on ? col('coralD') : col('greyD'); g.fill(); ink(g, 0.35)
  },
  coral(g) {
    const seg = [[6.5, 14, 6.5, 7], [6.5, 10, 3.5, 6], [3.5, 6, 3, 2.5], [6.5, 8, 9.5, 4.5], [9.5, 4.5, 10.5, 1.5], [6.5, 7, 5.5, 2], [3.5, 8, 1.2, 6.2], [9.5, 8.5, 11.6, 7.2]]
    g.lineCap = 'round'
    g.strokeStyle = col('coralD'); g.lineWidth = 1.8; for (const [a, b, c, d] of seg) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke() }
    g.strokeStyle = col('coral'); g.lineWidth = 1.1; for (const [a, b, c, d] of seg) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke() }
    g.fillStyle = col('pinkL'); for (const s of seg) { g.beginPath(); g.arc(s[2], s[3], 0.55, 0, TAU); g.fill() }
  },
  goal(g, f, T) {
    g.save(); g.translate(7, 13)
    const ig = g.createRadialGradient(0, 0, 0, 0, 0, 11); ig.addColorStop(0, rgba('goldL', 0.55)); ig.addColorStop(1, rgba('gold', 0.05))
    g.fillStyle = ig; g.beginPath(); g.ellipse(0, 0, 5, 11.2, 0, 0, TAU); g.fill()
    glow(g, col('gold'), 8); g.beginPath(); g.ellipse(0, 0, 5.6, 11.8, 0, 0, TAU); g.strokeStyle = col('gold'); g.lineWidth = 1.4; g.stroke(); noGlow(g)
    g.fillStyle = rgba('hi', 0.85)
    for (let i = 0; i < 6; i++) { const a = T * 0.05 + i; g.beginPath(); g.arc(Math.cos(a) * 3, ((T * 0.3 + i * 7) % 20) - 10, 0.45, 0, TAU); g.fill() }
    g.restore()
  },
}

function drawSprite(g, name, f, x, y, flip, T, spec) {
  const w = name === 'fish' ? FISH_SIZE[0] : ENTITY_SIZE[name][0]
  g.save(); g.translate(x, y)
  if (flip) { g.translate(w, 0); g.scale(-1, 1) }
  if (name === 'fish') paintFish(g, spec, T); else VEC[name](g, f, T)
  g.restore()
}

/* ---------------------------------------------------------------- renderer */

const FLAT_PTS = 80 // terrain/weed polyline capacity (points)

function pebbles(g, level, camX, camY, c0, c1, fromCeil, role) {
  g.fillStyle = rgba(role, 0.45)
  for (let c = c0; c <= c1; c++) {
    for (let k = 0; k < 4; k++) {
      const h1 = hash(c * 3 + k, k + 7), x = c * 8 + h1 * 8 - camX
      const y = fromCeil ? level.ceil[c] * 8 - 3 - hash(k, c) * 26 - camY + 16 : level.floor[c] * 8 + 3 + hash(k, c) * 30 - camY + 16
      g.beginPath(); g.ellipse(x, y, 0.6 + h1 * 1.1, 0.4 + h1 * 0.6, 0, 0, TAU); g.fill()
    }
  }
}

const floorPx = (level, x) => level.floor[Math.max(0, Math.min(level.cols - 1, Math.floor(x / 8)))] * 8

/** Draws the scene for `level` / `run`. Cosmetic state is private to the renderer. */
export function createReefRenderer(canvas) {
  const g = canvas.getContext ? canvas.getContext('2d') : null
  let darkCanvas = null
  let bubbles = []
  let flash = 0
  let tick = 0
  let lastT = null
  let clock = 0
  let lastNemo = null
  let hasCeilFor = null
  let hasCeil = false
  const fl = new Float32Array(FLAT_PTS * 2)
  const ce = new Float32Array(FLAT_PTS * 2)
  const wd = new Float32Array(FLAT_PTS * 2)
  const lights = []

  const scaleOf = () => canvas.width / LW

  function resize(cssWidth) {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    const w = Math.max(1, Math.round(cssWidth * dpr))
    const h = Math.max(1, Math.round(w * LH / LW))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    if (darkCanvas) { darkCanvas.width = w; darkCanvas.height = h }
  }

  function pushBubble(x, y, s, vy) {
    if (bubbles.length < 90) bubbles.push({ x, y, s, vy })
  }

  function stepCosmetics(T, level, run) {
    const n = lastT == null || T < lastT ? 1 : Math.max(0, Math.min(3, Math.floor(T - lastT)))
    if (lastT != null && T < lastT) { bubbles = []; flash = 0 }
    if (n > 0 || lastT == null) lastT = T
    const N = run.nemo, cam = run.cam
    for (let s = 0; s < n; s++) {
      tick++
      if (flash > 0) flash--
      if (N && run.mode !== 'dead' && tick % 45 === 0) pushBubble(N.x + (N.face > 0 ? 15 : 0), N.y + 3, 0, -0.35)
      if (tick % 20 === 0) {
        const x = cam.x + Math.random() * LW
        pushBubble(x, floorPx(level, x) - 2, Math.random() < 0.4 ? 1 : 0, -0.25 - Math.random() * 0.2)
      }
      let w = 0
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i]
        b.y += b.vy; b.x += Math.sin((b.y + b.x) * 0.15) * 0.2
        const cx = Math.max(0, Math.min(level.cols - 1, Math.floor(b.x / 8)))
        if (b.y > level.ceil[cx] * 8 + 1 && b.y > cam.y - 10 && Math.abs(b.x - cam.x) < 400) bubbles[w++] = b
      }
      bubbles.length = w
    }
  }

  function drawWorld(level, run, T, spec) {
    const cam = run.cam, H = level.rows * 8
    const look = THEME_LOOK[level.theme] || THEME_LOOK.reef
    const dark = !!level.dark, b = look.bands, top = 16 - cam.y
    // water
    const wg = g.createLinearGradient(0, top, 0, top + H)
    wg.addColorStop(0, lit(b[0], 0.15)); wg.addColorStop(0.35, col(b[1])); wg.addColorStop(0.7, col(b[2])); wg.addColorStop(1, col(b[3]))
    g.fillStyle = wg; g.fillRect(0, 0, LW, LH)
    // light rays
    if (!dark) {
      g.save(); g.globalCompositeOperation = 'lighter'
      for (let k = 0; k < 5; k++) {
        const bx = ((k * 47 - cam.x * 0.25 + Math.sin(T * 0.01 + k) * 6) % 220 + 220) % 220 - 40, a = 0.05 + 0.03 * Math.sin(T * 0.02 + k * 2)
        const rg = g.createLinearGradient(0, top, 0, top + 150); rg.addColorStop(0, rgba('hi', a * 2)); rg.addColorStop(1, rgba('hi', 0))
        g.fillStyle = rg; g.beginPath(); g.moveTo(bx, top); g.lineTo(bx + 10, top); g.lineTo(bx + 50, top + 150); g.lineTo(bx + 28, top + 150); g.closePath(); g.fill()
      }
      if (top > -20) {
        g.strokeStyle = rgba('hi', 0.22); g.lineWidth = 0.5
        for (let r = 0; r < 3; r++) {
          g.beginPath()
          for (let x = -4; x <= 164; x += 4) { const y = top + 2 + r * 3 + Math.sin(x * 0.12 + T * 0.05 + r * 2) * 1.2; x === -4 ? g.moveTo(x, y) : g.lineTo(x, y) }
          g.stroke()
        }
      }
      g.restore()
    }
    // far silhouettes
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.5 : 0.25, base = layer ? 0.82 : 0.66, amp = layer ? 14 : 20
      const role = dark ? 'dark' : layer ? 'farD' : 'far', al = layer ? 0.5 : 0.45
      g.beginPath(); g.moveTo(-2, 150)
      for (let sx = -2; sx <= 164; sx += 4) {
        const wx = sx + cam.x * par, h = amp * (0.6 + 0.4 * Math.sin(wx * 0.03)) + amp * 0.5 * Math.sin(wx * 0.071 + 1)
        g.lineTo(sx, 16 + H * base - cam.y * par * 1.2 - h)
      }
      g.lineTo(164, 150); g.closePath(); g.fillStyle = rgba(role, al); g.fill()
    }
    // plankton
    g.fillStyle = rgba('hi', 0.35)
    for (let i = 0; i < 26; i++) {
      const x = ((i * 53 - cam.x * 0.6 + T * 0.12) % 170 + 170) % 170 - 5, y = ((i * 37 - cam.y * 0.6 + Math.sin(T * 0.01 + i) * 4) % 130 + 130) % 130 + 14
      g.beginPath(); g.arc(x, y, 0.3 + (i % 3) * 0.12, 0, TAU); g.fill()
    }
    // terrain
    const c0 = Math.max(0, Math.floor(cam.x / 8) - 1), c1 = Math.min(level.cols - 1, c0 + 23), sandy = look.sandy
    if (hasCeilFor !== level) { hasCeilFor = level; hasCeil = level.ceil.some(v => v > 0) }
    let n = 0, fTop = Infinity, cBot = -Infinity
    fl[0] = 0; ce[0] = 0
    for (let c = c0; c <= c1; c++) {
      n++
      const x = c * 8 + 4 - cam.x, fy = level.floor[c] * 8 - cam.y + 16, cy = level.ceil[c] > 0 ? level.ceil[c] * 8 - cam.y + 16 : top - 24
      fl[n * 2] = x; fl[n * 2 + 1] = fy; ce[n * 2] = x; ce[n * 2 + 1] = cy
      if (fy < fTop) fTop = fy
      if (cy > cBot) cBot = cy
    }
    fl[0] = fl[2] - 8; fl[1] = fl[3]; ce[0] = ce[2] - 8; ce[1] = ce[3]
    n += 2
    fl[(n - 1) * 2] = fl[(n - 2) * 2] + 8; fl[(n - 1) * 2 + 1] = fl[(n - 2) * 2 + 1]
    ce[(n - 1) * 2] = ce[(n - 2) * 2] + 8; ce[(n - 1) * 2 + 1] = ce[(n - 2) * 2 + 1]
    g.beginPath(); smoothLine(g, fl, n); g.lineTo(200, 220); g.lineTo(-40, 220); g.closePath()
    const fg = g.createLinearGradient(0, fTop, 0, fTop + 60)
    if (sandy) { fg.addColorStop(0, lit('sand', 0.2)); fg.addColorStop(0.3, col('sand')); fg.addColorStop(0.7, col('sandD')); fg.addColorStop(1, col('rock')) }
    else { fg.addColorStop(0, col('rockL')); fg.addColorStop(0.3, col('rock')); fg.addColorStop(1, col('rockD')) }
    g.fillStyle = fg; g.fill()
    g.save(); g.clip(); pebbles(g, level, cam.x, cam.y, c0, c1, false, sandy ? 'sandD' : 'rockD'); g.restore()
    g.beginPath(); smoothLine(g, fl, n); g.strokeStyle = sandy ? rgba('white', 0.85) : rgba('rockL', 0.9); g.lineWidth = 0.8; g.stroke()
    if (hasCeil) {
      g.beginPath(); smoothLine(g, ce, n); g.lineTo(200, -60); g.lineTo(-40, -60); g.closePath()
      const cg = g.createLinearGradient(0, cBot - 50, 0, cBot); cg.addColorStop(0, col('rockD')); cg.addColorStop(0.7, col('rock')); cg.addColorStop(1, col('rockL'))
      g.fillStyle = cg; g.fill()
      g.save(); g.clip(); pebbles(g, level, cam.x, cam.y, c0, c1, true, 'rockD'); g.restore()
      g.beginPath(); smoothLine(g, ce, n); g.strokeStyle = rgba('rockD', 0.9); g.lineWidth = 0.7; g.stroke()
      g.fillStyle = col('rock')
      for (let c = c0; c <= c1; c++) {
        if (level.ceil[c] > 0 && hash(c, 9) < 0.35) {
          const x = c * 8 + 2 + hash(c, 4) * 4 - cam.x, y = level.ceil[c] * 8 - cam.y + 16 - 0.6
          g.beginPath(); g.moveTo(x - 1.4, y); g.lineTo(x, y + 2 + hash(c, 5) * 3); g.lineTo(x + 1.4, y); g.closePath(); g.fill()
        }
      }
    }
    // seaweed
    g.lineCap = 'round'; g.lineJoin = 'round'
    for (const w of level.weeds) {
      const sx = w.x - cam.x
      if (sx < -12 || sx > 172) continue
      const base = floorPx(level, w.x) - cam.y + 17
      let m = 0
      for (let k = 0; k <= w.h && m < FLAT_PTS; k += 2) { wd[m * 2] = sx + Math.sin(k * 0.18 + T * 0.04 + w.ph) * 2.2 * (k / w.h); wd[m * 2 + 1] = base - k; m++ }
      if (m < 3) continue
      g.beginPath(); smoothLine(g, wd, m); g.strokeStyle = col('weedD'); g.lineWidth = 2; g.stroke(); g.strokeStyle = col('weed'); g.lineWidth = 1.1; g.stroke()
      for (let i = 2; i < m - 1; i += 2) {
        const x = wd[i * 2], y = wd[i * 2 + 1], s = i % 4 ? 1 : -1
        g.beginPath(); g.ellipse(x + s * 1.6, y - 0.6, 1.8, 0.7, s * 0.6, 0, TAU); g.fillStyle = col(i % 4 ? 'weed' : 'weedL'); g.fill()
      }
    }
    for (const c of level.corals) {
      const sx = c.x - cam.x
      if (sx > -14 && sx < 162) drawSprite(g, 'coral', 0, sx, floorPx(level, c.x + 6) - 13 - cam.y + 16, false, T, null)
    }
    // entities
    const ents = run.ents
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]
      if (e.gone) continue
      const sx = e.x - cam.x, sy = e.y - cam.y + 16
      if (sx < -40 || sx > 200 || sy < -40 || sy > 190 || !VEC[e.k]) continue
      drawSprite(g, e.k, e.k === 'anem' ? (e.on ? 2 : 0) : 0, sx, sy, !!e.flip, T, null)
    }
    // player fish
    const N = run.nemo
    if (N && !(N.inv > 0 && Math.floor(N.inv / 4) % 2)) {
      if (N.dashCd > 45) {
        g.fillStyle = rgba('hi', 0.25)
        for (let k = 1; k <= 3; k++) { g.beginPath(); g.ellipse(N.x - cam.x + 9 - N.face * k * 4, N.y - cam.y + 24, 5 - k, 3 - k * 0.6, 0, 0, TAU); g.fill() }
      }
      drawSprite(g, 'fish', 0, N.x - cam.x, N.y - cam.y + 16, N.face < 0, T, spec)
    }
    for (let i = 0; i < bubbles.length; i++) { const bb = bubbles[i]; dot(g, bb.x - cam.x, bb.y - cam.y + 16, bb.s ? 1.3 : 0.65) }
    if (level.current) {
      g.strokeStyle = rgba('hi', 0.4); g.lineWidth = 0.45; g.lineCap = 'round'
      for (let k = 0; k < 16; k++) {
        const x = ((k * 53 - T * 3) % 190 + 190) % 190 - 15, y = 20 + (k * 37) % 110
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 7 + (k % 3) * 4, y); g.stroke()
      }
    }
    if (dark) drawDarkness(level, run)
  }

  function drawDarkness(level, run) {
    const cam = run.cam, N = run.nemo
    if (!darkCanvas) { darkCanvas = document.createElement('canvas'); darkCanvas.width = canvas.width; darkCanvas.height = canvas.height }
    const d = darkCanvas.getContext('2d')
    if (!d) return
    lights.length = 0
    if (N) lights.push(N.x + 9 - cam.x, N.y + 8 - cam.y + 16, 32)
    for (const e of run.ents) if (e.k === 'angler' && !e.gone) lights.push(e.x + (e.flip ? 4.4 : 19.6) - cam.x, e.y + 1.8 - cam.y + 16, 22)
    const k = scaleOf()
    d.setTransform(1, 0, 0, 1, 0, 0); d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, darkCanvas.width, darkCanvas.height)
    d.fillStyle = rgba('abyss', 0.96); d.fillRect(0, 0, darkCanvas.width, darkCanvas.height)
    d.setTransform(k, 0, 0, k, 0, 0); d.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < lights.length; i += 3) {
      const lx = lights[i], ly = lights[i + 1], r = lights[i + 2]
      const rg = d.createRadialGradient(lx, ly, 0, lx, ly, r); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.55, 'rgba(0,0,0,.85)'); rg.addColorStop(1, 'rgba(0,0,0,0)')
      d.fillStyle = rg; d.fillRect(lx - r, ly - r, r * 2, r * 2)
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(darkCanvas, 0, 0); g.restore()
  }

  function text(s, x, y, size, align) {
    const k = scaleOf()
    g.font = `800 ${size}px ${FONT}`; g.textBaseline = 'top'; g.textAlign = align
    g.shadowColor = rgba('ink', 0.45); g.shadowOffsetY = 0.6 * k; g.shadowBlur = 0
    g.fillStyle = col('white'); g.fillText(s, x, y)
    g.shadowColor = 'transparent'; g.shadowOffsetY = 0; g.textAlign = 'left'
  }

  function drawHud(run, T) {
    const hg = g.createLinearGradient(0, 0, 0, 16); hg.addColorStop(0, rgba('hudBg', 0.88)); hg.addColorStop(1, rgba('hudBg', 0.55))
    g.fillStyle = hg; g.fillRect(0, 0, LW, 15.5); g.fillStyle = rgba('hi', 0.14); g.fillRect(0, 15.5, LW, 0.5)
    const hp = run.nemo ? run.nemo.hp : 3
    for (let i = 0; i < 3; i++) drawSprite(g, 'heart', i < hp ? 0 : 1, 4 + i * 9, 4.6, false, T, null)
    drawSprite(g, 'pearl', 0, 37, 4.4, false, T, null)
    text('× ' + (run.pearls ?? 0), 46, 4, 8, 'left')
    text(String(run.score ?? 0).padStart(6, '0'), 156, 4, 8, 'right')
  }

  function draw(level, run, opts = {}) {
    if (!g || !level || !run || !run.cam) return
    ensurePalette()
    const T = typeof opts.t === 'number' ? opts.t : ++clock
    const spec = specOf(opts.avatarId)
    const k = scaleOf()
    g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, LW, canvas.height / k)
    stepCosmetics(T, level, run)
    if (run.nemo) lastNemo = run.nemo
    drawWorld(level, run, T, spec)
    if (flash > 0) { g.fillStyle = rgba('red', flash * 0.05); g.fillRect(0, 0, LW, LH) }
    if (!opts.noHud) drawHud(run, T)
  }

  function event(name) {
    const N = lastNemo
    if (name === 'hit') flash = 8
    else if (name === 'dash' && N) {
      for (let i = 0; i < 4; i++) pushBubble(N.x + (N.face > 0 ? 0 : 16), N.y + 3 + i * 2, i % 2, -0.3)
    } else if ((name === 'pearl' || name === 'shell' || name === 'star' || name === 'heart') && N) {
      for (let i = 0; i < 3; i++) pushBubble(N.x + 4 + i * 4, N.y + 2, 1, -0.4 - i * 0.05)
    }
  }

  function dispose() {
    bubbles = []
    lastNemo = null
    hasCeilFor = null
    darkCanvas = null
  }

  return { resize, draw, event, dispose }
}

/** Draw a swimming fish for `avatarId` filling `canvas` (galleries / lobby). `t` is in frames. */
export function drawFishPreview(canvas, avatarId, t = 0) {
  const g = canvas.getContext ? canvas.getContext('2d') : null
  if (!g || !canvas.width || !canvas.height) return
  ensurePalette()
  const s = Math.min(canvas.width / FISH_SIZE[0], canvas.height / FISH_SIZE[1]) * 0.86
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height)
  g.translate((canvas.width - FISH_SIZE[0] * s) / 2, (canvas.height - FISH_SIZE[1] * s) / 2 + Math.sin(t * 0.08) * s * 0.3)
  g.scale(s, s)
  paintFish(g, specOf(avatarId), t)
  g.setTransform(1, 0, 0, 1, 0, 0)
}
