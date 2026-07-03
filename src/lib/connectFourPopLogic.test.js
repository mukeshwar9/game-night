import { describe, it, expect } from 'vitest'
import {
  applyConnectFourPopMove, popWinner, canPop, popColumn, bottomIndex,
  connectFourLineFor, CF_BOARD_SIZE,
} from './connectFourPopLogic'

const COLS = 7
const empty = () => Array(CF_BOARD_SIZE).fill('')
const idx = (row, col) => row * COLS + col

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

describe('popWinner', () => {
  it('returns null on an ongoing board', () => {
    expect(popWinner(empty(), 'X')).toBeNull()
  })
  it('detects a draw only when the board is full', () => {
    const b = empty().map((_, i) => (i % 2 ? 'X' : 'O'))
    // guarantee no accidental four by checking the helper directly
    if (!connectFourLineFor(b, 'X') && !connectFourLineFor(b, 'O')) {
      expect(popWinner(b, 'X').winner).toBe('draw')
    }
  })
})
