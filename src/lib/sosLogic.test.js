import { describe, it, expect } from 'vitest'
import {
  SOS_SIZE,
  SOS_CELL_COUNT,
  normalizeSosLines,
  findNewSosLines,
  applySosMove,
  getSosWinner,
} from './sosLogic'

// ---------------------------------------------------------------------------
// normalizeSosLines
// ---------------------------------------------------------------------------
describe('normalizeSosLines', () => {
  it('returns [] for null', () => {
    expect(normalizeSosLines(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(normalizeSosLines(undefined)).toEqual([])
  })

  it('returns array as-is', () => {
    const arr = [{ cells: [0, 1, 2], by: 'X' }]
    expect(normalizeSosLines(arr)).toBe(arr)
  })

  it('converts numeric-keyed object to array', () => {
    const obj = { 0: { cells: [0, 1, 2], by: 'X' }, 1: { cells: [3, 4, 5], by: 'O' } }
    const result = normalizeSosLines(obj)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ cells: [0, 1, 2], by: 'X' })
  })
})

// ---------------------------------------------------------------------------
// findNewSosLines — helpers
// ---------------------------------------------------------------------------
function emptyBoard() {
  return Array(SOS_CELL_COUNT).fill('')
}

function idx(row, col) {
  return row * SOS_SIZE + col
}

