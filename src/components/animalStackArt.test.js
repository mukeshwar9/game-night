import { describe, expect, it } from 'vitest'
import { ART, hullBounds, lum, parseRgb, pixelate, rolePalette } from './animalStackArt'
import { PIECES } from '../lib/animalStackLogic'

const THEME = { bg: [240, 238, 225], text: [40, 50, 40], beak: [255, 159, 28], blush: [255, 105, 180] }

describe('animal stack art', () => {
  it('has art for every animal, using only palette roles', () => {
    const roles = Object.keys(rolePalette([100, 100, 100], THEME))
    for (const p of PIECES) {
      expect(ART[p.id], p.id).toBeTruthy()
      for (const d of ART[p.id].details) {
        expect(roles).toContain(d.r)
        expect(!!d.p + !!d.e + !!d.l, `${p.id} detail shape`).toBe(1)
      }
    }
  })

  it('keeps each animal hull bounds unchanged (art is clipped to physics)', () => {
    expect(hullBounds(PIECES[0]).map(v => +v.toFixed(2))).toEqual([-0.75, -0.63, 1.25, 0.58])
  })

  it('derives shades from the theme and keeps bellies readable on light tones', () => {
    const dark = rolePalette([60, 60, 60], THEME)
    expect(lum(dark.pale)).toBeGreaterThan(lum(dark.base))
    expect(lum(dark.dark)).toBeLessThan(lum(dark.base))
    // the penguin on a dark theme: tone = light text colour
    const light = rolePalette([235, 235, 235], { ...THEME, bg: [20, 20, 30], text: [235, 235, 235] })
    expect(lum(light.base) - lum(light.pale)).toBeGreaterThan(0.25)
  })

  it('lifts a tone that would vanish into the backdrop', () => {
    const p = rolePalette([12, 40, 12], { ...THEME, bg: [8, 30, 8], text: [180, 255, 180] })
    expect(lum(p.base) - lum([8, 30, 8])).toBeGreaterThan(0.1)
  })

  it('parses token triplets and falls back to grey', () => {
    expect(parseRgb(' 1 2 3 ')).toEqual([1, 2, 3])
    expect(parseRgb('')).toEqual([128, 128, 128])
  })

  it('pixelate thresholds alpha, snaps colours and draws an inner outline', () => {
    // 3×3 fully opaque block of a near-palette colour, faint pixel at the corner
    const w = 4, h = 4
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) data.set([98, 102, 99, 255], (y * w + x) * 4)
    data.set([0, 0, 0, 60], (3 * w + 3) * 4)
    pixelate(data, w, h, [[100, 100, 100], [200, 0, 0]], [10, 10, 10])
    const px = (x, y) => Array.from(data.slice((y * w + x) * 4, (y * w + x) * 4 + 4))
    expect(px(1, 1)).toEqual([100, 100, 100, 255]) // interior snapped
    expect(px(0, 0)).toEqual([10, 10, 10, 255]) // edge outlined
    expect(px(3, 3)[3]).toBe(0) // faint pixel dropped
  })
})
