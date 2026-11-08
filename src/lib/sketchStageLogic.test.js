import { describe, it, expect } from 'vitest'
import {
  RING_CIRCUMFERENCE,
  RING_URGENT_S,
  MIN_CANVAS_SIDE,
  STAGE_RESERVED_PX,
  MAX_BUBBLES,
  GALLERY_CAP,
  ringState,
  canvasSide,
  isKeyboardUp,
  faceTiles,
  gotItLabel,
  recentBubbles,
  compactDrawing,
  galleryEntry,
  addToGallery,
  galleryFor,
  podium,
} from './sketchStageLogic'

describe('ringState', () => {
  it('drains from a full ring to an empty one', () => {
    expect(ringState(75000, 75000, 0)).toMatchObject({ fraction: 1, seconds: 75, dash: 0, urgent: false })
    const half = ringState(75000, 75000, 37500)
    expect(half.fraction).toBeCloseTo(0.5)
    expect(half.dash).toBeCloseTo(RING_CIRCUMFERENCE / 2)
    expect(ringState(75000, 75000, 99999)).toMatchObject({ fraction: 0, seconds: 0, urgent: true })
  })
  it('turns urgent for the last seconds only', () => {
    expect(ringState(100000, 75000, 100000 - RING_URGENT_S * 1000).urgent).toBe(true)
    expect(ringState(100000, 75000, 100000 - RING_URGENT_S * 1000 - 1000).urgent).toBe(false)
  })
  it('shows a calm full ring with no number when timers are off', () => {
    expect(ringState(null, 75000, 5)).toEqual({ fraction: 1, seconds: null, urgent: false, dash: 0 })
  })
  it('survives a zero total', () => {
    expect(ringState(10, 0, 5).fraction).toBe(0)
  })
})

describe('canvasSide', () => {
  it('fills the column when the screen is tall enough', () => {
    expect(canvasSide({ availW: 343, viewportH: 844, stageTop: 140, role: 'guesser' })).toBe(343)
    expect(canvasSide({ availW: 343, viewportH: 844, stageTop: 140, role: 'artist' })).toBe(343)
  })
  it('shrinks on a short phone so the dock stays on screen', () => {
    const side = canvasSide({ availW: 343, viewportH: 667, stageTop: 140, role: 'artist' })
    expect(side).toBe(667 - 140 - STAGE_RESERVED_PX.artist)
    expect(side).toBeLessThan(343)
    expect(side).toBeGreaterThanOrEqual(MIN_CANVAS_SIDE)
  })
  it('gives the guesser more room than the artist, whose dock is taller', () => {
    const artist = canvasSide({ availW: 343, viewportH: 600, stageTop: 100, role: 'artist' })
    const guesser = canvasSide({ availW: 343, viewportH: 600, stageTop: 100, role: 'guesser' })
    expect(guesser).toBeGreaterThan(artist)
  })
  it('ignores the room header once the keyboard is up (the page scrolls it away)', () => {
    const closed = canvasSide({ availW: 343, viewportH: 400, stageTop: 140, role: 'guesser' })
    const open = canvasSide({ availW: 343, viewportH: 400, stageTop: 140, keyboardUp: true, role: 'guesser' })
    expect(open).toBeGreaterThan(closed)
    expect(open).toBe(400 - STAGE_RESERVED_PX.guesser)
  })
  it('never goes below the minimum, nor above the column', () => {
    expect(canvasSide({ availW: 343, viewportH: 300, stageTop: 200, role: 'artist' })).toBe(MIN_CANVAS_SIDE)
    expect(canvasSide({ availW: 150, viewportH: 300, stageTop: 200, role: 'artist' })).toBe(150)
    expect(canvasSide({ availW: 343.7, viewportH: 2000 })).toBe(343)
  })
  it('falls back to the column width when the viewport is unknown', () => {
    expect(canvasSide({ availW: 343, viewportH: 0 })).toBe(343)
    expect(canvasSide({ availW: 0, viewportH: 800 })).toBe(0)
  })
})

describe('isKeyboardUp', () => {
  it('needs a big gap between layout and visual viewport', () => {
    expect(isKeyboardUp(844, 844)).toBe(false)
    expect(isKeyboardUp(844, 790)).toBe(false) // browser chrome moving, not a keyboard
    expect(isKeyboardUp(844, 520)).toBe(true)
    expect(isKeyboardUp(0, 0)).toBe(false)
  })
})

