// Lines of Action (Claude Soucie, ~1969; Spiel des Jahres recommended) —
// pure logic, no DOM/Firebase/React. 8×8 board; each side owns 12 checkers
// on the two home rows (corners empty). A move travels EXACTLY as many
// squares as there are pieces (both colors!) on the line of movement —
// row, column, or diagonal — and may not jump over ENEMY pieces (own pieces
// are jumpable). Landing on an enemy captures it. GOAL: unite all of your
// pieces into one orthogonally/diagonally connected group. If both players
// complete their group on the same move, the MOVER wins. A player with no
// pieces (all captured) has... lost — can't form a group. Draws impossible.
//
// Firebase shape: board[64] — '' / 'X' / 'O'. currentTurn.
// Move payload: { from, to } — all validation here.

export const LOA_SIZE = 8
export const LOA_CELL_COUNT = 64

export const EMPTY = ''

export function indexOf(r, c) {
  return r * LOA_SIZE + c
}
export function rowColOf(i) {
  return [Math.floor(i / LOA_SIZE), i % LOA_SIZE]
}

export function INITIAL_LOA() {
  const board = Array(LOA_CELL_COUNT).fill(EMPTY)
  // Standard setup: O on the two horizontal rows, X on the two vertical
  // columns (corners empty). Both sides start SPLIT — pieces on row 0 never
  // touch row 7, so no side is united at the start (a row-only setup left X
  // pre-connected and every first move "won").
  for (let c = 1; c < 7; c++) {
    board[indexOf(0, c)] = 'O'
    board[indexOf(7, c)] = 'O'
  }
  for (let r = 1; r < 7; r++) {
    board[indexOf(r, 0)] = 'X'
    board[indexOf(r, 7)] = 'X'
  }
  return board
}

export function normalizeLoaBoard(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return Array.from({ length: LOA_CELL_COUNT }, (_, i) =>
    arr[i] === 'X' || arr[i] === 'O' ? arr[i] : EMPTY)
}

// The 8 ray directions as [dr, dc].
const DIRS = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

// Count pieces (either color) along the full line through `from` in
// direction [dr, dc], including `from` itself.
export function lineCount(board, from, dr, dc) {
  const [r0, c0] = rowColOf(from)
  let count = 1 // the piece itself
  for (const sign of [1, -1]) {
    let r = r0 + dr * sign
    let c = c0 + dc * sign
    while (r >= 0 && r < LOA_SIZE && c >= 0 && c < LOA_SIZE) {
      if (board[indexOf(r, c)] !== EMPTY) count++
      r += dr * sign
      c += dc * sign
    }
  }
  return count
}

// Is `to` reachable from `from` moving exactly `n` squares along direction
// [dr, dc], not jumping enemies, landing empty or enemy?
function rayReachable(board, from, to, n, dr, dc, symbol) {
  const [r0, c0] = rowColOf(from)
  const [r1, c1] = rowColOf(to)
  // to must lie along the ray direction.
  const ddr = r1 - r0
  const ddc = c1 - c0
  if (dr === 0 && ddr !== 0) return false
  if (dc === 0 && ddc !== 0) return false
  if (dr !== 0 && ddr % dr !== 0) return false
  if (dc !== 0 && ddc % dc !== 0) return false
  const steps = dr !== 0 ? ddr / dr : ddc / dc
  if (steps <= 0) return false // must move forward along the ray
  // Exact distance check: straight lines need |ddr|===n or |ddc|===n; the
  // generic check: the number of squares moved equals n (Chebyshev along ray).
  if (steps !== n) return false
  // Walk the path: intermediate squares may hold OWN pieces only; the target
  // may hold an enemy (capture) or be empty.
  for (let s = 1; s < steps; s++) {
    const r = r0 + dr * s
    const c = c0 + dc * s
    const v = board[indexOf(r, c)]
    if (v !== EMPTY && v !== symbol) return false // enemy in the way
  }
  return true
}

