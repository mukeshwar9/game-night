// @ts-check
// bamboozlePalette.js — the garden's materials, derived from the app theme.
//
// The garden is drawn on a canvas with shaded bamboo, boulders and sand, so it
// cannot take `rgb(var(--c-*))` directly. Instead every drawing colour is
// written once as its MATCHA value (the shading the art was tuned in) and
// passed through `K` / `KA`, which shifts it onto that *material's* colour in
// the current theme while keeping its light-and-dark offset. Materials are
// derived from the theme tokens in one place (`deriveMaterials`), so any theme
// added to src/lib/theme.js follows with no change here.
//
// Deliberate exceptions, as the theming rules allow for avatars: coins keep
// their gold and white stays white. Seat colours are the theme's own p1–p4.

/** @typedef {[number, number, number]} RGB */
/** @typedef {{ bg: RGB, surface: RGB, card: RGB, border: RGB, text: RGB, dim: RGB, p1: RGB, p2: RGB, p3: RGB, p4: RGB, cta: RGB, win: RGB, danger: RGB, structure: RGB }} Tokens */

/** MATCHA's token values and hand-tuned materials: the baseline the art is drawn in. */
export const BASE = {
  bg: [238, 240, 226], surface: [246, 248, 236], card: [252, 253, 246], border: [185, 195, 165],
  text: [45, 55, 35], dim: [95, 107, 81], cta: [130, 95, 14], win: [38, 123, 66], danger: [190, 30, 50], structure: [160, 170, 140],
  sand: [230, 220, 190], frame: [100, 78, 52], pole: [150, 176, 76], moss: [96, 140, 60], tip: [236, 226, 182],
  rock: [142, 150, 134], shadow: [40, 50, 30], ink: [30, 34, 24], coin: [230, 190, 50], white: [255, 255, 255],
}

const TOKEN_KEYS = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger', 'structure']

/** Which material each literal triplet in the drawing code belongs to. */
const CLASS_OF = {}
const put = (cls, list) => list.split(' ').forEach((k) => { CLASS_OF[k] = cls })
put('shadow', '40,50,30'); put('ink', '30,34,24 32,38,29 34,34,34'); put('card', '252,253,246'); put('white', '255,255,255')
put('frame', '60,44,20 86,66,44 112,88,58 78,60,40 72,54,36 46,34,22 40,28,16 30,20,10 126,100,66 255,240,210 86,62,34 100,78,52 84,64,42')
put('pole', '52,72,24 84,108,40 72,96,36 40,52,20 226,236,170 214,226,150 190,208,116 150,176,76 128,156,62 255,255,230 208,222,140')
put('moss', '86,132,54 126,170,80 96,146,60'); put('tip', '240,230,186 176,160,104 150,134,84 236,226,182')
put('sand', '234,226,198 232,222,192 226,216,186 120,104,70 150,130,90 226,214,180')
put('rock', '92,100,90 196,200,184 142,150,134 40,50,40 40,46,40 30,36,30 120,128,110 96,104,92')
put('coin', '244,204,70 176,128,20 226,180,40 255,250,210 240,200,60 200,150,20')
put('bg', '238,240,226'); put('surface', '246,248,236'); put('border', '185,195,165'); put('structure', '160,170,140'); put('dim', '95,107,81')
put('cta', '130,95,14'); put('win', '38,123,66'); put('danger', '190,30,50'); put('text', '45,55,35')

const mix = (a, b, t) => /** @type {RGB} */ ([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t))
const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255
const level = (c, target) => { const m = Math.max(c[0], c[1], c[2], 1); return /** @type {RGB} */ (c.map((v) => (v * target) / m)) }

/**
 * Every material colour for a theme. MATCHA keeps its hand-tuned values; every
 * other theme derives from its tokens, with dark themes detected from the
 * background's brightness.
 * @param {Tokens} t @param {boolean} isMatcha
 */
