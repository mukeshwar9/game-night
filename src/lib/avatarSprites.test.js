import { describe, it, expect } from 'vitest'
import { SHAPES, HUMANOIDS, HAIR_STYLES, ACCESSORIES, ACCESSORY_LABEL } from './avatars'
import {
  CREATURE_GLYPHS, BODY_GLYPHS, HAIR_GLYPHS, CAP_GLYPHS, ACCESSORY_GLYPHS,
  ACCESSORY_TONES, HEAD_BOX, composeHumanoidGrid, glyphFor,
} from './avatarSprites'

const CREATURE_SHAPES = SHAPES.filter((s) => !HUMANOIDS.includes(s))
const CREATURE_CHARS = new Set(['.', '#', 'o'])
const BODY_CHARS = new Set(['.', 'o', 'k', 's', 'p', 'b'])
const OVERLAY_CHARS = { h: new Set(['.', 'h']), c: new Set(['.', 'c']), g: new Set(['.', 'g']), u: new Set(['.', 'u']) }

function expectGrid(grid, n) {
  expect(grid.length).toBe(n)
  for (const row of grid) {
    expect(typeof row).toBe('string')
    expect(row.length).toBe(n)
  }
}

describe('CREATURE_GLYPHS', () => {
  it('has an entry for every non-humanoid SHAPES key, and only those', () => {
    expect(new Set(Object.keys(CREATURE_GLYPHS))).toEqual(new Set(CREATURE_SHAPES))
  })

  it('every creature grid is 8x8 using only allowed chars', () => {
    for (const grid of Object.values(CREATURE_GLYPHS)) {
      expectGrid(grid, 8)
      for (const row of grid) {
        for (const ch of row) expect(CREATURE_CHARS.has(ch)).toBe(true)
      }
    }
  })
})

describe('BODY_GLYPHS', () => {
  it('has an entry for every HUMANOIDS key, and only those', () => {
    expect(new Set(Object.keys(BODY_GLYPHS))).toEqual(new Set(HUMANOIDS))
  })

  it('every body grid is 16x16 using only allowed chars (no "c")', () => {
    for (const grid of Object.values(BODY_GLYPHS)) {
      expectGrid(grid, 16)
      for (const row of grid) {
        for (const ch of row) expect(BODY_CHARS.has(ch)).toBe(true)
        expect(row).not.toContain('c')
      }
    }
  })

  it('every body has at least one of each region char: k, s, p, b, o', () => {
    for (const [shape, grid] of Object.entries(BODY_GLYPHS)) {
      const joined = grid.join('')
      for (const ch of ['k', 's', 'p', 'b', 'o']) {
        expect(joined, `${shape} missing '${ch}'`).toContain(ch)
      }
    }
  })

  it('keeps every head pixel (k/o) inside the shared HEAD_BOX', () => {
    for (const [shape, grid] of Object.entries(BODY_GLYPHS)) {
      grid.forEach((row, y) => {
        row.split('').forEach((ch, x) => {
          if (ch !== 'k' && ch !== 'o') return
          expect(y, `${shape} head pixel row ${y} out of box`).toBeGreaterThanOrEqual(HEAD_BOX.rowStart)
          expect(y, `${shape} head pixel row ${y} out of box`).toBeLessThanOrEqual(HEAD_BOX.rowEnd)
          expect(x, `${shape} head pixel col ${x} out of box`).toBeGreaterThanOrEqual(HEAD_BOX.colStart)
          expect(x, `${shape} head pixel col ${x} out of box`).toBeLessThanOrEqual(HEAD_BOX.colEnd)
        })
      })
    }
  })
})

describe('HAIR_GLYPHS', () => {
  it('has an entry for every non-"none" HAIR_STYLES key, and only those', () => {
    const expected = HAIR_STYLES.filter((h) => h !== 'none')
    expect(new Set(Object.keys(HAIR_GLYPHS))).toEqual(new Set(expected))
  })

  it('every hair grid is 16x16 using only "." and "h", and is non-empty', () => {
    for (const grid of Object.values(HAIR_GLYPHS)) {
      expectGrid(grid, 16)
      const joined = grid.join('')
      for (const ch of joined) expect(OVERLAY_CHARS.h.has(ch)).toBe(true)
      expect(joined).toContain('h')
    }
  })
})

describe('CAP_GLYPHS', () => {
  it('is a single shared 16x16 "c" overlay', () => {
    const grids = Object.values(CAP_GLYPHS)
    expect(grids.length).toBe(1)
    for (const grid of grids) {
      expectGrid(grid, 16)
      const joined = grid.join('')
      for (const ch of joined) expect(OVERLAY_CHARS.c.has(ch)).toBe(true)
      expect(joined).toContain('c')
    }
  })
})

