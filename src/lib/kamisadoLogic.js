// @ts-check
// Kamisado (Peter Burley, 2008) — pure logic, no DOM/Firebase/React.
// 8x8 board where every square has one of 8 colors. Each player owns 8 towers
// (one per color). Towers move any number of squares straight or diagonally
// FORWARD (like a chess queen restricted to forward directions) without
// passing through or landing on occupied squares.
//
// THE HOOK: the color of the square you land on dictates which color tower
// your opponent must move next. If that tower is stuck (no legal move), the
// opponent passes and you move again — the FORCED color carries over (you
// must again move the same color tower you just moved). Reach the far home
// row with any tower and you win the round.
//
// Board: row-major flat array, '' | 'X' | 'O' (tower ownership per square).
// X moves UP (toward row 0), O moves DOWN — same orientation as Breakthrough.
// X's towers start on row 7 (bottom), O's on row 0 (top).
//
// TOWER IDENTITY — the critical subtlety. A tower keeps the color of its
// HOME square forever, even after marching to squares of other colors; the
// forced-color rule keys off tower identity, not current position. Identity
// is therefore stored explicitly on the game node:
//   kamisadoTowers: { X: cell[8], O: cell[8] }   // index = home color k
// (`board` remains the rendering/occupancy source of truth; the two must
// agree — see assertKmConsistent.) Legacy rooms predating this node are
// resolved positionally as a fallback (kmTowerCellOf).

export const KM_SIZE = 8
export const KM_CELL_COUNT = KM_SIZE * KM_SIZE // 64

export function rowColOf(i) {
  return [Math.floor(i / KM_SIZE), i % KM_SIZE]
}

export function indexOf(r, c) {
  return r * KM_SIZE + c
}

// Normalize a Firebase-sourced board (sparse array or numeric-keyed object).
export function normalizeKmBoard(raw) {
  const board = Array(KM_CELL_COUNT).fill('')
  if (!raw) return board
  const entries = Array.isArray(raw)
    ? Array.from(raw).map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k, 10), v])
  for (const [i, v] of entries) {
    if (i >= 0 && i < KM_CELL_COUNT && (v === 'X' || v === 'O')) board[i] = v
  }
  return board
}

// 8-color palette indices (0-7). Board rows are permutations of all 8 colors
// (so every player always owns exactly one tower per square color) with 180°
// rotational symmetry (row k = reverse of row 7-k), matching the classic
// board's structure. Colors resolve to theme vars --c-kam0 … --c-kam7.
const KM_COLOR_ROWS = [
  [7, 6, 5, 4, 3, 2, 1, 0], // row 0 — O's home row
  [2, 3, 4, 5, 6, 7, 0, 1],
  [5, 4, 3, 2, 1, 0, 7, 6],
  [0, 7, 6, 1, 2, 5, 4, 3],
  [3, 4, 5, 2, 1, 6, 7, 0], // reverse of row 3
  [6, 7, 0, 1, 2, 3, 4, 5], // reverse of row 2
  [1, 0, 7, 6, 5, 4, 3, 2], // reverse of row 1
  [0, 1, 2, 3, 4, 5, 6, 7], // row 7 — X's home row (reverse of row 0)
]

// Flattened color index per cell.
export const KM_COLORS = KM_COLOR_ROWS.flat()

// Themed color channels for the 8 square colors — CSS var names resolved in
// the board (var(--c-kam0) … --c-kam7). Defined in src/index.css per theme.
export const KM_COLOR_VARS = [
  '--c-kam0', '--c-kam1', '--c-kam2', '--c-kam3',
  '--c-kam4', '--c-kam5', '--c-kam6', '--c-kam7',
]

// Color name shown in the status text when a tower is forced.
export const KM_COLOR_NAMES = [
  'BROWN', 'GREEN', 'RED', 'YELLOW', 'PINK', 'PURPLE', 'BLUE', 'ORANGE',
]

