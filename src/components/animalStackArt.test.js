import { describe, expect, it } from 'vitest'
import { blur, lum, paintAnimal, parseRgb, rolePalette, SKINS, texture } from './animalStackArt'
import { CELL, GRIDS, PIXELS } from '../lib/animalStackPixels'
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

  describe('painted sprites', () => {
    const N = 4
    const pal = rolePalette([90, 150, 60], THEME)
    const paint = (id, n = N) => paintAnimal(PIXELS[id].grid, rolePalette(parseRgb('90 150 60'), THEME), n, SKINS[id], { parts: PIXELS[id].parts, cell: CELL })
    const art = Object.fromEntries(PIECES.map(p => [p.id, paint(p.id)]))
    const px = (r, x, y) => [...r.rgba.slice((y * r.w + x) * 4, (y * r.w + x) * 4 + 4)]

    it('gives every animal a known surface texture', () => {
      for (const p of PIECES) {
        expect(SKINS[p.id], p.id).toBeTruthy()
        expect(texture(SKINS[p.id], 3.3, 1.7), p.id).not.toBe(0)
      }
    })

    it('never paints outside the physics boxes and fills the drawn cells', () => {
      for (const p of PIECES) {
        const pp = PIXELS[p.id], r = art[p.id]
        expect([r.w, r.h]).toEqual([pp.w * N, pp.h * N])
        let cellPx = 0, solid = 0
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
          const a = px(r, x, y)[3]
          const mx = ((x + 0.5) / N - pp.w / 2) * CELL, my = (pp.h / 2 - (y + 0.5) / N) * CELL
          if (a > 0) {
            const inHull = pp.parts.some(b => mx > b[0][0] && mx < b[1][0] && my > b[0][1] && my < b[2][1])
            expect(inHull, `${p.id} px ${x},${y}`).toBe(true)
          }
          if (pp.grid[Math.floor(y / N)][Math.floor(x / N)] !== '.') { cellPx++; if (a > 128) solid++ }
        }
        // the smoothed contour only rounds off corners
        expect(solid / cellPx, p.id).toBeGreaterThan(0.85)
      }
    })

    it('shades bodies lit from above', () => {
      for (const id of ['elephant', 'hippo', 'pig', 'frog']) {
        const r = art[id]
        let top = 0, nt = 0, bot = 0, nb = 0
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
          const [R, G, B, a] = px(r, x, y)
          if (a < 255) continue
          if (y < r.h / 2) { top += lum([R, G, B]); nt++ } else { bot += lum([R, G, B]); nb++ }
        }
        expect(top / nt, id).toBeGreaterThan(bot / nb)
      }
    })

    it('gives eyes a dark pupil and a bright catchlight', () => {
      for (const p of PIECES) {
        const grid = PIXELS[p.id].grid, r = paint(p.id, 10)
        let dark = 1, bright = 0
        grid.forEach((row, cy) => row.forEach((ch, cx) => {
          if (ch !== 'K' && ch !== 'W') return
          for (let y = cy * 10; y < cy * 10 + 10; y++) for (let x = cx * 10; x < cx * 10 + 10; x++) {
            const l = lum(px(r, x, y).slice(0, 3))
            dark = Math.min(dark, l); bright = Math.max(bright, l)
          }
        }))
        expect(dark, p.id).toBeLessThan(lum(pal.pupil) + 0.08)
        expect(bright, p.id).toBeGreaterThan(lum(pal.eye) - 0.08)
      }
    })

    it('casts a soft shadow that spreads past the silhouette', () => {
      const { shadow, w, h } = art.pig
      expect(shadow.w).toBe(w + 2 * shadow.pad)
      expect(shadow.h).toBe(h + 2 * shadow.pad)
      const at = (x, y) => shadow.alpha[y * shadow.w + x]
      expect(at(shadow.w >> 1, shadow.h >> 1)).toBeGreaterThan(200)
      expect(at(0, 0)).toBe(0)
      let soft = 0
      for (const v of shadow.alpha) if (v > 0 && v < 200) soft++
      expect(soft).toBeGreaterThan(shadow.w * 2)
    })

    it('paints deterministically', () => {
      expect(paint('owl').rgba).toEqual(art.owl.rgba)
    })

    it('box blur keeps the mass of an interior impulse', () => {
      const f = new Float32Array(20 * 20)
      f[10 * 20 + 10] = 1
      const b = blur(f, 20, 20, 2, 2)
      expect(b.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5)
      expect(b[10 * 20 + 10]).toBeLessThan(0.2)
    })
  })
})
