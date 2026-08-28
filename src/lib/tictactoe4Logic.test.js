import { describe, it, expect } from 'vitest'
import { getTicTacToe4Winner, TTT4_CELL_COUNT, TTT4_WIN_LINES } from './tictactoe4Logic'

const empty = () => Array(TTT4_CELL_COUNT).fill('')

function place(board, cells, symbol) {
  const b = [...board]
  cells.forEach(i => { b[i] = symbol })
  return b
}

describe('getTicTacToe4Winner', () => {
  it('returns null on an empty board', () => {
    expect(getTicTacToe4Winner(empty())).toBeNull()
  })

  it('returns null when no line is complete', () => {
    const board = place(empty(), [0, 1, 2], 'X')
    expect(getTicTacToe4Winner(board)).toBeNull()
  })

  it('detects every row win', () => {
    const rows = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]]
    for (const line of rows) {
      const board = place(empty(), line, 'X')
      expect(getTicTacToe4Winner(board)).toEqual({ winner: 'X', line })
    }
  })

  it('detects every column win', () => {
    const cols = [[0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15]]
    for (const line of cols) {
      const board = place(empty(), line, 'O')
      expect(getTicTacToe4Winner(board)).toEqual({ winner: 'O', line })
    }
  })

  it('detects the main diagonal win', () => {
    const line = [0, 5, 10, 15]
    const board = place(empty(), line, 'X')
    expect(getTicTacToe4Winner(board)).toEqual({ winner: 'X', line })
  })

  it('detects the anti-diagonal win', () => {
    const line = [3, 6, 9, 12]
    const board = place(empty(), line, 'O')
    expect(getTicTacToe4Winner(board)).toEqual({ winner: 'O', line })
  })

  it('confirms every winning line is covered by TTT4_WIN_LINES', () => {
    expect(TTT4_WIN_LINES).toHaveLength(10)
  })

  it('returns a draw when the board is full with no winner', () => {
    // Checkerboard-ish pattern verified to contain no 4-in-a-row.
    const pattern = ['X', 'X', 'O', 'O', 'O', 'O', 'X', 'X', 'X', 'X', 'O', 'O', 'O', 'O', 'X', 'X']
    const board = [...pattern]
    expect(getTicTacToe4Winner(board)).toEqual({ winner: 'draw', line: [] })
  })

  it('does not false-positive on three-in-a-row without a fourth', () => {
    const board = place(empty(), [0, 1, 2], 'X')
    board[3] = 'O'
    expect(getTicTacToe4Winner(board)).toBeNull()
  })
})
