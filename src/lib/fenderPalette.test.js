import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { parseThemes, contrastRatio } from './themeContrast'
import { buildPalette, blend, brightness, hueOf, PALETTE_TOKENS } from './fenderPalette'

const themes = parseThemes(readFileSync(new URL('../index.css', import.meta.url), 'utf8'))
const paletteOf = (id) => buildPalette(Object.fromEntries(PALETTE_TOKENS.map((k) => [k, themes[id][k]])))
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))

describe('helpers', () => {
  it('blend moves between two colours', () => {
    expect(blend([0, 0, 0], [100, 200, 50], 0)).toEqual([0, 0, 0])
    expect(blend([0, 0, 0], [100, 200, 50], 1)).toEqual([100, 200, 50])
    expect(blend([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25])
  })
  it('brightness and hue', () => {
    expect(brightness([0, 0, 0])).toBe(0)
    expect(brightness([255, 255, 255])).toBeCloseTo(1, 5)
    expect(hueOf([128, 128, 128])).toBe(-1)
    expect(hueOf([0, 0, 255])).toBeCloseTo(240, 0)
    expect(hueOf([255, 0, 0])).toBeCloseTo(0, 0)
  })
})

describe('buildPalette over every theme', () => {
  const ids = Object.keys(themes)

  it('covers the whole theme list', () => {
    expect(ids.length).toBeGreaterThanOrEqual(31)
  })

  it.each(ids)('%s: cars, lines and edge read against the road', (id) => {
    const P = paletteOf(id)
    for (const car of P.cars) expect(contrastRatio(car, P.asphalt), `${id} car`).toBeGreaterThanOrEqual(2.2)
    expect(contrastRatio(P.line, P.asphalt), `${id} lane line`).toBeGreaterThanOrEqual(4)
    expect(contrastRatio(P.edge, P.asphalt), `${id} edge line`).toBeGreaterThanOrEqual(3)
  })

  it.each(ids)('%s: the four seats are told apart by colour as well as number', (id) => {
    const P = paletteOf(id)
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) expect(dist(P.cars[i], P.cars[j]), `${id} ${i}/${j}`).toBeGreaterThanOrEqual(25)
    }
  })

  it.each(ids)('%s: the kerb separates road and water, and the water is not the road', (id) => {
    const P = paletteOf(id)
    expect(dist(P.waterDeep, P.asphalt)).toBeGreaterThan(8)   // 1-BIT MONO has no blue: kerb and spray carry it
    expect(contrastRatio(P.kerbA, P.waterDeep), `${id} kerb`).toBeGreaterThanOrEqual(1.3)
  })

  it.each(ids)('%s: traffic paint is never the road’s own colour', (id) => {
    const P = paletteOf(id)
    expect(P.paints).toHaveLength(8)
    for (const p of P.paints) expect(contrastRatio(p, P.asphalt), `${id} paint`).toBeGreaterThanOrEqual(1.15)
  })

  it('a dark theme gets night lighting and a light theme does not', () => {
    expect(paletteOf('midnight').dark).toBe(true)
    expect(paletteOf('glass-night').dark).toBe(true)
    expect(paletteOf('glass').dark).toBe(false)
  })

  it('a theme with no blue falls back to its structure colour for water', () => {
    const P = paletteOf('mono')
    const sat = (c) => Math.max(...c) - Math.min(...c)
    expect(sat(P.waterDeep)).toBeLessThan(40)
  })
})
