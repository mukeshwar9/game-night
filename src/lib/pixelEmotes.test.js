import { describe, it, expect } from 'vitest'
import { EMOTES_PREMIUM, EMOTES_PICKER_ALL } from './emotes'
import { SPRITES, SPRITE_SIZE, PIXEL_PALETTE, pixelEmoteFor, spriteFrame, pixelColour } from './pixelEmotes'

describe('PIXEL EMOTES sprites', () => {
  it('has a sprite for every premium reaction, found by its glyph', () => {
    for (const item of EMOTES_PREMIUM) expect(pixelEmoteFor(item.glyph), item.id).toBe(item.id)
  })

  it('never turns a free reaction into a sprite', () => {
    for (const glyph of EMOTES_PICKER_ALL) expect(pixelEmoteFor(glyph), glyph).toBeNull()
    expect(pixelEmoteFor('🔥')).toBeNull()
    expect(pixelEmoteFor('')).toBeNull()
  })

  it('every frame is a 16×16 grid of known palette keys, and not empty', () => {
    for (const [id, sprite] of Object.entries(SPRITES)) {
      expect(sprite.frames, id).toBeGreaterThanOrEqual(3)
      for (let f = 0; f < sprite.frames; f++) {
        const grid = spriteFrame(id, f)
        expect(grid, `${id}#${f}`).toHaveLength(SPRITE_SIZE)
        let painted = 0
        for (const row of grid) {
          expect(row, `${id}#${f}`).toHaveLength(SPRITE_SIZE)
          for (const key of row) {
            if (key === '.') continue
            expect(PIXEL_PALETTE[key], `${id}#${f} key ${key}`).toBeTruthy()
            painted++
          }
        }
        expect(painted, `${id}#${f}`).toBeGreaterThan(12)
      }
    }
  })

  it('animates: consecutive frames differ', () => {
    for (const [id, sprite] of Object.entries(SPRITES)) {
      const a = JSON.stringify(spriteFrame(id, 0))
      const b = JSON.stringify(spriteFrame(id, 1 % sprite.frames))
      expect(a === b, id).toBe(false)
    }
  })

  it('wraps frame numbers and rejects unknown ids', () => {
    expect(spriteFrame('crown', 6)).toEqual(spriteFrame('crown', 0))
    expect(spriteFrame('crown', -1)).toEqual(spriteFrame('crown', 5))
    expect(spriteFrame('nope', 0)).toBeNull()
  })

  it('maps palette keys to rgb() colours from the fixed palette', () => {
    expect(pixelColour('.')).toBeNull()
    expect(pixelColour('Y')).toMatch(/^rgb\(\d+ \d+ \d+\)$/)
  })
})
