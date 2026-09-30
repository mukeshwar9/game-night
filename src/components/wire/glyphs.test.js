import { describe, expect, it } from 'vitest'
import { MIRRORABLE } from './glyphs'
import { GLYPH_COUNT, GLYPH_MIRROR_COUNT } from '../../lib/wireLogic'

describe('mirrored glyphs', () => {
  it('names 8 distinct base glyphs, one per mirrored id 24-31', () => {
    expect(MIRRORABLE).toHaveLength(GLYPH_MIRROR_COUNT)
    expect(new Set(MIRRORABLE).size).toBe(MIRRORABLE.length)
    MIRRORABLE.forEach(b => { expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThan(GLYPH_COUNT) })
  })
})
