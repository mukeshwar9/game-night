import { describe, it, expect } from 'vitest'
import {
  REVERSI_SIZE,
  REVERSI_DIM,
  reversiInitialBoard,
  flippedBy,
  legalMoves,
  hasAnyMove,
  applyReversiMove,
  getReversiWinner,
} from './reversiLogic'

const idx = (row, col) => row * REVERSI_DIM + col
const emptyBoard = () => Array(REVERSI_SIZE).fill('')

// ---------------------------------------------------------------------------
// reversiInitialBoard
// ---------------------------------------------------------------------------
describe('reversiInitialBoard', () => {
  it('has 64 cells', () => {
    expect(reversiInitialBoard()).toHaveLength(REVERSI_SIZE)
  })

  it('places the standard Othello opening (X on 27/36, O on 28/35)', () => {
    const board = reversiInitialBoard()
    expect(board[27]).toBe('X')
    expect(board[36]).toBe('X')
    expect(board[28]).toBe('O')
    expect(board[35]).toBe('O')
  })

  it('has exactly four discs, two each colour', () => {
    const board = reversiInitialBoard()
    expect(board.filter(c => c === 'X')).toHaveLength(2)
    expect(board.filter(c => c === 'O')).toHaveLength(2)
    expect(board.filter(c => c === '')).toHaveLength(60)
  })
})

