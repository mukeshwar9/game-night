import { describe, it, expect } from 'vitest'
import {
  getConnectFourWinner,
  getConnectFourDrop,
  CF_COLS,
  CF_BOARD_SIZE,
  CF5,
  CF5_COLS,
  CF5_ROWS,
  CF5_BOARD_SIZE,
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

// ---------------------------------------------------------------------------
// CF5 — 9×7 board, five-in-a-row variant
// ---------------------------------------------------------------------------
describe('getConnectFourWinner with CF5 config (9×7, winRun 5)', () => {
  const idx5 = (row, col) => row * CF5_COLS + col
  const empty5 = () => Array(CF5_BOARD_SIZE).fill('')

  it('four in a row does NOT win on the 9×7 board', () => {
    const board = place(empty5(), [idx5(6, 0), idx5(6, 1), idx5(6, 2), idx5(6, 3)], 'X')
    expect(getConnectFourWinner(board, CF5)).toBeNull()
  })

  it('five in a row wins horizontally on the bottom row', () => {
    const cells = [0, 1, 2, 3, 4].map(c => idx5(6, c))
    const board = place(empty5(), cells, 'X')
    expect(getConnectFourWinner(board, CF5)).toEqual({ winner: 'X', line: cells })
  })

  it('five in a row wins vertically', () => {
    const cells = [0, 1, 2, 3, 4].map(r => idx5(r, 0))
    const board = place(empty5(), cells, 'O')
    expect(getConnectFourWinner(board, CF5)).toEqual({ winner: 'O', line: cells })
  })

  it('five in a row wins on a diagonal', () => {
    const cells = [0, 1, 2, 3, 4].map(k => idx5(k, k))
    const board = place(empty5(), cells, 'X')
    expect(getConnectFourWinner(board, CF5)).toEqual({ winner: 'X', line: cells })
  })

  it('detects a win touching the bottom-right edge (row 6, col 8)', () => {
    const cells = [4, 5, 6, 7, 8].map(c => idx5(6, c))
    const board = place(empty5(), cells, 'O')
    expect(getConnectFourWinner(board, CF5)).toEqual({ winner: 'O', line: cells })
  })

  it('detects a win touching the top-left edge (row 0, col 0)', () => {
    const cells = [0, 1, 2, 3, 4].map(c => idx5(0, c))
    const board = place(empty5(), cells, 'X')
    expect(getConnectFourWinner(board, CF5)).toEqual({ winner: 'X', line: cells })
  })

  it('CF5 constants describe a 9×7, 63-cell board', () => {
    expect(CF5_COLS).toBe(9)
    expect(CF5_ROWS).toBe(7)
    expect(CF5_BOARD_SIZE).toBe(63)
    expect(CF5).toEqual({ cols: 9, rows: 7, winRun: 5 })
  })
})

describe('getConnectFourDrop with CF5 config', () => {
  it('drops to the bottom row (row 6) of the 9×7 board', () => {
    const empty5 = Array(CF5_BOARD_SIZE).fill('')
    expect(getConnectFourDrop(empty5, 3, CF5)).toBe(6 * CF5_COLS + 3)
  })

  it('returns -1 for an out-of-range column on the 9×7 board', () => {
    const empty5 = Array(CF5_BOARD_SIZE).fill('')
    expect(getConnectFourDrop(empty5, 9, CF5)).toBe(-1)
  })
})
