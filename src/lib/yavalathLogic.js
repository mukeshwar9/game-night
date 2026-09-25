// @ts-check
// Yavalath (Cameron Browne, 2007) — pure logic, no DOM/Firebase/React.
// Played on a hexagonal board of 61 hexes (radius 4: rows of 5,6,7,8,9,8,7,6,5).
// Players alternate placing stones. FOUR or more in a row WINS. THREE in a
// row LOSES. Full board with no result → draw. The tension: you constantly
// threaten 4 while dodging your own forced 3s (and forcing the opponent's).
//
// Board storage: row-major rhombus-free "pointy rows" layout — row r (0..8)
// has length 9-|r-4| and is offset horizontally by |r-4|/2. Cell index is
// computed from (row, col) with per-row offsets; adjacency uses axial cube
// directions. A 4+-line and a 3-line are detected over the 6 straight hex
// directions (each line counted once via canonical direction pairs).
//
// Firebase shape: board[61] — '' / 'X' / 'O'. currentTurn. standard win
// contract { winner, line? } — `line` is the winning/losing cell run.

export const YV_RADIUS = 4
export const YV_CELL_COUNT = 61

export const EMPTY = ''

// Rows 0..8 → lengths 5,6,7,8,9,8,7,6,5. Row r starts at column offset
// s = max(0, 4 - r) in axial space.
export const YV_ROW_LENGTHS = [5, 6, 7, 8, 9, 8, 7, 6, 5]

// Cell index lookup: precompute (row, col) → index and index → axial (q, r).
export const YV_CELLS = (() => {
  const cells = [] // { index, row, col, q, r }
  let idx = 0
  for (let row = 0; row < 9; row++) {
    const len = YV_ROW_LENGTHS[row]
    const startQ = YV_RADIUS - row // axial q of the row's first cell
    for (let col = 0; col < len; col++) {
      cells.push({ index: idx, row, col, q: startQ + col, r: row - YV_RADIUS })
      idx++
    }
  }
  return cells
})()

// Axial key → index map for fast adjacency.
const BY_AXIAL = new Map(YV_CELLS.map(c => [`${c.q},${c.r}`, c.index]))

export function yvIndexOf(q, r) {
  const i = BY_AXIAL.get(`${q},${r}`)
  return i === undefined ? -1 : i
}

// The 6 hex neighbors of cell i (axial directions).
export function yvNeighbors(i) {
  const c = YV_CELLS[i]
  if (!c) return []
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
  const out = []
  for (const [dq, dr] of dirs) {
    const n = yvIndexOf(c.q + dq, c.r + dr)
    if (n >= 0) out.push(n)
  }
  return out
}

// The 3 canonical straight-line direction pairs (each hex line has 6 rays;
// canonical = 3 pairs so every line is counted once).
const LINE_DIRS = [[1, 0], [1, -1], [0, 1]]

// All maximal straight lines on the board (arrays of cell indices).
export const YV_LINES = (() => {
  const lines = []
  for (const [dq, dr] of LINE_DIRS) {
    for (const c of YV_CELLS) {
      // Only start a line at a cell that has no predecessor in -dir.
      if (yvIndexOf(c.q - dq, c.r - dr) >= 0) continue
      const line = []
      let q = c.q
      let r = c.r
      for (;;) {
        line.push(yvIndexOf(q, r))
        q += dq
        r += dr
        if (yvIndexOf(q, r) < 0) break
      }
      if (line.length >= 3) lines.push(line)
    }
  }
  return lines
})()

export function normalizeYvBoard(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return Array.from({ length: YV_CELL_COUNT }, (_, i) =>
    arr[i] === 'X' || arr[i] === 'O' ? arr[i] : EMPTY)
}

// ─── Result detection ───────────────────────────────────────────────────────
// After `mover` places a stone: 4+ in a row → mover WINS; 3 (exactly a run
// of 3 with both extensions empty/off-board... simplest: any run of exactly
// 3 consecutive same-color stones within a line where the run can't be part
// of a 4) → mover LOSES. Standard digital implementation: scan every line
// for runs of the mover's color; if any run ≥ 4 → win; else if any run
// exactly 3 → loss. (A run of 3 that could extend to 4 later is still an
// immediate loss — that's the rule's bite.)
//
// Returns null while unresolved, else { winner: 'X'|'O'|'draw', line? }.
// For a loss, winner is the OPPONENT and `line` marks the fatal 3-run.
// Draw when the board is full.

export function getYavalathResult(rawBoard, mover) {
  const board = normalizeYvBoard(rawBoard)
  const other = mover === 'X' ? 'O' : 'X'
  let lossLine = null
  for (const line of YV_LINES) {
    // Scan runs of mover's color.
    let runStart = -1
    for (let i = 0; i <= line.length; i++) {
      const v = i < line.length ? board[line[i]] : null
      const inRun = v === mover
      if (inRun && runStart < 0) runStart = i
      if (!inRun && runStart >= 0) {
        const len = i - runStart
        const cells = line.slice(runStart, i)
        if (len >= 4) return { winner: mover, line: cells }
        if (len === 3 && !lossLine) lossLine = cells
        runStart = -1
      }
    }
  }
  if (lossLine) return { winner: other, line: lossLine }
  if (board.every(v => v !== EMPTY)) return { winner: 'draw' }
  return null
}

// ─── Apply a move ───────────────────────────────────────────────────────────
// Payload: cell index. Standard placement contract — empty cell required.

export function applyYavalathMove(rawBoard, index, symbol) {
  const board = normalizeYvBoard(rawBoard)
  if (!Number.isInteger(index) || index < 0 || index >= YV_CELL_COUNT) return null
  if (board[index] !== EMPTY) return null
  const next = [...board]
  next[index] = symbol
  const result = getYavalathResult(next, symbol)
  return {
    board: next,
    currentTurn: symbol === 'X' ? 'O' : 'X',
    result,
  }
}
