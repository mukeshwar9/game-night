import { describe, it, expect } from 'vitest'
import {
  columnLetter, joinLabel, coordLabel, cellLabel, countLabel,
  quartoPieceLabel, mineCellLabel, directionLabel,
} from './a11yLabels'

describe('columnLetter', () => {
  it('maps 0-based columns to letters', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(3)).toBe('D')
    expect(columnLetter(25)).toBe('Z')
  })
  it('falls back to a 1-based number past Z', () => {
    expect(columnLetter(26)).toBe('27')
  })
})

describe('joinLabel', () => {
  it('drops falsy parts and flattens arrays', () => {
    expect(joinLabel('Row 1', null, ['X', false, 'last move'], '', undefined)).toBe('Row 1, X, last move')
  })
  it('keeps 0 (a real count)', () => {
    expect(joinLabel('Pit 1', 0)).toBe('Pit 1, 0')
  })
})

describe('coordLabel', () => {
  it('is 1-based row/column by default', () => {
    expect(coordLabel({ row: 2, col: 3 })).toBe('Row 3, column 4')
  })
  it('uses column letter + row number with letters: true', () => {
    expect(coordLabel({ row: 2, col: 3, letters: true })).toBe('D3')
  })
})

describe('cellLabel', () => {
  it('names an empty cell', () => {
    expect(cellLabel({ row: 0, col: 0, occupant: '' })).toBe('Row 1, column 1, empty')
  })
  it('names the occupant and trailing flags', () => {
    expect(cellLabel({ row: 2, col: 3, occupant: 'X', extra: ['last move', null, 'winning line'] }))
      .toBe('Row 3, column 4, X, last move, winning line')
  })
  it('accepts a single extra string', () => {
    expect(cellLabel({ row: 0, col: 1, occupant: 'O', extra: 'last move' })).toBe('Row 1, column 2, O, last move')
  })
  it('supports letter coordinates', () => {
    expect(cellLabel({ row: 4, col: 2, occupant: 'O', letters: true })).toBe('C5, O')
  })
  it('falls back to a 1-based cell index when no row/col is given', () => {
    expect(cellLabel({ index: 4, occupant: null })).toBe('Cell 5, empty')
  })
  it('allows a custom empty word', () => {
    expect(cellLabel({ row: 0, col: 0, occupant: null, empty: 'face down' })).toBe('Row 1, column 1, face down')
  })
  it('treats row/col 0 as present (not falsy)', () => {
    expect(cellLabel({ row: 0, col: 0, index: 9, occupant: 'X' })).toBe('Row 1, column 1, X')
  })
})

describe('countLabel', () => {
  it('pluralises', () => {
    expect(countLabel(0, 'seed')).toBe('0 seeds')
    expect(countLabel(1, 'seed')).toBe('1 seed')
    expect(countLabel(4, 'seed')).toBe('4 seeds')
    expect(countLabel(2, 'box', 'boxes')).toBe('2 boxes')
  })
})

describe('quartoPieceLabel', () => {
  it('describes all four attributes', () => {
    expect(quartoPieceLabel(0)).toBe('short square hollow light piece')
    expect(quartoPieceLabel(15)).toBe('tall round solid dark piece')
    expect(quartoPieceLabel(5)).toBe('tall square solid light piece')
  })
  it('gives distinct names to all 16 pieces', () => {
    const names = new Set(Array.from({ length: 16 }, (_, v) => quartoPieceLabel(v)))
    expect(names.size).toBe(16)
  })
  it('is empty for an empty cell', () => {
    expect(quartoPieceLabel('')).toBe('')
    expect(quartoPieceLabel(null)).toBe('')
  })
})

describe('mineCellLabel', () => {
  const at = { row: 1, col: 2 }
  it('hides the contents of an unrevealed cell', () => {
    expect(mineCellLabel({ ...at })).toBe('Row 2, column 3, hidden')
  })
  it('names a flag', () => {
    expect(mineCellLabel({ ...at, flagged: true })).toBe('Row 2, column 3, flagged')
  })
  it('reads the adjacent-mine number of a revealed cell', () => {
    expect(mineCellLabel({ ...at, revealed: true, count: 1 })).toBe('Row 2, column 3, 1 adjacent mine')
    expect(mineCellLabel({ ...at, revealed: true, count: 3 })).toBe('Row 2, column 3, 3 adjacent mines')
  })
  it('reads a revealed zero as clear', () => {
    expect(mineCellLabel({ ...at, revealed: true, count: 0 })).toBe('Row 2, column 3, clear')
  })
  it('reveals mines only when told to', () => {
    expect(mineCellLabel({ ...at, mine: true })).toBe('Row 2, column 3, mine')
    expect(mineCellLabel({ ...at, mine: true, flagged: true })).toBe('Row 2, column 3, flagged, mine')
    expect(mineCellLabel({ ...at, mine: true, fatal: true })).toBe('Row 2, column 3, mine, detonated')
  })
})

describe('directionLabel', () => {
  it('names axis directions (screen y grows downward)', () => {
    expect(directionLabel(0, -1)).toBe('up')
    expect(directionLabel(0, 1)).toBe('down')
    expect(directionLabel(-1, 0)).toBe('left')
    expect(directionLabel(1, 0)).toBe('right')
  })
  it('combines diagonals', () => {
    expect(directionLabel(Math.SQRT1_2, -Math.SQRT1_2)).toBe('up-right')
  })
})