// ---------------------------------------------------------------------------
// flippedBy
// ---------------------------------------------------------------------------
describe('flippedBy', () => {
  it('flips a single bracketed disc horizontally', () => {
    // row 3: X at col2, O at col3 — play X at col4 → flips col3
    const board = emptyBoard()
    board[idx(3, 2)] = 'X'
    board[idx(3, 3)] = 'O'
    const flips = flippedBy(board, idx(3, 4), 'X')
    expect(flips).toEqual([idx(3, 3)])
  })

  it('flips multiple discs in one direction', () => {
    // row 3: X at col0, O at col1, O at col2 — play X at col3 → flips col1 & col2
    const board = emptyBoard()
    board[idx(3, 0)] = 'X'
    board[idx(3, 1)] = 'O'
    board[idx(3, 2)] = 'O'
    const flips = flippedBy(board, idx(3, 3), 'X').sort((a, b) => a - b)
    expect(flips).toEqual([idx(3, 1), idx(3, 2)])
  })

  it('flips in multiple directions from one placement', () => {
    // center placement bracketing both horizontally and vertically
    const board = emptyBoard()
    // horizontal: X at (4,2), O at (4,3), play X at (4,4)
    board[idx(4, 2)] = 'X'
    board[idx(4, 3)] = 'O'
    // vertical: O at (3,4), X at (2,4)
    board[idx(3, 4)] = 'O'
    board[idx(2, 4)] = 'X'
    const flips = flippedBy(board, idx(4, 4), 'X').sort((a, b) => a - b)
    expect(flips).toContain(idx(4, 3)) // horizontal flip
    expect(flips).toContain(idx(3, 4)) // vertical flip
    expect(flips).toHaveLength(2)
  })

  it('flips on a diagonal', () => {
    // X at (2,2), O at (3,3), play X at (4,4) → flips (3,3)
    const board = emptyBoard()
    board[idx(2, 2)] = 'X'
    board[idx(3, 3)] = 'O'
    const flips = flippedBy(board, idx(4, 4), 'X')
    expect(flips).toEqual([idx(3, 3)])
  })

  it('returns [] when the cell is already occupied', () => {
    const board = reversiInitialBoard()
    expect(flippedBy(board, 27, 'X')).toEqual([])
  })

  it('returns [] when nothing is flanked (adjacent own colour only)', () => {
    // X at (3,2), play X at (3,3): no opponent between → illegal
    const board = emptyBoard()
    board[idx(3, 2)] = 'X'
    expect(flippedBy(board, idx(3, 3), 'X')).toEqual([])
  })

  it('returns [] when bracket is not closed (no own disc terminating the run)', () => {
    // O at (3,1), O at (3,2), then empty — play X at (3,0) → bracket never closes
    const board = emptyBoard()
    board[idx(3, 1)] = 'O'
    board[idx(3, 2)] = 'O'
    const flips = flippedBy(board, idx(3, 0), 'X')
    expect(flips).toEqual([])
  })

  it('does not wrap around the row edge', () => {
    // O at (3,0) (col 0), X at (3,1) — play X at "(3,-1)" i.e. (2,7) is a
    // different row. Verify a move at left edge does not read the prior row.
    const board = emptyBoard()
    board[idx(3, 7)] = 'O' // far right
    board[idx(3, 6)] = 'X'
    // Place X at (4,0): scanning west from col 0 immediately leaves the row.
    // There is nothing to flip → illegal.
    expect(flippedBy(board, idx(4, 0), 'X')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// legalMoves / hasAnyMove
// ---------------------------------------------------------------------------
describe('legalMoves & hasAnyMove', () => {
  it('opening position yields the four standard first moves for X', () => {
    const board = reversiInitialBoard()
    const moves = legalMoves(board, 'X').sort((a, b) => a - b)
    // Classic first-move squares for the player on X here: 20, 29, 34, 43
    expect(moves).toEqual([20, 29, 34, 43])
  })

  it('opening position yields four moves for O too', () => {
    const board = reversiInitialBoard()
    const moves = legalMoves(board, 'O')
    expect(moves).toHaveLength(4)
  })

  it('hasAnyMove true on opening', () => {
    const board = reversiInitialBoard()
    expect(hasAnyMove(board, 'X')).toBe(true)
    expect(hasAnyMove(board, 'O')).toBe(true)
  })

  it('hasAnyMove false on an empty board (no discs to flank)', () => {
    expect(hasAnyMove(emptyBoard(), 'X')).toBe(false)
  })

  it('hasAnyMove false when a colour is wiped out / cannot flank', () => {
    // Board full of X except one empty cell, no O anywhere → no flanks possible
    const board = Array(REVERSI_SIZE).fill('X')
    board[0] = ''
    expect(hasAnyMove(board, 'X')).toBe(false)
    expect(hasAnyMove(board, 'O')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applyReversiMove
// ---------------------------------------------------------------------------
describe('applyReversiMove', () => {
  it('returns null for out-of-range index', () => {
    expect(applyReversiMove(reversiInitialBoard(), -1, 'X')).toBeNull()
    expect(applyReversiMove(reversiInitialBoard(), REVERSI_SIZE, 'X')).toBeNull()
  })

  it('returns null when the cell is occupied', () => {
    expect(applyReversiMove(reversiInitialBoard(), 27, 'X')).toBeNull()
  })

  it('returns null for a non-flanking (illegal) move', () => {
    // empty corner with nothing adjacent
    expect(applyReversiMove(reversiInitialBoard(), 0, 'X')).toBeNull()
  })

  it('places the disc and flips bracketed discs', () => {
    // X plays at 20 in opening: brackets O at 28 (between 20 and 36)
    const board = reversiInitialBoard()
    const result = applyReversiMove(board, 20, 'X')
    expect(result).not.toBeNull()
    expect(result.board[20]).toBe('X')
    expect(result.board[28]).toBe('X') // flipped from O
  })

  it('does not mutate the input board', () => {
    const board = reversiInitialBoard()
    const copy = [...board]
    applyReversiMove(board, 20, 'X')
    expect(board).toEqual(copy)
  })

  it('total disc count increases by exactly 1 (the placed disc; flips only recolour)', () => {
    const board = reversiInitialBoard()
    const before = board.filter(c => c !== '').length
    const result = applyReversiMove(board, 20, 'X')
    const after = result.board.filter(c => c !== '').length
    expect(after).toBe(before + 1)
  })

  it("placing mover's disc count grows by 1 + number of flips", () => {
    const board = reversiInitialBoard()
    const beforeX = board.filter(c => c === 'X').length
    const flips = flippedBy(board, 20, 'X').length
    const result = applyReversiMove(board, 20, 'X')
    const afterX = result.board.filter(c => c === 'X').length
    expect(afterX).toBe(beforeX + 1 + flips)
  })
})

// ---------------------------------------------------------------------------
// getReversiWinner — including the no-move pass scenario
// ---------------------------------------------------------------------------
describe('getReversiWinner', () => {
  it('returns null while the game is still playable', () => {
    expect(getReversiWinner(reversiInitialBoard())).toBeNull()
  })

  it('declares X winner with more discs on a full board', () => {
    const board = Array(REVERSI_SIZE).fill('X')
    board[0] = 'O'
    expect(getReversiWinner(board)).toEqual({ winner: 'X' })
  })

  it('declares O winner with more discs on a full board', () => {
    const board = Array(REVERSI_SIZE).fill('O')
    board[0] = 'X'
    expect(getReversiWinner(board)).toEqual({ winner: 'O' })
  })

  it('declares a draw on a 32/32 full board', () => {
    const board = Array(REVERSI_SIZE).fill('')
    for (let i = 0; i < REVERSI_SIZE; i++) board[i] = i < 32 ? 'X' : 'O'
    expect(getReversiWinner(board)).toEqual({ winner: 'draw' })
  })

  it('declares a winner when the board is not full but neither side can move', () => {
    // Board full of X except one empty corner, no O anywhere: neither side
    // can flank, so the game is over and X wins by disc count.
    const board = Array(REVERSI_SIZE).fill('X')
    board[0] = ''
    expect(hasAnyMove(board, 'X')).toBe(false)
    expect(hasAnyMove(board, 'O')).toBe(false)
    expect(getReversiWinner(board)).toEqual({ winner: 'X' })
  })
})

// ---------------------------------------------------------------------------
// Pass mechanic + full-game smoke: registry-style turn flipping
// ---------------------------------------------------------------------------
describe('pass mechanic and turn flow', () => {
  it('opponent passes when they have no legal move; mover keeps the turn', () => {
    // Construct a position where after X moves, O has no legal move.
    // Simplest: a board where only X can ever flank.
    const board = Array(REVERSI_SIZE).fill('X')
    // Two empty cells in a row with an X to their left, O nowhere → O cannot move.
    board[idx(0, 6)] = 'O'
    board[idx(0, 7)] = '' // empty
    board[idx(0, 5)] = 'X'
    // X playing at (0,7) flanks the O at (0,6).
    const applied = applyReversiMove(board, idx(0, 7), 'X')
    expect(applied).not.toBeNull()
    // After the move, decide next turn the way the registry will:
    const opp = 'O'
    const nextTurn = hasAnyMove(applied.board, opp) ? opp : 'X'
    expect(nextTurn).toBe('X') // O has no move → X keeps the turn
  })

  it('a simulated game terminates with a valid winner', () => {
    let board = reversiInitialBoard()
    let turn = 'X'
    let guard = 0
    let winner = null

    while (guard++ < 200) {
      if (!board.includes('') ||
          (!hasAnyMove(board, 'X') && !hasAnyMove(board, 'O'))) {
        winner = getReversiWinner(board)
        break
      }
      if (!hasAnyMove(board, turn)) {
        turn = turn === 'X' ? 'O' : 'X' // pass
        continue
      }
      const moves = legalMoves(board, turn)
      const applied = applyReversiMove(board, moves[0], turn)
      board = applied.board
      // flip to opponent unless opponent must pass
      const opp = turn === 'X' ? 'O' : 'X'
      turn = hasAnyMove(board, opp) ? opp : turn
    }

    expect(winner).not.toBeNull()
    expect(['X', 'O', 'draw']).toContain(winner.winner)
    // every cell is either filled or the game ended on mutual no-move
    const filled = board.filter(c => c !== '').length
    expect(filled).toBeGreaterThanOrEqual(4)
  })
})
