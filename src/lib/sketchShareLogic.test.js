import { describe, it, expect } from 'vitest'
import {
  CARD_W, CARD_H, COLLAGE_MAX,
  collagePages, collageGrid, collageLayout, shareTitle, drawingCaption, allCaption,
  whatsAppLink, sketchFilename, byLine, pdfPages, onThisPhone,
} from './sketchShareLogic'
import { GALLERY_CAP } from './sketchStageLogic'

const n = k => Array.from({ length: k }, (_, i) => i)

describe('collagePages', () => {
  it('fits up to 9 drawings on one image', () => {
    expect(collagePages(n(1))).toEqual([[0]])
    expect(collagePages(n(9))).toHaveLength(1)
  })

  it('balances more than 9 over 2 or 3 images', () => {
    expect(collagePages(n(10)).map(p => p.length)).toEqual([5, 5])
    expect(collagePages(n(18)).map(p => p.length)).toEqual([9, 9])
    expect(collagePages(n(19)).map(p => p.length)).toEqual([7, 6, 6])
    expect(collagePages(n(GALLERY_CAP)).length).toBe(3)
    expect(collagePages(n(GALLERY_CAP)).flat()).toEqual(n(GALLERY_CAP))
  })

  it('makes no images from nothing', () => {
    expect(collagePages([])).toEqual([])
    expect(collagePages(null)).toEqual([])
  })
})

describe('collageGrid', () => {
  it('uses 1, 2 or 3 columns', () => {
    expect(collageGrid(1)).toEqual({ cols: 1, rows: 1 })
    expect(collageGrid(2)).toEqual({ cols: 2, rows: 1 })
    expect(collageGrid(4)).toEqual({ cols: 2, rows: 2 })
    expect(collageGrid(5)).toEqual({ cols: 3, rows: 2 })
    expect(collageGrid(COLLAGE_MAX)).toEqual({ cols: 3, rows: 3 })
  })
})

describe('collageLayout', () => {
  it('keeps every drawing inside the image and clear of the others', () => {
    for (const count of [1, 2, 3, 4, 5, 7, 9]) {
      const { cells, size } = collageLayout(count)
      expect(cells).toHaveLength(count)
      expect(size).toBeGreaterThan(200)
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.x + c.size).toBeLessThanOrEqual(CARD_W)
        expect(c.y).toBeGreaterThanOrEqual(150)
        expect(c.labelY + 64).toBeLessThanOrEqual(CARD_H - 190 + 1)
      }
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]; const b = cells[j]
          const apart = a.x + a.size <= b.x || b.x + b.size <= a.x || a.labelY + 64 <= b.y || b.labelY + 64 <= a.y
          expect(apart).toBe(true)
        }
      }
    }
  })

  it('centres a short last row', () => {
    const { cells, size } = collageLayout(4) // 2 × 2
    expect(cells[0].x + size / 2 + cells[1].x + size / 2).toBeCloseTo(CARD_W, -1)
    const five = collageLayout(5) // 3 + 2
    const mid = (five.cells[3].x + five.cells[4].x + five.size) / 2
    expect(mid).toBeCloseTo(CARD_W / 2, -1)
  })
})

describe('copy', () => {
  it('titles a collage with the date', () => {
    expect(shareTitle(new Date(2026, 10, 8))).toBe('SKETCH · 8 NOV 2026')
  })

  it('captions one drawing, with or without the artist', () => {
    expect(drawingCaption({ word: 'treasure map', name: 'Ivy', link: 'https://x/play/sketch' }))
      .toBe('"TREASURE MAP" BY IVY — DRAWN IN SKETCH ON GAME NIGHT. PLAY: https://x/play/sketch')
    expect(drawingCaption({ word: 'cat', name: 'Ivy', showName: false, link: 'L' })).toBe('"CAT" — DRAWN IN SKETCH ON GAME NIGHT. PLAY: L')
  })

  it('captions the whole set', () => {
    expect(allCaption({ count: 6, link: 'L' })).toBe('6 DRAWINGS FROM OUR SKETCH MATCH ON GAME NIGHT. PLAY: L')
    expect(allCaption({ count: 1 })).toBe('1 DRAWING FROM OUR SKETCH MATCH ON GAME NIGHT.')
  })

  it('builds a wa.me link with the caption filled in', () => {
    expect(whatsAppLink('"CAT" & co')).toBe('https://wa.me/?text=%22CAT%22%20%26%20co')
  })

  it('makes safe file names', () => {
    expect(sketchFilename('Treasure Map')).toBe('sketch-treasure-map.png')
    expect(sketchFilename('Café au lait!', 'png', '2')).toBe('sketch-cafe-au-lait-2.png')
    expect(sketchFilename('', 'pdf')).toBe('sketch-drawing.pdf')
    expect(sketchFilename('???')).toBe('sketch-drawing.png')
  })

  it('writes the by-line, leaving the name off on request', () => {
    expect(byLine({ name: 'Ivy', hearts: 4 })).toBe('DRAWN BY IVY · ♥ 4')
    expect(byLine({ name: 'Ivy', showName: false, hearts: 4 })).toBe('♥ 4')
    expect(byLine({ name: 'Ivy' })).toBe('DRAWN BY IVY')
  })

  it('counts the drawings on this phone', () => {
    expect(onThisPhone(6)).toBe('6 DRAWINGS ON THIS PHONE')
    expect(onThisPhone(1)).toBe('1 DRAWING ON THIS PHONE')
  })
})

describe('pdfPages', () => {
  it('starts with a cover, then one page per drawing', () => {
    expect(pdfPages(['a', 'b'])).toEqual([{ kind: 'cover' }, { kind: 'drawing', entry: 'a' }, { kind: 'drawing', entry: 'b' }])
  })
})
