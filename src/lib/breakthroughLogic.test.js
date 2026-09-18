import { describe, it, expect } from 'vitest'
import {
  BT_COLS,
  BT_ROWS,
  BT_CELL_COUNT,
  BT_GOAL_ROW,
  rowColOf,
  indexOf,
  normalizeBtBoard,
  INITIAL_BREAKTHROUGH,
  stepRow,
  legalMoves,
  hasAnyBreakthroughMove,
  countPawns,
  applyBreakthroughMove,
  getBreakthroughWinner,
} from './breakthroughLogic'

// ---------------------------------------------------------------------------
// Structure / setup
// ---------------------------------------------------------------------------
describe('structure', () => {
  it('is an 8x8 board with 32 starting pawns', () => {
    expect(BT_COLS).toBe(8)
    expect(BT_ROWS).toBe(8)
    expect(BT_CELL_COUNT).toBe(64)
    const b = INITIAL_BREAKTHROUGH()
    expect(countPawns(b, 'X')).toBe(16)
    expect(countPawns(b, 'O')).toBe(16)
    expect(b.filter(v => v === '')).toHaveLength(32)
  })

  it('X starts on the bottom two rows, O on the top two', () => {
    const b = INITIAL_BREAKTHROUGH()
    for (let c = 0; c < BT_COLS; c++) {
      expect(b[indexOf(0, c)]).toBe('O')
      expect(b[indexOf(1, c)]).toBe('O')
      expect(b[indexOf(BT_ROWS - 2, c)]).toBe('X')
      expect(b[indexOf(BT_ROWS - 1, c)]).toBe('X')
    }
    expect(b[indexOf(3, 3)]).toBe('')
  })

  it('goal rows are correct per symbol', () => {
    expect(BT_GOAL_ROW.X).toBe(0)
    expect(BT_GOAL_ROW.O).toBe(7)
  })

  it('stepRow: X moves up, O moves down', () => {
    expect(stepRow('X')).toBe(-1)
    expect(stepRow('O')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// normalizeBtBoard
// ---------------------------------------------------------------------------
describe('normalizeBtBoard', () => {
  it('accepts sparse arrays and numeric-keyed objects', () => {
    const sparse = []
    sparse[5] = 'X'
    expect(normalizeBtBoard(sparse)[5]).toBe('X')
    expect(normalizeBtBoard(sparse)).toHaveLength(64)
    const obj = { 9: 'O', 62: 'X' }
    const n = normalizeBtBoard(obj)
    expect(n[9]).toBe('O')
    expect(n[62]).toBe('X')
    expect(n[0]).toBe('')
  })

  it('drops junk values and out-of-range keys', () => {
    const n = normalizeBtBoard({ 0: 'x', 1: 'Z', 999: 'X', 2: 'O' })
    expect(n[0]).toBe('')
    expect(n[1]).toBe('')
    expect(n[2]).toBe('O')
    expect(n).toHaveLength(64)
  })

  it('null gives an empty board', () => {
    expect(normalizeBtBoard(null).every(v => v === '')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// legalMoves
// ---------------------------------------------------------------------------
describe('legalMoves', () => {
  it('from the initial position X has 22 moves (6 straight via edge columns + 16 diagonals)',
    () => {
      const moves = legalMoves(INITIAL_BREAKTHROUGH(), 'X')
      // 8 pawns: edge pawns (cols 0,7) get 1 diagonal each + 1 straight = 2;
      // middle pawns get 2 diagonals + 1 straight = 3. 2*2 + 6*3 = 22.
      expect(moves).toHaveLength(22)
    })

  it('all initial X moves stay in the bottom three rows', () => {
    const b = INITIAL_BREAKTHROUGH()
    for (const m of legalMoves(b, 'X')) {
      const [r] = rowColOf(m.to)
      expect(r).toBeGreaterThanOrEqual(BT_ROWS - 3)
    }
  })

  it('diagonal forward into empty is legal; backward/sideways never appear',
    () => {
      const b = Array(64).fill('')
      b[indexOf(4, 4)] = 'X'
      const tos = legalMoves(b, 'X').map(m => m.to)
      expect(tos).toContain(indexOf(3, 3))
      expect(tos).toContain(indexOf(3, 4))
      expect(tos).toContain(indexOf(3, 5))
      expect(tos).toHaveLength(3)
    })

  it('straight forward is blocked by any pawn; diagonals capture O only', () => {
    const b = Array(64).fill('')
    b[indexOf(4, 4)] = 'X'
    b[indexOf(3, 4)] = 'O' // blocks straight
    b[indexOf(3, 5)] = 'X' // own pawn blocks diagonal
    const tos = legalMoves(b, 'X').map(m => m.to)
    expect(tos).not.toContain(indexOf(3, 4))
    expect(tos).not.toContain(indexOf(3, 5))
    expect(tos).toContain(indexOf(3, 3)) // diagonal empty OK
  })

  it('edge pawn has no off-board diagonals', () => {
    const b = Array(64).fill('')
    b[indexOf(4, 0)] = 'X'
    const tos = legalMoves(b, 'X').map(m => m.to)
    expect(tos).toHaveLength(2)
    expect(tos).toContain(indexOf(3, 0))
    expect(tos).toContain(indexOf(3, 1))
  })

  it('O moves downward (mirror of X)', () => {
    const b = Array(64).fill('')
    b[indexOf(3, 4)] = 'O'
    const tos = legalMoves(b, 'O').map(m => m.to)
    expect(tos).toContain(indexOf(4, 3))
    expect(tos).toContain(indexOf(4, 4))
    expect(tos).toContain(indexOf(4, 5))
  })

  it('hasAnyBreakthroughMove matches legalMoves', () => {
    const b = Array(64).fill('')
    b[indexOf(0, 0)] = 'X' // on the goal row already — can't move further
    expect(hasAnyBreakthroughMove(b, 'X')).toBe(false)
    expect(hasAnyBreakthroughMove(INITIAL_BREAKTHROUGH(), 'O')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyBreakthroughMove
// ---------------------------------------------------------------------------
describe('applyBreakthroughMove', () => {
  it('moves a pawn and vacates the source', () => {
    const b = INITIAL_BREAKTHROUGH()
    const res = applyBreakthroughMove(b, { from: indexOf(6, 3), to: indexOf(5, 3) }, 'X')
    expect(res.board[indexOf(6, 3)]).toBe('')
    expect(res.board[indexOf(5, 3)]).toBe('X')
  })

  it('captures diagonally, removing the enemy pawn', () => {
    const b = Array(64).fill('')
    b[indexOf(4, 4)] = 'X'
    b[indexOf(3, 3)] = 'O'
    const res = applyBreakthroughMove(b, { from: indexOf(4, 4), to: indexOf(3, 3) }, 'X')
    expect(res.board[indexOf(3, 3)]).toBe('X')
    expect(countPawns(res.board, 'O')).toBe(0)
  })

  it('rejects straight-forward capture attempts', () => {
    const b = Array(64).fill('')
    b[indexOf(4, 4)] = 'X'
    b[indexOf(3, 4)] = 'O'
    expect(applyBreakthroughMove(b, { from: indexOf(4, 4), to: indexOf(3, 4) }, 'X')).toBeNull()
  })

  it('rejects backward and sideways moves', () => {
    const b = Array(64).fill('')
    b[indexOf(4, 4)] = 'X'
    expect(applyBreakthroughMove(b, { from: indexOf(4, 4), to: indexOf(5, 4) }, 'X')).toBeNull()
    expect(applyBreakthroughMove(b, { from: indexOf(4, 4), to: indexOf(4, 5) }, 'X')).toBeNull()
  })

  it('rejects moves not owned by the mover and malformed payloads', () => {
    const b = INITIAL_BREAKTHROUGH()
    expect(applyBreakthroughMove(b, { from: indexOf(1, 0), to: indexOf(2, 0) }, 'X')).toBeNull()
    expect(applyBreakthroughMove(b, { from: indexOf(6, 0) }, 'X')).toBeNull()
    expect(applyBreakthroughMove(b, null, 'X')).toBeNull()
  })

  it('does not mutate the input board', () => {
    const b = INITIAL_BREAKTHROUGH()
    const before = [...b]
    applyBreakthroughMove(b, { from: indexOf(6, 0), to: indexOf(5, 1) }, 'X')
    expect(b).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// getBreakthroughWinner
// ---------------------------------------------------------------------------
describe('getBreakthroughWinner', () => {
  it('null while unresolved', () => {
    expect(getBreakthroughWinner(INITIAL_BREAKTHROUGH(), 'X')).toBeNull()
  })

  it('X pawn on row 0 wins for X', () => {
    const b = Array(64).fill('')
    b[indexOf(0, 2)] = 'X'
    b[indexOf(7, 5)] = 'O'
    expect(getBreakthroughWinner(b, 'X')).toEqual({ winner: 'X' })
  })

  it('O pawn on row 7 wins for O (checked after O moves)', () => {
    const b = Array(64).fill('')
    b[indexOf(7, 2)] = 'O'
    b[indexOf(4, 5)] = 'X' // X mid-board, NOT on its goal row
    expect(getBreakthroughWinner(b, 'O')).toEqual({ winner: 'O' })
    // A stale O-on-goal board also resolves for O when checked after X's
    // move (defensive heal — real play ends on O's own move).
    expect(getBreakthroughWinner(b, 'X')).toEqual({ winner: 'O' })
  })

  it('wiping out all enemy pawns wins', () => {
    const b = Array(64).fill('')
    b[indexOf(3, 3)] = 'X'
    expect(getBreakthroughWinner(b, 'X')).toEqual({ winner: 'X' }) // O has none
  })

  it('a pawn already on its own goal row wins regardless of which side is checked', () => {
    const b = Array(64).fill('')
    b[indexOf(0, 0)] = 'X' // ON X's goal row → X wins
    b[indexOf(5, 5)] = 'O' // O mid-board, NOT on its goal row
    expect(getBreakthroughWinner(b, 'O')).toEqual({ winner: 'X' })
    expect(getBreakthroughWinner(b, 'X')).toEqual({ winner: 'X' })
  })

  it('full random playouts always terminate with a winner (no draws)', () => {
    let seed = 0xbadc0de
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >> 17
      seed ^= seed << 5; seed >>>= 0
      return seed / 0xffffffff
    }
    for (let trial = 0; trial < 60; trial++) {
      let board = INITIAL_BREAKTHROUGH()
      let turn = 'X'
      let guard = 0
      let result = null
      while (!result && guard++ < 200) {
        const moves = legalMoves(board, turn)
        if (!moves.length) {
          result = { winner: turn === 'X' ? 'O' : 'X' } // no-move loss
          break
        }
        const m = moves[Math.floor(rand() * moves.length)]
        board = applyBreakthroughMove(board, m, turn).board
        result = getBreakthroughWinner(board, turn)
        turn = turn === 'X' ? 'O' : 'X'
      }
      expect(result).not.toBeNull()
      expect(['X', 'O']).toContain(result.winner)
      expect(guard).toBeLessThan(200) // pawns only advance — must terminate
    }
  })
})
