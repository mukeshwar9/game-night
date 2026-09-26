import { describe, it, expect } from 'vitest'
import {
  normalizeVmArray, applyVmMove, generateVmPattern, vmGridSide, vmCellCount,
  vmRevealMs, vmLevelForClears, VM_GRID, VM_START_LEVEL,
} from './visualMemoryLogic'

describe('normalizeVmArray', () => {
  it('returns [] for null', () => expect(normalizeVmArray(null)).toEqual([]))
  it('returns array unchanged', () => expect(normalizeVmArray([1, 3, 5])).toEqual([1, 3, 5]))
  it('converts Firebase object', () =>
    expect(normalizeVmArray({ 0: 2, 1: 7, 2: 9 })).toEqual([2, 7, 9]))
})

describe('applyVmMove — correct click', () => {
  const game = { vmPattern: [2, 7, 9], vmClicked: [], vmLevel: 3 }

  it('correct click records it', () => {
    const r = applyVmMove(game, 2, 'X')
    expect(r.updates.vmClicked).toEqual([2])
    expect(r.result).toBeNull()
  })

  it('second correct click records both', () => {
    const g = { vmPattern: [2, 7, 9], vmClicked: [2], vmLevel: 3 }
    const r = applyVmMove(g, 7, 'X')
    expect(r.updates.vmClicked).toEqual([2, 7])
    expect(r.result).toBeNull()
  })

  it('first clear of a level hands the SAME level to the opponent', () => {
    const g = { vmPattern: [2, 7, 9], vmClicked: [2, 7], vmLevel: 3, vmClears: 0 }
    const r = applyVmMove(g, 9, 'X')
    expect(r.updates.vmLevel).toBe(3)
    expect(r.updates.vmClears).toBe(1)
    expect(r.updates.vmPattern).toHaveLength(3)
    expect(r.updates.currentTurn).toBe('O')
  })

  it('second clear of a level moves both players up one level', () => {
    const g = { vmPattern: [2, 7, 9], vmClicked: [2, 7], vmLevel: 3, vmClears: 1 }
    const r = applyVmMove(g, 9, 'O')
    expect(r.updates.vmLevel).toBe(4)
    expect(r.updates.vmClears).toBe(2)
    expect(r.updates.currentTurn).toBe('X')
  })

  it('a legacy room with no vmClears stays level-aligned', () => {
    const g = { vmPattern: [2, 7, 9], vmClicked: [2, 7], vmLevel: 3 }
    const r = applyVmMove(g, 9, 'X')
    expect(r.updates.vmLevel).toBe(3)
    expect(r.updates.vmClears).toBe(1)
  })

  it('last correct click completes the turn and flips it', () => {
    const g = { vmPattern: [2, 7, 9], vmClicked: [2, 7], vmLevel: 3, vmClears: 1 }
    const r = applyVmMove(g, 9, 'X')
    expect(r.updates.vmLevel).toBe(4)
    expect(r.updates.vmPattern).toHaveLength(4)
    expect(r.updates.vmClicked).toBeNull()
    expect(r.updates.currentTurn).toBe('O')
    expect(r.updates.vmDeadline).toBeNull()
    expect(r.result).toBeNull()
  })
})

describe('applyVmMove — wrong click', () => {
  const game = { vmPattern: [2, 7, 9], vmClicked: [], vmLevel: 3 }

  it('wrong cell gives win to opponent and records the miss', () => {
    const r = applyVmMove(game, 5, 'X')
    expect(r.result).toEqual({ winner: 'O' })
    expect(r.updates.vmDeadline).toBeNull()
    expect(r.updates.vmMiss).toBe(5)
  })

  it('wrong cell with some already clicked still loses', () => {
    const g = { vmPattern: [2, 7, 9], vmClicked: [2], vmLevel: 3 }
    const r = applyVmMove(g, 5, 'X')
    expect(r.result).toEqual({ winner: 'O' })
  })
})

describe('applyVmMove — invalid', () => {
  const game = { vmPattern: [2, 7], vmClicked: [], vmLevel: 2 }
  it('returns null for empty pattern', () =>
    expect(applyVmMove({ vmPattern: null, vmClicked: [], vmLevel: 3 }, 2, 'X')).toBeNull())
  it('returns null for out-of-range cell', () =>
    expect(applyVmMove(game, VM_GRID, 'X')).toBeNull())
  it('returns null for a cell outside the current level grid', () =>
    expect(applyVmMove({ vmPattern: [2, 7, 9], vmClicked: [], vmLevel: 3 }, 16, 'X')).toBeNull())
  it('returns null for already-clicked cell', () =>
    expect(applyVmMove({ ...game, vmClicked: [2] }, 2, 'X')).toBeNull())
})

describe('grid growth', () => {
  it('starts on 4×4 and grows with the level', () => {
    expect(vmGridSide(VM_START_LEVEL)).toBe(4)
    expect(vmGridSide(7)).toBe(5)
    expect(vmGridSide(11)).toBe(6)
    expect(vmGridSide(16)).toBe(7)
    expect(vmGridSide(40)).toBe(8)
  })

  it('never lights more than ~45% of the grid', () => {
    for (let level = VM_START_LEVEL; level <= 28; level++) {
      expect(level / vmCellCount(level)).toBeLessThanOrEqual(0.45)
    }
  })

  it('accepts a tile beyond 4×4 once the grid has grown', () => {
    const r = applyVmMove({ vmPattern: [20, 3, 9, 1, 5, 6, 7], vmClicked: [], vmLevel: 7 }, 20, 'X')
    expect(r.updates.vmClicked).toEqual([20])
  })
})

describe('generateVmPattern', () => {
  it('returns unique in-range cells for every level (level 17 used to hang)', () => {
    for (let level = VM_START_LEVEL; level <= 40; level++) {
      const p = generateVmPattern(level)
      expect(p).toHaveLength(level)
      expect(new Set(p).size).toBe(level)
      p.forEach(i => expect(i).toBeLessThan(vmCellCount(level)))
    }
  })

  it('caps at the grid size instead of looping forever', () => {
    expect(generateVmPattern(20, 16)).toHaveLength(16)
  })
})

describe('pacing', () => {
  it('level rises once per pair of clears', () => {
    expect([0, 1, 2, 3, 4].map(vmLevelForClears)).toEqual([3, 3, 4, 4, 5])
  })

  it('reveal window grows with the level and is capped', () => {
    expect(vmRevealMs(4)).toBeGreaterThan(vmRevealMs(3))
    expect(vmRevealMs(100)).toBe(4000)
  })
})
