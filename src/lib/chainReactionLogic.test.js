import { describe, it, expect } from 'vitest'
import {
  CR_COLS, CR_ROWS, CR_CELL_COUNT,
  criticalMass,
  decodeCell,
  encodeCell,
  applyPlacement,
  applyChainReactionMove,
} from './chainReactionLogic'

// Convenience helpers
const emptyBoard = () => Array(CR_CELL_COUNT).fill('')
const idx = (row, col) => row * CR_COLS + col
const fakeGame = (crMoves = 1) => ({ crMoves })

// ---------------------------------------------------------------------------
// applyPlacement — explosion waves / steps
// ---------------------------------------------------------------------------
describe('applyPlacement — steps', () => {
  it('simple single explosion produces one wave with correct exploded and converted', () => {
    // Corner (0,0) has critical mass 2. Seed X1 then place → boom.
    const board = emptyBoard()
    board[idx(0, 0)] = 'X1'
    const { steps } = applyPlacement(board, idx(0, 0), 'X')
    expect(steps).toHaveLength(1)
    // Exploded = [0] (index of top-left corner)
    expect(steps[0].exploded).toEqual([idx(0, 0)])
    // Converted = neighbours of (0,0): right=(0,1)=1, down=(1,0)=6, ascending
    expect(steps[0].converted).toEqual([idx(0, 1), idx(1, 0)].sort((a, b) => a - b))
  })

  it('two-wave cascade produces exactly two steps with deterministic indices', () => {
    // (0,0) X1 → place X → explode corner → (0,1) gets +1; (0,1) was O2 → becomes X3 ≥ mass3 → second wave
    const board = emptyBoard()
    board[idx(0, 0)] = 'X1'
    board[idx(0, 1)] = 'O2' // mass 3; after conversion becomes X3 → explodes
    const { steps } = applyPlacement(board, idx(0, 0), 'X')
    expect(steps).toHaveLength(2)
    // First wave: corner (0,0) explodes
    expect(steps[0].exploded).toEqual([idx(0, 0)])
    // Second wave: (0,1) explodes (index 1)
    expect(steps[1].exploded).toEqual([idx(0, 1)])
    // Second wave converted = neighbours of (0,1) that received an orb: (0,0), (0,2), (1,1)
    const expectedConverted = [idx(0, 0), idx(0, 2), idx(1, 1)].sort((a, b) => a - b)
    expect(steps[1].converted).toEqual(expectedConverted)
  })

  it('no steps when placement does not trigger explosion', () => {
    const board = emptyBoard()
    // (1,1) interior, mass 4; place X1 → count becomes 1 < 4, no explosion
    const { steps } = applyPlacement(board, idx(1, 1), 'X')
    expect(steps).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// applyChainReactionMove — crLastMove
// ---------------------------------------------------------------------------
describe('applyChainReactionMove — crLastMove', () => {
  it('includes crLastMove in updates equal to the placed index', () => {
    const board = emptyBoard()
    const target = idx(2, 3)
    const res = applyChainReactionMove({ board, game: { crMoves: 0 }, index: target, symbol: 'X' })
    expect(res).not.toBeNull()
    expect(res.updates.crLastMove).toBe(target)
  })
})

// ---------------------------------------------------------------------------
// criticalMass
// ---------------------------------------------------------------------------
describe('criticalMass', () => {
  it('corners have mass 2', () => {
    expect(criticalMass(idx(0, 0))).toBe(2)              // top-left
    expect(criticalMass(idx(0, CR_COLS - 1))).toBe(2)   // top-right
    expect(criticalMass(idx(CR_ROWS - 1, 0))).toBe(2)   // bottom-left
    expect(criticalMass(idx(CR_ROWS - 1, CR_COLS - 1))).toBe(2) // bottom-right
  })

  it('edge (non-corner) cells have mass 3', () => {
    expect(criticalMass(idx(0, 1))).toBe(3)        // top edge
    expect(criticalMass(idx(CR_ROWS - 1, 1))).toBe(3) // bottom edge
    expect(criticalMass(idx(1, 0))).toBe(3)        // left edge
    expect(criticalMass(idx(1, CR_COLS - 1))).toBe(3) // right edge
  })

  it('interior cells have mass 4', () => {
    expect(criticalMass(idx(1, 1))).toBe(4)
    expect(criticalMass(idx(3, 3))).toBe(4)
    expect(criticalMass(idx(CR_ROWS - 2, CR_COLS - 2))).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// encode / decode helpers
// ---------------------------------------------------------------------------
describe('encodeCell / decodeCell', () => {
  it('empty string decodes to null owner and 0 count', () => {
    expect(decodeCell('')).toEqual({ owner: null, count: 0 })
    expect(decodeCell(undefined)).toEqual({ owner: null, count: 0 })
  })

  it('round-trips single and multi-digit counts', () => {
    expect(encodeCell('X', 1)).toBe('X1')
    expect(encodeCell('O', 3)).toBe('O3')
    expect(encodeCell('X', 10)).toBe('X10')
    expect(decodeCell('X1')).toEqual({ owner: 'X', count: 1 })
    expect(decodeCell('O3')).toEqual({ owner: 'O', count: 3 })
  })

  it('encodes count 0 as empty string', () => {
    expect(encodeCell('X', 0)).toBe('')
    expect(encodeCell(null, 0)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// applyChainReactionMove — basic placement
// ---------------------------------------------------------------------------
describe('applyChainReactionMove — basic placement', () => {
  it('places one orb on an empty cell', () => {
    const board = emptyBoard()
    const res = applyChainReactionMove({ board, game: { crMoves: 0 }, index: idx(2, 2), symbol: 'X' })
    expect(res).not.toBeNull()
    expect(res.updates.board[idx(2, 2)]).toBe('X1')
  })

  it('adds to an already-owned cell', () => {
    const board = emptyBoard()
    board[idx(2, 2)] = 'X2'
    const res = applyChainReactionMove({ board, game: fakeGame(1), index: idx(2, 2), symbol: 'X' })
    expect(res).not.toBeNull()
    expect(res.updates.board[idx(2, 2)]).toBe('X3')
  })

  it('flips currentTurn', () => {
    const board = emptyBoard()
    const res = applyChainReactionMove({ board, game: { crMoves: 0 }, index: 0, symbol: 'X' })
    expect(res.updates.currentTurn).toBe('O')
    const res2 = applyChainReactionMove({ board, game: { crMoves: 0 }, index: 0, symbol: 'O' })
    expect(res2.updates.currentTurn).toBe('X')
  })

  it('increments crMoves', () => {
    const board = emptyBoard()
    const res = applyChainReactionMove({ board, game: { crMoves: 5 }, index: 0, symbol: 'X' })
    expect(res.updates.crMoves).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// applyChainReactionMove — invalid moves return null
// ---------------------------------------------------------------------------
describe('applyChainReactionMove — invalid moves', () => {
  it('returns null for out-of-range index', () => {
    const board = emptyBoard()
    expect(applyChainReactionMove({ board, game: fakeGame(), index: -1, symbol: 'X' })).toBeNull()
    expect(applyChainReactionMove({ board, game: fakeGame(), index: CR_CELL_COUNT, symbol: 'X' })).toBeNull()
  })

  it('returns null when clicking an opponent cell', () => {
    const board = emptyBoard()
    board[idx(3, 3)] = 'O2'
    expect(applyChainReactionMove({ board, game: fakeGame(), index: idx(3, 3), symbol: 'X' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Explosion + conversion
// ---------------------------------------------------------------------------
describe('explosion mechanics', () => {
  it('exploding corner cell converts neighbours and empties cell', () => {
    // Corner (0,0) has critical mass 2; place 2nd orb → explosion
    const board = emptyBoard()
    board[idx(0, 0)] = 'X1'
    const res = applyChainReactionMove({ board, game: fakeGame(1), index: idx(0, 0), symbol: 'X' })
    // The corner cell should be empty (exploded, 2 - 2 = 0 remainder)
    expect(res.updates.board[idx(0, 0)]).toBe('')
    // Right neighbour gains 1 X orb
    expect(res.updates.board[idx(0, 1)]).toBe('X1')
    // Bottom neighbour gains 1 X orb
    expect(res.updates.board[idx(1, 0)]).toBe('X1')
  })

  it('explosion converts opponent orbs to current player', () => {
    // Corner (0,0) mass=2; place X orb at X1 → explode into (0,1) and (1,0)
    // Seed (0,1) with O's orb first so it gets converted.
    const board = emptyBoard()
    board[idx(0, 0)] = 'X1'
    board[idx(0, 1)] = 'O1'
    const res = applyChainReactionMove({ board, game: fakeGame(2), index: idx(0, 0), symbol: 'X' })
    // (0,1) should now be X (converted) with count bumped by 1 = 2
    expect(res.updates.board[idx(0, 1)][0]).toBe('X')
  })

  it('cascades: explosion of one cell triggers neighbouring cell explosion', () => {
    // Set up: (0,1) has mass=3. Seed it with O2. X explodes into it pushing it to 3 → chain.
    // (0,0) X1 → place X → explode corner → (0,1) becomes X3 which >= mass3 → chain explode
    const board = emptyBoard()
    board[idx(0, 0)] = 'X1'
    board[idx(0, 1)] = 'O2' // mass=3, after +1 = 3 → explodes in chain
    const res = applyChainReactionMove({ board, game: fakeGame(2), index: idx(0, 0), symbol: 'X' })
    // (0,1) should have exploded (3 - 3 = 0)
    expect(res.updates.board[idx(0, 1)]).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Win condition
// ---------------------------------------------------------------------------
describe('win condition', () => {
  it('no winner before both players have moved (crMoves < 2)', () => {
    const board = emptyBoard()
    const res = applyChainReactionMove({ board, game: { crMoves: 0 }, index: idx(2, 2), symbol: 'X' })
    // crMoves becomes 1 → still no winner
    expect(res.result).toBeNull()
  })

  it('detects elimination win after both players moved', () => {
    // Board with only X orbs and O has none — simulate after both played
    // We need crMoves ≥ 2 and O to have no orbs after the move.
    // Manually construct: small board scenario — X takes O's last cell via explosion
    const board = emptyBoard()
    // Put X at a corner with 1 orb, and O at the corner's neighbour with 1 orb
    // X corner (0,0) mass=2, currently X1; place X → explode → neighbour (0,1) which is O1 becomes X2
    board[idx(0, 0)] = 'X1'
    board[idx(0, 1)] = 'O1'
    // Make sure O has only those 2 cells and X will wipe them:
    // Actually (0,1) will become X2 — O eliminated
    const res = applyChainReactionMove({ board, game: { crMoves: 1 }, index: idx(0, 0), symbol: 'X' })
    expect(res.updates.crMoves).toBe(2)
    expect(res.result).toEqual({ winner: 'X' })
  })

  it('no premature win when opponent still has orbs', () => {
    const board = emptyBoard()
    board[idx(3, 3)] = 'O1'
    const res = applyChainReactionMove({ board, game: { crMoves: 1 }, index: idx(0, 0), symbol: 'X' })
    // O still has orb at (3,3), no winner
    expect(res.result).toBeNull()
  })
})

describe('classic 6×8 board', () => {
  const cols = 6
  const rows = 8
  const idx6 = (r, c) => r * cols + c

  it('corners have mass 2 on 6×8', () => {
    expect(criticalMass(idx6(0, 0), cols, rows)).toBe(2)
    expect(criticalMass(idx6(0, cols - 1), cols, rows)).toBe(2)
    expect(criticalMass(idx6(rows - 1, 0), cols, rows)).toBe(2)
    expect(criticalMass(idx6(rows - 1, cols - 1), cols, rows)).toBe(2)
  })

  it('rejects a move past 48 cells', () => {
    const board = Array(48).fill('')
    const res = applyChainReactionMove({
      board, game: { crMoves: 0 }, index: 48, symbol: 'X', cols, rows,
    })
    expect(res).toBeNull()
  })
})
