import { describe, it, expect } from 'vitest'
import {
  HEX_SIZE,
  HEX_CELL_COUNT,
  neighbors,
  getHexWinner,
  getMoveIndex,
} from './hexLogic'

const emptyBoard = () => Array(HEX_CELL_COUNT).fill('')
const idx = (row, col) => row * HEX_SIZE + col
const rowOf = i => Math.floor(i / HEX_SIZE)
const colOf = i => i % HEX_SIZE

// Verify a winningLine is a genuine connection: consecutive cells adjacent,
// every cell holds the winner's stone, spans the winner's two edges.
function assertValidPath(board, result, symbol) {
  const { winner, winningLine } = result
  expect(winner).toBe(symbol)
  expect(winningLine.length).toBeGreaterThanOrEqual(HEX_SIZE)
  for (const cell of winningLine) {
    expect(board[cell]).toBe(symbol)
  }
  for (let k = 1; k < winningLine.length; k++) {
    expect(neighbors(winningLine[k - 1])).toContain(winningLine[k])
  }
  if (symbol === 'X') {
    expect(winningLine.some(i => colOf(i) === 0)).toBe(true)
    expect(winningLine.some(i => colOf(i) === HEX_SIZE - 1)).toBe(true)
  } else {
    expect(winningLine.some(i => rowOf(i) === 0)).toBe(true)
    expect(winningLine.some(i => rowOf(i) === HEX_SIZE - 1)).toBe(true)
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
    expect(result.winningLine).toHaveLength(HEX_SIZE)
    for (let c = 0; c < HEX_SIZE; c++) expect(result.winningLine[c]).toBe(idx(5, c))
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
    expect(result.winningLine).toContain(idx(6, 5))
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
    expect(result.winningLine).toHaveLength(HEX_SIZE)
    for (let r = 0; r < HEX_SIZE; r++) expect(result.winningLine[r]).toBe(idx(r, 3))
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
    expect(result.winningLine).toEqual(Array.from({ length: HEX_SIZE }, (_, c) => idx(7, c)))
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
