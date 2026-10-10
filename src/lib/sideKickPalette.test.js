import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { parseThemes, contrastRatio } from './themeContrast'
import { buildPalette, mx, css, SK_TOKENS, SK_OPTIONAL_TOKENS } from './sideKickPalette'

const themes = parseThemes(readFileSync(new URL('../index.css', import.meta.url), 'utf8'))
const tokensOf = (id) => {
  const T = {}
  for (const k of [...SK_TOKENS, ...SK_OPTIONAL_TOKENS]) if (themes[id][k]) T[k] = themes[id][k]
  return T
}
const ids = Object.keys(themes)
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))

describe('helpers', () => {
  it('mixes and formats colours', () => {
    expect(mx([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25])
    expect(css([1.4, 2.6, 3])).toBe('rgb(1,3,3)')
    expect(css([10, 20, 30], 0.5)).toBe('rgba(10,20,30,0.5)')
  })
})

describe('buildPalette over every theme', () => {
  it('covers the whole theme list', () => {
    expect(ids.length).toBeGreaterThanOrEqual(31)
  })
  it.each(ids)('%s: every scene colour is a valid rgb string', (id) => {
    const P = buildPalette(tokensOf(id))
    const re = /^rgba?\(\d{1,3},\d{1,3},\d{1,3}(,[\d.]+)?\)$/
    for (const k of ['sky0', 'sky1', 'mount', 'grassA', 'roadA', 'kerbA', 'lane', 'center', 'edge', 'fog', 'leaf0', 'trunk', 'tire', 'helmet', 'ink', 'paper', 'house', 'roof']) {
      expect(P[k], `${id} ${k}`).toMatch(re)
    }
    expect(P.seat).toHaveLength(4)
    for (const s of P.seat) for (const v of Object.values(s)) expect(v).toMatch(re)
    expect(P.cars).toHaveLength(6)
    expect(P.fogTab.roadA).toHaveLength(25)
  })
  it.each(ids)('%s: the road reads against the grass and the line reads on the road', (id) => {
    const P = buildPalette(tokensOf(id))
    expect(dist(P.raw.roadA, P.raw.grassA), `${id} road/grass`).toBeGreaterThan(10)
    expect(dist(P.raw.kerbA, P.raw.roadA), `${id} kerb/road`).toBeGreaterThan(40)
    expect(contrastRatio(P.raw.lane, P.raw.roadA), `${id} lane/road`).toBeGreaterThan(1.8)
    expect(contrastRatio(P.raw.center, P.raw.roadA), `${id} centre/road`).toBeGreaterThan(1.8)
    expect(dist(P.raw.sky1, P.raw.grassA), `${id} sky/ground`).toBeGreaterThan(25)
  })
  it.each(ids)('%s: a name tag is readable on every seat colour', (id) => {
    const P = buildPalette(tokensOf(id))
    P.rs.forEach((c, i) => {
      const text = P.tagText[i]
      const m = text.match(/\d+/g).map(Number)
      expect(contrastRatio(c, m), `${id} seat ${i}`).toBeGreaterThan(2.4)
    })
  })
  it.each(ids)('%s: the seats are told apart', (id) => {
    const P = buildPalette(tokensOf(id))
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        const d = Math.hypot(...P.rs[a].map((v, i) => v - P.rs[b][i]))
        expect(d, `${id} seats ${a}/${b}`).toBeGreaterThan(18)
      }
    }
  })
  it('calls a dark theme dark and a light one light', () => {
    expect(buildPalette(tokensOf('glass')).dark).toBe(false)
    expect(buildPalette(tokensOf('glass-night')).dark).toBe(true)
    expect(buildPalette(tokensOf('synthwave')).dark).toBe(true)
  })
  it('uses a theme\'s own sky and ground colours when it defines them', () => {
    const P = buildPalette(tokensOf('glass'))
    expect(P.t.art4).toEqual(themes.glass['art-4'])
    expect(P.raw.grassA).toEqual(themes.glass['art-1'])
  })
  it('works for a theme with neither blue nor green accents', () => {
    const grey = Object.fromEntries(SK_TOKENS.map((k) => [k, [200, 200, 200]]))
    grey.bg = [250, 250, 250]; grey.text = [20, 20, 20]; grey.card = [255, 255, 255]
    const P = buildPalette(grey)
    expect(P.sky0).toMatch(/^rgb/)
    expect(P.grassA).toMatch(/^rgb/)
  })
})
