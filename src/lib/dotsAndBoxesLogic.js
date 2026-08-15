export const DB_SIZE = 6
export const DB_SIZE_CLASSIC = 4

export function dbConfig(size = DB_SIZE) {
  const dots = size + 1
  const hEdgeCount = dots * size
  const vEdgeCount = size * dots
  const boxCount = size * size
  return {
    size,
    dots,
    hEdgeCount,
    vEdgeCount,
    edgeCount: hEdgeCount + vEdgeCount,
    boxCount,
    clinch: Math.floor(boxCount / 2) + 1,
  }
}

const LARGE = dbConfig(DB_SIZE)
export const DB_DOTS = LARGE.dots
export const DB_H_EDGE_COUNT = LARGE.hEdgeCount
export const DB_V_EDGE_COUNT = LARGE.vEdgeCount
export const DB_EDGE_COUNT = LARGE.edgeCount
export const DB_BOX_COUNT = LARGE.boxCount
export const DB_CLINCH = LARGE.clinch

const CLASSIC = dbConfig(DB_SIZE_CLASSIC)
export const DB_EDGE_COUNT_CLASSIC = CLASSIC.edgeCount
export const DB_BOX_COUNT_CLASSIC = CLASSIC.boxCount

// Horizontal edge index: row 0..size, col 0..size-1
export const hEdgeIndex = (row, col, size = DB_SIZE) => row * size + col

// Vertical edge index: row 0..size-1, col 0..size
export const vEdgeIndex = (row, col, size = DB_SIZE) => {
  const { hEdgeCount, dots } = dbConfig(size)
  return hEdgeCount + row * dots + col
}

// Returns [top, bottom, left, right] edge indices for box b
export function edgesOfBox(b, size = DB_SIZE) {
  const r = Math.floor(b / size)
  const c = b % size
  return [
    hEdgeIndex(r, c, size),
    hEdgeIndex(r + 1, c, size),
    vEdgeIndex(r, c, size),
    vEdgeIndex(r, c + 1, size),
  ]
}

// Returns 1-2 box indices adjacent to edge e
export function boxesOfEdge(e, size = DB_SIZE) {
  const { hEdgeCount, dots, edgeCount } = dbConfig(size)
  if (e < 0 || e >= edgeCount) return []

  if (e < hEdgeCount) {
    const row = Math.floor(e / size)
    const col = e % size
    const result = []
    if (row > 0) result.push((row - 1) * size + col)
    if (row < size) result.push(row * size + col)
    return result
  }

  const idx = e - hEdgeCount
  const row = Math.floor(idx / dots)
  const col = idx % dots
  const result = []
  if (col > 0) result.push(row * size + (col - 1))
  if (col < size) result.push(row * size + col)
  return result
}

// Pure: apply edge move. Returns null if out of range or already occupied.
// Returns { edges, boxes, completedBoxes: number[] }
export function applyEdgeMove(edges, boxes, edgeIndex, symbol, size = DB_SIZE) {
  const { edgeCount } = dbConfig(size)
  if (edgeIndex < 0 || edgeIndex >= edgeCount) return null
  if (edges[edgeIndex]) return null

  const newEdges = [...edges]
  newEdges[edgeIndex] = symbol

  const newBoxes = [...boxes]
  const completedBoxes = []

  for (const boxIdx of boxesOfEdge(edgeIndex, size)) {
    if (newBoxes[boxIdx]) continue
    const [top, bottom, left, right] = edgesOfBox(boxIdx, size)
    if (newEdges[top] && newEdges[bottom] && newEdges[left] && newEdges[right]) {
      newBoxes[boxIdx] = symbol
      completedBoxes.push(boxIdx)
    }
  }

  return { edges: newEdges, boxes: newBoxes, completedBoxes }
}

export function getDotsAndBoxesWinner(boxes, size = DB_SIZE) {
  const { boxCount, clinch } = dbConfig(size)
  let x = 0
  let o = 0
  for (const b of boxes) {
    if (b === 'X') x++
    else if (b === 'O') o++
  }
  if (x >= clinch) return { winner: 'X' }
  if (o >= clinch) return { winner: 'O' }
  if (x + o === boxCount) return { winner: 'draw' }
  return null
}

export function dbSizeFromGame(game) {
  const n = game?.boxes?.length
  if (n === DB_BOX_COUNT_CLASSIC) return DB_SIZE_CLASSIC
  if (n === DB_BOX_COUNT) return DB_SIZE
  if (game?.board?.length === DB_EDGE_COUNT_CLASSIC) return DB_SIZE_CLASSIC
  return DB_SIZE
}
