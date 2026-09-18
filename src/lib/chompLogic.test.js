import { describe, it, expect } from 'vitest'
import {
  CHOMP_COLS,
  CHOMP_ROWS,
  CHOMP_CELL_COUNT,
  POISON_INDEX,
  EATEN,
  normalizeChompBoard,
  rowColOf,
  isPoisonOnly,
  applyChompMove,
  getChompWinner,
  edibleSquares,
  getMoveIndex,
} from './chompLogic'

const fresh = () => Array(CHOMP_CELL_COUNT).fill('')
const idx = (r, c) => r * CHOMP_COLS + c

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------
describe('structure', () => {
  it('is a 6x5 bar with poison at top-left', () => {
    expect(CHOMP_COLS).toBe(6)
    expect(CHOMP_ROWS).toBe(5)
    expect(CHOMP_CELL_COUNT).toBe(30)
    expect(POISON_INDEX).toBe(idx(0, 0))
    expect(POISON_INDEX).toBe(0)
  })

  it('rowColOf maps indices correctly', () => {
    expect(rowColOf(0)).toEqual([0, 0])
    expect(rowColOf(5)).toEqual([0, 5])
    expect(rowColOf(6)).toEqual([1, 0])
    expect(rowColOf(29)).toEqual([4, 5])
  })
})

// ---------------------------------------------------------------------------
// normalizeChompBoard
// ---------------------------------------------------------------------------
describe('normalizeChompBoard', () => {
  it('fills a sparse array with empty squares', () => {
    const raw = []
    raw[idx(2, 3)] = EATEN
    const b = normalizeChompBoard(raw)
    expect(b).toHaveLength(CHOMP_CELL_COUNT)
    expect(b[idx(2, 3)]).toBe(EATEN)
    expect(b[0]).toBe('')
  })

  it('accepts numeric-keyed objects and drops junk values', () => {
    const b = normalizeChompBoard({ 7: EATEN, 11: 'x', 99: EATEN })
    expect(b[idx(1, 1)]).toBe(EATEN)
    expect(b[idx(1, 5)]).toBe('') // 'x' is not the EATEN token
    expect(b).toHaveLength(CHOMP_CELL_COUNT)
  })

  it('handles null/undefined', () => {
    expect(normalizeChompBoard(null)).toHaveLength(CHOMP_CELL_COUNT)
  })
})

