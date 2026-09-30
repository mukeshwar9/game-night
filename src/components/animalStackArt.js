// ANIMAL STACK palette helpers — pure, no DOM. The animals themselves are pixel
// grids in lib/animalStackPixels.js; this turns a theme's --c-* tokens into the
// shades those grids are painted with.

// ─── Palette ─────────────────────────────────────────────────────────────────

/** Parse a --c-* token value ("r g b") into [r, g, b]. */
export function parseRgb(v) {
  const n = String(v || '').trim().split(/[\s,]+/).map(Number)
  return n.length >= 3 && n.slice(0, 3).every(Number.isFinite) ? n.slice(0, 3) : [128, 128, 128]
}
export const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
export const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * Shades of one animal's tone, all derived from the theme: `L`/`D` are the
 * theme's lighter/darker ends (bg and text), so every theme keeps its own
 * palette. A tone that nearly matches the backdrop is lifted toward the text
 * colour so the animal never vanishes, and `pale` flips toward D when the
 * tone already sits at the light end (the penguin on a dark theme, whose tone
 * is the light text colour) so bellies still read.
 */
export function rolePalette(rawTone, { bg, text, beak, blush }) {
  const [L, D] = lum(bg) >= lum(text) ? [bg, text] : [text, bg]
  const tone = Math.abs(lum(rawTone) - lum(bg)) < 0.1 ? mix(rawTone, text, 0.35) : rawTone
  const atLight = dist(tone, L) < 70
  return {
    base: tone,
    light: atLight ? mix(tone, D, 0.14) : mix(tone, L, 0.35),
    pale: atLight ? mix(tone, D, 0.5) : mix(tone, L, 0.7),
    shade: mix(tone, D, 0.28),
    spot: mix(tone, D, 0.45),
    dark: mix(tone, D, 0.62),
    beak,
    blush: mix(blush, tone, 0.3),
    eye: mix(L, tone, 0.08),
    pupil: mix(D, tone, 0.1),
  }
}
