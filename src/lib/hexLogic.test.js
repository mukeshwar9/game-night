import { describe, it, expect } from 'vitest'
import {
  HEX_SIZE,
  HEX_CELL_COUNT,
  neighbors,
  getHexWinner,
  getMoveIndex,
  SWAP_ACTION,
  isSwapMove,
  hexMirror,
  canHexSwap,
  applyHexMove,
} from './hexLogic'

const emptyBoard = () => Array(HEX_CELL_COUNT).fill('')
const idx = (row, col) => row * HEX_SIZE + col
const rowOf = i => Math.floor(i / HEX_SIZE)
const colOf = i => i % HEX_SIZE

// Verify a winningLine is a genuine connection: consecutive cells adjacent,
// every cell holds the winner's stone, spans the winner's two edges.
function assertValidPath(board, result, symbol) {
  const { winner, line } = result
  expect(result).not.toHaveProperty('winningLine')
  expect(winner).toBe(symbol)
  expect(line.length).toBeGreaterThanOrEqual(HEX_SIZE)
  for (const cell of line) {
    expect(board[cell]).toBe(symbol)
  }
  for (let k = 1; k < line.length; k++) {
    expect(neighbors(line[k - 1])).toContain(line[k])
  }
  if (symbol === 'X') {
    expect(line.some(i => colOf(i) === 0)).toBe(true)
    expect(line.some(i => colOf(i) === HEX_SIZE - 1)).toBe(true)
  } else {
    expect(line.some(i => rowOf(i) === 0)).toBe(true)
    expect(line.some(i => rowOf(i) === HEX_SIZE - 1)).toBe(true)
  }
}

