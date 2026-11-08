import { describe, it, expect } from 'vitest'
import {
  ACTIVATION_MS, CARD_H, CARD_W, COLLAGE_BOTTOM, COLLAGE_MAX, COLLAGE_TOP, PDF_PAGE, PLAY_PATH,
  allCaption, byLine, canShareAll, collageGrid, collageImageCount, collageLayout, collagePages,
  coverLines, drawingCaption, needsSecondTap, onThisPhone, pdfPages, picturesLine, shareTitle,
  shareFavourite, sharePodium, sketchFilename, whatsAppLink,
} from './sketchShareLogic'
import { GALLERY_CAP } from './sketchStageLogic'

const range = n => Array.from({ length: n }, (_, i) => i)

describe('sizes', () => {
  it('shares 1080 × 1350 portraits, up to 3 × 3 a collage, and A4 PDF pages', () => {
    expect([CARD_W, CARD_H]).toEqual([1080, 1350])
    expect(COLLAGE_MAX).toBe(9)
    expect(PDF_PAGE.h / PDF_PAGE.w).toBeCloseTo(297 / 210, 2)
    expect(PLAY_PATH).toBe('/games?game=sketch')
  })
})

describe('collagePages', () => {
  it('fits up to nine drawings on one image', () => {
    expect(collagePages(range(2))).toEqual([[0, 1]])
    expect(collagePages(range(9))).toEqual([range(9)])
  })

  it('splits more than nine into as few images as possible, balanced', () => {
    expect(collagePages(range(10)).map(p => p.length)).toEqual([5, 5])
    expect(collagePages(range(14)).map(p => p.length)).toEqual([7, 7])
    expect(collagePages(range(19)).map(p => p.length)).toEqual([7, 6, 6])
    expect(collagePages(range(GALLERY_CAP)).map(p => p.length)).toEqual([8, 8, 8])
    // Order is kept across images.
    expect(collagePages(range(10)).flat()).toEqual(range(10))
  })

  it('makes nothing from nothing', () => {
    expect(collagePages([])).toEqual([])
    expect(collagePages(null)).toEqual([])
    expect(collageImageCount(0)).toBe(0)
  })

  it('never makes more than three images for a full gallery', () => {
    expect(collageImageCount(GALLERY_CAP)).toBe(3)
    expect(collageImageCount(9)).toBe(1)
    expect(collageImageCount(10)).toBe(2)
  })
})

describe('collageGrid and collageLayout', () => {
  it('uses 2 columns up to four drawings, then 3', () => {
    expect(collageGrid(1)).toEqual({ cols: 1, rows: 1 })
    expect(collageGrid(2)).toEqual({ cols: 2, rows: 1 })
    expect(collageGrid(4)).toEqual({ cols: 2, rows: 2 })
    expect(collageGrid(5)).toEqual({ cols: 3, rows: 2 })
    expect(collageGrid(9)).toEqual({ cols: 3, rows: 3 })
  })

  it('keeps every cell and its labels inside the band between title and footer', () => {
    for (let n = 1; n <= COLLAGE_MAX; n++) {
      const { cells, size } = collageLayout(n)
      expect(cells).toHaveLength(n)
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(70)
        expect(c.x + size).toBeLessThanOrEqual(CARD_W - 70 + 1)
        expect(c.y).toBeGreaterThanOrEqual(COLLAGE_TOP)
        expect(c.labelY + 64).toBeLessThanOrEqual(CARD_H - COLLAGE_BOTTOM + 1)
      }
    }
  })

  it('never overlaps two cells', () => {
    for (let n = 2; n <= COLLAGE_MAX; n++) {
      const { cells, size } = collageLayout(n)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = cells[i]
          const b = cells[j]
          const apart = a.x + size <= b.x || b.x + size <= a.x || a.y + size + 64 <= b.y || b.y + size + 64 <= a.y
          expect(apart).toBe(true)
        }
      }
    }
  })

  it('keeps a 3 × 3 drawing big enough to read (about a quarter of the width)', () => {
    expect(collageLayout(9).size).toBeGreaterThanOrEqual(260)
  })

  it('centres a short last row', () => {
    const { cells, size } = collageLayout(5)
    const lastRow = cells.slice(3)
    const left = lastRow[0].x
    const right = CARD_W - (lastRow[1].x + size)
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
  })
})

