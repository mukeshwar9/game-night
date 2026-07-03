import { describe, it, expect } from 'vitest'
import {
  applyUltimateMove, getUltimateWinner, miniBoardWinner, legalCells,
  normalizeUWon, UT_CELL_COUNT, UT_BOARD_COUNT,
} from './ultimateTttLogic'

const empty = () => Array(UT_CELL_COUNT).fill('')
const noWon = () => Array(UT_BOARD_COUNT).fill('')

describe('miniBoardWinner', () => {
  it('detects a row win', () => {
    expect(miniBoardWinner(['X', 'X', 'X', '', '', '', '', '', ''])).toBe('X')
  })
  it('detects a diagonal win', () => {
    expect(miniBoardWinner(['O', '', '', '', 'O', '', '', '', 'O'])).toBe('O')
  })
  it('returns null with no line', () => {
    expect(miniBoardWinner(['X', 'O', 'X', '', '', '', '', '', ''])).toBeNull()
  })
})

describe('applyUltimateMove', () => {
  it('rejects an occupied cell', () => {
    const b = empty(); b[0] = 'X'
    expect(applyUltimateMove(b, noWon(), -1, 0, 'O')).toBeNull()
  })

  it('rejects a move outside the active board', () => {
    // active board 0, try to play in board 1 (index 9)
    expect(applyUltimateMove(empty(), noWon(), 0, 9, 'X')).toBeNull()
  })

  it('allows any board when active is -1', () => {
    const res = applyUltimateMove(empty(), noWon(), -1, 40, 'X')
    expect(res).not.toBeNull()
    expect(res.board[40]).toBe('X')
  })

  it('sends the opponent to the board matching the played cell', () => {
    // play cell index 5 → cell-in-mini = 5 → opponent must play board 5
    const res = applyUltimateMove(empty(), noWon(), -1, 5, 'X')
    expect(res.activeBoard).toBe(5)
  })

  it('frees the active board when the dictated board is already decided', () => {
    const uWon = noWon(); uWon[3] = 'X'          // board 3 already won
    // play a cell whose position is 3 (e.g. index 3 in board 0) → target board 3 decided → free
    const res = applyUltimateMove(empty(), uWon, 0, 3, 'O')
    expect(res.activeBoard).toBe(-1)
  })

  it('marks a miniboard won when 3-in-a-row completes', () => {
    const b = empty()
    b[0] = 'X'; b[1] = 'X'                        // board 0 cells 0,1
    const res = applyUltimateMove(b, noWon(), 0, 2, 'X')  // complete board 0
    expect(res.uWon[0]).toBe('X')
  })

  it('marks a miniboard drawn when full with no winner', () => {
    // Fill board 0 to a draw except last cell, then place it.
    const b = empty()
    const cells = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', '']
    for (let i = 0; i < 9; i++) b[i] = cells[i]
    const res = applyUltimateMove(b, noWon(), 0, 8, 'X')
    expect(res.uWon[0]).toBe('D')
  })
})

describe('getUltimateWinner', () => {
  it('returns null while boards remain', () => {
    expect(getUltimateWinner(noWon())).toBeNull()
  })
  it('detects a meta line', () => {
    const uWon = noWon(); uWon[0] = uWon[1] = uWon[2] = 'X'
    expect(getUltimateWinner(uWon)).toEqual({ winner: 'X', line: [0, 1, 2] })
  })
  it('does not count a drawn board toward a line', () => {
    const uWon = noWon(); uWon[0] = 'X'; uWon[1] = 'D'; uWon[2] = 'X'
    expect(getUltimateWinner(uWon)).toBeNull()
  })
  it('awards the majority when all boards decided with no line', () => {
    const uWon = ['X', 'O', 'X', 'O', 'X', 'D', 'O', 'D', 'D']  // X:3 O:3
    expect(getUltimateWinner(uWon).winner).toBe('draw')
    const uWon2 = ['X', 'O', 'X', 'O', 'X', 'D', 'D', 'D', 'D']  // X:3 O:2
    expect(getUltimateWinner(uWon2).winner).toBe('X')
  })
})

describe('legalCells / normalizeUWon', () => {
  it('restricts to the active board', () => {
    const cells = legalCells(empty(), noWon(), 2)
    expect(cells.every(i => Math.floor(i / 9) === 2)).toBe(true)
    expect(cells).toHaveLength(9)
  })
  it('excludes decided boards when free', () => {
    const uWon = noWon(); uWon[0] = 'X'
    const cells = legalCells(empty(), uWon, -1)
    expect(cells.some(i => Math.floor(i / 9) === 0)).toBe(false)
    expect(cells).toHaveLength(72)
  })
  it('normalizes objects and arrays', () => {
    expect(normalizeUWon({ 0: 'X', 2: 'O' })).toEqual(['X', '', 'O', '', '', '', '', '', ''])
    expect(normalizeUWon(null)).toHaveLength(9)
  })
})