describe('ACCESSORY_GLYPHS / ACCESSORY_TONES', () => {
  const expectedKeys = ACCESSORIES.filter((a) => a !== 'none')

  it('has an entry for every non-"none" ACCESSORIES key, and only those', () => {
    expect(new Set(Object.keys(ACCESSORY_GLYPHS))).toEqual(new Set(expectedKeys))
  })

  it('every layer grid is 16x16 with only its own overlay char', () => {
    for (const [acc, layers] of Object.entries(ACCESSORY_GLYPHS)) {
      for (const [layerName, grid] of Object.entries(layers)) {
        expectGrid(grid, 16)
        const joined = grid.join('')
        const allowed = layerName === 'under' ? OVERLAY_CHARS.u : OVERLAY_CHARS.g
        for (const ch of joined) expect(allowed.has(ch)).toBe(true)
        expect(joined, `${acc}.${layerName} is empty`).toContain(layerName === 'under' ? 'u' : 'g')
      }
    }
  })

  it('cape carries an under layer', () => {
    expect(ACCESSORY_GLYPHS.cape.under).toBeTruthy()
  })

  it('ACCESSORY_TONES covers every non-"none" accessory with a token role', () => {
    for (const acc of expectedKeys) expect(typeof ACCESSORY_TONES[acc]).toBe('string')
    expect(Object.keys(ACCESSORY_TONES).length).toBe(expectedKeys.length)
    expect(ACCESSORY_LABEL[expectedKeys[0]]).toBeTruthy() // sanity: labels exist for these keys too
  })
})

describe('composeHumanoidGrid', () => {
  const baseParts = { cap: 'none', shirt: 'p1', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p1', acc: 'none' }

  it('returns a 16x16 grid for every humanoid shape', () => {
    for (const shape of HUMANOIDS) {
      expectGrid(composeHumanoidGrid(shape, baseParts), 16)
    }
  })

  it('is a pure function: same inputs -> identical output', () => {
    const a = composeHumanoidGrid('boy', { ...baseParts, hair: 'spiky', acc: 'glasses' })
    const b = composeHumanoidGrid('boy', { ...baseParts, hair: 'spiky', acc: 'glasses' })
    expect(a).toEqual(b)
  })

  it('hair shows when cap is "none"', () => {
    const grid = composeHumanoidGrid('boy', { ...baseParts, hair: 'short' })
    expect(grid.join('')).toContain('h')
  })

  it('cap overwrites hair in the cells they share', () => {
    const withoutCap = composeHumanoidGrid('boy', { ...baseParts, hair: 'short', cap: 'none' })
    const withCap = composeHumanoidGrid('boy', { ...baseParts, hair: 'short', cap: 'cta' })
    // row 0 is fully hair in HAIR_GLYPHS.short and fully cap in CAP_GLYPHS.cap.
    expect(withoutCap[0]).toContain('h')
    expect(withoutCap[0]).not.toContain('c')
    expect(withCap[0]).toContain('c')
    expect(withCap[0]).not.toContain('h')
  })

  it('cape "u" never overwrites body pixels', () => {
    const withoutCape = composeHumanoidGrid('boy', baseParts)
    const withCape = composeHumanoidGrid('boy', { ...baseParts, acc: 'cape' })
    withoutCape.forEach((row, y) => {
      row.split('').forEach((ch, x) => {
        if (ch === '.') return // only body-occupied cells are meaningful here
        expect(withCape[y][x]).toBe(ch)
      })
    })
    // and the cape layer is actually visible somewhere (in a cell the body left empty)
    expect(withCape.join('')).toContain('u')
  })

  it('accessory front layer composites after hair/cap', () => {
    const grid = composeHumanoidGrid('boy', { ...baseParts, hair: 'short', cap: 'cta', acc: 'glasses' })
    expect(grid.join('')).toContain('g')
  })

  it('unknown shape falls back to boy body', () => {
    expect(composeHumanoidGrid('zzz', baseParts)).toEqual(composeHumanoidGrid('boy', baseParts))
  })
})

describe('glyphFor', () => {
  it('returns the 8x8 creature grid for a creature shape', () => {
    const { grid, size } = glyphFor('ghost')
    expect(size).toBe(8)
    expect(grid).toBe(CREATURE_GLYPHS.ghost)
  })

  it('falls back to invader for an unknown shape', () => {
    const { grid } = glyphFor('zzz')
    expect(grid).toBe(CREATURE_GLYPHS.invader)
  })
})