describe('copy', () => {
  it('titles a share with the date', () => {
    expect(shareTitle(new Date(2026, 10, 8))).toBe('SKETCH · 8 NOV 2026')
    expect(shareTitle(new Date('nope'))).toMatch(/^SKETCH · \d+ [A-Z]{3} \d{4}$/)
  })

  it('writes the by-line with or without the name', () => {
    expect(byLine({ name: 'Ivy', hearts: 4 })).toBe('DRAWN BY IVY · ♥ 4')
    expect(byLine({ name: 'Ivy', hearts: 0 })).toBe('DRAWN BY IVY')
    expect(byLine({ name: 'Ivy', showName: false, hearts: 4 })).toBe('♥ 4')
    expect(byLine({ name: 'Ivy', showName: false })).toBe('')
  })

  it('captions one drawing, leaving the name off when asked', () => {
    const link = 'https://x.app/games?game=sketch'
    expect(drawingCaption({ word: 'treasure map', name: 'Ivy', link }))
      .toBe(`"TREASURE MAP" BY IVY — DRAWN IN SKETCH ON GAME NIGHT. PLAY: ${link}`)
    expect(drawingCaption({ word: 'cat', name: 'Ivy', showName: false, link }))
      .toBe(`"CAT" — DRAWN IN SKETCH ON GAME NIGHT. PLAY: ${link}`)
    expect(drawingCaption({ word: 'cat' })).toBe('"CAT" — DRAWN IN SKETCH ON GAME NIGHT.')
  })

  it('captions the whole set', () => {
    expect(allCaption({ count: 6, link: 'L' })).toBe('6 DRAWINGS FROM OUR SKETCH MATCH ON GAME NIGHT. PLAY: L')
    expect(allCaption({ count: 1 })).toBe('1 DRAWING FROM OUR SKETCH MATCH ON GAME NIGHT.')
  })

  it('builds a wa.me link with the caption encoded', () => {
    expect(whatsAppLink('"CAT" BY IVY — X & Y')).toBe('https://wa.me/?text=%22CAT%22%20BY%20IVY%20%E2%80%94%20X%20%26%20Y')
    expect(whatsAppLink()).toBe('https://wa.me/?text=')
  })

  it('makes safe file names', () => {
    expect(sketchFilename('Treasure Map')).toBe('sketch-treasure-map.png')
    expect(sketchFilename('Crème brûlée!')).toBe('sketch-creme-brulee.png')
    expect(sketchFilename('../../etc')).toBe('sketch-etc.png')
    expect(sketchFilename('')).toBe('sketch-drawing.png')
    expect(sketchFilename('ねこ')).toBe('sketch-drawing.png')
    expect(sketchFilename('collage', 'png', '2')).toBe('sketch-collage-2.png')
    expect(sketchFilename('drawings', 'pdf')).toBe('sketch-drawings.pdf')
    expect(sketchFilename('a'.repeat(80)).length).toBeLessThanOrEqual('sketch-.png'.length + 40)
  })

  it('says how many drawings this phone has and how they will be packed', () => {
    expect(onThisPhone(6)).toBe('6 DRAWINGS ON THIS PHONE')
    expect(onThisPhone(1)).toBe('1 DRAWING ON THIS PHONE')
    expect(picturesLine(6)).toBe('ALL 6 DRAWINGS ON ONE IMAGE')
    expect(picturesLine(9)).toBe('ALL 9 DRAWINGS ON ONE IMAGE')
    expect(picturesLine(14)).toBe('14 DRAWINGS ON 2 IMAGES')
    expect(picturesLine(24)).toBe('24 DRAWINGS ON 3 IMAGES')
  })
})

