import { describe, it, expect } from 'vitest'
import { normalizeVmArray, applyVmMove, VM_GRID, VM_START_LEVEL } from './visualMemoryLogic'

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

  it('last correct click completes level and flips turn', () => {
    const g = { vmPattern: [2, 7, 9], vmClicked: [2, 7], vmLevel: 3 }
    const r = applyVmMove(g, 9, 'X')
    expect(r.updates.vmLevel).toBe(4)
    expect(r.updates.vmPattern).toHaveLength(4)
    expect(r.updates.vmClicked).toBeNull()
    expect(r.updates.currentTurn).toBe('O')
    expect(r.result).toBeNull()
  })
})

describe('applyVmMove — wrong click', () => {
  const game = { vmPattern: [2, 7, 9], vmClicked: [], vmLevel: 3 }

  it('wrong cell gives win to opponent', () => {
    const r = applyVmMove(game, 5, 'X')
    expect(r.result).toEqual({ winner: 'O' })
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
  it('returns null for already-clicked cell', () =>
    expect(applyVmMove({ ...game, vmClicked: [2] }, 2, 'X')).toBeNull())
})