// ---------------------------------------------------------------------------
// applyChompMove
// ---------------------------------------------------------------------------
describe('applyChompMove', () => {
  it('eats the chosen square and everything below-right', () => {
    const res = applyChompMove(fresh(), idx(1, 2))
    expect(res).not.toBeNull()
    for (let r = 1; r < CHOMP_ROWS; r++) {
      for (let c = 2; c < CHOMP_COLS; c++) {
        expect(res.board[idx(r, c)]).toBe(EATEN)
      }
    }
    // above-left stays
    expect(res.board[idx(0, 0)]).toBe('')
    expect(res.board[idx(0, 5)]).toBe('')
    expect(res.board[idx(1, 1)]).toBe('')
    expect(res.board[idx(4, 1)]).toBe('')
  })

  it('eating the bottom-right corner eats exactly one square', () => {
    const res = applyChompMove(fresh(), idx(4, 5))
    expect(res.board.filter(v => v === EATEN)).toHaveLength(1)
  })

  it('eating the poison square clears the whole bar', () => {
    const res = applyChompMove(fresh(), idx(0, 0))
    expect(res.board.every(v => v === EATEN)).toBe(true)
  })

  it('reports atePoison only for the poison square itself', () => {
    expect(applyChompMove(fresh(), POISON_INDEX).atePoison).toBe(true)
    expect(applyChompMove(fresh(), idx(4, 1)).atePoison).toBe(false)
    expect(applyChompMove(fresh(), idx(2, 3)).atePoison).toBe(false)
  })

  it('does not mutate the input board', () => {
    const b = fresh()
    const before = [...b]
    applyChompMove(b, idx(2, 2))
    expect(b).toEqual(before)
  })

  it('rejects eaten squares and out-of-range indices', () => {
    const { board } = applyChompMove(fresh(), idx(1, 1))
    expect(applyChompMove(board, idx(1, 1))).toBeNull()
    expect(applyChompMove(board, -1)).toBeNull()
    expect(applyChompMove(board, 30)).toBeNull()
    expect(applyChompMove(board, 1.5)).toBeNull()
    expect(applyChompMove(board, null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isPoisonOnly / getChompWinner
// ---------------------------------------------------------------------------
describe('isPoisonOnly / getChompWinner', () => {
  it('fresh bar is not poison-only', () => {
    expect(isPoisonOnly(fresh())).toBe(false)
  })

  it('bar with only poison left is poison-only', () => {
    const b = fresh().map((_, i) => (i === POISON_INDEX ? '' : EATEN))
    expect(isPoisonOnly(b)).toBe(true)
  })

  it('mover who bites the poison loses immediately', () => {
    expect(getChompWinner(true, 'X')).toEqual({ winner: 'O' })
    expect(getChompWinner(true, 'O')).toEqual({ winner: 'X' })
  })

  it('mover who leaves only the poison does NOT resolve — opponent must bite it', () => {
    // Eat rows 1-4 of columns 1-5, then row 0 of columns 1-5, then rows 1-4
    // of column 0: leaves exactly the top-left poison square.
    let b = fresh()
    b = applyChompMove(b, idx(1, 1)).board // rows 1-4, cols 1-5
    b = applyChompMove(b, idx(0, 1)).board // row 0, cols 1-5
    b = applyChompMove(b, idx(1, 0)).board // rows 1-4, col 0
    expect(isPoisonOnly(b)).toBe(true)
    expect(getChompWinner(false, 'X')).toBeNull()
    // the only remaining edible square is the poison itself
    expect(edibleSquares(b)).toEqual([POISON_INDEX])
  })

  it('returns null when no poison was eaten', () => {
    expect(getChompWinner(false, 'X')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// edibleSquares / getMoveIndex
// ---------------------------------------------------------------------------
describe('edibleSquares / getMoveIndex', () => {
  it('fresh bar has 30 edible squares', () => {
    expect(edibleSquares(fresh())).toHaveLength(30)
  })

  it('after one bottom-right bite the count matches the rectangle math', () => {
    const b = applyChompMove(fresh(), idx(2, 2)).board
    // eaten: rows 2-4 x cols 2-5 = 12 squares
    expect(edibleSquares(b)).toHaveLength(30 - 12)
    expect(getMoveIndex(b, idx(1, 1))).toBe(idx(1, 1))
    expect(getMoveIndex(b, idx(3, 4))).toBe(-1)
    expect(getMoveIndex(b, null)).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// Invariant fuzz — positions are always integer partitions (staircase shape)
// ---------------------------------------------------------------------------
describe('chomp invariants under random play', () => {
  it('random legal sequences keep the staircase invariant and end decisively', () => {
    let seed = 0xc40bb1
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >> 17
      seed ^= seed << 5; seed >>>= 0
      return seed / 0xffffffff
    }
    for (let trial = 0; trial < 200; trial++) {
      let board = fresh()
      let guard = 0
      let someoneAtePoison = false
      while (!someoneAtePoison && guard++ < 40) {
        const options = edibleSquares(board)
        const pick = options[Math.floor(rand() * options.length)]
        const res = applyChompMove(board, pick)
        expect(res).not.toBeNull()
        board = res.board
        if (res.atePoison) someoneAtePoison = true
        // Staircase invariant: if (r,c) is chocolate then everything
        // above-left ((r2<=r, c2<=c)) is chocolate too.
        for (let r = 0; r < CHOMP_ROWS; r++) {
          for (let c = 0; c < CHOMP_COLS; c++) {
            if (board[idx(r, c)] !== EATEN) {
              for (let r2 = 0; r2 <= r; r2++) {
                for (let c2 = 0; c2 <= c; c2++) {
                  expect(board[idx(r2, c2)]).not.toBe(EATEN)
                }
              }
            }
          }
        }
      }
      expect(someoneAtePoison).toBe(true) // every playout ends in a poison bite
    }
  })
})