// ---------------------------------------------------------------------------
// getHexWinner — no winner
// ---------------------------------------------------------------------------
describe('getHexWinner: unresolved boards', () => {
  it('returns null on empty board', () => {
    expect(getHexWinner(emptyBoard())).toBeNull()
  })

  it('returns null on a partial board with no chain', () => {
    const board = emptyBoard()
    board[idx(0, 0)] = 'X'
    board[idx(0, 1)] = 'O'
    board[idx(5, 5)] = 'X'
    board[idx(10, 10)] = 'O'
    expect(getHexWinner(board)).toBeNull()
  })

  it('returns null when an X left-right chain has a gap', () => {
    const board = emptyBoard()
    for (let c = 0; c < 5; c++) board[idx(3, c)] = 'X'
    for (let c = 6; c < 11; c++) board[idx(3, c)] = 'X'
    expect(getHexWinner(board)).toBeNull()
  })

  it('returns null when an O top-bottom chain has a gap', () => {
    const board = emptyBoard()
    for (let r = 0; r < 5; r++) board[idx(r, 7)] = 'O'
    for (let r = 6; r < 11; r++) board[idx(r, 7)] = 'O'
    expect(getHexWinner(board)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getHexWinner — X wins left↔right
// ---------------------------------------------------------------------------
describe('getHexWinner: X connects left-right', () => {
  it('detects a straight horizontal chain', () => {
    const board = emptyBoard()
    for (let c = 0; c < HEX_SIZE; c++) board[idx(5, c)] = 'X'
    const result = getHexWinner(board)
    assertValidPath(board, result, 'X')
    expect(result.line).toHaveLength(HEX_SIZE)
    for (let c = 0; c < HEX_SIZE; c++) expect(result.line[c]).toBe(idx(5, c))
  })

  it('detects a zigzag staircase chain', () => {
    const board = emptyBoard()
    // (0,0)-(0,1)-(1,1)-(1,2)-...-(9,10)-(10,10): left edge to right edge
    for (let r = 0; r < 10; r++) {
      board[idx(r, r)] = 'X'
      board[idx(r, r + 1)] = 'X'
    }
    board[idx(10, 10)] = 'X'
    const result = getHexWinner(board)
    assertValidPath(board, result, 'X')
  })

  it('detects a corner-hugging chain along the top edge', () => {
    const board = emptyBoard()
    for (let c = 0; c < HEX_SIZE; c++) board[idx(0, c)] = 'X'
    const result = getHexWinner(board)
    assertValidPath(board, result, 'X')
  })

  it('routes around a blocking O wall through the single gap', () => {
    const board = emptyBoard()
    // O wall down column 5 with one gap; X fills both flanks but only wins
    // once it steps through the gap at (6,5).
    for (let r = 0; r < HEX_SIZE; r++) {
      if (r !== 6) board[idx(r, 5)] = 'O'
      for (let c = 0; c < 5; c++) board[idx(r, c)] = 'X'
      for (let c = 6; c < HEX_SIZE; c++) board[idx(r, c)] = 'X'
    }
    expect(getHexWinner(board)).toBeNull()
    board[idx(6, 5)] = 'X'
    const result = getHexWinner(board)
    assertValidPath(board, result, 'X')
    expect(result.line).toContain(idx(6, 5))
  })
})

// ---------------------------------------------------------------------------
// getHexWinner — O wins top↔bottom
// ---------------------------------------------------------------------------
describe('getHexWinner: O connects top-bottom', () => {
  it('detects a straight vertical chain', () => {
    const board = emptyBoard()
    for (let r = 0; r < HEX_SIZE; r++) board[idx(r, 3)] = 'O'
    const result = getHexWinner(board)
    assertValidPath(board, result, 'O')
    expect(result.line).toHaveLength(HEX_SIZE)
    for (let r = 0; r < HEX_SIZE; r++) expect(result.line[r]).toBe(idx(r, 3))
  })

  it('detects a zigzag staircase chain', () => {
    const board = emptyBoard()
    // Mirror of the X staircase: (0,10) down to (10,0) region.
    for (let c = 0; c < 10; c++) {
      board[idx(c, 10 - c)] = 'O'
      board[idx(c + 1, 10 - c)] = 'O'
    }
    board[idx(10, 0)] = 'O'
    const result = getHexWinner(board)
    assertValidPath(board, result, 'O')
  })
})

// ---------------------------------------------------------------------------
// getHexWinner — edge-direction correctness (the classic bug)
// ---------------------------------------------------------------------------
describe('getHexWinner: edge direction correctness', () => {
  it('X chain touching top AND bottom is NOT a win for X', () => {
    const board = emptyBoard()
    for (let r = 0; r < HEX_SIZE; r++) board[idx(r, 5)] = 'X'
    expect(getHexWinner(board)).toBeNull()
  })

  it('O chain touching left AND right is NOT a win for O', () => {
    const board = emptyBoard()
    for (let c = 0; c < HEX_SIZE; c++) board[idx(4, c)] = 'O'
    expect(getHexWinner(board)).toBeNull()
  })

  it('both wrong-direction chains coexist with no winner', () => {
    const board = emptyBoard()
    for (let r = 0; r < HEX_SIZE; r++) board[idx(r, 2)] = 'X'
    for (let c = 0; c < HEX_SIZE; c++) board[idx(8, c)] = 'O'
    expect(getHexWinner(board)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getHexWinner — full-board fuzz (no draws possible in Hex)
// ---------------------------------------------------------------------------
describe('getHexWinner: full-board fuzz', () => {
  it('every randomly filled full board has a winner with a valid path', () => {
    let seed = 0x2f6e2b1
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >> 17
      seed ^= seed << 5; seed >>>= 0
      return seed / 0xffffffff
    }
    for (let trial = 0; trial < 300; trial++) {
      const board = emptyBoard().map(() => (rand() < 0.5 ? 'X' : 'O'))
      const result = getHexWinner(board)
      expect(result).not.toBeNull()
      expect(['X', 'O']).toContain(result.winner)
      assertValidPath(board, result, result.winner)
    }
  })
})

// ---------------------------------------------------------------------------
// getHexWinner — normalization (Firebase arrays / numeric-keyed objects)
// ---------------------------------------------------------------------------
describe('getHexWinner: normalization', () => {
  it('accepts a numeric-keyed object board', () => {
    const obj = {}
    for (let c = 0; c < HEX_SIZE; c++) obj[idx(7, c)] = 'X'
    const result = getHexWinner(obj)
    expect(result.winner).toBe('X')
    expect(result.line).toEqual(Array.from({ length: HEX_SIZE }, (_, c) => idx(7, c)))
  })

  it('treats missing cells as empty', () => {
    const obj = { [idx(2, 2)]: 'O', [idx(2, 3)]: 'O' }
    expect(getHexWinner(obj)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// neighbors
// ---------------------------------------------------------------------------
describe('neighbors', () => {
  it('interior cell has exactly 6 neighbors', () => {
    expect(neighbors(idx(5, 5))).toHaveLength(6)
    expect(neighbors(idx(5, 5)).sort((a, b) => a - b)).toEqual([
      idx(4, 5), idx(4, 6), idx(5, 4), idx(5, 6), idx(6, 4), idx(6, 5),
    ])
  })

  it('non-corner edge cells have exactly 4 neighbors', () => {
    expect(neighbors(idx(0, 5))).toHaveLength(4)
    expect(neighbors(idx(10, 5))).toHaveLength(4)
    expect(neighbors(idx(5, 0))).toHaveLength(4)
    expect(neighbors(idx(5, 10))).toHaveLength(4)
  })

  it('corners have 2-3 neighbors', () => {
    expect(neighbors(idx(0, 0))).toHaveLength(2)
    expect(neighbors(idx(10, 10))).toHaveLength(2)
    expect(neighbors(idx(0, 10))).toHaveLength(3)
    expect(neighbors(idx(10, 0))).toHaveLength(3)
  })

  it('never wraps around row boundaries', () => {
    expect(neighbors(idx(0, 10))).not.toContain(idx(1, 0))
    expect(neighbors(idx(5, 10))).not.toContain(idx(6, 0))
    expect(neighbors(idx(1, 0))).not.toContain(idx(0, 10))
    for (let i = 0; i < HEX_CELL_COUNT; i++) {
      for (const nb of neighbors(i)) {
        expect(nb).toBeGreaterThanOrEqual(0)
        expect(nb).toBeLessThan(HEX_CELL_COUNT)
        expect(Math.abs(rowOf(nb) - rowOf(i))).toBeLessThanOrEqual(1)
        expect(Math.abs(colOf(nb) - colOf(i))).toBeLessThanOrEqual(1)
      }
    }
  })

  it('adjacency is symmetric', () => {
    for (let i = 0; i < HEX_CELL_COUNT; i++) {
      for (const nb of neighbors(i)) {
        expect(neighbors(nb)).toContain(i)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// getMoveIndex
// ---------------------------------------------------------------------------
describe('getMoveIndex', () => {
  it('returns the index for an empty cell', () => {
    expect(getMoveIndex(emptyBoard(), 60)).toBe(60)
  })

  it('returns -1 for an occupied cell', () => {
    const board = emptyBoard()
    board[60] = 'X'
    expect(getMoveIndex(board, 60)).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// Swap (pie) rule
// ---------------------------------------------------------------------------
describe('swap rule', () => {
  const SWAP = { action: SWAP_ACTION }
  const opening = (row, col, symbol = 'X') => {
    const board = emptyBoard()
    board[idx(row, col)] = symbol
    return board
  }

  it('recognises only the swap payload', () => {
    expect(isSwapMove(SWAP)).toBe(true)
    expect(isSwapMove(5)).toBe(false)
    expect(isSwapMove(null)).toBe(false)
    expect(isSwapMove({ action: 'drop' })).toBe(false)
  })

  it('hexMirror transposes (r, c) → (c, r) and is its own inverse', () => {
    expect(hexMirror(idx(2, 7))).toBe(idx(7, 2))
    expect(hexMirror(idx(5, 5))).toBe(idx(5, 5))
    for (let i = 0; i < HEX_CELL_COUNT; i++) expect(hexMirror(hexMirror(i))).toBe(i)
  })

  it('is legal only on move 2, for the player who did not open', () => {
    expect(canHexSwap(emptyBoard(), 'O')).toBe(false) // move 1: nothing to take
    expect(canHexSwap(opening(3, 4), 'O')).toBe(true)
    expect(canHexSwap(opening(3, 4), 'X')).toBe(false) // can't take your own stone
    expect(canHexSwap(opening(3, 4, 'O'), 'X')).toBe(true) // O opened (first-mover chooser)
    const two = opening(3, 4)
    two[idx(6, 6)] = 'O'
    expect(canHexSwap(two, 'O')).toBe(false) // move 3+: too late
    expect(canHexSwap(opening(3, 4), 'O', true)).toBe(false) // already swapped this round
    expect(canHexSwap(opening(3, 4), null)).toBe(false) // spectators never swap
  })

  it('flips ownership onto the mirrored cell and hands the stone to the swapper', () => {
    const res = applyHexMove(opening(2, 7), SWAP, 'O')
    expect(res.swapped).toBe(true)
    expect(res.index).toBe(idx(7, 2))
    expect(res.board[idx(7, 2)]).toBe('O')
    expect(res.board[idx(2, 7)]).toBe('')
    expect(res.board.filter(Boolean)).toEqual(['O'])
    expect(res.result).toBeNull()
  })

  it('a diagonal opening stays put and just changes owner', () => {
    const res = applyHexMove(opening(5, 5), SWAP, 'O')
    expect(res.index).toBe(idx(5, 5))
    expect(res.board[idx(5, 5)]).toBe('O')
  })

  it('rejects illegal swaps and a swap-back', () => {
    expect(applyHexMove(emptyBoard(), SWAP, 'O')).toBeNull()
    expect(applyHexMove(opening(1, 1), SWAP, 'X')).toBeNull()
    const swapped = applyHexMove(opening(1, 8), SWAP, 'O')
    // X now faces a lone O stone — but the round's swap is spent.
    expect(applyHexMove(swapped.board, SWAP, 'X', true)).toBeNull()
  })

  it('placements are validated and clear the swap flag', () => {
    const res = applyHexMove(opening(3, 3), idx(4, 4), 'O')
    expect(res.swapped).toBe(false)
    expect(res.index).toBe(idx(4, 4))
    expect(res.board[idx(4, 4)]).toBe('O')
    expect(applyHexMove(opening(3, 3), idx(3, 3), 'O')).toBeNull() // occupied
    expect(applyHexMove(emptyBoard(), -1, 'X')).toBeNull()
    expect(applyHexMove(emptyBoard(), HEX_CELL_COUNT, 'X')).toBeNull()
    expect(applyHexMove(emptyBoard(), 'x', 'X')).toBeNull()
  })

  it('win detection is unaffected: the swapped stone counts for its new owner', () => {
    // X opens at (0,3); O swaps → O owns (3,0). O then builds column 0 downward
    // except row 3, and the mirrored stone completes the top-bottom chain.
    let board = applyHexMove(opening(0, 3), SWAP, 'O').board
    for (let r = 0; r < HEX_SIZE; r++) {
      if (r === 3) continue
      const res = applyHexMove(board, idx(r, 0), 'O')
      board = res.board
      if (r < HEX_SIZE - 1) expect(res.result).toBeNull()
      else {
        expect(res.result.winner).toBe('O')
        expect(res.result.line).toContain(idx(3, 0))
      }
    }
  })

  it('a placement that completes a chain reports the winner', () => {
    const board = emptyBoard()
    for (let c = 0; c < HEX_SIZE - 1; c++) board[idx(4, c)] = 'X'
    const res = applyHexMove(board, idx(4, HEX_SIZE - 1), 'X')
    expect(res.result.winner).toBe('X')
  })

  it('getMoveIndex resolves a swap to the lone stone, else -1', () => {
    expect(getMoveIndex(opening(2, 6), SWAP)).toBe(idx(2, 6))
    expect(getMoveIndex(emptyBoard(), SWAP)).toBe(-1)
    const two = opening(2, 6)
    two[0] = 'O'
    expect(getMoveIndex(two, SWAP)).toBe(-1)
  })
})
