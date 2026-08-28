import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { parseThemes, contrastRatio, hueGap, saturationGap } from './themeContrast'

const cssText = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const themes = parseThemes(cssText)

const EXPECTED_THEME_IDS = [
  'midnight', 'phosphor', 'amber', 'synthwave', 'grid', 'mono', 'virtualboy', 'paper',
]

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
})


describe('per-theme contrast floors (regression guards, 2026-08 audit)', () => {
  for (const id of EXPECTED_THEME_IDS) {
    describe(id, () => {
      const t = themes[id]

      it('text vs bg >= 7', () => {
        expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(7)
      })

      it('dim vs bg >= 4', () => {
        expect(contrastRatio(t.dim, t.bg)).toBeGreaterThanOrEqual(4)
      })

      it('danger vs bg >= 4.5', () => {
        expect(contrastRatio(t.danger, t.bg)).toBeGreaterThanOrEqual(4.5)
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
