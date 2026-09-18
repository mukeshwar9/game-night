// Breakthrough (Dan Troyka, 2000) — pure logic, no DOM/Firebase/React.
// Winner of the 2001 8x8 Game Design Competition. Each player starts with two
// full rows of pawns; a pawn moves one square straight or diagonally forward
// into an EMPTY square, or one square diagonally forward into an OPPONENT
// square (capture). No backward moves, no chains. First pawn to reach the
// far home row wins; capturing every enemy pawn wins; a player with no legal
// move loses (theoretical — see the "no-move loss" comment in
// getBreakthroughWinner). Draws are impossible: pawns only advance.
//
// Board: row-major flat array. X moves "up" (toward row 0), O moves "down"
// (toward the last row) — same orientation as Checkers/Reversi in this repo:
// X starts on the BOTTOM two rows, O on the TOP two rows.
// Cells: '' | 'X' | 'O'.

export const BT_COLS = 8
export const BT_ROWS = 8
export const BT_CELL_COUNT = BT_COLS * BT_ROWS // 64
export const BT_GOAL_ROW = { X: 0, O: BT_ROWS - 1 }

export function rowColOf(i) {
  return [Math.floor(i / BT_COLS), i % BT_COLS]
}

export function indexOf(r, c) {
  return r * BT_COLS + c
}

// Normalize a Firebase-sourced board (sparse array or numeric-keyed object).
export function normalizeBtBoard(raw) {
  const board = Array(BT_CELL_COUNT).fill('')
  if (!raw) return board
  // Array.from fills sparse-array holes so destructuring never sees them.
  const entries = Array.isArray(raw)
    ? Array.from(raw).map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k, 10), v])
  for (const [i, v] of entries) {
    if (i >= 0 && i < BT_CELL_COUNT && (v === 'X' || v === 'O')) board[i] = v
  }
  return board
}

// X's two home rows are the BOTTOM two; O's the TOP two.
export function INITIAL_BREAKTHROUGH() {
  const board = Array(BT_CELL_COUNT).fill('')
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < BT_COLS; c++) board[indexOf(r, c)] = 'O'
  }
  for (let r = BT_ROWS - 2; r < BT_ROWS; r++) {
    for (let c = 0; c < BT_COLS; c++) board[indexOf(r, c)] = 'X'
  }
  return board
}

// Row X moves toward: up (dr = -1). Row O moves toward: down (dr = +1).
export function stepRow(symbol) {
  return symbol === 'X' ? -1 : 1
}

// All legal (from, to) pairs for `symbol`. A pawn on row `to`-direction edge
// that can't advance is simply stuck; pawns never wrap columns.
export function legalMoves(rawBoard, symbol) {
  const board = normalizeBtBoard(rawBoard)
  const dr = stepRow(symbol)
  const opp = symbol === 'X' ? 'O' : 'X'
  const moves = []
  for (let i = 0; i < BT_CELL_COUNT; i++) {
    if (board[i] !== symbol) continue
    const [r, c] = rowColOf(i)
    const nr = r + dr
    if (nr < 0 || nr >= BT_ROWS) continue
    // straight forward into empty
    if (board[indexOf(nr, c)] === '') moves.push({ from: i, to: indexOf(nr, c) })
    // diagonal forward: empty OR capture
    for (const nc of [c - 1, c + 1]) {
      if (nc < 0 || nc >= BT_COLS) continue
      const target = board[indexOf(nr, nc)]
      if (target === '' || target === opp) moves.push({ from: i, to: indexOf(nr, nc) })
    }
  }
  return moves
}

export function hasAnyBreakthroughMove(rawBoard, symbol) {
  return legalMoves(rawBoard, symbol).length > 0
}

export function countPawns(rawBoard, symbol) {
  const board = normalizeBtBoard(rawBoard)
  let n = 0
  for (let i = 0; i < BT_CELL_COUNT; i++) if (board[i] === symbol) n++
  return n
}

// Apply a move payload { from, to }. Returns { board } or null if illegal
// (wrong ownership, wrong direction, illegal capture). Mirrors the
// applyXxxMove contract used by applyMove hooks.
export function applyBreakthroughMove(rawBoard, move, symbol) {
  if (!move || !Number.isInteger(move.from) || !Number.isInteger(move.to)) return null
  const board = normalizeBtBoard(rawBoard)
  if (board[move.from] !== symbol) return null
  const legal = legalMoves(board, symbol).some(
    m => m.from === move.from && m.to === move.to,
  )
  if (!legal) return null
  const next = [...board]
  next[move.from] = ''
  next[move.to] = symbol
  return { board: next }
}

// Full resolution after `symbol` just moved:
//  - symbol reached the goal row → symbol wins
//  - opponent has a pawn on THEIR goal row → opponent wins (defensive heal;
//    real play resolves this on the opponent's own winning move)
//  - opponent reduced to 0 pawns → symbol wins
//  - opponent has no legal move → symbol wins (defensive; unreachable in
//    reachable positions — a pawn off its goal row always has a move, and a
//    pawn ON the goal row is caught by the opp-goal check above)
//  - otherwise null
export function getBreakthroughWinner(rawBoard, symbol) {
  const board = normalizeBtBoard(rawBoard)
  const opp = symbol === 'X' ? 'O' : 'X'
  const goal = BT_GOAL_ROW[symbol]
  for (let c = 0; c < BT_COLS; c++) {
    if (board[indexOf(goal, c)] === symbol) return { winner: symbol }
  }
  const oppGoal = BT_GOAL_ROW[opp]
  for (let c = 0; c < BT_COLS; c++) {
    if (board[indexOf(oppGoal, c)] === opp) return { winner: opp }
  }
  if (countPawns(board, opp) === 0) return { winner: symbol }
  if (!hasAnyBreakthroughMove(board, opp)) return { winner: symbol }
  return null
}
