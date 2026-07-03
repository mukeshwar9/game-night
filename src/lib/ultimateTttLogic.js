// Ultimate Tic-Tac-Toe — a 3×3 grid of nine 3×3 tic-tac-toe boards.
//
//   board:        string[81] — index = miniBoard*9 + cell (both in reading order 0..8)
//   uWon:         string[9]  — per-miniboard outcome: '' | 'X' | 'O' | 'D' (drawn/full)
//   uActiveBoard: number     — the miniboard the current player MUST play in (0..8),
//                              or -1 = free choice (the dictated board is decided/full)
//
// The cell you play in dictates which miniboard your opponent must play in next.
// You win a miniboard with 3-in-a-row; you win the game with 3 won miniboards
// in a row on the meta board.

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export const UT_CELL_COUNT = 81
export const UT_BOARD_COUNT = 9

// Winner ('X'|'O') of a single 9-cell miniboard, or null.
export function miniBoardWinner(cells) {
  for (const [a, b, c] of LINES) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a]
  }
  return null
}

function isFull(cells) {
  return cells.every(c => c)
}

// Meta winner over uWon. 'D' boards count as filled but neutral.
// Returns { winner: 'X'|'O'|'draw', line } or null while the game is live.
export function getUltimateWinner(uWon) {
  for (const line of LINES) {
    const [a, b, c] = line
    const v = uWon[a]
    if ((v === 'X' || v === 'O') && uWon[b] === v && uWon[c] === v) {
      return { winner: v, line }
    }
  }
  if (uWon.every(v => v)) {
    // Every board decided with no meta line — the majority of won boards wins.
    const x = uWon.filter(v => v === 'X').length
    const o = uWon.filter(v => v === 'O').length
    return { winner: x === o ? 'draw' : (x > o ? 'X' : 'O'), line: [] }
  }
  return null
}

// Apply a move at absolute cell index (0..80) for `symbol`.
// Returns { board, uWon, activeBoard } or null if the move is illegal.
export function applyUltimateMove(board, uWon, activeBoard, index, symbol) {
  if (index < 0 || index >= UT_CELL_COUNT) return null
  if (board[index]) return null
  const mini = Math.floor(index / 9)
  if (uWon[mini]) return null                                   // board already decided
  if (activeBoard !== -1 && activeBoard !== mini) return null    // wrong board

  const nextBoard = [...board]
  nextBoard[index] = symbol

  const nextWon = [...uWon]
  const miniCells = nextBoard.slice(mini * 9, mini * 9 + 9)
  const w = miniBoardWinner(miniCells)
  if (w) nextWon[mini] = w
  else if (isFull(miniCells)) nextWon[mini] = 'D'

  // The cell position (0..8) sends the opponent to that miniboard; if it's
  // already decided or full, they may play anywhere.
  let nextActive = index % 9
  const targetCells = nextBoard.slice(nextActive * 9, nextActive * 9 + 9)
  if (nextWon[nextActive] || isFull(targetCells)) nextActive = -1

  return { board: nextBoard, uWon: nextWon, activeBoard: nextActive }
}

// Absolute cell indices (0..80) that are legally playable right now.
export function legalCells(board, uWon, activeBoard) {
  const out = []
  for (let i = 0; i < UT_CELL_COUNT; i++) {
    if (board[i]) continue
    const mini = Math.floor(i / 9)
    if (uWon[mini]) continue
    if (activeBoard !== -1 && activeBoard !== mini) continue
    out.push(i)
  }
  return out
}

// Firebase may hand back an array or a numeric-keyed object (or nothing).
export function normalizeUWon(raw) {
  const arr = Array(UT_BOARD_COUNT).fill('')
  if (!raw) return arr
  const entries = Array.isArray(raw)
    ? raw.map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k), v])
  entries.forEach(([i, v]) => { if (i < UT_BOARD_COUNT) arr[i] = v || '' })
  return arr
}
