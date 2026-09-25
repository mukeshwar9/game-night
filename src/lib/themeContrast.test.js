import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { parseThemes, contrastRatio, hueGap, saturationGap } from './themeContrast'

const cssText = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const themes = parseThemes(cssText)

const EXPECTED_THEME_IDS = [
  'midnight', 'phosphor', 'amber', 'synthwave', 'grid', 'mono', 'virtualboy', 'paper',
  'c64', 'blueprint', 'sakura', 'matcha', 'matcha-strawberry', 'matcha-blueberry',
  'cotton-candy', 'arctic-frost',
]

const TINTS = ['tint-p1', 'tint-p2', 'tint-p3', 'tint-p4', 'tint-cta', 'tint-danger']

const REQUIRED_KEYS = [
  'bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'cta', 'win',
  'danger', 'tint-p1', 'tint-p2', 'tint-cta', 'tint-danger', 'structure', 'deep', 'skin',
]

describe('contrastRatio', () => {
  it('white vs black is 21', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5)
  })

  it('same color is 1', () => {
    expect(contrastRatio([100, 120, 140], [100, 120, 140])).toBeCloseTo(1, 5)
  })
})

describe('parseThemes', () => {
  it('finds exactly the expected theme set', () => {
    expect(Object.keys(themes).sort()).toEqual([...EXPECTED_THEME_IDS].sort())
  })

  it('every theme defines all required keys', () => {
    for (const id of EXPECTED_THEME_IDS) {
      for (const key of REQUIRED_KEYS) {
        expect(themes[id][key], `${id}.${key}`).toBeDefined()
      }
    }
  })

  // A key missing from a theme block silently inherits MIDNIGHT's value via
  // the cascade (e.g. dark 4P tints on a light theme), so every theme must
  // redefine every token the default does.
  it('every theme redefines every --c-* key the default theme defines', () => {
    const defaultKeys = Object.keys(themes.midnight)
    for (const id of EXPECTED_THEME_IDS) {
      for (const key of defaultKeys) {
        expect(themes[id][key], `${id}.${key}`).toBeDefined()
      }
    }
  })
})


describe('per-theme contrast floors (regression guards, 2026-08 audit)', () => {
  for (const id of EXPECTED_THEME_IDS) {
    describe(id, () => {
      const t = themes[id]

      it('text vs bg >= 7', () => {
        expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(7)
      })

      const expectFloor = (fg, grounds, floor) => {
        for (const g of grounds) {
          const ratio = contrastRatio(t[fg], t[g])
          expect(ratio, `${fg} on ${g} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(floor)
        }
      }

      it('text vs every surface and tint >= 4.5', () => {
        expectFloor('text', ['surface', 'card', 'deep', ...TINTS], 4.5)
      })

      it('dim vs bg/surface/card/deep >= 4.5', () => {
        expectFloor('dim', ['bg', 'surface', 'card', 'deep'], 4.5)
      })

      it('danger vs bg/surface/card >= 4.5', () => {
        expectFloor('danger', ['bg', 'surface', 'card'], 4.5)
      })

      // Accents double as text (player labels, CTA copy) and as the fill
      // behind text-retro-bg, so both uses reduce to accent-vs-bg.
      it('p1/p2/cta/win vs bg >= 4.5', () => {
        for (const k of ['p1', 'p2', 'cta', 'win']) expectFloor(k, ['bg'], 4.5)
      })

      // WCAG 1.4.11 non-text contrast: pieces and markers on raised grounds.
      it('player/cta/win accents vs every ground >= 3', () => {
        for (const k of ['p1', 'p2', 'p3', 'p4', 'cta', 'win']) {
          expectFloor(k, ['bg', 'surface', 'card', 'deep'], 3)
        }
      })

      it('each accent vs its own tint >= 3', () => {
        for (const k of ['p1', 'p2', 'p3', 'p4', 'cta', 'danger']) expectFloor(k, [`tint-${k}`], 3)
      })

      it('p1 vs p2 separable (contrast >= 2 OR hueGap >= 40 OR saturationGap >= 0.5)', () => {
        const ratio = contrastRatio(t.p1, t.p2)
        const hue = hueGap(t.p1, t.p2)
        const sat = saturationGap(t.p1, t.p2)
        const separable = ratio >= 2 || (hue !== null && hue >= 40) || sat >= 0.5
        expect(separable, `ratio=${ratio.toFixed(2)} hueGap=${hue} satGap=${sat.toFixed(2)}`).toBe(true)
      })

      it('danger vs p2 separable (contrast >= 1.5 OR hueGap >= 18 OR saturationGap >= 0.4)', () => {
        const ratio = contrastRatio(t.danger, t.p2)
        const hue = hueGap(t.danger, t.p2)
        const sat = saturationGap(t.danger, t.p2)
        const separable = ratio >= 1.5 || (hue !== null && hue >= 18) || sat >= 0.4
        expect(separable, `ratio=${ratio.toFixed(2)} hueGap=${hue} satGap=${sat.toFixed(2)}`).toBe(true)
      })
    })
  }
})

describe('ground scheme', () => {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '')

  // A theme scoped to a wrapper (settings preview, picker swatches) must not
  // inherit the page's scheme: dark blocks rely on this reset instead of
  // restating it, and it has to precede every theme block so they win.
  it('resets the dark-ground defaults on every [data-theme] element before the theme blocks', () => {
    const reset = clean.match(/\[data-theme\]\s*\{([^{}]*)\}/)
    expect(reset, '[data-theme] { ... } block').not.toBeNull()
    expect(reset[1]).toMatch(/color-scheme:\s*dark\s*;/)
    expect(reset[1]).toMatch(/--crt-overlay:\s*block\s*;/)
    expect(reset[1]).toMatch(/--glow:\s*1\s*;/)
    expect(reset.index).toBeLessThan(clean.search(/\[data-theme="[\w-]+"\]\s*\{/))
  })

  const blocks = Object.fromEntries(
    [...clean.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^{}]*)\}/g)]
      .map(([, id, body]) => [id, body]),
  )
  const black = [0, 0, 0]

  for (const id of EXPECTED_THEME_IDS.filter(id => id !== 'midnight')) {
    it(`${id} declares the color-scheme, CRT overlay and glow strength its ground needs`, () => {
      const t = themes[id]
      const lightGround = contrastRatio(t.bg, black) > contrastRatio(t.text, black)
      const body = blocks[id]
      expect(/color-scheme:\s*light\s*;/.test(body), `${id} color-scheme: light`).toBe(lightGround)
      expect(/--crt-overlay:\s*none\s*;/.test(body), `${id} --crt-overlay: none`).toBe(lightGround)
      const glow = body.match(/--glow:\s*([\d.]+)\s*;/)
      if (lightGround) expect(Number(glow?.[1]), `${id} --glow below 1`).toBeLessThan(1)
      else expect(glow, `${id} keeps the default --glow`).toBeNull()
    })
  }
})
