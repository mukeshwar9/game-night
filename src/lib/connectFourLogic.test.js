import { describe, it, expect } from 'vitest'
import {
  getConnectFourWinner,
  getConnectFourDrop,
  CF_COLS,
  CF_BOARD_SIZE,
} from './connectFourLogic'

// Board layout: 6 rows × 7 cols, index = row * 7 + col, row 0 = top
const empty = () => Array(42).fill('')

function place(board, cells, symbol) {
  const b = [...board]
  cells.forEach(i => { b[i] = symbol })
  return b
}

// Verified draw board: column patterns XXOOXX / OOXXOO alternating.
// Rendered as rows (top to bottom):
//   XOXOXOX  XOXOXOX  OXOXOXO  OXOXOXO  XOXOXOX  XOXOXOX
// No four-in-a-row exists in any direction (verified programmatically).
const drawBoard = (() => {
  const colPatterns = ['XXOOXX', 'OOXXOO', 'XXOOXX', 'OOXXOO', 'XXOOXX', 'OOXXOO', 'XXOOXX']
  const b = Array(42).fill('')
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row < 6; row++) {
      b[row * 7 + col] = colPatterns[col][row]
    }
  }
  return b
})()

describe('getConnectFourWinner', () => {
  it('returns null for an empty board', () => {
    expect(getConnectFourWinner(empty())).toBeNull()
  })

  it('returns null for exactly three in a row (horizontal) — no false positive', () => {
    const board = place(empty(), [35, 36, 37], 'X')
    expect(getConnectFourWinner(board)).toBeNull()
  })

  it('detects a horizontal win on the bottom row', () => {
    const board = place(empty(), [35, 36, 37, 38], 'X')
    expect(getConnectFourWinner(board)).toEqual({ winner: 'X', line: [35, 36, 37, 38] })
  })

  it('detects a vertical win (O at col 0, rows 2-5)', () => {
    const board = place(empty(), [14, 21, 28, 35], 'O')
    expect(getConnectFourWinner(board)).toEqual({ winner: 'O', line: [14, 21, 28, 35] })
  })

  it('detects a diagonal down-right win', () => {
    // 0=(r0,c0), 8=(r1,c1), 16=(r2,c2), 24=(r3,c3)
    const board = place(empty(), [0, 8, 16, 24], 'X')
    expect(getConnectFourWinner(board)).toEqual({ winner: 'X', line: [0, 8, 16, 24] })
  })

  it('detects a diagonal down-left win', () => {
    // 6=(r0,c6), 12=(r1,c5), 18=(r2,c4), 24=(r3,c3)
    const board = place(empty(), [6, 12, 18, 24], 'X')
    expect(getConnectFourWinner(board)).toEqual({ winner: 'X', line: [6, 12, 18, 24] })
  })

  it('correctly detects a win touching the bottom-right corner', () => {
    // 38=(r5,c3), 39=(r5,c4), 40=(r5,c5), 41=(r5,c6)
    const board = place(empty(), [38, 39, 40, 41], 'X')
    expect(getConnectFourWinner(board)).toEqual({ winner: 'X', line: [38, 39, 40, 41] })
  })

  it('returns draw with an empty line array for a full board with no four-in-a-row', () => {
    expect(getConnectFourWinner(drawBoard)).toEqual({ winner: 'draw', line: [] })
  })

  it('returns a win (not draw) for five in a row', () => {
    const board = place(empty(), [35, 36, 37, 38, 39], 'X')
    const result = getConnectFourWinner(board)
    expect(result).not.toBeNull()
    expect(result.winner).toBe('X')
  })
})

describe('getConnectFourDrop', () => {
  it('drops to the bottom row (index 38) for col 3 on an empty board', () => {
    expect(getConnectFourDrop(empty(), 3)).toBe(38)
  })

  it('stacks upward: after col 3 bottom is filled, next drop lands at 31', () => {
    const board = place(empty(), [38], 'X')
    expect(getConnectFourDrop(board, 3)).toBe(31)
  })

  it('returns -1 for a full column', () => {
    const board = place(empty(), [3, 10, 17, 24, 31, 38], 'X')
    expect(getConnectFourDrop(board, 3)).toBe(-1)
  })

  it('drops to 35 for col 0 on an empty board', () => {
    expect(getConnectFourDrop(empty(), 0)).toBe(35)
  })

  it('drops to 41 for col 6 on an empty board', () => {
    expect(getConnectFourDrop(empty(), 6)).toBe(41)
  })
})

describe('CF_COLS', () => {
  it('equals 7', () => {
    expect(CF_COLS).toBe(7)
  })
})

describe('CF_BOARD_SIZE', () => {
  it('equals 42', () => {
    expect(CF_BOARD_SIZE).toBe(42)
  })
})
