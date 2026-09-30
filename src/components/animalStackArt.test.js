import { describe, expect, it } from 'vitest'
import { lum, parseRgb, rolePalette } from './animalStackArt'
import { GRIDS, PIXELS } from '../lib/animalStackPixels'
import { PIECES } from '../lib/animalStackLogic'

const THEME = { bg: [240, 238, 225], text: [40, 50, 40], beak: [255, 159, 28], blush: [255, 105, 180] }

describe('animal stack art', () => {
  it('has a pixel grid for every animal using only palette roles', () => {
    const roles = new Set('BLSPDWKOR.'.split(''))
    for (const p of PIECES) {
      const g = GRIDS[p.id]
      expect(g, p.id).toBeTruthy()
      for (const row of g.rows) for (const ch of row) expect(roles.has(ch), `${p.id} '${ch}'`).toBe(true)
      expect(g.rows.join('')).toMatch(/K/) // has a pupil
    }
  })

  it('uses each grid as its physics hull: boxes cover every drawn cell', () => {
    for (const p of PIECES) {
      const px = PIXELS[p.id]
      expect(p.parts).toBe(px.parts)
      const cell = 1 / 16
      let drawn = 0
      px.grid.forEach((row, y) => row.forEach((ch, x) => {
        if (ch === '.') return
        drawn++
        const cx = (x + 0.5 - px.w / 2) * cell, cy = (px.h / 2 - y - 0.5) * cell
        const inside = px.parts.some(b => cx > b[0][0] && cx < b[1][0] && cy > b[0][1] && cy < b[2][1])
        expect(inside, `${p.id} cell ${x},${y}`).toBe(true)
      }))
      expect(drawn).toBeGreaterThan(30)
    }
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
})