// Each player's towers: 8, one per color, lined on their home row. Column c
// of X's home row (row 7) holds the tower of KM_COLOR of that square; O is
// mirrored on row 0.
export function INITIAL_KAMISADO() {
  const board = Array(KM_CELL_COUNT).fill('')
  for (let c = 0; c < KM_SIZE; c++) board[indexOf(7, c)] = 'X'
  for (let c = 0; c < KM_SIZE; c++) board[indexOf(0, c)] = 'O'
  return board
}

// Initial tower map: tower k (home color k) starts on its home square.
export function INITIAL_KAMISADO_TOWERS() {
  const towers = { X: Array(8).fill(-1), O: Array(8).fill(-1) }
  for (let c = 0; c < KM_SIZE; c++) {
    towers.X[KM_COLORS[indexOf(7, c)]] = indexOf(7, c)
    towers.O[KM_COLORS[indexOf(0, c)]] = indexOf(0, c)
  }
  return towers
}

// Normalize the persisted tower map: array of 8 valid distinct cells per side.
export function normalizeKmTowers(raw) {
  const out = { X: Array(8).fill(-1), O: Array(8).fill(-1) }
  if (!raw || typeof raw !== 'object') return out
  for (const sym of ['X', 'O']) {
    const arr = Array.isArray(raw[sym]) ? raw[sym] : []
    const seen = new Set()
    for (let k = 0; k < 8 && k < arr.length; k++) {
      const n = Number(arr[k])
      if (Number.isInteger(n) && n >= 0 && n < KM_CELL_COUNT && !seen.has(n)) {
        seen.add(n)
        out[sym][k] = n
      }
    }
  }
  return out
}

// Where is `symbol`'s tower of color k (i.e. the tower whose HOME square had
// color k)? Prefers the explicit tower map; falls back to a positional scan
// for legacy rooms (correct only while every tower still stands on a square
// of its home color — i.e. before any cross-color march).
export function kmTowerCellOf(rawBoard, symbol, k, rawTowers) {
  const towers = normalizeKmTowers(rawTowers)
  const v = towers[symbol][k]
  if (v >= 0) return v
  const board = normalizeKmBoard(rawBoard)
  for (let i = 0; i < KM_CELL_COUNT; i++) {
    if (board[i] === symbol && KM_COLORS[i] === k) return i
  }
  return -1
}

// Forward row step: X up (-1), O down (+1).
export function kmStepRow(symbol) {
  return symbol === 'X' ? -1 : 1
}

// Legal destinations for `symbol`'s tower of color k: slide any number of
// squares straight or diagonally forward over EMPTY squares.
export function kmTowerMoves(rawBoard, symbol, k, rawTowers) {
  const board = normalizeKmBoard(rawBoard)
  const from = kmTowerCellOf(board, symbol, k, rawTowers)
  if (from < 0 || board[from] !== symbol) return []
  const [r, c] = rowColOf(from)
  const dr = kmStepRow(symbol)
  const dests = []
  for (const dc of [-1, 0, 1]) {
    let step = 1
    for (;;) {
      const nr = r + dr * step
      const nc = c + dc * step
      if (nr < 0 || nr >= KM_SIZE || nc < 0 || nc >= KM_SIZE) break
      if (board[indexOf(nr, nc)] !== '') break // blocked: stop scanning this ray
      dests.push(indexOf(nr, nc))
      step++
    }
  }
  return dests.map(to => ({ from, to }))
}

// Does `symbol` have ANY legal move at all (any tower)?
export function hasAnyKamisadoMove(rawBoard, symbol, rawTowers) {
  const board = normalizeKmBoard(rawBoard)
  for (let k = 0; k < 8; k++) {
    if (kmTowerMoves(board, symbol, k, rawTowers).length > 0) return true
  }
  return false
}

// Round resolution: reaching the far home row with any tower wins. Checked
// for BOTH symbols so stale boards resolve consistently.
export function getKamisadoWinner(rawBoard) {
  const board = normalizeKmBoard(rawBoard)
  for (let c = 0; c < KM_SIZE; c++) {
    if (board[indexOf(0, c)] === 'X') return { winner: 'X' }
  }
  for (let c = 0; c < KM_SIZE; c++) {
    if (board[indexOf(KM_SIZE - 1, c)] === 'O') return { winner: 'O' }
  }
  return null
}

