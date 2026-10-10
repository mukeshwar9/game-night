// Arena colours for FENDER BENDER, derived from the selected theme's --c-*
// tokens. The road, water, kerbs, traffic paint and lights all follow the
// theme, so a new theme needs no game changes (.claude/rules/theming-rules.md);
// player cars stay on their seat accents so they stand out from the neutral
// traffic. Pure: tokens in ([r, g, b] triplets), palette out.

import { contrastRatio } from './themeContrast'

const WHITE = [255, 255, 255]
const EDGE_MIN_CONTRAST = 3

/** Blend `a` toward `b` by `k` (0 keeps a, 1 is b). */
export const blend = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k))

/** Relative brightness in 0..1 (a perceptual weighting, not WCAG luminance). */
export const brightness = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255

/** Hue in degrees, or -1 for a grey. */
export function hueOf(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255
  const mx = Math.max(r, g, b)
  const d = mx - Math.min(r, g, b)
  if (d < 0.08) return -1
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

export const PALETTE_TOKENS = ['bg', 'card', 'text', 'border', 'structure', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger']

/**
 * @param {Record<string, number[]>} T  token name → [r, g, b], see PALETTE_TOKENS
 */
export function buildPalette(T) {
  const { bg, card, text: ink, structure: st } = T
  const dark = brightness(bg) < 0.4

  // The theme's bluest accent becomes the water; a theme with no blue falls
  // back to its structure colour (1-BIT MONO, AMBER CRT).
  let water = null
  let best = 1e9
  for (const k of ['p1', 'p2', 'p3', 'p4', 'cta', 'win']) {
    const h = hueOf(T[k])
    if (h < 0) continue
    const d = Math.abs(h - 205)
    if (d < best) { best = d; water = T[k] }
  }
  if (!water || best > 70) water = st

  const asphalt = dark ? blend(blend(bg, card, 0.7), [128, 128, 128], 0.12) : blend(ink, [72, 74, 78], 0.35)
  const line = dark ? blend(ink, bg, 0.12) : blend(card, ink, 0.05)

  return {
    dark,
    asphalt,
    line,
    // The road-edge marking is the accent colour where that reads on the road,
    // else the lane-line colour (some light themes have a dark accent).
    edge: contrastRatio(T.cta, asphalt) >= EDGE_MIN_CONTRAST ? T.cta : line,
    glow: dark ? T.cta : blend(T.cta, WHITE, 0.3),
    danger: T.danger,
    kerbA: dark ? blend(st, ink, 0.25) : blend(st, card, 0.5),
    kerbB: dark ? blend(st, bg, 0.4) : blend(st, ink, 0.25),
    waterDeep: dark ? blend(water, bg, 0.74) : blend(water, ink, 0.22),
    waterLite: dark ? blend(water, bg, 0.5) : blend(water, card, 0.3),
    paints: dark
      ? [blend(ink, bg, 0.18), blend(st, ink, 0.35), blend(ink, bg, 0.55), blend(T.border, ink, 0.35),
        blend(T.p1, bg, 0.5), blend(T.p2, bg, 0.5), blend(T.cta, bg, 0.4), blend(ink, st, 0.5)]
      : [card, st, blend(ink, card, 0.12), T.border,
        blend(T.p1, st, 0.6), blend(T.p2, st, 0.6), blend(T.cta, st, 0.45), blend(card, st, 0.5)],
    bus: [blend(T.cta, dark ? bg : card, 0.25), blend(T.p4, dark ? bg : card, 0.25)],
    cars: [1, 2, 3, 4].map((n) => (dark ? T[`p${n}`] : blend(T[`p${n}`], WHITE, 0.16))),
  }
}
