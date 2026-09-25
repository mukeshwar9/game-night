import { existsSync, readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { FONTS } from './font'

const cssText = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

const faces = [...cssText.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
  family: body.match(/font-family:\s*'([^']+)'/)?.[1],
  src: body.match(/url\('([^']+)'\)/)?.[1],
  sizeAdjust: Number(body.match(/size-adjust:\s*([\d.]+)%/)?.[1] ?? NaN),
}))

const DEFAULT_ID = 'press-start'

describe('FONTS registry', () => {
  it('has unique ids and families', () => {
    expect(new Set(FONTS.map(f => f.id)).size).toBe(FONTS.length)
    expect(new Set(FONTS.map(f => f.family)).size).toBe(FONTS.length)
  })

  it('every family has a self-hosted @font-face whose file exists', () => {
    for (const font of FONTS) {
      const own = faces.filter(face => face.family === font.family)
      expect(own.length, font.family).toBeGreaterThan(0)
      for (const face of own) {
        expect(face.src, font.family).toMatch(/^\/fonts\//)
        expect(existsSync(new URL(`../../public${face.src}`, import.meta.url)), face.src).toBe(true)
      }
    }
  })

  // The UI's pixel sizes were tuned for Press Start 2P; without a cap-matching
  // size-adjust every other face renders 20-36% smaller at the same class.
  it('every non-default face declares a cap-matching size-adjust', () => {
    for (const font of FONTS.filter(f => f.id !== DEFAULT_ID)) {
      for (const face of faces.filter(f => f.family === font.family)) {
        expect(face.sizeAdjust, font.family).toBeGreaterThanOrEqual(110)
        expect(face.sizeAdjust, font.family).toBeLessThanOrEqual(180)
      }
    }
  })

  it('every non-default id has a [data-font] rule for first paint', () => {
    for (const font of FONTS.filter(f => f.id !== DEFAULT_ID)) {
      expect(cssText, font.id).toContain(`[data-font='${font.id}'] { --font-pixel: '${font.family}'; }`)
    }
  })
})
