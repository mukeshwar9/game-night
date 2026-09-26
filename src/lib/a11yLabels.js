// @ts-check
// Accessible names for board cells, pure (no DOM/React). Every *Board.jsx
// builds its cell `aria-label` here so a screen reader hears
// "Row 3, column 4, X, last move" instead of a test ID like
// `gomoku-cell-2-3`. Test IDs live on `data-testid` instead.
//
// Conventions:
// - Rows and columns are 1-based and counted from the top-left, matching
//   what a sighted player sees (no chess-style bottom-up ranks).
// - `letters: true` gives the compact "D3" form (column letter + row
//   number) for boards where that notation is conventional (Reversi,
//   Gomoku, Hex).
// - `occupant` is whatever sits in the cell ("X", "S", "X king"); falsy
//   reads as `empty` (default "empty").
// - `extra` is a string or array of trailing flags ("last move",
//   "winning line", "legal move"); falsy entries are dropped.

export const COLUMN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function columnLetter(col) {
  return COLUMN_LETTERS[col] ?? String(col + 1)
}

// Joins label fragments with ", ", flattening arrays and dropping falsy parts.
export function joinLabel(...parts) {
  return parts.flat(Infinity).filter(p => p !== null && p !== undefined && p !== false && p !== '').join(', ')
}

export function coordLabel({ row, col, letters = false }) {
  return letters ? `${columnLetter(col)}${row + 1}` : `Row ${row + 1}, column ${col + 1}`
}

/**
 * @param {{ row: number, col: number, index?: number, occupant?: string, extra?: any, letters?: boolean, empty?: string }} cell
 */
export function cellLabel({ row, col, index, occupant, extra, letters = false, empty = 'empty' }) {
  const position = row != null && col != null
    ? coordLabel({ row, col, letters })
    : index != null ? `Cell ${index + 1}` : ''
  return joinLabel(position, occupant || empty, extra)
}

// "1 seed" / "3 seeds" / "0 seeds".
export function countLabel(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`
}

// Quarto piece id (0–15) → its four attributes in words. Bit layout matches
// quartoLogic.js and QuartoBoard's glyph: bit0 tall, bit1 round, bit2 solid,
// bit3 dark (drawn in the full-strength text colour).
export function quartoPieceLabel(v) {
  if (v === '' || v == null) return ''
  return [
    v & 1 ? 'tall' : 'short',
    v & 2 ? 'round' : 'square',
    v & 4 ? 'solid' : 'hollow',
    v & 8 ? 'dark' : 'light',
  ].join(' ') + ' piece'
}

// Mine Race / minesweeper cell state. `count` is the adjacent-mine number
// of a revealed cell; `mine` only matters once mines are shown (game over).
export function mineCellLabel({ row, col, revealed = false, flagged = false, count = 0, mine = false, fatal = false }) {
  let state
  if (fatal) state = 'mine, detonated'
  else if (mine) state = flagged ? 'flagged, mine' : 'mine'
  else if (flagged) state = 'flagged'
  else if (!revealed) state = 'hidden'
  else if (count > 0) state = countLabel(count, 'adjacent mine')
  else state = 'clear'
  return cellLabel({ row, col, occupant: state })
}

// Unit exit vector → compass word, for boards whose pieces point somewhere
// (Arrows). Diagonals combine: (1, -1) → "up-right".
export function directionLabel(dx, dy) {
  const v = dy < -0.5 ? 'up' : dy > 0.5 ? 'down' : ''
  const h = dx > 0.5 ? 'right' : dx < -0.5 ? 'left' : ''
  return [v, h].filter(Boolean).join('-')
}
