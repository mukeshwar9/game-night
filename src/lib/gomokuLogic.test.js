import { describe, it, expect } from 'vitest'
import {
  GOMOKU_SIZE,
  GOMOKU_CELL_COUNT,
  GOMOKU_WIN_RUN,
  getGomokuWinner,
  getMoveIndex,
  SWAP_ACTION,
  isSwapMove,
  canGomokuSwap,
  applyGomokuMove,
} from './gomokuLogic'

const emptyBoard = () => Array(GOMOKU_CELL_COUNT).fill('')
const idx = (row, col) => row * GOMOKU_SIZE + col

// ---------------------------------------------------------------------------
// getGomokuWinner
// ---------------------------------------------------------------------------
describe('getGomokuWinner', () => {
  it('returns null on empty board', () => {
    expect(getGomokuWinner(emptyBoard())).toBeNull()
  })

  it('returns null with no run on a partial board', () => {
    const board = emptyBoard()
    board[idx(0, 0)] = 'X'
    board[idx(0, 1)] = 'O'
    board[idx(1, 1)] = 'X'
    expect(getGomokuWinner(board)).toBeNull()
  })

  it('returns null for a run of only 4', () => {
    const board = emptyBoard()
    for (let c = 0; c < 4; c++) board[idx(5, c)] = 'X'
    expect(getGomokuWinner(board)).toBeNull()
  })

  it('detects a horizontal run of 5 (X)', () => {
    const board = emptyBoard()
    for (let c = 0; c < 5; c++) board[idx(7, c)] = 'X'
    const result = getGomokuWinner(board)
    expect(result.winner).toBe('X')
    expect(result.line).toEqual([idx(7, 0), idx(7, 1), idx(7, 2), idx(7, 3), idx(7, 4)])
  })

  it('detects a vertical run of 5 (O)', () => {
    const board = emptyBoard()
    for (let r = 3; r < 8; r++) board[idx(r, 9)] = 'O'
    const result = getGomokuWinner(board)
    expect(result.winner).toBe('O')
    expect(result.line).toEqual([idx(3, 9), idx(4, 9), idx(5, 9), idx(6, 9), idx(7, 9)])
  })

  it('detects a diagonal run of 5 (down-right)', () => {
    const board = emptyBoard()
    for (let k = 0; k < 5; k++) board[idx(2 + k, 2 + k)] = 'X'
    const result = getGomokuWinner(board)
    expect(result.winner).toBe('X')
    expect(result.line).toEqual([idx(2, 2), idx(3, 3), idx(4, 4), idx(5, 5), idx(6, 6)])
  })

  it('detects a diagonal run of 5 (down-left)', () => {
    const board = emptyBoard()
    for (let k = 0; k < 5; k++) board[idx(2 + k, 10 - k)] = 'O'
    const result = getGomokuWinner(board)
    expect(result.winner).toBe('O')
    // anchored at top-right cell (2,10) scanning down-left
    expect(result.line).toEqual([idx(2, 10), idx(3, 9), idx(4, 8), idx(5, 7), idx(6, 6)])
  })

  it('detects a run of 6 (still a win, first 5 cells)', () => {
    const board = emptyBoard()
    for (let c = 0; c < 6; c++) board[idx(0, c)] = 'X'
    const result = getGomokuWinner(board)
    expect(result.winner).toBe('X')
    expect(result.line).toHaveLength(GOMOKU_WIN_RUN)
  })

  it('no horizontal wraparound across a row boundary', () => {
    // cols 11..14 of row 0 then col 0 of row 1 are contiguous indices but wrap rows
    const board = emptyBoard()
    board[idx(0, 11)] = 'X'
    board[idx(0, 12)] = 'X'
    board[idx(0, 13)] = 'X'
    board[idx(0, 14)] = 'X'
    board[idx(1, 0)] = 'X'
    expect(getGomokuWinner(board)).toBeNull()
  })

  it('does not win on a broken run (gap in the middle)', () => {
    const board = emptyBoard()
    board[idx(4, 0)] = 'X'
    board[idx(4, 1)] = 'X'
    board[idx(4, 2)] = 'O'
    board[idx(4, 3)] = 'X'
    board[idx(4, 4)] = 'X'
    expect(getGomokuWinner(board)).toBeNull()
  })

  it('returns draw on a full board with no run of 5', () => {
    // Build a full board that intentionally avoids 5-in-a-row by shifting the
    // pattern period each row so no direction lines up 5 of a kind.
    const board = emptyBoard()
    for (let r = 0; r < GOMOKU_SIZE; r++) {
      for (let c = 0; c < GOMOKU_SIZE; c++) {
        // period-2 stripes offset by row → max horizontal run 2, no diagonal 5
        board[idx(r, c)] = ((c + (r % 2) * 2 + Math.floor(r / 2)) % 4 < 2) ? 'X' : 'O'
      }
    }
    const result = getGomokuWinner(board)
    // If the constructed pattern happens to have no winner, expect a draw;
    // assert there is no empty cell so 'draw' is the only valid full-board verdict.
    expect(board.every(c => c)).toBe(true)
    if (result && result.winner !== 'draw') {
      // Guard: if the pattern accidentally produced a line, fail loudly.
      throw new Error('test pattern unexpectedly produced a winning line')
    }
    expect(result).toEqual({ winner: 'draw' })
  })

  it('draw result has no line property', () => {
    const board = emptyBoard()
    for (let i = 0; i < GOMOKU_CELL_COUNT; i++) {
      const r = Math.floor(i / GOMOKU_SIZE)
      const c = i % GOMOKU_SIZE
      board[i] = ((c + (r % 2) * 2 + Math.floor(r / 2)) % 4 < 2) ? 'X' : 'O'
    }
    const result = getGomokuWinner(board)
    expect(result).not.toHaveProperty('line')
  })

  it('a near-full board with one empty cell and no run returns null', () => {
    const board = emptyBoard()
    for (let i = 0; i < GOMOKU_CELL_COUNT; i++) {
      const r = Math.floor(i / GOMOKU_SIZE)
      const c = i % GOMOKU_SIZE
      board[i] = ((c + (r % 2) * 2 + Math.floor(r / 2)) % 4 < 2) ? 'X' : 'O'
    }
    board[idx(7, 7)] = '' // leave one empty
    expect(getGomokuWinner(board)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getMoveIndex
// ---------------------------------------------------------------------------
describe('getMoveIndex', () => {
  it('returns the index for an empty cell', () => {
    expect(getMoveIndex(emptyBoard(), 42)).toBe(42)
  })

  it('returns -1 for an occupied cell', () => {
    const board = emptyBoard()
    board[42] = 'X'
    expect(getMoveIndex(board, 42)).toBe(-1)
  })

  it('handles index 0', () => {
    expect(getMoveIndex(emptyBoard(), 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Swap (pie) rule — GOMOKU SWAP variant
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
    expect(isSwapMove(0)).toBe(false)
    expect(isSwapMove(undefined)).toBe(false)
  })

  it('is legal only on move 2, for the player who did not open', () => {
    expect(canGomokuSwap(emptyBoard(), 'O')).toBe(false)
    expect(canGomokuSwap(opening(7, 7), 'O')).toBe(true)
    expect(canGomokuSwap(opening(7, 7), 'X')).toBe(false)
    expect(canGomokuSwap(opening(7, 7, 'O'), 'X')).toBe(true)
    const two = opening(7, 7)
    two[idx(7, 8)] = 'O'
    expect(canGomokuSwap(two, 'O')).toBe(false)
    expect(canGomokuSwap(opening(7, 7), 'O', true)).toBe(false)
    expect(canGomokuSwap(opening(7, 7), null)).toBe(false)
  })

  it('flips the opening stone to the swapper in place', () => {
    const res = applyGomokuMove(opening(7, 7), SWAP, 'O')
    expect(res).toEqual({
      board: opening(7, 7, 'O'),
      index: idx(7, 7),
      swapped: true,
      result: null,
    })
  })

  it('rejects illegal swaps and a swap-back', () => {
    expect(applyGomokuMove(emptyBoard(), SWAP, 'O')).toBeNull()
    expect(applyGomokuMove(opening(7, 7), SWAP, 'X')).toBeNull()
    const swapped = applyGomokuMove(opening(7, 7), SWAP, 'O')
    expect(applyGomokuMove(swapped.board, SWAP, 'X', true)).toBeNull()
  })

  it('placements are validated and clear the swap flag', () => {
    const res = applyGomokuMove(opening(7, 7), idx(7, 8), 'O')
    expect(res.swapped).toBe(false)
    expect(res.board[idx(7, 8)]).toBe('O')
    expect(applyGomokuMove(opening(7, 7), idx(7, 7), 'O')).toBeNull()
    expect(applyGomokuMove(emptyBoard(), -1, 'X')).toBeNull()
    expect(applyGomokuMove(emptyBoard(), GOMOKU_CELL_COUNT, 'X')).toBeNull()
  })

  it('win detection is unaffected: the swapped stone counts for its new owner', () => {
    let board = applyGomokuMove(opening(7, 7), SWAP, 'O').board
    for (const c of [8, 9, 10]) board = applyGomokuMove(board, idx(7, c), 'O').board
    const res = applyGomokuMove(board, idx(7, 11), 'O')
    expect(res.result.winner).toBe('O')
    expect(res.result.line).toEqual([idx(7, 7), idx(7, 8), idx(7, 9), idx(7, 10), idx(7, 11)])
  })

  it('getMoveIndex resolves a swap to the lone stone, else -1', () => {
    expect(getMoveIndex(opening(3, 4), SWAP)).toBe(idx(3, 4))
    expect(getMoveIndex(emptyBoard(), SWAP)).toBe(-1)
  })
})
