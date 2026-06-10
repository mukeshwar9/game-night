import { describe, it, expect } from 'vitest'
import { normalizeSimonSequence, applySimonMove, SIMON_PADS } from './simonLogic'

describe('normalizeSimonSequence', () => {
  it('returns [] for null', () => expect(normalizeSimonSequence(null)).toEqual([]))
  it('returns [] for undefined', () => expect(normalizeSimonSequence(undefined)).toEqual([]))
  it('returns array unchanged', () => expect(normalizeSimonSequence([1, 2, 3])).toEqual([1, 2, 3]))
  it('converts Firebase numeric-keyed object', () =>
    expect(normalizeSimonSequence({ 0: 2, 1: 0, 2: 3 })).toEqual([2, 0, 3]))
})

describe('applySimonMove — append phase (empty sequence)', () => {
  const game = { simonSequence: [], simonProgress: 0 }

  it('first move appends pad and flips turn to O', () => {
    const r = applySimonMove(game, 2, 'X')
    expect(r.updates.simonSequence).toEqual([2])
    expect(r.updates.simonProgress).toBe(0)
    expect(r.updates.currentTurn).toBe('O')
    expect(r.result).toBeNull()
  })

  it('different pad works the same', () => {
    const r = applySimonMove(game, 0, 'X')
    expect(r.updates.simonSequence).toEqual([0])
    expect(r.updates.currentTurn).toBe('O')
  })
})

describe('applySimonMove — replay phase', () => {
  const game = { simonSequence: [1, 3, 0], simonProgress: 0 }

  it('correct first pad advances progress', () => {
    const r = applySimonMove(game, 1, 'O')
    expect(r.updates.simonProgress).toBe(1)
    expect(r.result).toBeNull()
  })

  it('wrong first pad gives win to opponent', () => {
    const r = applySimonMove(game, 2, 'O')
    expect(r.result).toEqual({ winner: 'X' })
  })

  it('correct mid-sequence press advances progress', () => {
    const mid = { simonSequence: [1, 3, 0], simonProgress: 1 }
    const r = applySimonMove(mid, 3, 'O')
    expect(r.updates.simonProgress).toBe(2)
    expect(r.result).toBeNull()
  })

  it('wrong mid-sequence press loses', () => {
    const mid = { simonSequence: [1, 3, 0], simonProgress: 1 }
    const r = applySimonMove(mid, 0, 'O')
    expect(r.result).toEqual({ winner: 'X' })
  })
})

describe('applySimonMove — replay-to-append transition', () => {
  it('last correct replay press transitions to append (progress === seq.length)', () => {
    const game = { simonSequence: [2], simonProgress: 0 }
    const r = applySimonMove(game, 2, 'O')
    expect(r.updates.simonProgress).toBe(1) // now equals seq.length → append
    expect(r.result).toBeNull()
  })

  it('append after completed replay extends sequence and flips turn', () => {
    const game = { simonSequence: [2], simonProgress: 1 }
    const r = applySimonMove(game, 3, 'O')
    expect(r.updates.simonSequence).toEqual([2, 3])
    expect(r.updates.simonProgress).toBe(0)
    expect(r.updates.currentTurn).toBe('X')
    expect(r.result).toBeNull()
  })
})

describe('applySimonMove — invalid', () => {
  const game = { simonSequence: [], simonProgress: 0 }
  it('returns null for pad index out of range (high)', () => {
    expect(applySimonMove(game, SIMON_PADS, 'X')).toBeNull()
  })
  it('returns null for negative pad index', () => {
    expect(applySimonMove(game, -1, 'X')).toBeNull()
  })
})
