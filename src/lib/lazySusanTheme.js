// lazySusanTheme.js — the LAZY SUSAN table palette, derived from the app's
// theme tokens. Pure: takes the --c-* RGB triplets, returns about forty named
// colour roles (table, plate, food, chopsticks, glass). Nothing here is a
// fixed colour except the WHITE/BLACK/gold mixing constants, so the table
// follows whichever theme the player picked. The canvas reads the live tokens
// with readTokens() and re-derives on a theme change.

export const TOKEN_NAMES = ['bg', 'card', 'deep', 'structure', 'text', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger']

const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]
const GOLD_BASE = [255, 214, 80]
const GOLD_HI = [255, 235, 150]
const BRASS = [214, 160, 28]

/** Used before the DOM can be read (tests, first paint): GLASS. */
export const FALLBACK_TOKENS = {
  bg: [238, 240, 226], card: [252, 253, 246], deep: [228, 232, 214], structure: [160, 170, 140], text: [45, 55, 35],
  p1: [70, 121, 47], p2: [129, 89, 180], p3: [175, 55, 115], p4: [25, 100, 150], cta: [130, 95, 14], win: [38, 123, 66],
  danger: [190, 30, 50],
}

const mix = (a, b, t) => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t))
const luma = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11

/** @param {string} v "r g b" as CSS custom properties hold it */
export function parseTriplet(v, fallback) {
  const n = String(v ?? '').trim().split(/\s+/).map(Number)
  return n.length === 3 && n.every((x) => Number.isFinite(x) && x >= 0 && x <= 255) ? n : fallback
}

/** Reads the live --c-* tokens from an element's computed style. */
export function readTokens(el = document.documentElement) {
  const cs = getComputedStyle(el)
  return Object.fromEntries(TOKEN_NAMES.map((n) => [n, parseTriplet(cs.getPropertyValue(`--c-${n}`), FALLBACK_TOKENS[n])]))
}

/** True for dark themes (decided from the background's luminance). */
export const isDark = (t) => luma(t.bg) < 110

/**
 * @param {Record<string, number[]>} t token triplets (see TOKEN_NAMES)
 * @returns {{ P: Record<string, number[]>, seats: number[][], ink: number[], danger: number[], gold: number[], dark: boolean }}
 */
export function derivePalette(t) {
  const dark = isDark(t)
  const d = (light, dk) => (dark ? dk : light)
  const fA = d(mix(t.card, WHITE, 0.5), mix(t.text, t.card, 0.1))
  const bunA = d(WHITE, mix(t.text, WHITE, 0.4))
  const shadow = d(mix(t.text, BLACK, 0.5), BLACK)
  const gold = mix(t.cta, GOLD_BASE, 0.55)
  const P = {
    ink: t.text, danger: t.danger, win: t.win, shadow,
    tableA: d(mix(t.bg, t.cta, 0.14), mix(mix(t.bg, t.structure, 0.55), t.cta, 0.07)),
    tableB: d(mix(t.bg, t.cta, 0.26), mix(mix(t.bg, t.structure, 0.4), t.cta, 0.06)),
    tableC: d(mix(t.bg, t.cta, 0.4), mix(mix(t.bg, t.structure, 0.22), t.cta, 0.05)),
    grain: d(mix(t.cta, BLACK, 0.3), mix(t.structure, t.text, 0.45)),
    lampHi: d([255, 250, 232], mix(t.structure, t.text, 0.35)),
    baseA: d(mix(t.cta, t.text, 0.3), mix(t.structure, t.cta, 0.4)),
    baseB: d(mix(t.cta, BLACK, 0.55), mix(t.bg, t.structure, 0.5)),
    pl0: d(mix(t.card, WHITE, 0.6), mix(t.card, t.text, 0.24)),
    pl1: d(t.card, mix(t.card, t.text, 0.16)),
    pl2: d(t.deep, mix(t.card, t.text, 0.1)),
    pl3: d(mix(t.deep, t.structure, 0.5), mix(t.card, t.structure, 0.5)),
    paintA: t.p1, paintB: t.p3, well: t.structure,
    soyA: mix(t.cta, BLACK, 0.45), soyB: mix(t.cta, BLACK, 0.8), soyC: mix(t.cta, BLACK, 0.95),
    hi: d(WHITE, mix(t.text, WHITE, 0.5)),
    fA, fB: mix(fA, t.cta, 0.18), fC: mix(fA, t.cta, 0.45),
    fLine: d(mix(t.text, t.cta, 0.5), mix(t.bg, t.cta, 0.4)),
    sear: d(t.cta, mix(t.cta, BLACK, 0.3)),
    steam: mix(t.cta, t.structure, 0.35),
    bunA, bunB: mix(bunA, t.structure, 0.12), bunC: mix(bunA, t.structure, 0.4),
    chA: mix(t.danger, WHITE, 0.35), chC: mix(t.danger, BLACK, 0.45), stemB: mix(t.win, BLACK, 0.4),
    gold, goldHi: mix(t.cta, GOLD_HI, 0.6),
    stA: d(mix(t.text, t.cta, 0.4), mix(t.text, t.cta, 0.3)),
    stB: d(mix(t.text, BLACK, 0.4), mix(t.text, t.bg, 0.25)),
    stC: d(mix(t.text, BLACK, 0.65), mix(t.text, t.bg, 0.45)),
    glass: t.card, glassHi: d(WHITE, mix(t.card, t.text, 0.5)),
    outline: d(t.card, t.bg),
  }
  return {
    P,
    seats: [t.p1, t.p2, t.p3, t.p4],
    ink: t.text,
    danger: t.danger,
    gold: d(mix(t.cta, BRASS, 0.5), gold),
    dark,
  }
}
