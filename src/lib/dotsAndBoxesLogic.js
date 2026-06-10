export const DB_SIZE = 4
export const DB_EDGE_COUNT = 40
export const DB_BOX_COUNT = 16

// Horizontal edge index: row 0-4, col 0-3
export const hEdgeIndex = (row, col) => row * 4 + col

// Vertical edge index: row 0-3, col 0-4
export const vEdgeIndex = (row, col) => 20 + row * 5 + col

// Returns [top, bottom, left, right] edge indices for box b
export function edgesOfBox(b) {
  const r = Math.floor(b / DB_SIZE)
  const c = b % DB_SIZE
  return [
    hEdgeIndex(r, c),     // top
    hEdgeIndex(r + 1, c), // bottom
    vEdgeIndex(r, c),     // left
    vEdgeIndex(r, c + 1), // right
  ]
}

// Returns 1-2 box indices adjacent to edge e
export function boxesOfEdge(e) {
  if (e < 0 || e >= DB_EDGE_COUNT) return []

  if (e < 20) {
    // Horizontal edge: hEdgeIndex(row, col) = row*4+col
    const row = Math.floor(e / 4)
    const col = e % 4
    const result = []
    if (row > 0) result.push((row - 1) * DB_SIZE + col)   // box above
    if (row < DB_SIZE) result.push(row * DB_SIZE + col)   // box below
    return result
  } else {
    // Vertical edge: vEdgeIndex(row, col) = 20 + row*5 + col
    const idx = e - 20
    const row = Math.floor(idx / 5)
    const col = idx % 5
    const result = []
    if (col > 0) result.push(row * DB_SIZE + (col - 1))  // box to left
    if (col < DB_SIZE) result.push(row * DB_SIZE + col)  // box to right
    return result
  }
}

// Pure: apply edge move. Returns null if out of range or already occupied.
// Returns { edges, boxes, completedBoxes: number[] }
export function applyEdgeMove(edges, boxes, edgeIndex, symbol) {
  if (edgeIndex < 0 || edgeIndex >= DB_EDGE_COUNT) return null
  if (edges[edgeIndex]) return null

  const newEdges = [...edges]
  newEdges[edgeIndex] = symbol

  const newBoxes = [...boxes]
  const completedBoxes = []

  for (const boxIdx of boxesOfEdge(edgeIndex)) {
    if (newBoxes[boxIdx]) continue // already claimed, skip
    const [top, bottom, left, right] = edgesOfBox(boxIdx)
    if (newEdges[top] && newEdges[bottom] && newEdges[left] && newEdges[right]) {
      newBoxes[boxIdx] = symbol
      completedBoxes.push(boxIdx)
    }
  }

  return { edges: newEdges, boxes: newBoxes, completedBoxes }
}

// Returns winner object or null
export function getDotsAndBoxesWinner(boxes) {
  let x = 0
  let o = 0
  for (const b of boxes) {
    if (b === 'X') x++
    else if (b === 'O') o++
  }
  if (x >= 9) return { winner: 'X' }
  if (o >= 9) return { winner: 'O' }
  if (x + o === DB_BOX_COUNT) return { winner: 'draw' }
  return null
}
