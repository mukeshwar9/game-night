import { describe, it, expect } from 'vitest'
import { normalizeChimpLayout, applyChimpMove, CHIMP_GRID, CHIMP_START_LEVEL } from './chimpLogic'

describe('normalizeChimpLayout', () => {
  it('returns [] for null', () => expect(normalizeChimpLayout(null)).toEqual([]))
  it('returns array unchanged', () => expect(normalizeChimpLayout([3, 7, 1])).toEqual([3, 7, 1]))
  it('converts Firebase object', () =>
    expect(normalizeChimpLayout({ 0: 5, 1: 12, 2: 0 })).toEqual([5, 12, 0]))
})

describe('applyChimpMove — correct sequence', () => {
  const game = { chimpLayout: [5, 12, 0, 20], chimpProgress: 0, chimpLevel: 4 }

  it('correct first click advances progress', () => {
    const r = applyChimpMove(game, 5, 'X')
    expect(r.updates.chimpProgress).toBe(1)
    expect(r.result).toBeNull()
  })

  it('wrong first click gives win to opponent', () => {
    const r = applyChimpMove(game, 12, 'X')
    expect(r.result).toEqual({ winner: 'O' })
  })

  it('completing last click generates new layout and flips turn', () => {
    const g = { chimpLayout: [5], chimpProgress: 0, chimpLevel: 1 }
    const r = applyChimpMove(g, 5, 'X')
    expect(r.updates.chimpLevel).toBe(2)
    expect(r.updates.chimpLayout).toHaveLength(2)
    expect(r.updates.chimpProgress).toBe(0)
    expect(r.updates.currentTurn).toBe('O')
    expect(r.result).toBeNull()
  })

  it('mid-sequence correct click advances progress', () => {
    const g = { chimpLayout: [5, 12, 0, 20], chimpProgress: 2, chimpLevel: 4 }
    const r = applyChimpMove(g, 0, 'O')
    expect(r.updates.chimpProgress).toBe(3)
    expect(r.result).toBeNull()
  })

  it('mid-sequence wrong click gives win to opponent', () => {
    const g = { chimpLayout: [5, 12, 0, 20], chimpProgress: 2, chimpLevel: 4 }
    const r = applyChimpMove(g, 5, 'O')
    expect(r.result).toEqual({ winner: 'X' })
  })
})

describe('applyChimpMove — invalid', () => {
  const game = { chimpLayout: [5, 12], chimpProgress: 0, chimpLevel: 2 }
  it('returns null for empty layout', () =>
    expect(applyChimpMove({ chimpLayout: null, chimpProgress: 0, chimpLevel: 4 }, 5, 'X')).toBeNull())
  it('returns null for out-of-range cell', () =>
    expect(applyChimpMove(game, CHIMP_GRID, 'X')).toBeNull())
  it('returns null for negative cell', () =>
    expect(applyChimpMove(game, -1, 'X')).toBeNull())
})
