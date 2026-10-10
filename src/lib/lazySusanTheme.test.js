import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FALLBACK_TOKENS, TOKEN_NAMES, derivePalette, isDark, parseTriplet } from './lazySusanTheme'

// A dark theme's tokens (MIDNIGHT-like) and a light one (GLASS).
const DARK = { ...FALLBACK_TOKENS, bg: [14, 16, 28], card: [30, 34, 54], deep: [8, 10, 20], structure: [70, 80, 120], text: [225, 230, 245], cta: [255, 190, 70] }
const triplet = (c) => Array.isArray(c) && c.length === 3 && c.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)

describe('lazySusanTheme', () => {
  it('names the tokens the app themes define', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    for (const n of TOKEN_NAMES) expect(css, n).toContain(`--c-${n}:`)
  })

  it('derives every role as an RGB triplet for light and dark themes', () => {
    for (const tokens of [FALLBACK_TOKENS, DARK]) {
      const { P, seats } = derivePalette(tokens)
      expect(Object.keys(P).length).toBeGreaterThan(35)
      for (const [role, c] of Object.entries(P)) expect(triplet(c), role).toBe(true)
      expect(seats).toEqual([tokens.p1, tokens.p2, tokens.p3, tokens.p4])
    }
  })

  it('tells dark themes from light ones and lifts the plate off a dark table', () => {
    expect(isDark(FALLBACK_TOKENS)).toBe(false)
    expect(isDark(DARK)).toBe(true)
    const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11
    const dark = derivePalette(DARK).P
    expect(lum(dark.pl1)).toBeGreaterThan(lum(dark.tableB))
    const light = derivePalette(FALLBACK_TOKENS).P
    expect(lum(light.pl1)).toBeGreaterThan(lum(light.tableB))
  })

  it('a different theme gives a different table', () => {
    expect(derivePalette(DARK).P.tableB).not.toEqual(derivePalette(FALLBACK_TOKENS).P.tableB)
  })

  it('parses a custom property and falls back on junk', () => {
    expect(parseTriplet(' 12 34 56 ', [0, 0, 0])).toEqual([12, 34, 56])
    expect(parseTriplet('', [1, 2, 3])).toEqual([1, 2, 3])
    expect(parseTriplet('1 2', [1, 2, 3])).toEqual([1, 2, 3])
    expect(parseTriplet('300 0 0', [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('has no hex colour literal (theming rules)', () => {
    const src = readFileSync(new URL('./lazySusanTheme.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
