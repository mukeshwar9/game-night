// Chain Reaction — pure game logic
// Default board: 8 columns × 10 rows = 80 cells, row-major.
// Classic variant: 6×8 = 48 cells.
// Cell encoding: '' = empty, '<symbol><count>' e.g. 'X1', 'O3'.

export const CR_COLS = 8
export const CR_ROWS = 10
export const CR_CELL_COUNT = CR_COLS * CR_ROWS

export const CR_COLS_CLASSIC = 6
export const CR_ROWS_CLASSIC = 8
export const CR_CELL_COUNT_CLASSIC = CR_COLS_CLASSIC * CR_ROWS_CLASSIC

export function crDimsFromLength(n) {
  if (n === CR_CELL_COUNT_CLASSIC) return { cols: CR_COLS_CLASSIC, rows: CR_ROWS_CLASSIC }
  return { cols: CR_COLS, rows: CR_ROWS }
}

function resolveDims(board, dims) {
  if (dims?.cols && dims?.rows) return dims
  return crDimsFromLength(board?.length)
}

// How many orthogonal neighbours a cell has (= critical mass to explode).
export function criticalMass(index, cols = CR_COLS, rows = CR_ROWS) {
  const row = Math.floor(index / cols)
  const col = index % cols
  const top    = row > 0
  const bottom = row < rows - 1
  const left   = col > 0
  const right  = col < cols - 1
  return (top ? 1 : 0) + (bottom ? 1 : 0) + (left ? 1 : 0) + (right ? 1 : 0)
}

// Orthogonal neighbour indices of a cell.
function neighbours(index, cols, rows) {
  const row = Math.floor(index / cols)
  const col = index % cols
  const ns = []
  if (row > 0)           ns.push(index - cols)
  if (row < rows - 1)    ns.push(index + cols)
  if (col > 0)           ns.push(index - 1)
  if (col < cols - 1)    ns.push(index + 1)
  return ns
}

// Decode a cell string.
export function decodeCell(cell) {
  if (!cell) return { owner: null, count: 0 }
  return { owner: cell[0], count: parseInt(cell.slice(1), 10) }
}

// Encode a cell. count === 0 → ''.
export function encodeCell(owner, count) {
  if (!owner || count <= 0) return ''
  return `${owner}${count}`
}

/**
 * Apply a single placement and resolve all chain explosions.
 * Returns the settled board AND ordered explosion waves for animation.
 *
 * @param {string[]} board  - board before placement (not mutated)
 * @param {number}   index  - cell to place on
 * @param {string}   symbol - 'X' or 'O'
 * @param {{cols:number, rows:number}} [dims]
 * @returns {{ board: string[], steps: Array<{ exploded: number[], converted: number[] }> }}
 */
export function applyPlacement(board, index, symbol, dims) {
  const { cols, rows } = resolveDims(board, dims)
  const cellCount = cols * rows
  const newBoard = [...board]

  const { count: c0 } = decodeCell(newBoard[index])
  newBoard[index] = encodeCell(symbol, c0 + 1)

  const steps = []
  const MAX_WAVES = cellCount * 10
  let safetyWaves = 0

  let currentLevel = c0 + 1 >= criticalMass(index, cols, rows) ? [index] : []

  while (currentLevel.length && safetyWaves++ < MAX_WAVES) {
    const toExplode = [...new Set(currentLevel)].sort((a, b) => a - b)
    const nextLevel = []
    const convertedSet = new Set()

    for (const idx of toExplode) {
      const cm = criticalMass(idx, cols, rows)
      const { owner, count } = decodeCell(newBoard[idx])
      if (count < cm) continue

      const remainder = count - cm
      newBoard[idx] = encodeCell(owner, remainder)

      for (const n of neighbours(idx, cols, rows)) {
        const { count: nc } = decodeCell(newBoard[n])
        newBoard[n] = encodeCell(symbol, nc + 1)
        convertedSet.add(n)
        if (nc + 1 >= criticalMass(n, cols, rows)) {
          nextLevel.push(n)
        }
      }
    }

    steps.push({
      exploded: toExplode,
      converted: [...convertedSet].sort((a, b) => a - b),
    })
    currentLevel = nextLevel
  }

  return { board: newBoard, steps }
}

function checkWinner(board, crMoves) {
  if (crMoves < 2) return null
  const hasX = board.some(c => c && c[0] === 'X')
  const hasO = board.some(c => c && c[0] === 'O')
  if (!hasX) return { winner: 'O' }
  if (!hasO) return { winner: 'X' }
  return null
}

/**
 * Apply a Chain Reaction move.
 * @returns {{ updates, result } | null}
 */
export function applyChainReactionMove({ board, game, index, symbol, cols, rows }) {
  const dims = resolveDims(board, (cols && rows) ? { cols, rows } : undefined)
  const cellCount = dims.cols * dims.rows
  if (index < 0 || index >= cellCount) return null

  const cell = board[index]
  if (cell && cell[0] !== symbol) return null

  const { board: newBoard } = applyPlacement(board, index, symbol, dims)

  const newMoves = (game.crMoves ?? 0) + 1
  const result = checkWinner(newBoard, newMoves)

  return {
    updates: {
      board: newBoard,
      crMoves: newMoves,
      crLastMove: index,
      currentTurn: symbol === 'X' ? 'O' : 'X',
    },
    result,
  }
}
