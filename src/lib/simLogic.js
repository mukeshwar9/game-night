// @ts-check
// Sim (Gustavus Simmons, 1969) — pure logic, no DOM/Firebase/React.
// 6 dots, 15 possible edges. Players alternate claiming an unclaimed edge
// (X=p1, O=p2). In any 2-coloring of K6 there is always a monochromatic
// triangle (Ramsey R(3,3)=6), so the game can never end in a draw: the first
// player to complete a triangle of their own color loses.

export const SIM_DOTS = 6
export const SIM_EDGE_COUNT = 15

// Edge endpoints by index: 01 02 03 04 05 12 13 14 15 23 24 25 34 35 45
// Derived, exported for the board so the dot labels/geometry stay in sync.
export const SIM_EDGES = (() => {
  const edges = []
  for (let a = 0; a < SIM_DOTS; a++) {
    for (let b = a + 1; b < SIM_DOTS; b++) edges.push([a, b])
  }
  return edges
})()

// Dots arranged on a circle (layout geometry lives here so the board stays
// rendering-only). Flat positions 0-100, index matches dot number — the six
// vertices of a regular hexagon starting at the top, clockwise.
export const SIM_DOT_POS = [
  { x: 50, y: 2 },
  { x: 91.6, y: 26 },
  { x: 91.6, y: 74 },
  { x: 50, y: 98 },
  { x: 8.4, y: 74 },
  { x: 8.4, y: 26 },
]

// All triangles (3-edge cycles) over 6 dots — 20 of them.
export const SIM_TRIANGLES = (() => {
  const tris = []
  for (let a = 0; a < SIM_DOTS; a++) {
    for (let b = a + 1; b < SIM_DOTS; b++) {
      for (let c = b + 1; c < SIM_DOTS; c++) {
        tris.push([edgeOf(a, b), edgeOf(b, c), edgeOf(a, c)])
      }
    }
  }
  return tris
})()

// Edge index for dot pair (a, b) in SIM_EDGES order (grouped by the LOWER dot):
// pair (lo, hi) sits at lo*(2N-1-lo)/2 + (hi-lo-1). Always an integer because
// lo and 11-lo have opposite parity when N=6.
function edgeOf(a, b) {
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return lo * (2 * SIM_DOTS - 1 - lo) / 2 + (hi - lo - 1)
}

// Normalize a Firebase-sourced board (sparse array or numeric-keyed object).
function normalizeEdges(raw) {
  const board = Array(SIM_EDGE_COUNT).fill('')
  if (!raw) return board
  const entries = Array.isArray(raw)
    ? raw.map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k, 10), v])
  for (const [i, v] of entries) {
    if (i >= 0 && i < SIM_EDGE_COUNT && (v === 'X' || v === 'O')) board[i] = v
  }
  return board
}

// Claimed edges by symbol.
export function edgesOf(board, symbol) {
  const n = normalizeEdges(board)
  const out = []
  for (let i = 0; i < SIM_EDGE_COUNT; i++) if (n[i] === symbol) out.push(i)
  return out
}

// Any triangle fully claimed by the owner of `edges`? Returns the triangle's
// edge indices. (Takes just the edge list — the caller already filtered by
// symbol via edgesOf.)
export function triangleOf(edges) {
  const owned = new Set(edges)
  for (const [e1, e2, e3] of SIM_TRIANGLES) {
    if (owned.has(e1) && owned.has(e2) && owned.has(e3)) return [e1, e2, e3]
  }
  return null
}

// The whole game is one rule: completing your own triangle loses. Draws are
// mathematically impossible (R(3,3)=6). Returns null while unresolved, else
// { winner, line } — key `line` matches the getWinner contract; line is the
// losing triangle (rendered in the loser's color as the losing shape).
export function getSimWinner(rawBoard) {
  const board = normalizeEdges(rawBoard)
  const xLoss = triangleOf(edgesOf(board, 'X'))
  if (xLoss) return { winner: 'O', line: xLoss }
  const oLoss = triangleOf(edgesOf(board, 'O'))
  if (oLoss) return { winner: 'X', line: oLoss }
  return null
}

// Standard path: board index must be an empty edge slot.
export const getMoveIndex = (board, edge) =>
  Number.isInteger(edge) && edge >= 0 && edge < SIM_EDGE_COUNT && !board[edge] ? edge : -1
