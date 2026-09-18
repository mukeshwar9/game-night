// Ataxx (Infection, 1988/1990) — pure logic, no DOM/Firebase/React.
// 7x7 grid. Each player starts with one piece in opposite corners (repo
// convention: X bottom-left, O top-right). On your turn, pick one of your
// pieces and either:
//   - CLONE it to any empty square at Chebyshev distance 1 (original stays),
//   - JUMP it to any empty square at Chebyshev distance 2 (source empties).
// After landing, every enemy piece adjacent (8-way) to the destination
// converts to your color. You must move if any move exists; otherwise you
// PASS (turn stays with the same player). The game ends when the board is
// full OR neither side can move; most pieces wins.
//
// Board: row-major flat array, '' | 'X' | 'O'.

export const AX_COLS = 7
export const AX_ROWS = 7
export const AX_CELL_COUNT = AX_COLS * AX_ROWS // 49

export const AX_START_X = AX_CELL_COUNT - AX_COLS // bottom-left
export const AX_START_O = 0 // top-right

export function rowColOf(i) {
  return [Math.floor(i / AX_COLS), i % AX_COLS]
}

export function indexOf(r, c) {
  return r * AX_COLS + c
}

// Normalize a Firebase-sourced board (sparse array or numeric-keyed object).
export function normalizeAxBoard(raw) {
  const board = Array(AX_CELL_COUNT).fill('')
  if (!raw) return board
  const entries = Array.isArray(raw)
    ? Array.from(raw).map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k, 10), v])
  for (const [i, v] of entries) {
    if (i >= 0 && i < AX_CELL_COUNT && (v === 'X' || v === 'O')) board[i] = v
  }
  return board
}

export function INITIAL_ATAXX() {
  const board = Array(AX_CELL_COUNT).fill('')
  board[AX_START_X] = 'X'
  board[AX_START_O] = 'O'
  return board
}

// Chebyshev distance (chess-king metric).
export function chebyshev(a, b) {
  const [r1, c1] = rowColOf(a)
  const [r2, c2] = rowColOf(b)
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2))
}

// All legal move payloads { from, to, kind } for `symbol`.
// kind: 'clone' (distance 1) or 'jump' (distance 2).
export function legalAtaxxMoves(rawBoard, symbol) {
  const board = normalizeAxBoard(rawBoard)
  const moves = []
  for (let from = 0; from < AX_CELL_COUNT; from++) {
    if (board[from] !== symbol) continue
    for (let to = 0; to < AX_CELL_COUNT; to++) {
      if (board[to] !== '') continue
      const d = chebyshev(from, to)
      if (d === 1) moves.push({ from, to, kind: 'clone' })
      else if (d === 2) moves.push({ from, to, kind: 'jump' })
    }
  }
  return moves
}

export function hasAnyAtaxxMove(rawBoard, symbol) {
  return legalAtaxxMoves(rawBoard, symbol).length > 0
}

export function countAtaxx(rawBoard, symbol) {
  const board = normalizeAxBoard(rawBoard)
  let n = 0
  for (let i = 0; i < AX_CELL_COUNT; i++) if (board[i] === symbol) n++
  return n
}

// Indices 8-way adjacent to `i` (in-bounds).
export function ataxxNeighbors(i) {
  const [r, c] = rowColOf(i)
  const out = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < AX_ROWS && nc >= 0 && nc < AX_COLS) {
        out.push(indexOf(nr, nc))
      }
    }
  }
  return out
}

// Apply a move payload { from, to } for `symbol` (kind is derived, not
// trusted — the distance decides clone vs jump). Returns
// { board, converted } or null if illegal. `converted` counts enemy pieces
// flipped (UI juice), never null — 0 for a plain clone in open space.
export function applyAtaxxMove(rawBoard, move, symbol) {
  if (!move || !Number.isInteger(move.from) || !Number.isInteger(move.to)) return null
  const board = normalizeAxBoard(rawBoard)
  if (board[move.from] !== symbol) return null
  if (move.to < 0 || move.to >= AX_CELL_COUNT) return null
  if (board[move.to] !== '') return null
  const d = chebyshev(move.from, move.to)
  if (d !== 1 && d !== 2) return null
  const next = [...board]
  if (d === 1) {
    next[move.to] = symbol // clone: source keeps its piece
  } else {
    next[move.from] = '' // jump: source vacates
    next[move.to] = symbol
  }
  const opp = symbol === 'X' ? 'O' : 'X'
  let converted = 0
  for (const nb of ataxxNeighbors(move.to)) {
    if (next[nb] === opp) {
      next[nb] = symbol
      converted++
    }
  }
  return { board: next, converted }
}

// Safety cap: conversions + jumps can cycle positions forever, so a match
// that reaches this many plies is decided by majority (never hangs). In
// practice clone-heavy play fills the board long before this.
export const ATAXX_MOVE_CAP = 120

// Round outcome, evaluated after `symbol` moved. Terminal conditions:
//  - a side has zero pieces → it can never move again; game over now
//  - board full → more pieces wins, equal → draw
//  - neither side can move → same
//  - moveCount reached ATAXX_MOVE_CAP → same (anti-cycle guard)
// Returns null while unresolved, else { winner: 'X'|'O'|'draw', scoreX, scoreO }.
export function getAtaxxWinner(rawBoard, moveCount = 0) {
  const board = normalizeAxBoard(rawBoard)
  const scoreX = countAtaxx(board, 'X')
  const scoreO = countAtaxx(board, 'O')
  const full = board.every(v => v !== '')
  const dead = scoreX === 0 || scoreO === 0
  const xStuck = !hasAnyAtaxxMove(board, 'X')
  const oStuck = !hasAnyAtaxxMove(board, 'O')
  if (!full && !dead && !(xStuck && oStuck) && moveCount < ATAXX_MOVE_CAP) return null
  const winner = scoreX > scoreO ? 'X' : scoreO > scoreX ? 'O' : 'draw'
  return { winner, scoreX, scoreO }
}
