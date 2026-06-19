import { describe, it, expect } from 'vitest'
import {
  OC_SIZE,
  OC_CELL_COUNT,
  OC_RUN,
  findRun,
  applyOrderChaosMove,
  getOrderChaosWinner,
} from './orderChaosLogic'

function emptyBoard() {
  return Array(OC_CELL_COUNT).fill('')
}

function idx(row, col) {
  return row * OC_SIZE + col
}

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------
describe('constants', () => {
  it('OC_SIZE is 6, cell count 36, run 5', () => {
    expect(OC_SIZE).toBe(6)
    expect(OC_CELL_COUNT).toBe(36)
    expect(OC_RUN).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// findRun
// ---------------------------------------------------------------------------
describe('findRun', () => {
  it('returns null for empty board', () => {
    expect(findRun(emptyBoard())).toBeNull()
  })

  it('detects a horizontal 5-run of X', () => {
    const board = emptyBoard()
    for (let c = 0; c < 5; c++) board[idx(2, c)] = 'X'
    expect(findRun(board)).toEqual([idx(2, 0), idx(2, 1), idx(2, 2), idx(2, 3), idx(2, 4)])
  })

  it('detects a horizontal 5-run of O', () => {
    const board = emptyBoard()
    for (let c = 1; c < 6; c++) board[idx(0, c)] = 'O'
    expect(findRun(board)).toEqual([idx(0, 1), idx(0, 2), idx(0, 3), idx(0, 4), idx(0, 5)])
  })

  it('detects a vertical 5-run', () => {
    const board = emptyBoard()
    for (let r = 0; r < 5; r++) board[idx(r, 3)] = 'X'
    expect(findRun(board)).toEqual([idx(0, 3), idx(1, 3), idx(2, 3), idx(3, 3), idx(4, 3)])
  })

  it('detects a down-right diagonal 5-run', () => {
    const board = emptyBoard()
    for (let k = 0; k < 5; k++) board[idx(k, k)] = 'O'
    expect(findRun(board)).toEqual([idx(0, 0), idx(1, 1), idx(2, 2), idx(3, 3), idx(4, 4)])
  })

  it('detects a down-left diagonal 5-run', () => {
    const board = emptyBoard()
    // (0,5),(1,4),(2,3),(3,2),(4,1)
    for (let k = 0; k < 5; k++) board[idx(k, 5 - k)] = 'X'
    expect(findRun(board)).toEqual(
      [idx(0, 5), idx(1, 4), idx(2, 3), idx(3, 2), idx(4, 1)].sort((a, b) => a - b),
    )
  })

  it('a run of length 6 still counts (returns first 5 window ascending)', () => {
    const board = emptyBoard()
    for (let c = 0; c < 6; c++) board[idx(1, c)] = 'X'
    const run = findRun(board)
    expect(run).not.toBeNull()
    expect(run).toHaveLength(5)
    // every index belongs to row 1
    expect(run.every(i => Math.floor(i / OC_SIZE) === 1)).toBe(true)
  })

  it('returns null for a 4-run (one short)', () => {
    const board = emptyBoard()
    for (let c = 0; c < 4; c++) board[idx(2, c)] = 'X'
    expect(findRun(board)).toBeNull()
  })

  it('no wraparound across a row boundary', () => {
    // place 5 X starting near the right edge of row 0 wrapping into row 1
    const board = emptyBoard()
    board[idx(0, 4)] = 'X'
    board[idx(0, 5)] = 'X'
    board[idx(1, 0)] = 'X'
    board[idx(1, 1)] = 'X'
    board[idx(1, 2)] = 'X'
    // These are linear indices 4,5,6,7,8 but should NOT count as a row run
    expect(findRun(board)).toBeNull()
  })

  it('mixed letters in a line do not form a run', () => {
    const board = emptyBoard()
    board[idx(0, 0)] = 'X'
    board[idx(0, 1)] = 'O'
    board[idx(0, 2)] = 'X'
    board[idx(0, 3)] = 'O'
    board[idx(0, 4)] = 'X'
    expect(findRun(board)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// applyOrderChaosMove
// ---------------------------------------------------------------------------
describe('applyOrderChaosMove', () => {
  it('returns null for index out of range (negative)', () => {
    expect(applyOrderChaosMove(emptyBoard(), -1, 'X')).toBeNull()
  })

  it('returns null for index out of range (too large)', () => {
    expect(applyOrderChaosMove(emptyBoard(), OC_CELL_COUNT, 'X')).toBeNull()
  })

  it('returns null when cell is occupied', () => {
    const board = emptyBoard()
    board[0] = 'X'
    expect(applyOrderChaosMove(board, 0, 'O')).toBeNull()
  })

  it('returns null for invalid letter', () => {
    expect(applyOrderChaosMove(emptyBoard(), 0, 'S')).toBeNull()
    expect(applyOrderChaosMove(emptyBoard(), 0, 'x')).toBeNull()
    expect(applyOrderChaosMove(emptyBoard(), 0, '')).toBeNull()
  })

  it('places X', () => {
    const result = applyOrderChaosMove(emptyBoard(), 10, 'X')
    expect(result).not.toBeNull()
    expect(result.board[10]).toBe('X')
  })

  it('places O', () => {
    const result = applyOrderChaosMove(emptyBoard(), 20, 'O')
    expect(result.board[20]).toBe('O')
  })

  it('does not mutate input board', () => {
    const board = emptyBoard()
    const copy = [...board]
    applyOrderChaosMove(board, 5, 'X')
    expect(board).toEqual(copy)
  })
})

// ---------------------------------------------------------------------------
// getOrderChaosWinner
// ---------------------------------------------------------------------------
describe('getOrderChaosWinner', () => {
  it('returns null on empty board', () => {
    expect(getOrderChaosWinner(emptyBoard())).toBeNull()
  })

  it('returns null on partial board with no run', () => {
    const board = emptyBoard()
    board[0] = 'X'
    board[1] = 'O'
    expect(getOrderChaosWinner(board)).toBeNull()
  })

  it('Order (X) wins on any 5-run of X', () => {
    const board = emptyBoard()
    for (let c = 0; c < 5; c++) board[idx(2, c)] = 'X'
    const result = getOrderChaosWinner(board)
    expect(result.winner).toBe('X')
    expect(result.line).toHaveLength(5)
  })

  it('Order (X) wins on any 5-run of O (run of either letter)', () => {
    const board = emptyBoard()
    for (let c = 0; c < 5; c++) board[idx(3, c)] = 'O'
    const result = getOrderChaosWinner(board)
    expect(result.winner).toBe('X')
    expect(result.line).toHaveLength(5)
  })

  it('Chaos (O) wins when board fills with no 5-run', () => {
    // A verified full 6x6 filling with no 5-in-a-row in any direction
    // (horizontal / vertical / both diagonals).
    const board = emptyBoard()
    const patterns = [
      'OXOOOO',
      'OXOOOO',
      'OXOOOO',
      'OOXOOO',
      'XOOXXX',
      'OXOOOO',
    ]
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        board[idx(r, c)] = patterns[r][c]
      }
    }
    // sanity: no run exists in this pattern
    expect(findRun(board)).toBeNull()
    expect(board.every(c => c !== '')).toBe(true)
    expect(getOrderChaosWinner(board)).toEqual({ winner: 'O' })
  })

  it('Order wins even on a full board if a 5-run is present', () => {
    const board = emptyBoard()
    // fill arbitrarily, then carve a horizontal run of X in row 0
    for (let i = 0; i < OC_CELL_COUNT; i++) board[i] = i % 2 === 0 ? 'X' : 'O'
    for (let c = 0; c < 5; c++) board[idx(0, c)] = 'X'
    const result = getOrderChaosWinner(board)
    expect(result.winner).toBe('X')
    expect(result.line).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------
// integration: simulate registry applyMove path (write letter, flip turn)
// ---------------------------------------------------------------------------
describe('registry applyMove simulation', () => {
  it('Order completes a vertical run; winner X with a line', () => {
    let board = emptyBoard()
    let currentTurn = 'X'
    let result = null

    // X (Order) places 5 O's vertically in col 0 over its 5 turns,
    // O (Chaos) places elsewhere on alternating turns.
    const orderMoves = [idx(0, 0), idx(1, 0), idx(2, 0), idx(3, 0), idx(4, 0)]
    const chaosMoves = [idx(0, 5), idx(1, 5), idx(2, 5), idx(3, 5)]
    let oi = 0
    let ci = 0

    while (!result) {
      const isOrder = currentTurn === 'X'
      const index = isOrder ? orderMoves[oi++] : chaosMoves[ci++]
      const letter = isOrder ? 'O' : 'X' // Order builds an O run
      const moved = applyOrderChaosMove(board, index, letter)
      expect(moved).not.toBeNull()
      board = moved.board
      result = getOrderChaosWinner(board)
      currentTurn = currentTurn === 'X' ? 'O' : 'X'
    }

    expect(result.winner).toBe('X')
    expect(result.line).toEqual(orderMoves.slice(0, 5))
  })
})
