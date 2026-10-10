// quiverPalette.js — every colour the QUIVER table uses, derived from the
// page's --c-* theme tokens. Pure: it takes token triplets and returns triplets,
// so every theme can be checked in a unit test without a canvas.
//
// Shapes, light and shadow are the same in every theme; colour is not.
//   • table cloth, seat colours, stars, painted rings, text → straight from tokens
//   • "real material" colours (wood, brass, sparks) → a fixed warm base pulled
//     toward the theme: lightly tinted for a multi-colour theme, soaked in the
//     theme's hue when all its accents share one hue (AMBER CRT), and reduced to
//     grey when the theme has no colour at all (1-BIT MONO)
//   • steel (arrow heads, the hub) is neutral grey in every theme — an RGB
//     triplet, not a hex string, so the theming rules' hex ban still holds

export const TOKENS = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger', 'structure', 'deep']
const FALLBACK = [128, 128, 128]

export function parseTriplet(raw) {
  const m = String(raw ?? '').trim().split(/[\s,]+/).map(Number)
  return m.length >= 3 && m.every(Number.isFinite) ? [m[0], m[1], m[2]] : null
}

export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f]
export const tint = (c, f) => [c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f]
export const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

/** Hue in degrees, or null for a grey. */
export function hue(c) {
  const mx = Math.max(c[0], c[1], c[2])
  const mn = Math.min(c[0], c[1], c[2])
  const d = mx - mn
  if (d < 12) return null
  const h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4
  return (h * 60 + 360) % 360
}

/** Largest gap between any two of these hues, in degrees. */
function hueSpread(hs) {
  let spread = 0
  for (const a of hs) for (const b of hs) spread = Math.max(spread, Math.min(Math.abs(a - b), 360 - Math.abs(a - b)))
  return spread
}

/**
 * @param {Record<string, number[]>} tokens token name → [r, g, b]
 * @returns the palette the painter reads; every colour is [r, g, b] (0–255, may be fractional)
 */
export function makePalette(tokens) {
  const c = {}
  for (const k of TOKENS) c[k] = tokens[k] ?? FALLBACK
  const light = lum(c.bg) > 150
  const hs = [c.p1, c.p2, c.cta, c.p3].map(hue).filter((h) => h != null)
  const grey = hs.length === 0
  const soak = !grey && hueSpread(hs) < 50 ? 0.72 : 0.2
  const key = c.cta
  const keyL = Math.max(40, lum(key))

  // A fixed "real material" colour pulled toward the theme.
  const material = (base) => {
    const l = lum(base)
    if (grey) return [l, l, l]
    const toward = key.map((v) => Math.min(255, (v * l) / keyL))
    const o = mix(base, toward, soak)
    return light ? shade(o, 0.9) : o
  }

  const pal = {
    c, light, grey, material,
    seat: [c.p1, c.p2, c.p3, c.p4],
    // additive light disappears on a pale cloth, so light themes blend normally
    blend: light ? 'source-over' : 'lighter',
    clothA: light ? tint(c.surface, 0.35) : mix(c.surface, c.structure, 0.28),
    clothB: light ? mix(c.bg, c.border, 0.1) : mix(c.bg, c.surface, 0.6),
    clothC: light ? mix(c.deep, c.border, 0.55) : shade(c.bg, 0.55),
    vignette: light ? 0.2 : 0.5,
    shadow: light ? 0.36 : 0.62,
    mote: light ? c.dim : c.text,
    wood: material([224, 180, 122]),
    brass: material([170, 132, 60]),
    spark: material([255, 226, 150]),
    chip: material([206, 160, 104]),
    ring1: c.danger,
    ring2: light ? c.dim : mix(c.structure, c.p1, 0.4),
    star: light ? c.cta : tint(c.cta, 0.1),
    gold: light ? c.win : mix(c.win, c.cta, 0.4),
    flip: mix(c.structure, c.p2, 0.45),
    shave: mix(c.p3, c.text, 0.25),
    outline: light ? c.card : shade(c.bg, 0.7),
    bannerBg: c.card,
    bannerInk: c.cta,
    ink: [16, 18, 28],
  }
  return pal
}

/** Pad label ink that stays readable on a seat colour. */
export function onColor(c) { return lum(c) > 150 ? [20, 22, 30] : [255, 255, 255] }