export function deriveMaterials(t, isMatcha) {
  const dark = lum(t.bg) < 0.45
  if (isMatcha) {
    return { dark, ...t, sand: BASE.sand, frame: BASE.frame, pole: BASE.pole, moss: BASE.moss, tip: BASE.tip, rock: BASE.rock, shadow: BASE.shadow, ink: BASE.ink, coin: BASE.coin, white: BASE.white }
  }
  const sand = dark ? mix(mix(t.surface, t.text, 0.2), t.cta, 0.12) : mix(t.surface, t.cta, 0.14)
  return {
    dark, ...t, sand,
    frame: dark ? mix(t.structure, t.bg, 0.45) : mix(t.text, t.cta, 0.45),
    pole: level(mix(t.win, t.cta, 0.15), dark ? 215 : 185),
    moss: mix(t.win, sand, 0.15),
    tip: dark ? mix(t.text, t.cta, 0.3) : mix(t.card, t.cta, 0.22),
    rock: dark ? mix(t.structure, t.text, 0.3) : mix(t.structure, t.dim, 0.3),
    shadow: dark ? /** @type {RGB} */ ([0, 0, 0]) : mix(t.text, [0, 0, 0], 0.3),
    ink: dark ? /** @type {RGB} */ ([0, 0, 0]) : mix(t.text, [0, 0, 0], 0.35),
    coin: BASE.coin,
    white: BASE.white,
  }
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)))

/**
 * The retinting functions for one theme. `KA(r, g, b)` returns the colour as a
 * triplet, `K(r, g, b, a)` as a CSS string.
 * @param {Tokens} tokens @param {boolean} isMatcha
 */
export function makePalette(tokens, isMatcha) {
  const pal = deriveMaterials(tokens, isMatcha)
  /** @type {Map<number, RGB>} */
  const cache = new Map()
  /** @type {Map<string, string>} */
  const classCache = new Map()
  const classOf = (r, g, b) => {
    const key = `${r},${g},${b}`
    const known = CLASS_OF[key] || classCache.get(key)
    if (known) return known
    let best = 'ink'
    let bd = Infinity
    for (const [name, q] of Object.entries(BASE)) {
      const d = (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2
      if (d < bd) { bd = d; best = name }
    }
    classCache.set(key, best)
    return best
  }
  /** @param {number} r @param {number} g @param {number} b @returns {RGB} */
  const KA = (r, g, b) => {
    const key = r * 65536 + g * 256 + b
    let v = cache.get(key)
    if (!v) {
      const cls = classOf(r, g, b)
      const base = BASE[cls]
      const to = pal[cls]
      v = /** @type {RGB} */ ([r, g, b].map((x, i) => clamp255(to[i] + (x - base[i]))))
      cache.set(key, v)
    }
    return v
  }
  /** @param {number} r @param {number} g @param {number} b @param {number} [a] */
  const K = (r, g, b, a) => {
    const v = KA(r, g, b)
    return `rgba(${v[0]},${v[1]},${v[2]},${a == null ? 1 : a})`
  }
  return { K, KA, pal, dark: pal.dark }
}

/** @typedef {ReturnType<typeof makePalette>} Palette */

/**
 * The theme tokens out of a style source: anything with getPropertyValue
 * (a CSSStyleDeclaration). Missing tokens fall back to MATCHA's.
 * @param {{ getPropertyValue(name: string): string }} style
 * @returns {Tokens}
 */
export function readTokens(style) {
  /** @type {Record<string, RGB>} */
  const out = {}
  for (const k of TOKEN_KEYS) {
    const raw = style.getPropertyValue(`--c-${k}`).trim().split(/\s+/).map(Number)
    out[k] = raw.length === 3 && raw.every((n) => Number.isFinite(n)) ? /** @type {RGB} */ (raw) : /** @type {RGB} */ (FALLBACK[k] || BASE.ink)
  }
  return /** @type {Tokens} */ (out)
}

const FALLBACK = {
  ...BASE,
  p1: [70, 121, 47], p2: [129, 89, 180], p3: [175, 55, 115], p4: [25, 100, 150],
}

/** A seat's colour as a CSS value: the theme's own p1–p4 token. @param {number} seat */
export const seatCss = (seat) => `rgb(var(--c-p${(seat % 4) + 1}))`
