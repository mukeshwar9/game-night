import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PAIRS_FACES, PAIRS_SIZE } from './pairsLogic'
import {
  PAIRS_FACE_NAMES, pairsFaceColor, pairsFaceName, pairsFaceGlyph, pairsCellPosition,
} from './pairsFaces'

// The palette lives in src/index.css; parse it so the test guards the real values.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
function token(name) {
  const m = css.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`))
  return m ? m.slice(1, 4).map(Number) : null
}
function luminance([r, g, b]) {
  const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

describe('pairs card faces', () => {
  it('every face has a spoken name, and names are unique', () => {
    const names = PAIRS_FACES.map(pairsFaceName)
    expect(names.every(n => n && n !== 'card')).toBe(true)
    expect(new Set(names).size).toBe(PAIRS_FACES.length)
    expect(Object.keys(PAIRS_FACE_NAMES).sort()).toEqual([...PAIRS_FACES].sort())
  })

  it('every face has its own silhouette (no two glyphs alike)', () => {
    const glyphs = PAIRS_FACES.map(f => pairsFaceGlyph(f).join('/'))
    expect(new Set(glyphs).size).toBe(PAIRS_FACES.length)
    for (const g of PAIRS_FACES.map(pairsFaceGlyph)) {
      expect(g).toHaveLength(8)
      g.forEach(row => expect(row).toHaveLength(8))
    }
  })

  it('every face has its own colour token in index.css', () => {
    const colours = PAIRS_FACES.map(f => token(`pair-${f}`))
    expect(colours.every(Boolean)).toBe(true)
    expect(new Set(colours.map(c => c.join(' '))).size).toBe(PAIRS_FACES.length)
  })

  it('card ink stays readable (>= 4.5:1) on every face colour', () => {
    const ink = luminance(token('pair-ink'))
    for (const f of PAIRS_FACES) {
      const l = luminance(token(`pair-${f}`))
      const ratio = (Math.max(l, ink) + 0.05) / (Math.min(l, ink) + 0.05)
      expect(ratio, f).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('pairsFaceColor emits a CSS var expression, falling back for unknown faces', () => {
    expect(pairsFaceColor('frog')).toBe('rgb(var(--pair-frog))')
    expect(pairsFaceColor('frog', 0.5)).toBe('rgb(var(--pair-frog) / 0.5)')
    expect(pairsFaceColor('nope')).toBe('rgb(var(--pair-ghost))')
  })

  it('pairsCellPosition is 1-based row/column', () => {
    expect(pairsCellPosition(0, PAIRS_SIZE)).toBe('row 1, column 1')
    expect(pairsCellPosition(35, PAIRS_SIZE)).toBe('row 6, column 6')
    expect(pairsCellPosition(7, PAIRS_SIZE)).toBe('row 2, column 2')
  })
})
