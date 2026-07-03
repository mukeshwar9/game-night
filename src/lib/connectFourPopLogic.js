// Connect Four "Pop Out" variant. Same 6×7 board and drop rules as classic
// Connect Four, but on your turn you may instead POP one of your own discs out
// of the bottom of a column — every disc above it slides down one row. This
// de-solves the game and lets a pop complete a line for either player.
//
// Board layout matches connectFourLogic: string[42], index = row*7 + col, row 0
// is the top, row 5 the bottom. Move payload: { col, action: 'drop' | 'pop' }.

import { getConnectFourDrop, CF_COLS, CF_BOARD_SIZE } from './connectFourLogic'

const ROWS = 6
const COLS = CF_COLS // 7
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]]

export { CF_BOARD_SIZE }

// Bottom-row cell index of a column.
export function bottomIndex(col) {
  return (ROWS - 1) * COLS + col
}

// Does `symbol` have any four-in-a-row? Returns the winning line or null.
export function connectFourLineFor(board, symbol) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row * COLS + col] !== symbol) continue
      for (const [dr, dc] of DIRECTIONS) {
        const line = []
        for (let k = 0; k < 4; k++) {
          const r = row + dr * k
          const c = col + dc * k
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break
          if (board[r * COLS + c] !== symbol) break
          line.push(r * COLS + c)
        }
        if (line.length === 4) return line
      }
    }
  }
  return null
}

// `symbol` can pop from `col` only if they own the bottom disc there.
export function canPop(board, col, symbol) {
  return board[bottomIndex(col)] === symbol
}

// Remove the bottom disc of `col`; discs above slide down one row, top clears.
export function popColumn(board, col) {
  const nb = [...board]
  for (let row = ROWS - 1; row > 0; row--) {
    nb[row * COLS + col] = nb[(row - 1) * COLS + col]
  }
  nb[col] = ''
  return nb
}

// After a move by `mover`, decide the outcome. A pop can complete fours for
// either or both sides. House rule: if both complete a four, the mover (who
// chose the move) wins; otherwise whoever has four wins; a full board with
// none is a draw. Returns { winner, line } or null while the game is live.
export function popWinner(board, mover) {
  const opp = mover === 'X' ? 'O' : 'X'
  const mine = connectFourLineFor(board, mover)
  const theirs = connectFourLineFor(board, opp)
  if (mine) return { winner: mover, line: mine }
  if (theirs) return { winner: opp, line: theirs }
  if (board.every(c => c)) return { winner: 'draw', line: [] }
  return null
}

// Apply a drop or pop. Returns { board, result } or null if illegal.
export function applyConnectFourPopMove(board, move, symbol) {
  const col = move?.col
  const action = move?.action || 'drop'
  if (col == null || col < 0 || col >= COLS) return null

  let nextBoard
  if (action === 'pop') {
    if (!canPop(board, col, symbol)) return null
    nextBoard = popColumn(board, col)
  } else {
    const landing = getConnectFourDrop(board, col)
    if (landing === -1) return null
    nextBoard = [...board]
    nextBoard[landing] = symbol
  }

  return { board: nextBoard, result: popWinner(nextBoard, symbol) }
}