describe('findNewSosLines', () => {
  it('detects a horizontal S-O-S', () => {
    const board = emptyBoard()
    board[idx(0, 0)] = 'S'
    board[idx(0, 1)] = 'O'
    board[idx(0, 2)] = 'S'
    // placed letter is the last S at col 2
    const lines = findNewSosLines(board, idx(0, 2))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([idx(0, 0), idx(0, 1), idx(0, 2)])
  })

  it('detects a vertical S-O-S', () => {
    const board = emptyBoard()
    board[idx(0, 3)] = 'S'
    board[idx(1, 3)] = 'O'
    board[idx(2, 3)] = 'S'
    const lines = findNewSosLines(board, idx(1, 3)) // placed the O
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([idx(0, 3), idx(1, 3), idx(2, 3)])
  })

  it('detects a diagonal S-O-S (down-right)', () => {
    const board = emptyBoard()
    board[idx(1, 1)] = 'S'
    board[idx(2, 2)] = 'O'
    board[idx(3, 3)] = 'S'
    const lines = findNewSosLines(board, idx(1, 1)) // placed the first S
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([idx(1, 1), idx(2, 2), idx(3, 3)])
  })

  it('detects a diagonal S-O-S (down-left)', () => {
    const board = emptyBoard()
    board[idx(1, 5)] = 'S'
    board[idx(2, 4)] = 'O'
    board[idx(3, 3)] = 'S'
    const lines = findNewSosLines(board, idx(3, 3)) // placed the last S
    expect(lines).toHaveLength(1)
    // ascending order: idx(1,5)=12, idx(2,4)=18, idx(3,3)=24
    expect(lines[0]).toEqual([idx(1, 5), idx(2, 4), idx(3, 3)].sort((a, b) => a - b))
  })

  it('completion when placed letter is the middle O', () => {
    const board = emptyBoard()
    board[idx(3, 2)] = 'S'
    board[idx(3, 4)] = 'S'
    board[idx(3, 3)] = 'O' // placed last — middle O
    const lines = findNewSosLines(board, idx(3, 3))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([idx(3, 2), idx(3, 3), idx(3, 4)])
  })

  it('completion when placed letter is the first S', () => {
    const board = emptyBoard()
    board[idx(0, 1)] = 'O'
    board[idx(0, 2)] = 'S'
    board[idx(0, 0)] = 'S' // placed first S
    const lines = findNewSosLines(board, idx(0, 0))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([idx(0, 0), idx(0, 1), idx(0, 2)])
  })

  it('a single placement completing TWO sequences returns both triples', () => {
    // Horizontal: S-O-S at (0,0)-(0,1)-(0,2), placed S at (0,2) which is also S in vertical (0,2)-(1,2)-(2,2)
    const board = emptyBoard()
    // horizontal: cells 0,1,2 → S at col0, O at col1, placed S at col2
    board[idx(0, 0)] = 'S'
    board[idx(0, 1)] = 'O'
    // vertical: S at row0col2 (the placed), O at row1col2, S at row2col2
    board[idx(1, 2)] = 'O'
    board[idx(2, 2)] = 'S'
    board[idx(0, 2)] = 'S' // placed
    const lines = findNewSosLines(board, idx(0, 2))
    expect(lines).toHaveLength(2)
  })

  it('no false positive for S-S-S', () => {
    const board = emptyBoard()
    board[idx(0, 0)] = 'S'
    board[idx(0, 1)] = 'S'
    board[idx(0, 2)] = 'S'
    expect(findNewSosLines(board, idx(0, 0))).toHaveLength(0)
  })

  it('no false positive for O-O-O', () => {
    const board = emptyBoard()
    board[idx(2, 2)] = 'O'
    board[idx(2, 3)] = 'O'
    board[idx(2, 4)] = 'O'
    expect(findNewSosLines(board, idx(2, 3))).toHaveLength(0)
  })

  it('no false positive for partial S-O or O-S', () => {
    const board = emptyBoard()
    board[idx(0, 0)] = 'S'
    board[idx(0, 1)] = 'O'
    expect(findNewSosLines(board, idx(0, 1))).toHaveLength(0)
  })

  it('no wraparound: cells at cols 5,6 and col 0 of next row must NOT count', () => {
    // index 6 is (0,6), index 7 is (1,0) — row boundary
    const board = emptyBoard()
    board[idx(0, 5)] = 'S'
    board[idx(0, 6)] = 'O'
    board[idx(1, 0)] = 'S' // would be index 7, adjacent index but different row
    // place the O at (0,6) — index 6
    const lines = findNewSosLines(board, idx(0, 6))
    // The horizontal direction would need col 7 which is out of bounds, so no line
    expect(lines).toHaveLength(0)
  })

  it('no wraparound: cells 5,6,7 should NOT form a horizontal line across rows', () => {
    // idx(0,5)=5, idx(0,6)=6, idx(1,0)=7
    const board = emptyBoard()
    board[5] = 'S'
    board[6] = 'O'
    board[7] = 'S'
    // place at index 5 (row 0, col 5); index 7 is row 1, col 0 — different row
    const lines = findNewSosLines(board, 5)
    expect(lines).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// applySosMove
// ---------------------------------------------------------------------------
describe('applySosMove', () => {
  const emptyBoard = () => Array(SOS_CELL_COUNT).fill('')

  it('returns null for index out of range (negative)', () => {
    expect(applySosMove(emptyBoard(), [], -1, 'S', 'X')).toBeNull()
  })

  it('returns null for index out of range (too large)', () => {
    expect(applySosMove(emptyBoard(), [], SOS_CELL_COUNT, 'S', 'X')).toBeNull()
  })

  it('returns null when cell is occupied', () => {
    const board = emptyBoard()
    board[0] = 'S'
    expect(applySosMove(board, [], 0, 'O', 'X')).toBeNull()
  })

  it('returns null for invalid letter', () => {
    expect(applySosMove(emptyBoard(), [], 0, 'X', 'X')).toBeNull()
    expect(applySosMove(emptyBoard(), [], 0, 's', 'X')).toBeNull()
    expect(applySosMove(emptyBoard(), [], 0, '', 'X')).toBeNull()
  })

  it('places the letter on the board', () => {
    const result = applySosMove(emptyBoard(), [], 10, 'O', 'X')
    expect(result).not.toBeNull()
    expect(result.board[10]).toBe('O')
  })

  it('does not mutate input board', () => {
    const board = emptyBoard()
    const boardCopy = [...board]
    applySosMove(board, [], 5, 'S', 'X')
    expect(board).toEqual(boardCopy)
  })

  it('does not mutate input sosLines', () => {
    const lines = [{ cells: [0, 1, 2], by: 'X' }]
    const linesCopy = [...lines]
    const board = emptyBoard()
    board[0] = 'S'; board[1] = 'O'; board[2] = 'S'
    // place something unrelated
    applySosMove(board, lines, 10, 'S', 'X')
    expect(lines).toHaveLength(linesCopy.length)
  })

  it('completedCount is 0 when no SOS formed', () => {
    const result = applySosMove(emptyBoard(), [], 0, 'S', 'X')
    expect(result.completedCount).toBe(0)
  })

  it('completedCount is 1 when one SOS formed', () => {
    const board = emptyBoard()
    board[idx(0, 0)] = 'S'
    board[idx(0, 1)] = 'O'
    const result = applySosMove(board, [], idx(0, 2), 'S', 'O')
    expect(result.completedCount).toBe(1)
  })

  it('appends correct by symbol for completed line', () => {
    const board = emptyBoard()
    board[idx(0, 0)] = 'S'
    board[idx(0, 1)] = 'O'
    const result = applySosMove(board, [], idx(0, 2), 'S', 'O')
    expect(result.sosLines).toHaveLength(1)
    expect(result.sosLines[0].by).toBe('O')
    expect(result.sosLines[0].cells).toEqual([idx(0, 0), idx(0, 1), idx(0, 2)])
  })

  it('completedCount matches number of new lines appended', () => {
    const board = emptyBoard()
    // two lines complete when placing S at (0,2):
    board[idx(0, 0)] = 'S'
    board[idx(0, 1)] = 'O'
    board[idx(1, 2)] = 'O'
    board[idx(2, 2)] = 'S'
    const result = applySosMove(board, [], idx(0, 2), 'S', 'X')
    expect(result.completedCount).toBe(2)
    expect(result.sosLines).toHaveLength(2)
  })

  it('existing sosLines are preserved', () => {
    const board = emptyBoard()
    const existingLines = [{ cells: [5, 6, 7], by: 'X' }]
    const result = applySosMove(board, existingLines, 0, 'S', 'X')
    expect(result.sosLines[0]).toEqual(existingLines[0])
  })
})

// ---------------------------------------------------------------------------
// getSosWinner
// ---------------------------------------------------------------------------
describe('getSosWinner', () => {
  const emptyBoard = () => Array(SOS_CELL_COUNT).fill('')
  const fullBoard = () => Array(SOS_CELL_COUNT).fill('S')

  it('returns null on empty board', () => {
    expect(getSosWinner(emptyBoard(), [])).toBeNull()
  })

  it('returns null on partial board even with scored lines', () => {
    const board = emptyBoard()
    board[0] = 'S'; board[1] = 'O'; board[2] = 'S'
    const lines = [{ cells: [0, 1, 2], by: 'X' }]
    expect(getSosWinner(board, lines)).toBeNull()
  })

  it('returns X winner when X has more lines on full board', () => {
    const lines = [
      { cells: [0, 1, 2], by: 'X' },
      { cells: [3, 4, 5], by: 'X' },
      { cells: [6, 7, 8], by: 'O' },
    ]
    expect(getSosWinner(fullBoard(), lines)).toEqual({ winner: 'X' })
  })

  it('returns O winner when O has more lines on full board', () => {
    const lines = [
      { cells: [0, 1, 2], by: 'X' },
      { cells: [3, 4, 5], by: 'O' },
      { cells: [6, 7, 8], by: 'O' },
    ]
    expect(getSosWinner(fullBoard(), lines)).toEqual({ winner: 'O' })
  })

  it('returns draw when counts are equal on full board', () => {
    const lines = [
      { cells: [0, 1, 2], by: 'X' },
      { cells: [3, 4, 5], by: 'O' },
    ]
    expect(getSosWinner(fullBoard(), lines)).toEqual({ winner: 'draw' })
  })

  it('returns draw when no lines scored on full board', () => {
    expect(getSosWinner(fullBoard(), [])).toEqual({ winner: 'draw' })
  })

  it('result has no line property', () => {
    const result = getSosWinner(fullBoard(), [{ cells: [0, 1, 2], by: 'X' }])
    expect(result).not.toHaveProperty('line')
  })
})

// ---------------------------------------------------------------------------
// Full-game simulation with extra-turn rule
// ---------------------------------------------------------------------------
describe('full-game simulation with extra-turn rule', () => {
  it('all cells filled, final sosLines counts sum correctly, winner matches', () => {
    let board = Array(SOS_CELL_COUNT).fill('')
    let sosLines = []
    let currentTurn = 'X'
    let winner = null

    // Alternate S and O placements row by row; use a simple pattern
    const letters = ['S', 'O', 'S', 'O', 'S', 'O', 'S'] // repeating pattern per row
    let moveCount = 0

    for (let i = 0; i < SOS_CELL_COUNT; i++) {
      if (board[i] !== '') continue // skip if already filled (shouldn't happen in this linear scan)

      const letter = letters[i % letters.length]
      const result = applySosMove(board, sosLines, i, letter, currentTurn)
      expect(result).not.toBeNull()

      board = result.board
      sosLines = result.sosLines
      moveCount++

      const gameResult = getSosWinner(board, sosLines)
      if (gameResult) {
        winner = gameResult.winner
        break
      }

      // extra turn rule: if scoring move, keep same player; otherwise flip
      if (result.completedCount === 0) {
        currentTurn = currentTurn === 'X' ? 'O' : 'X'
      }
    }

    // All cells should be filled when game ends, one move per cell
    expect(board.every(c => c !== '')).toBe(true)
    expect(moveCount).toBe(SOS_CELL_COUNT)

    // sosLines counts should be derivable from the array
    const xCount = sosLines.filter(l => l.by === 'X').length
    const oCount = sosLines.filter(l => l.by === 'O').length
    expect(xCount + oCount).toBe(sosLines.length)

    if (winner === 'X') expect(xCount).toBeGreaterThan(oCount)
    else if (winner === 'O') expect(oCount).toBeGreaterThan(xCount)
    else {
      expect(winner).toBe('draw')
      expect(xCount).toBe(oCount)
    }
  })
})
