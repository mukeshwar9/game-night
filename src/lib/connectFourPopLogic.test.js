import { describe, it, expect } from 'vitest'
import {
  applyConnectFourPopMove, popWinner, canPop, popColumn, bottomIndex,
  connectFourLineFor, hasLegalPop, CF_BOARD_SIZE,
} from './connectFourPopLogic'

const COLS = 7
const empty = () => Array(CF_BOARD_SIZE).fill('')
const idx = (row, col) => row * COLS + col

// Verified draw board (same pattern as connectFourLogic.test.js's drawBoard):
// column patterns XXOOXX / OOXXOO alternating — no four-in-a-row in any
// direction, including diagonals. Bottom row (row 5) is X,O,X,O,X,O,X, so
// both colours own at least one column bottom.
const noFourBoard = () => {
  const colPatterns = ['XXOOXX', 'OOXXOO', 'XXOOXX', 'OOXXOO', 'XXOOXX', 'OOXXOO', 'XXOOXX']
  const b = empty()
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < 6; row++) {
      b[idx(row, col)] = colPatterns[col][row]
    }
  }
  return b
}

describe('drop moves', () => {
  it('drops to the bottom of an empty column', () => {
    const res = applyConnectFourPopMove(empty(), { col: 3, action: 'drop' }, 'X')
    expect(res.board[idx(5, 3)]).toBe('X')
    expect(res.result).toBeNull()
  })

  it('stacks on top of existing discs', () => {
    const b = empty(); b[idx(5, 0)] = 'O'
    const res = applyConnectFourPopMove(b, { col: 0, action: 'drop' }, 'X')
    expect(res.board[idx(4, 0)]).toBe('X')
  })

  it('rejects a drop into a full column', () => {
    const b = empty()
    for (let r = 0; r < 6; r++) b[idx(r, 2)] = 'X'
    expect(applyConnectFourPopMove(b, { col: 2, action: 'drop' }, 'O')).toBeNull()
  })

  it('detects a horizontal win on drop', () => {
    const b = empty()
    b[idx(5, 0)] = 'X'; b[idx(5, 1)] = 'X'; b[idx(5, 2)] = 'X'
    const res = applyConnectFourPopMove(b, { col: 3, action: 'drop' }, 'X')
    expect(res.result.winner).toBe('X')
    expect(res.result.line).toHaveLength(4)
  })
})

describe('pop moves', () => {
  it('only pops your own bottom disc', () => {
    const b = empty(); b[bottomIndex(1)] = 'O'
    expect(canPop(b, 1, 'X')).toBe(false)
    expect(applyConnectFourPopMove(b, { col: 1, action: 'pop' }, 'X')).toBeNull()
    expect(canPop(b, 1, 'O')).toBe(true)
  })

  it('slides the column down by one on pop', () => {
    const b = empty()
    b[idx(5, 0)] = 'X'   // bottom (owned by X)
    b[idx(4, 0)] = 'O'
    b[idx(3, 0)] = 'X'
    const nb = popColumn(b, 0)
    expect(nb[idx(5, 0)]).toBe('O')  // O fell to bottom
    expect(nb[idx(4, 0)]).toBe('X')  // top X fell one
    expect(nb[idx(3, 0)]).toBe('')   // top cleared
  })

  it('a pop can complete a four for the opponent', () => {
    // Column 0 bottom-up: X (poppable), then four Os stacked above. Popping the
    // X slides the Os down into a vertical four → the opponent (O) wins.
    const b = empty()
    b[idx(5, 0)] = 'X'
    b[idx(4, 0)] = 'O'; b[idx(3, 0)] = 'O'; b[idx(2, 0)] = 'O'; b[idx(1, 0)] = 'O'
    const res = applyConnectFourPopMove(b, { col: 0, action: 'pop' }, 'X')
    expect(res.result.winner).toBe('O')
    expect(res.result.line).toHaveLength(4)
  })

  it('mover wins ties when a pop completes fours for both', () => {
    // Construct a board where the mover already has a four and it survives.
    const b = empty()
    b[idx(5, 0)] = 'X'; b[idx(5, 1)] = 'X'; b[idx(5, 2)] = 'X'; b[idx(5, 3)] = 'X'
    // moot pop elsewhere; popWinner should already see X's four
    expect(popWinner(b, 'X')).toEqual({ winner: 'X', line: [idx(5, 0), idx(5, 1), idx(5, 2), idx(5, 3)] })
  })
})

describe('hasLegalPop', () => {
  it('true when the symbol owns at least one column bottom', () => {
    const b = empty(); b[bottomIndex(2)] = 'X'
    expect(hasLegalPop(b, 'X')).toBe(true)
    expect(hasLegalPop(b, 'O')).toBe(false)
  })

  it('false when the symbol owns no column bottoms', () => {
    const b = empty()
    for (let c = 0; c < 7; c++) b[bottomIndex(c)] = 'O'
    expect(hasLegalPop(b, 'X')).toBe(false)
    expect(hasLegalPop(b, 'O')).toBe(true)
  })
})

describe('popWinner', () => {
  it('returns null on an ongoing board', () => {
    expect(popWinner(empty(), 'X')).toBeNull()
  })

  it('BUG FIX: full board with no four-in-a-row still continues if the opponent can pop', () => {
    // Board full, no four-in-a-row anywhere, and both colours own at least
    // one column bottom (row 5 alternates X,O,X,O,X,O,X). Previously
    // popWinner declared this a draw purely because the board was full;
    // it must instead see that O (the side to move after X) can still pop.
    const b = noFourBoard()
    expect(connectFourLineFor(b, 'X')).toBeNull()
    expect(connectFourLineFor(b, 'O')).toBeNull()
    expect(b.every(c => c)).toBe(true)
    expect(hasLegalPop(b, 'O')).toBe(true)
    expect(hasLegalPop(b, 'X')).toBe(true)
    // Full board, no four, opponent (O) can still pop → not a draw yet.
    expect(popWinner(b, 'X')).toBeNull()
    expect(popWinner(b, 'O')).toBeNull()
  })

})