// All legal destinations for the piece at `from`.
export function loaMoves(board, from, symbol) {
  const b = normalizeLoaBoard(board)
  if (b[from] !== symbol) return []
  const out = []
  for (const [dr, dc] of DIRS) {
    const n = lineCount(b, from, dr, dc)
    const [r0, c0] = rowColOf(from)
    // Exactly one landing square per direction: `n` steps out. Landing on an
    // own piece is illegal; an enemy is a capture; empty is a normal move.
    const r = r0 + dr * n
    const c = c0 + dc * n
    if (r < 0 || r >= LOA_SIZE || c < 0 || c >= LOA_SIZE) continue
    const to = indexOf(r, c)
    if (b[to] === symbol) continue // own piece on the landing square
    if (rayReachable(b, from, to, n, dr, dc, symbol)) out.push(to)
  }
  return out
}

export function hasAnyLoaMove(board, symbol) {
  const b = normalizeLoaBoard(board)
  for (let i = 0; i < LOA_CELL_COUNT; i++) {
    if (b[i] === symbol && loaMoves(b, i, symbol).length) return true
  }
  return false
}

// ─── Connectivity (the win condition) ───────────────────────────────────────
// Are all of `symbol`'s pieces one orthogonally/diagonally connected group?

export function isUnited(board, symbol) {
  const b = normalizeLoaBoard(board)
  const cells = []
  for (let i = 0; i < LOA_CELL_COUNT; i++) if (b[i] === symbol) cells.push(i)
  if (cells.length === 0) return false // no pieces → can't be united
  if (cells.length === 1) return true
  const seen = new Set([cells[0]])
  const queue = [cells[0]]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    const [r, c] = rowColOf(cur)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const r2 = r + dr
        const c2 = c + dc
        if (r2 < 0 || r2 >= LOA_SIZE || c2 < 0 || c2 >= LOA_SIZE) continue
        const n = indexOf(r2, c2)
        if (!seen.has(n) && b[n] === symbol) {
          seen.add(n)
          queue.push(n)
        }
      }
    }
  }
  return seen.size === cells.length
}

// ─── Winner detection ───────────────────────────────────────────────────────
// Called after `mover`'s move. Mover wins if united; opponent also united on
// the same ply → the MOVER wins (standard rule). Opponent reduced to zero
// pieces → mover wins. Returns null while unresolved.

export function getLoaWinner(rawBoard, mover) {
  const board = normalizeLoaBoard(rawBoard)
  const other = mover === 'X' ? 'O' : 'X'
  const moverCount = board.filter(v => v === mover).length
  const otherCount = board.filter(v => v === other).length
  if (moverCount === 0) return { winner: other } // mover eliminated (can't happen on mover's own move, but defensive)
  if (otherCount === 0) return { winner: mover }
  const moverUnited = isUnited(board, mover)
  const otherUnited = isUnited(board, other)
  if (moverUnited) return { winner: mover } // mover priority on simultaneity
  if (otherUnited) return { winner: other } // e.g. mover's capture disconnected... no: capturing can't connect the opponent, but a capture can UNITE them by removing blockers? It can: capturing a piece may merge their groups.
  return null
}

// ─── Apply a move ───────────────────────────────────────────────────────────
// Payload { from, to } for `symbol`. Returns null if illegal. On success:
//   { board, currentTurn, captured?, result }

export function applyLoaMove(rawBoard, move, symbol) {
  const board = normalizeLoaBoard(rawBoard)
  const { from, to } = move ?? {}
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null
  if (from === to) return null
  if (board[from] !== symbol) return null
  if (!loaMoves(board, from, symbol).includes(to)) return null

  const next = [...board]
  const captured = next[to] !== EMPTY
  next[to] = symbol
  next[from] = EMPTY

  const result = getLoaWinner(next, symbol)
  return {
    board: next,
    currentTurn: symbol === 'X' ? 'O' : 'X',
    captured: captured || undefined,
    result,
  }
}
