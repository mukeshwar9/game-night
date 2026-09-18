// Chomp (David Gale) — pure logic, no DOM/Firebase/React.
// A rectangular chocolate bar. On your turn you pick a square and "eat" it
// plus every square below and to the right of it. The TOP-LEFT square is
// poisoned: eating it loses the game. (Poison sits top-left precisely so
// that only picking the poison square itself can eat it — every other
// square's below-right region excludes row 0 col 0.)
//
// Board encoding (row-major, poison at top-left => row 0, col 0):
//   board[i] = '' | 'eaten'   — '' = chocolate still there, 'eaten' = gone.
// Row 0 is the TOP row, so "below and to the right" of (r, c) is every cell
// (r2, c2) with r2 >= r and c2 >= c. Winning-line convention doesn't apply —
// there is no line; the result is winner only.

export const CHOMP_COLS = 6
export const CHOMP_ROWS = 5
export const CHOMP_CELL_COUNT = CHOMP_COLS * CHOMP_ROWS // 30
export const POISON_INDEX = 0 // top-left

export const EATEN = 'eaten'

// Normalize a Firebase-sourced board (sparse array or numeric-keyed object).
export function normalizeChompBoard(raw) {
  const board = Array(CHOMP_CELL_COUNT).fill('')
  if (!raw) return board
  // Array.from fills sparse-array holes with undefined so destructuring never
  // sees them (Firebase arrays arrive dense, but be defensive).
  const entries = Array.isArray(raw)
    ? Array.from(raw).map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k, 10), v])
  for (const [i, v] of entries) {
    if (i >= 0 && i < CHOMP_CELL_COUNT && v === EATEN) board[i] = EATEN
  }
  return board
}

export function rowColOf(i) {
  return [Math.floor(i / CHOMP_COLS), i % CHOMP_COLS]
}

// True if only the poisoned square remains. That position is a LOSS for the
// player to move (they must eat the poison), so the winner is the OTHER side.
export function isPoisonOnly(board) {
  for (let i = 0; i < CHOMP_CELL_COUNT; i++) {
    if (i !== POISON_INDEX && board[i] !== EATEN) return false
  }
  return true
}

// Apply an eat at `index` (must be a non-eaten square). Returns
// { board: newBoard, atePoison } or null for illegal moves.
// `atePoison` distinguishes "left 1x1 poison" (opponent forced to eat it)
// from "ate the poison yourself" (immediate loss).
export function applyChompMove(rawBoard, index) {
  const board = normalizeChompBoard(rawBoard)
  if (!Number.isInteger(index) || index < 0 || index >= CHOMP_CELL_COUNT) return null
  if (board[index] === EATEN) return null
  const [r, c] = rowColOf(index)
  const next = [...board]
  for (let r2 = r; r2 < CHOMP_ROWS; r2++) {
    for (let c2 = c; c2 < CHOMP_COLS; c2++) {
      next[r2 * CHOMP_COLS + c2] = EATEN
    }
  }
  return { board: next, atePoison: index === POISON_INDEX }
}

// Win resolution. The ONLY resolving event is the mover biting the poison
// square (atePoison true from applyChompMove) — losing immediately.
// A mover who LEAVES only the poison does not resolve: play continues and the
// opponent is forced to take the poisoned square themselves next turn.
// Returns null while unresolved, else { winner }.
export function getChompWinner(atePoison, symbol) {
  if (!atePoison) return null
  return { winner: symbol === 'X' ? 'O' : 'X' }
}

// All currently edible squares (non-eaten indices) — bot convenience.
export function edibleSquares(rawBoard) {
  const board = normalizeChompBoard(rawBoard)
  const out = []
  for (let i = 0; i < CHOMP_CELL_COUNT; i++) {
    if (board[i] !== EATEN) out.push(i)
  }
  return out
}

// Standard path helper: board index for a fresh square, -1 if eaten/out of range.
export const getMoveIndex = (board, i) =>
  Number.isInteger(i) && i >= 0 && i < CHOMP_CELL_COUNT && board[i] !== EATEN ? i : -1