describe('faceTiles', () => {
  const players = {
    a: { name: 'Ana', avatar: 'K1', online: true },
    b: { name: 'Bo', avatar: 'K2' },
    c: { name: 'Cy', online: false },
  }
  const round = { artist: 'a', correct: { b: { at: 1 } } }
  it('marks the artist, who solved it and who is still guessing', () => {
    const tiles = faceTiles({ players, order: ['a', 'b', 'c'], scores: { a: 25, b: 100 }, round })
    expect(tiles.map(t => [t.id, t.role])).toEqual([['a', 'artist'], ['b', 'solved'], ['c', 'guessing']])
    expect(tiles[1].score).toBe(100)
    expect(tiles[2].score).toBe(0)
    expect(tiles[2].offline).toBe(true)
    expect(tiles[0].offline).toBe(false)
  })
  it('never calls the artist solved, even with a stray correct entry', () => {
    const tiles = faceTiles({ players, order: ['a'], scores: {}, round: { artist: 'a', correct: { a: { at: 1 } } } })
    expect(tiles[0].role).toBe('artist')
  })
  it('skips a seat that left, and uses the player list when the order is empty', () => {
    expect(faceTiles({ players, order: ['a', 'gone'], scores: {}, round }).map(t => t.id)).toEqual(['a'])
    expect(faceTiles({ players, order: [], scores: {}, round }).map(t => t.id)).toEqual(['a', 'b', 'c'])
    expect(faceTiles({ players: null, order: null, scores: null, round: null })).toEqual([])
  })
  it('marks a player outside the round\'s order as new (joined mid-match)', () => {
    const tiles = faceTiles({ players, order: ['a', 'b', 'c'], scores: {}, round: { artist: 'a', order: ['a', 'b'] } })
    expect(tiles.map(t => t.isNew)).toEqual([false, false, true])
  })
})

describe('gotItLabel', () => {
  it('reads like the mockup', () => {
    expect(gotItLabel(1, 3)).toBe('1 OF 3 GOT IT')
  })
})

describe('recentBubbles', () => {
  const entries = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((k, i) => [k, { uid: `u${i}`, text: `guess ${i}` }])
  it('keeps the newest few, oldest first, with age counting back from the newest', () => {
    const b = recentBubbles(entries)
    expect(b).toHaveLength(MAX_BUBBLES)
    expect(b.map(x => x.key)).toEqual(['k3', 'k4', 'k5', 'k6'])
    expect(b.map(x => x.age)).toEqual([3, 2, 1, 0])
  })
  it('handles an empty or short feed', () => {
    expect(recentBubbles([])).toEqual([])
    expect(recentBubbles(null)).toEqual([])
    expect(recentBubbles(entries.slice(0, 2)).map(x => x.age)).toEqual([1, 0])
    expect(recentBubbles([['k', null]])[0].text).toBe('')
  })
})

describe('gallery', () => {
  const strokes = { b: { c: 2, w: 3, p: [1, 2, 3, 4] }, a: { c: 0, w: 1, p: [9, 9, 10, 10] }, z: { c: 1, w: 1, p: [5] } }
  const fills = { f1: { c: 4, p: [1, 1] } }
  const round = { cycle: 1, artist: 'u1' }

  it('keeps strokes in draw order and drops empty ones', () => {
    const d = compactDrawing(strokes, fills)
    expect(d.strokes.map(s => s.p[0])).toEqual([9, 1])
    expect(d.fills).toEqual([{ c: 4, p: [1, 1] }])
    expect(compactDrawing(null, null)).toEqual({ strokes: [], fills: [] })
  })

  it('records the word and the artist, and skips blank pages', () => {
    const e = galleryEntry({ round, word: 'fire escape', tier: 2, artistName: 'Ivy', strokes, fills })
    expect(e).toMatchObject({ id: '1:u1', word: 'fire escape', tier: 2, artist: 'u1', artistName: 'Ivy' })
    expect(galleryEntry({ round, word: 'x', strokes: {}, fills: {} })).toBeNull()
    expect(galleryEntry({ round, word: null, strokes, fills })).toBeNull()
    expect(galleryEntry({ round: null, word: 'x', strokes, fills })).toBeNull()
  })

  it('replaces a round seen twice and keeps only the newest pages', () => {
    const mk = (n) => ({ id: `${n}:u`, word: `w${n}`, strokes: [], fills: [] })
    let list = []
    for (let n = 0; n < GALLERY_CAP + 5; n++) list = addToGallery(list, mk(n))
    expect(list).toHaveLength(GALLERY_CAP)
    expect(list[0].id).toBe('5:u')
    const again = addToGallery(list, { ...mk(7), word: 'redrawn' })
    expect(again).toHaveLength(GALLERY_CAP)
    expect(again.filter(e => e.id === '7:u')).toHaveLength(1)
    expect(again.at(-1).word).toBe('redrawn')
    expect(addToGallery(list, null)).toBe(list)
    expect(addToGallery(null, null)).toEqual([])
  })

  it('shows only the match it belongs to, and ignores damaged storage', () => {
    const stored = { seed: 's1', entries: [{ id: '1:u', strokes: [], fills: [] }, { id: 'bad' }, null] }
    expect(galleryFor(stored, 's1')).toHaveLength(1)
    expect(galleryFor(stored, 's2')).toEqual([])
    expect(galleryFor(null, 's1')).toEqual([])
    expect(galleryFor({ seed: 's1', entries: 'nope' }, 's1')).toEqual([])
  })
})

describe('podium', () => {
  it('ranks by score with ties sharing a rank', () => {
    const rows = podium(['a', 'b', 'c', 'd'], { a: 100, b: 250, c: 100, d: 40 })
    expect(rows.map(r => [r.id, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 2], ['d', 4]])
  })
  it('breaks ties by seat and treats a missing score as 0', () => {
    expect(podium(['x', 'y'], {}).map(r => [r.id, r.rank, r.score])).toEqual([['x', 1, 0], ['y', 1, 0]])
    expect(podium(null, null)).toEqual([])
  })
})
