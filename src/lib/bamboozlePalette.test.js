import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { BASE, deriveMaterials, makePalette, readTokens } from './bamboozlePalette'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const themeSrc = readFileSync(new URL('./theme.js', import.meta.url), 'utf8')

/** The tokens of one theme block in src/index.css, falling back to the :root block like the browser does. */
function tokensOf(id) {
  const rootEnd = css.indexOf('[data-theme="phosphor"] {')
  const root = css.slice(0, rootEnd)
  const block = id === 'midnight' ? '' : (css.match(new RegExp(`\\[data-theme="${id}"\\] \\{([\\s\\S]*?)\\n\\}`)) || ['', ''])[1]
  const get = (k) => {
    const re = new RegExp(`--c-${k}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`)
    const m = block.match(re) || root.match(re)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  }
  const style = { getPropertyValue: (name) => { const v = get(name.replace('--c-', '')); return v ? v.join(' ') : '' } }
  return readTokens(style)
}

const themeIds = [...themeSrc.matchAll(/\{ id: '([a-z0-9-]+)',\s*label:/g)].map((m) => m[1])

describe('bamboozlePalette', () => {
  it('knows every theme in the app', () => {
    expect(themeIds.length).toBeGreaterThan(20)
    expect(themeIds).toContain('matcha')
  })

  it('MATCHA is the baseline: the art keeps its tuned colours', () => {
    const { KA, K } = makePalette(tokensOf('matcha'), true)
    expect(KA(150, 176, 76)).toEqual([150, 176, 76]) // bamboo
    expect(KA(234, 226, 198)).toEqual([234, 226, 198]) // sand
    expect(KA(142, 150, 134)).toEqual([142, 150, 134]) // rock
    expect(K(150, 176, 76, 0.5)).toBe('rgba(150,176,76,0.5)')
  })

  it('keeps shading offsets: a lighter bamboo stays lighter in every theme', () => {
    for (const id of themeIds) {
      const { KA, pal } = makePalette(tokensOf(id), id === 'matcha')
      const mid = KA(150, 176, 76)
      const lit = KA(190, 208, 116)
      expect(lit[1], id).toBeGreaterThanOrEqual(mid[1])
      expect(mid[1], id).toBeGreaterThanOrEqual(KA(84, 108, 40)[1])
      expect(pal.pole).toBeDefined()
    }
  })

  it('every colour is a valid byte triplet in every theme', () => {
    const literals = ['40,50,30', '86,66,44', '150,176,76', '226,236,170', '234,226,198', '92,100,90', '244,204,70', '252,253,246', '12,200,99']
    for (const id of themeIds) {
      const { KA, K } = makePalette(tokensOf(id), id === 'matcha')
      for (const lit of literals) {
        const [r, g, b] = lit.split(',').map(Number)
        const v = KA(r, g, b)
        expect(v, `${id} ${lit}`).toHaveLength(3)
        for (const x of v) { expect(Number.isInteger(x)).toBe(true); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(255) }
        expect(K(r, g, b, 0.3)).toMatch(/^rgba\(\d+,\d+,\d+,0\.3\)$/)
      }
    }
  })

  it('dark themes get dark sand and black shadows; light themes get light sand', () => {
    const night = deriveMaterials(tokensOf('midnight'), false)
    const matcha = deriveMaterials(tokensOf('matcha'), true)
    expect(night.dark).toBe(true)
    expect(matcha.dark).toBe(false)
    expect(night.shadow).toEqual([0, 0, 0])
    const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    expect(lum(night.sand)).toBeLessThan(lum(matcha.sand))
    // sand stays distinguishable from the page it sits on
    expect(Math.abs(lum(night.sand) - lum(night.bg))).toBeGreaterThan(4)
  })

  it('coins keep their gold and avatar-free white stays white', () => {
    for (const id of ['midnight', 'matcha', ...themeIds.slice(0, 6)]) {
      const { KA } = makePalette(tokensOf(id), id === 'matcha')
      expect(KA(244, 204, 70)).toEqual([244, 204, 70])
      expect(KA(255, 255, 255)).toEqual([255, 255, 255])
    }
  })

  it('reads tokens from a style source and falls back to MATCHA for missing ones', () => {
    const t = readTokens({ getPropertyValue: (n) => (n === '--c-p1' ? ' 1 2 3 ' : '') })
    expect(t.p1).toEqual([1, 2, 3])
    expect(t.bg).toEqual(BASE.bg)
  })
})