describe('canShareAll', () => {
  it('offers SHARE ALL only with more than one drawing', () => {
    expect(canShareAll(0)).toBe(false)
    expect(canShareAll(1)).toBe(false)
    expect(canShareAll(2)).toBe(true)
  })
})

describe('needsSecondTap', () => {
  it('asks for one more tap on the web when making the files took too long', () => {
    expect(needsSecondTap(ACTIVATION_MS - 1)).toBe(false)
    expect(needsSecondTap(ACTIVATION_MS + 1)).toBe(true)
    expect(needsSecondTap(10_000, { native: true })).toBe(false)
  })
})

describe('pdfPages', () => {
  it('is a cover, then one numbered page per drawing', () => {
    expect(pdfPages(['a', 'b'])).toEqual([
      { kind: 'cover' },
      { kind: 'drawing', entry: 'a', n: 1 },
      { kind: 'drawing', entry: 'b', n: 2 },
    ])
    expect(pdfPages(null)).toEqual([{ kind: 'cover' }])
  })

  it('stays within 25 pages for a full gallery', () => {
    expect(pdfPages(range(GALLERY_CAP))).toHaveLength(25)
  })
})

describe('coverLines', () => {
  const podium = [{ rank: 1, name: 'Ivy', score: 420 }, { rank: 2, name: 'Gus', score: 300 }]

  it('lists the podium and the crowd favourite', () => {
    const c = coverLines({ podium, favourite: { hearts: 4, items: [{ word: 'treasure map', name: 'Ivy' }] } })
    expect(c.rows.map(r => r.text)).toEqual(['1. IVY · 420', '2. GUS · 300'])
    expect(c.fave).toEqual({ title: '♥ CROWD FAVOURITE · ♥ 4', lines: ['TREASURE MAP BY IVY'] })
  })

  it('says when favourites tie', () => {
    const c = coverLines({ podium, favourite: { hearts: 3, items: [{ word: 'cat', name: 'Ivy' }, { word: 'dog', name: 'Gus' }] } })
    expect(c.fave.title).toBe('♥ CROWD FAVOURITES · TIED AT ♥ 3')
    expect(c.fave.lines).toEqual(['CAT BY IVY', 'DOG BY GUS'])
  })

  it('leaves every name off when names are off', () => {
    const c = coverLines({ podium, showNames: false, favourite: { hearts: 4, items: [{ word: 'cat', name: 'Ivy' }] } })
    expect(c.rows).toEqual([])
    expect(c.fave.lines).toEqual(['CAT'])
    expect(JSON.stringify(c)).not.toMatch(/IVY|GUS/)
  })

  it('has no favourite block without an award, or with nothing to name', () => {
    expect(coverLines({ podium }).fave).toBeNull()
    expect(coverLines({ podium, favourite: { hearts: 2, items: [] } }).fave).toBeNull()
  })
})

describe('sharePodium and shareFavourite', () => {
  const players = { u1: { name: 'Ivy' }, u2: { name: 'Gus' } }

  it('names the podium rows', () => {
    expect(sharePodium([{ id: 'u1', rank: 1, score: 400 }, { id: 'gone', rank: 2, score: 10 }], players))
      .toEqual([{ rank: 1, score: 400, name: 'Ivy' }, { rank: 2, score: 10, name: '???' }])
    expect(sharePodium(null, players)).toEqual([])
  })

  it('turns the award into words and names, from this phone\'s gallery', () => {
    const entries = [{ id: '1:u1', word: 'cat', artistName: 'Ivy' }]
    expect(shareFavourite({ hearts: 3, keys: ['1:u1', '2:u2'] }, entries, players)).toEqual({
      hearts: 3,
      items: [{ word: 'cat', name: 'Ivy' }, { word: undefined, name: 'Gus' }],
    })
    expect(shareFavourite(null, entries, players)).toBeNull()
    expect(shareFavourite({ hearts: 3, keys: [] }, entries, players)).toBeNull()
  })
})
