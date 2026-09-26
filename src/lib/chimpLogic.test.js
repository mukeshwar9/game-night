import { describe, it, expect } from 'vitest'
import {
  normalizeChimpLayout, evaluateChimpTap, buildChimpAdvance,
  generateChimpLayout, chimpMemorizeMs, CHIMP_GRID, CHIMP_START_LEVEL,
} from './chimpLogic'

describe('normalizeChimpLayout', () => {
  it('returns [] for null', () => expect(normalizeChimpLayout(null)).toEqual([]))
  it('returns array unchanged', () => expect(normalizeChimpLayout([3, 7, 1])).toEqual([3, 7, 1]))
  it('converts Firebase object', () =>
    expect(normalizeChimpLayout({ 0: 5, 1: 12, 2: 0 })).toEqual([5, 12, 0]))
})

describe('generateChimpLayout', () => {
  it('returns `level` unique indices within the grid', () => {
    const layout = generateChimpLayout(10, CHIMP_GRID)
    expect(layout).toHaveLength(10)
    expect(new Set(layout).size).toBe(10)
    layout.forEach(i => {
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(CHIMP_GRID)
    })
  })
})

// ---------------------------------------------------------------------------
// evaluateChimpTap — the real per-player rule ChimpGame.jsx's handleCellClick
// applies: each player races through their own copy of the shared layout
// independently, no shared turn.
// ---------------------------------------------------------------------------
describe('evaluateChimpTap — invalid', () => {
  it('is invalid when the layout is empty/missing', () => {
    expect(evaluateChimpTap({ layout: null, progress: 0, level: 4, cellIndex: 5 })).toEqual({ valid: false })
  })

  it('is invalid for an out-of-range cell', () => {
    expect(evaluateChimpTap({ layout: [5, 12], progress: 0, level: 2, cellIndex: CHIMP_GRID })).toEqual({ valid: false })
  })

  it('is invalid for a negative cell', () => {
    expect(evaluateChimpTap({ layout: [5, 12], progress: 0, level: 2, cellIndex: -1 })).toEqual({ valid: false })
  })
})

describe('evaluateChimpTap — correct sequence', () => {
  const layout = [5, 12, 0, 20]

  it('correct first tap advances progress, not done', () => {
    const r = evaluateChimpTap({ layout, progress: 0, level: 4, cellIndex: 5 })
    expect(r).toEqual({ valid: true, correct: true, newProgress: 1, done: false })
  })

  it('mid-sequence correct tap advances progress', () => {
    const r = evaluateChimpTap({ layout, progress: 2, level: 4, cellIndex: 0 })
    expect(r).toEqual({ valid: true, correct: true, newProgress: 3, done: false })
  })

  it('the final correct tap marks done', () => {
    const r = evaluateChimpTap({ layout: [5], progress: 0, level: 1, cellIndex: 5 })
    expect(r).toEqual({ valid: true, correct: true, newProgress: 1, done: true })
  })

  it('treats a missing progress as 0', () => {
    const r = evaluateChimpTap({ layout, progress: undefined, level: 4, cellIndex: 5 })
    expect(r).toEqual({ valid: true, correct: true, newProgress: 1, done: false })
  })
})

describe('evaluateChimpTap — mis-taps', () => {
  const layout = [5, 12, 0, 20]

  it('wrong first tap is a mis-tap (caller resolves the round for the opponent)', () => {
    expect(evaluateChimpTap({ layout, progress: 0, level: 4, cellIndex: 12 })).toEqual({ valid: true, correct: false })
  })

  it('mid-sequence wrong tap is a mis-tap', () => {
    expect(evaluateChimpTap({ layout, progress: 2, level: 4, cellIndex: 5 })).toEqual({ valid: true, correct: false })
  })

  it('tapping an already-completed cell again is a mis-tap', () => {
    expect(evaluateChimpTap({ layout, progress: 2, level: 4, cellIndex: 12 })).toEqual({ valid: true, correct: false })
  })
})

// ---------------------------------------------------------------------------
// buildChimpAdvance — the round-advance patch both clients race to apply
// ---------------------------------------------------------------------------
describe('buildChimpAdvance', () => {
  it('bumps the level and resets both players for the new round', () => {
    const patch = buildChimpAdvance(CHIMP_START_LEVEL)
    expect(patch.chimpLevel).toBe(CHIMP_START_LEVEL + 1)
    expect(patch.chimpLayout).toHaveLength(CHIMP_START_LEVEL + 1)
    expect(patch.chimpProgressX).toBe(0)
    expect(patch.chimpProgressO).toBe(0)
    expect(patch.chimpDoneX).toBe(false)
    expect(patch.chimpDoneO).toBe(false)
  })

  it('generates a fresh layout with unique cells', () => {
    const patch = buildChimpAdvance(6)
    expect(new Set(patch.chimpLayout).size).toBe(patch.chimpLayout.length)
  })
})

describe('level ceiling', () => {
  it('generateChimpLayout never asks for more cells than the grid holds', () => {
    const layout = generateChimpLayout(CHIMP_GRID + 3)
    expect(layout).toHaveLength(CHIMP_GRID)
    expect(new Set(layout).size).toBe(CHIMP_GRID)
  })

  it('buildChimpAdvance stops at a full grid', () => {
    const patch = buildChimpAdvance(CHIMP_GRID)
    expect(patch.chimpLevel).toBe(CHIMP_GRID)
    expect(patch.chimpLayout).toHaveLength(CHIMP_GRID)
  })

  it('memorize window grows with the level', () => {
    expect(chimpMemorizeMs(CHIMP_START_LEVEL)).toBe(5000)
    expect(chimpMemorizeMs(10)).toBeGreaterThan(chimpMemorizeMs(5))
  })
})
