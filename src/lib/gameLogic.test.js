import { describe, it, expect } from 'vitest'
import { getWinner, normalizeBoard, generateGameId } from './gameLogic'

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

describe('getWinner', () => {
  it('returns null for an empty board', () => {
    expect(getWinner(Array(9).fill(''))).toBeNull()
  })

  it('returns null for an in-progress board with no winning line', () => {
    const board = ['X', '', '', '', 'O', '', '', '', '']
    expect(getWinner(board)).toBeNull()
  })

  it('detects all 8 winning lines for X', () => {
    WINNING_LINES.forEach(line => {
      const board = Array(9).fill('')
      line.forEach(i => { board[i] = 'X' })
      expect(getWinner(board)).toEqual({ winner: 'X', line })
    })
  })

  it('detects an O win', () => {
    const board = Array(9).fill('')
    ;[3, 4, 5].forEach(i => { board[i] = 'O' })
    expect(getWinner(board)).toEqual({ winner: 'O', line: [3, 4, 5] })
  })

  it('returns draw with an empty line array for a full board with no three-in-a-row', () => {
    const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']
    const result = getWinner(board)
    expect(result).toEqual({ winner: 'draw', line: [] })
    expect(Array.isArray(result.line)).toBe(true)
    expect(result.line).toHaveLength(0)
  })

  it('returns the win (not draw) for a full board that contains a winning line', () => {
    // Row 0 all X, rest filled with O/X so board is full
    const board = ['X', 'X', 'X', 'O', 'O', 'X', 'O', 'X', 'O']
    const result = getWinner(board)
    expect(result).toEqual({ winner: 'X', line: [0, 1, 2] })
  })
})

describe('normalizeBoard', () => {
  it('returns a 9-element array of empty strings for null input', () => {
    const board = normalizeBoard(null)
    expect(board).toHaveLength(9)
    expect(board.every(c => c === '')).toBe(true)
  })

  it('returns a 9-element array of empty strings for undefined input', () => {
    const board = normalizeBoard(undefined)
    expect(board).toHaveLength(9)
    expect(board.every(c => c === '')).toBe(true)
  })

  it('passes through a 9-element array unchanged', () => {
    const arr = ['X', 'O', '', '', '', '', '', '', '']
    expect(normalizeBoard(arr)).toEqual(arr)
  })

  it('converts a Firebase-style numeric-keyed object to a 9-element array', () => {
    const obj = { '0': 'X', '4': 'O' }
    const board = normalizeBoard(obj)
    expect(board).toHaveLength(9)
    expect(board[0]).toBe('X')
    expect(board[4]).toBe('O')
    expect(board[1]).toBe('')
    expect(board[8]).toBe('')
  })

  it('fills missing indices with empty string (sparse input)', () => {
    const sparse = { '0': 'X', '8': 'O' }
    const board = normalizeBoard(sparse)
    expect(board).toHaveLength(9)
    expect(board[0]).toBe('X')
    expect(board[8]).toBe('O')
    for (let i = 1; i <= 7; i++) {
      expect(board[i]).toBe('')
    }
  })

  it('converts null or undefined values inside the input to empty string', () => {
    const arr = ['X', null, undefined, 'O', '', '', '', '', '']
    const board = normalizeBoard(arr)
    expect(board[0]).toBe('X')
    expect(board[1]).toBe('')
    expect(board[2]).toBe('')
    expect(board[3]).toBe('O')
  })

  it('drops entries with index >= size', () => {
    const obj = { '9': 'X' }
    const board = normalizeBoard(obj)
    expect(board).toHaveLength(9)
    expect(board.every(c => c === '')).toBe(true)
  })

  it('respects the size parameter: normalizeBoard(null, 42) has length 42', () => {
    expect(normalizeBoard(null, 42)).toHaveLength(42)
  })

  it('respects the size parameter: an entry at index 41 lands at position 41', () => {
    const board = normalizeBoard({ '41': 'X' }, 42)
    expect(board).toHaveLength(42)
    expect(board[41]).toBe('X')
    expect(board[40]).toBe('')
  })

  it('pads a shorter-than-size array with empty strings to exactly size elements', () => {
    const short = ['X', 'O']
    const board = normalizeBoard(short)
    expect(board).toHaveLength(9)
    expect(board[0]).toBe('X')
    expect(board[1]).toBe('O')
    for (let i = 2; i < 9; i++) {
      expect(board[i]).toBe('')
    }
  })
})

describe('generateGameId', () => {
  it('returns a 6-character uppercase alphanumeric string', () => {
    const id = generateGameId()
    expect(id).toMatch(/^[A-Z0-9]{6}$/)
  })

  it('returns a different id on each call', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateGameId()))
    expect(ids.size).toBeGreaterThan(1)
  })
})
