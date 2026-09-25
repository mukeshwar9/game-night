// @ts-check
// Santorini (Hamilton, 2004/2016) — pure logic, no DOM/Firebase/React.
// 5×5 board. Each player owns 2 workers. A turn: MOVE one worker one square
// (orthogonal or diagonal), then BUILD one level on any square orthogonal or
// diagonal to the moved worker (including under itself — no, actually the
// build target may be any adjacent square, and may be the square the worker
// LEFT or one occupied by any worker — building under a worker is allowed:
// that worker just stands on a taller level). Climb rules: you may move up at
// most ONE level; move down any amount; move across flat. Domes cap towers
// at height 3 → no more moves/builds onto them. You may NOT move onto any
// occupied square (worker or dome). You may NOT build on an occupied square
// (worker or dome).
//
// WIN: one of your workers stands on level 3 after your move (the build then
// still happens? — standard rules: the game ends IMMEDIATELY when a worker
// reaches level 3; no build). Also: if the opponent has NO legal move+build
// at the start of their turn, they lose (immobilized).
//
// Firebase shape: board[25] heights (0-4, 4 = domed), workers:
// { X: [a, b], O: [a, b] } cell indices, currentTurn.
// Move payload: { worker, to, build } — worker = CURRENT cell of the moving
// worker, to = destination, build = build-target cell. All validation here.

export const ST_SIZE = 5
export const ST_CELL_COUNT = 25
export const ST_MAX_LEVEL = 3 // winnable top; 4 = dome marker

export const EMPTY = '' // heights board uses numbers; '' never appears

export function indexOf(r, c) {
  return r * ST_SIZE + c
}
export function rowColOf(i) {
  return [Math.floor(i / ST_SIZE), i % ST_SIZE]
}

// Moore neighborhood (8 adjacent cells).
export function neighbors(i) {
  const [r, c] = rowColOf(i)
  const out = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const r2 = r + dr
      const c2 = c + dc
      if (r2 >= 0 && r2 < ST_SIZE && c2 >= 0 && c2 < ST_SIZE) out.push(indexOf(r2, c2))
    }
  }
  return out
}

export function INITIAL_SANTORINI() {
  // Standard-ish symmetric setup: X bottom-middle pair, O top-middle pair.
  return {
    board: Array(ST_CELL_COUNT).fill(0),
    workers: { X: [20, 24], O: [0, 4] },
  }
}

export function normalizeStBoard(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return Array.from({ length: ST_CELL_COUNT }, (_, i) => {
    const v = Number(arr[i] ?? 0)
    return Number.isFinite(v) ? Math.min(4, Math.max(0, Math.floor(v))) : 0
  })
}

export function normalizeStWorkers(raw) {
  const w = raw?.X && raw?.O
    ? { X: raw.X, O: raw.O }
    : { X: [20, 24], O: [0, 4] }
  const ok = (v) => Number.isInteger(v) && v >= 0 && v < ST_CELL_COUNT
  const X = Array.isArray(w.X) ? w.X.filter(ok).slice(0, 2) : []
  const O = Array.isArray(w.O) ? w.O.filter(ok).slice(0, 2) : []
  // Corrupt → re-deal defaults (defensive; never happens in live rooms).
  if (X.length !== 2) { X[0] = 20; X[1] = 24 }
  if (O.length !== 2) { O[0] = 0; O[1] = 4 }
  return { X, O }
}

const isOccupied = (workers, cell) =>
  workers.X.includes(cell) || workers.O.includes(cell)

// ─── Move generation ────────────────────────────────────────────────────────

// All destinations worker `from` can MOVE to (climb ≤ +1, no domes/occupants).
export function moveTargets(heights, workers, from) {
  const h = normalizeStBoard(heights)
  const out = []
  const fromLevel = h[from]
  for (const to of neighbors(from)) {
    if (h[to] >= 4) continue // domed
    if (isOccupied(workers, to)) continue
    if (h[to] > fromLevel + 1) continue // climb limit
    out.push(to)
  }
  return out
}

// Build targets for a worker who just moved onto `to` (post-move worker
// layout passed in): any adjacent cell of `to` INCLUDING `to` itself (build-
// under-self is legal per the official rules), minus domes. Other workers'
// squares are blocked.
export function buildTargetsAfter(heights, workersAfter, to) {
  const h = normalizeStBoard(heights)
  const out = []
  for (const cell of neighbors(to).concat(to)) {
    if (h[cell] >= 4) continue
    if (cell !== to && isOccupied(workersAfter, cell)) continue
    out.push(cell)
  }
  return out
}

// Full turn candidates for `symbol`: { worker, to, build }.
export function legalStTurns(heights, workersRaw, symbol) {
  const workers = normalizeStWorkers(workersRaw)
  const h = normalizeStBoard(heights)
  const out = []
  for (const from of workers[symbol]) {
    for (const to of moveTargets(h, workers, from)) {
      // For build-target purposes the mover now stands on `to`.
      const w2 = { X: [...workers.X], O: [...workers.O] }
      w2[symbol] = w2[symbol].map(c => (c === from ? to : c))
      for (const build of buildTargetsAfter(h, w2, to)) {
        out.push({ worker: from, to, build })
      }
    }
  }
  return out
}

export function hasAnyStTurn(heights, workers, symbol) {
  return legalStTurns(heights, workers, symbol).length > 0
}

// ─── Winner detection ───────────────────────────────────────────────────────
// Called AFTER a completed move+build. Level-3 wins are detected inside
// applyStMove (mid-turn). This helper catches the immobilization loss only.

export function getStWinner(heights, workersRaw, justMoved) {
  const workers = normalizeStWorkers(workersRaw)
  const next = justMoved === 'X' ? 'O' : 'X'
  if (!hasAnyStTurn(heights, workers, next)) return { winner: justMoved }
  return null
}

// ─── Apply a full turn ──────────────────────────────────────────────────────
// Payload { worker, to, build } for `symbol`. Returns null if illegal.
// Success: { board, workers, currentTurn, result } — result.winner is the
// MOVER on a level-3 climb (game ends mid-turn, no build applied) or on
// opponent immobilization after the build.

export function applyStMove(rawState, move, symbol) {
  const heights = normalizeStBoard(rawState?.board)
  const workers = normalizeStWorkers(rawState?.workers)
  const { worker, to, build } = move ?? {}
  if (!workers[symbol].includes(worker)) return null
  if (!moveTargets(heights, workers, worker).includes(to)) return null

  // Apply the move tentatively to validate the build.
  const wAfter = { X: [...workers.X], O: [...workers.O] }
  wAfter[symbol] = wAfter[symbol].map(c => (c === worker ? to : c))

  // Level-3 climb wins IMMEDIATELY — no build happens (standard rules).
  if (heights[to] === ST_MAX_LEVEL) {
    const nextWorkers = wAfter
    return {
      board: heights,
      workers: nextWorkers,
      currentTurn: symbol === 'X' ? 'O' : 'X',
      result: { winner: symbol, how: 'summit' },
    }
  }

  if (!Number.isInteger(build)) return null // still going: build is required
  const okBuilds = buildTargetsAfter(heights, wAfter, to)
  if (!okBuilds.includes(build)) return null

  const nextHeights = [...heights]
  nextHeights[build] = Math.min(4, nextHeights[build] + 1)

  // Immobilization loss for the opponent?
  const result = getStWinner(nextHeights, wAfter, symbol)

  return {
    board: nextHeights,
    workers: wAfter,
    currentTurn: symbol === 'X' ? 'O' : 'X',
    result, // null while unresolved
  }
}
