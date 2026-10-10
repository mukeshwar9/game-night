import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { GLASS_DESIGN, GLASS_THEME_IDS } from './glassLogic'
import { contrastRatio, parseThemes } from './themeContrast'

// The GLASS theme's contrast table, recomputed from the theme tokens in
// index.css (the way font.test.js checks the fonts). Worst case: the tint
// composited over the strongest art colour or glyph under it, with no blur
// averaging and no text halo, so real screens score better than this.
//
// Body text on glass passes AA everywhere, provided the art stays capped: dark
// art at 50 % and light glyphs at about 70 % opacity. Dim text does not pass on
// light glass, so secondary labels on glass use full ink at a smaller size, and
// --c-dim in both GLASS themes is pushed toward ink because it also lands on the
// bare art.

const cssText = readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const themes = parseThemes(cssText)

function numericTokens(id) {
  const body = cssText.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([^{}]*)\\}`))?.[1] ?? ''
  return Object.fromEntries([...body.matchAll(/--(g-[\w-]+)\s*:\s*([\d.]+)(?:px)?\s*;/g)].map(([, k, v]) => [k, Number(v)]))
}

const mix = (top, under, a) => top.map((v, i) => v * a + under[i] * (1 - a))

/** The colours a glass surface can sit over: each art field, each glyph tone. */
function grounds(t, g) {
  const field = [1, 2, 3, 4].map(n => [`art-${n}`, mix(t[`art-${n}`], t.bg, g['g-art-strength'])])
  const glyph = ['p1', 'p2'].map(k => [`${k} glyph`, mix(t[k], t.bg, g['g-glyph-opacity'])])
  return [...field, ...glyph]
}

function worst(ink, t, g, alpha) {
  let min = Infinity
  let where = ''
  for (const [name, under] of grounds(t, g)) {
    const surface = alpha === null ? under : mix(t['glass-tint'], under, alpha)
    const ratio = contrastRatio(ink, surface)
    if (ratio < min) { min = ratio; where = name }
  }
  return { ratio: min, where }
}

const MODES = [
  { id: 'glass', mode: 'light', body: [5.08, 6.02, 7.56] },
  { id: 'glass-night', mode: 'dark', body: [6.39, 7.8, 10.3] },
]

describe('GLASS contrast (from the theme tokens)', () => {
  it('has a token block for each GLASS variant', () => {
    expect(MODES.map(m => m.id)).toEqual(GLASS_THEME_IDS)
    for (const { id } of MODES) {
      expect(themes[id], id).toBeDefined()
      expect(numericTokens(id)['g-alpha'], id).toBeDefined()
    }
  })

  for (const { id, mode, body } of MODES) {
    describe(`${id} (${mode})`, () => {
      const t = themes[id]
      const g = numericTokens(id)
      const design = GLASS_DESIGN[mode]
      const alphas = [g['g-alpha'], g['g-alpha-text'], g['g-alpha-sheet']]

      it('uses the documented tint opacities and art caps', () => {
        expect(alphas).toEqual([design.alpha.icon, design.alpha.text, design.alpha.sheet])
        expect(g['g-art-strength']).toBeLessThanOrEqual(design.artStrength)
        expect(g['g-glyph-opacity']).toBeLessThanOrEqual(design.glyphOpacity)
      })

      it('caps dark art at 50 % and light glyphs at about 70 %', () => {
        if (mode === 'dark') {
          expect(g['g-art-strength']).toBeLessThanOrEqual(0.5)
          expect(g['g-glyph-opacity']).toBeLessThanOrEqual(0.5)
        } else {
          expect(g['g-glyph-opacity']).toBeLessThanOrEqual(0.7)
        }
      })

      it.each(['icon controls', 'text panels', 'sheet'].map((label, i) => [label, i]))('body text on %s reaches the table value and AA', (_label, i) => {
        const { ratio, where } = worst(t.text, t, g, alphas[i])
        expect(ratio, `worst under ${where}`).toBeGreaterThanOrEqual(4.5)
        expect(ratio).toBeCloseTo(body[i], 1)
      })

      it('more opaque surfaces never read worse', () => {
        const r = alphas.map(a => worst(t.text, t, g, a).ratio)
        expect(r[1]).toBeGreaterThan(r[0])
        expect(r[2]).toBeGreaterThan(r[1])
      })

      it('text sits above 4:1 straight on the art, in the places no glass is drawn', () => {
        expect(worst(t.text, t, g, null).ratio).toBeGreaterThanOrEqual(4)
      })

      it('dim text, pushed toward ink, keeps 3:1 on the bare art and 4.5:1 on the ground', () => {
        expect(worst(t.dim, t, g, null).ratio).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(t.dim, t.bg)).toBeGreaterThanOrEqual(4.5)
      })
    })
  }

  it('MATCHA dim ink would fail on the strongest art colour: why GLASS carries its own --c-dim', () => {
    const t = themes.glass
    const g = numericTokens('glass')
    expect(worst([95, 107, 81], t, g, null).ratio).toBeLessThan(3)
  })
})