// Sanity: every tower cell in the map holds that symbol's piece, every piece
// on the board is some tower, and per-color identities are consistent when
// towers stand on squares matching their home color. Returns [] of problems.
export function assertKmConsistent(rawBoard, rawTowers) {
  const problems = []
  const board = normalizeKmBoard(rawBoard)
  const towers = normalizeKmTowers(rawTowers)
  const covered = new Set()
  for (const sym of ['X', 'O']) {
    for (let k = 0; k < 8; k++) {
      const cell = towers[sym][k]
      if (cell < 0) { problems.push(`${sym}${k}:missing`); continue }
      if (covered.has(cell)) problems.push(`${sym}${k}:dup`)
      covered.add(cell)
      if (board[cell] !== sym) problems.push(`${sym}${k}:piece-mismatch`)
    }
  }
  for (let i = 0; i < KM_CELL_COUNT; i++) {
    if (board[i] !== '' && !covered.has(i)) problems.push(`cell${i}:unmapped`)
  }
  return problems
}

// Apply a move payload { from, to } for `symbol`, with `forcedColor` being
// the color `symbol` was required to move (null = any tower — round start or
// a bonus move after the opponent's forced tower was stuck). `state.towers`
// is the explicit identity map (legacy rooms may omit it). Returns null if
// illegal. On success returns the complete applyMove hook shape:
//   { board, towers, forcedColor, extraTurn, result }
//   - towers: updated identity map (moved tower k → `to`)
//   - forcedColor: color of the landed square (the NEXT mover's constraint;
//     null when extraTurn — see below)
//   - extraTurn: true when the opponent's forced tower is stuck but they have
//     other movable towers — the SAME player moves again, ANY tower (this
//     house rule guarantees progress; re-forcing the same stuck color could
//     otherwise loop forever).
export function applyKamisadoMove(rawBoard, move, symbol, forcedColor = null, state = null) {
  if (!move || !Number.isInteger(move.from) || !Number.isInteger(move.to)) return null
  const board = normalizeKmBoard(rawBoard)
  if (board[move.from] !== symbol) return null
  const towers = normalizeKmTowers(state?.towers)
  // Identify the moving tower. With an explicit map: the tower whose CURRENT
  // cell is `move.from`. Legacy fallback: match by the from-square's color.
  let k = towers[symbol].indexOf(move.from)
  if (k < 0) k = KM_COLORS[move.from] // legacy positional fallback
  const legal = kmTowerMoves(board, symbol, k, towers).some(
    m => m.from === move.from && m.to === move.to,
  )
  // The moved TOWER's identity (home color) must match the forced color —
  // not the color of the square it stands on (towers cross colors).
  if (forcedColor != null && k !== forcedColor) return null
  if (!legal) return null

  const next = [...board]
  next[move.from] = ''
  next[move.to] = symbol
  const nextTowers = normalizeKmTowers(towers)
  nextTowers[symbol][k] = move.to

  const result = getKamisadoWinner(next)
  if (result) {
    return { board: next, towers: nextTowers, forcedColor: KM_COLORS[move.to], extraTurn: false, result }
  }

  // Opponent's forced tower: color of the square we landed on — keyed to
  // tower IDENTITY (home color), not the square color under the tower.
  const opp = symbol === 'X' ? 'O' : 'X'
  const landedColor = KM_COLORS[move.to]
  const oppHasMove = kmTowerMoves(next, opp, landedColor, nextTowers).length > 0
  // Stuck forced tower + opponent has OTHER movable towers → bonus move to
  // the mover, constraint lifted (forcedColor null). If the opponent has no
  // movable tower at all, the constraint simply stands and they'll resolve
  // via the board state on their next interaction.
  const oppHasAny = hasAnyKamisadoMove(next, opp, nextTowers)
  const extraTurn = !oppHasMove && oppHasAny

  return {
    board: next, towers: nextTowers,
    forcedColor: extraTurn ? null : landedColor, extraTurn, result: null,
  }
}
