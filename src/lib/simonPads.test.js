import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SIMON_PAD_META, simonPadVar, simonPadName } from './simonPads'
import { SIMON_PADS } from './simonLogic'

// The palette lives in src/index.css; parse it so the test guards the real values.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
function token(name) {
  const m = css.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`))
  return m ? m.slice(1, 4).map(Number) : null
}
const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
function luminance([r, g, b]) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) }
// CIE76 ΔE on D65 Lab — enough to say "these two read as different colours".
function lab(rgb) {
  const [r, g, b] = rgb.map(lin)
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047)
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722)
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))

describe('simon pads', () => {
  it('has one identity per pad', () => {
    expect(SIMON_PAD_META).toHaveLength(SIMON_PADS)
    expect(new Set(SIMON_PAD_META.map(p => p.glyph)).size).toBe(SIMON_PADS)
    expect(new Set(SIMON_PAD_META.map(p => p.where)).size).toBe(SIMON_PADS)
  })

  it('every pad colour is defined in index.css', () => {
    for (const { key } of SIMON_PAD_META) expect(token(`simon-${key}`), key).not.toBeNull()
  })

  // On Matcha the old themed pads were ΔE 12.8 apart; 40 is a clear margin over
  // "reads as the same colour at a glance" (roughly ΔE 20).
  it('pads are far apart in colour (ΔE76 >= 40 for every pair)', () => {
    const cols = SIMON_PAD_META.map(p => token(`simon-${p.key}`))
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        expect(deltaE(cols[i], cols[j]), `${SIMON_PAD_META[i].key}/${SIMON_PAD_META[j].key}`).toBeGreaterThanOrEqual(40)
      }
    }
  })

  it('the glyph ink stays readable (>= 4.5:1) on every lit pad', () => {
    const ink = luminance(token('simon-ink'))
    for (const { key } of SIMON_PAD_META) {
      const l = luminance(token(`simon-${key}`))
      expect((Math.max(l, ink) + 0.05) / (Math.min(l, ink) + 0.05), key).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('names and CSS vars', () => {
    expect(simonPadVar(0)).toBe('var(--simon-green)')
    expect(simonPadName(3)).toBe('blue pad, bottom right')
    expect(simonPadName(9)).toBe('pad')
  })
})
