// @ts-check
// Quarto (Bruno Faidutti, 1991 — Mensa Select) — pure logic, no DOM/Firebase/React.
// 4×4 board, 16 SHARED pieces. Each piece is a 4-bit id (0–15); bit k encodes
// attribute k: bit0 tall/short, bit1 round/square, bit2 hollow/solid,
// bit3 light/dark. Two pieces share an attribute iff their ids agree on that
// bit. THE HOOK: you never choose your own piece — you PLACE the piece your
// opponent handed you, then hand them the next one. First line of 4 (row,
// column, or either main diagonal) whose four pieces all share ANY ONE
// attribute wins.
//
// State machine (all in the room node):
//   board[16]     — '' / piece id (number)
//   unplaced[]    — piece ids still on the shelf
//   pending       — piece id the CURRENT mover must place (null = corrupt/
//                   pre-deal; freshGameState always deals one)
//   currentTurn   — who must place the pending piece
//
// A turn is ONE action: { place, give } — place the pending piece, then hand
// the opponent their next piece. Placing the last piece wins on the spot (no
// give); a full board with no line is a draw.
//
// The `give` half is where the skill lives: you may hand your opponent ANY
// unplaced piece — including one that completes their line — because if they
// play it and complete a line, YOU placed... no: THEY placed it, so THEY win.
// You must therefore avoid handing a winning piece, and prefer one whose
// every placement lets you keep control.

export const QRT_SIZE = 4
export const QRT_CELL_COUNT = 16
export const QRT_PIECE_COUNT = 16

export const QRT_ATTR_NAMES = ['TALL/SHORT', 'ROUND/SQUARE', 'HOLLOW/SOLID', 'LIGHT/DARK']

export const EMPTY = ''

// Bit k of piece id v: (v >> k) & 1.
export const attrBit = (v, k) => (Number.isInteger(v) ? (v >> k) & 1 : null)

export function normalizeQuartoBoard(rawBoard) {
  const arr = Array.isArray(rawBoard) ? rawBoard : []
  return Array.from({ length: QRT_CELL_COUNT }, (_, i) => {
    const v = arr[i]
    if (v === '' || v == null) return EMPTY
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n < QRT_PIECE_COUNT ? n : EMPTY
  })
}

export function normalizeIds(raw) {
  const arr = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const out = []
  for (const v of arr) {
    const n = Number(v)
    if (Number.isInteger(n) && n >= 0 && n < QRT_PIECE_COUNT && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

// ─── Lines & win check ──────────────────────────────────────────────────────
// All 10 win lines (4 rows, 4 cols, 2 main diagonals) as cell index arrays.

export const QRT_LINES = (() => {
  const lines = []
  for (let r = 0; r < QRT_SIZE; r++) lines.push([0, 1, 2, 3].map(c => r * 4 + c))
  for (let c = 0; c < QRT_SIZE; c++) lines.push([0, 1, 2, 3].map(r => r * 4 + c))
  lines.push([0, 5, 10, 15])
  lines.push([3, 6, 9, 12])
  return lines
})()

// Do four placed ids share at least one common bit value? (Attribute k is
// "shared" when all four agree on bit k.)
export function lineWins(ids) {
  if (!Array.isArray(ids) || ids.length !== 4) return false
  if (ids.some(v => v === EMPTY || !Number.isInteger(v))) return false
  for (let k = 0; k < 4; k++) {
    const b0 = attrBit(ids[0], k)
    if (ids.every(v => attrBit(v, k) === b0)) return true
  }
  return false
}

// Winning line on the board → the line's cell indices, or null.
export function findQuartoLine(rawBoard) {
  const board = normalizeQuartoBoard(rawBoard)
  for (const line of QRT_LINES) {
    const ids = line.map(i => board[i])
    if (lineWins(ids)) return line
  }
  return null
}

// ─── Winner detection (standard { winner, line? } contract) ─────────────────
// Only meaningful right after a placement. Full board with no line → draw.

export function getQuartoWinner(rawBoard) {
  const board = normalizeQuartoBoard(rawBoard)
  const line = findQuartoLine(board)
  if (line) return { winner: 'X', line } // symbol set by the caller's move; X is a placeholder
  if (board.every(v => v !== EMPTY)) return { winner: 'draw' }
  return null
}

// ─── Give options: pieces the mover may hand over ───────────────────────────
// Any unplaced piece — INCLUDING losing gifts (that's the bluff/skill), but
// never an already-placed one (corrupt-state guard) and never `pending`
// itself (it's about to leave the shelf).

export function giveOptions(rawBoard, rawUnplaced, pending) {
  const board = normalizeQuartoBoard(rawBoard)
  const unplaced = normalizeIds(rawUnplaced)
  const onBoard = new Set(board.filter(v => v !== EMPTY))
  return unplaced.filter(v => !onBoard.has(v) && v !== pending)
}

// ─── Apply the two-part action { place, give } ──────────────────────────────
// `place` = CELL index (0–15) where the pending piece goes; the piece itself
// is always `state.pending` (the mover has no choice about WHICH piece — only
// WHERE). `give` = the piece id handed to the opponent; omit it when placing
// the final piece. Returns null if illegal. On success:
//   { board, unplaced, pending, currentTurn, result }
// `result.winner` is the mover (`symbol`) on a line win.

export function applyQuartoMove(rawBoard, action, symbol, state) {
  const board = normalizeQuartoBoard(rawBoard)
  const { place, give } = action ?? {}
  const unplaced = normalizeIds(state?.unplaced)
  const pending = state?.pending
  if (!Number.isInteger(place) || place < 0 || place >= QRT_CELL_COUNT) return null
  if (!Number.isInteger(pending) || pending < 0 || pending >= QRT_PIECE_COUNT) return null
  if (board[place] !== EMPTY) return null // cell occupied
  if (!unplaced.includes(pending)) return null // piece not on the shelf

  const next = [...board]
  next[place] = pending
  const nextUnplaced = unplaced.filter(v => v !== pending)

  // Win check first — placing the last piece can win immediately.
  const line = findQuartoLine(next)
  if (line) {
    return {
      board: next, unplaced: nextUnplaced, pending: null,
      currentTurn: symbol === 'X' ? 'O' : 'X',
      result: { winner: symbol, line },
    }
  }
  if (next.every(v => v !== EMPTY)) {
    // Last piece placed, no line → draw.
    return {
      board: next, unplaced: [], pending: null,
      currentTurn: symbol === 'X' ? 'O' : 'X',
      result: { winner: 'draw' },
    }
  }

  // Still going: the mover must hand over the next piece.
  if (!Number.isInteger(give)) return null
  if (!nextUnplaced.includes(give)) return null
  return {
    board: next,
    unplaced: nextUnplaced,
    pending: give,
    currentTurn: symbol === 'X' ? 'O' : 'X',
    result: null,
  }
}

// Initial deal: X places a random piece on turn one. Pure helper returns the
// piece + shelf; freshGameState assembles the room shape.
export function dealQuarto() {
  const unplaced = Array.from({ length: QRT_PIECE_COUNT }, (_, i) => i)
  const pending = Math.floor(Math.random() * QRT_PIECE_COUNT)
  return { unplaced, pending }
}
