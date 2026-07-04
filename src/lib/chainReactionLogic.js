// Chain Reaction — pure game logic
// Board: 6 columns × 8 rows = 48 cells, row-major.
// Cell encoding: '' = empty, '<symbol><count>' e.g. 'X1', 'O3'.

export const CR_COLS = 6
export const CR_ROWS = 8
export const CR_CELL_COUNT = CR_COLS * CR_ROWS // 48

// How many orthogonal neighbours a cell has (= critical mass to explode).
export function criticalMass(index) {
  const row = Math.floor(index / CR_COLS)
  const col = index % CR_COLS
  const top    = row > 0
  const bottom = row < CR_ROWS - 1
  const left   = col > 0
  const right  = col < CR_COLS - 1
  return (top ? 1 : 0) + (bottom ? 1 : 0) + (left ? 1 : 0) + (right ? 1 : 0)
}

// Orthogonal neighbour indices of a cell.
function neighbours(index) {
  const row = Math.floor(index / CR_COLS)
  const col = index % CR_COLS
  const ns = []
  if (row > 0)             ns.push(index - CR_COLS)
  if (row < CR_ROWS - 1)   ns.push(index + CR_COLS)
  if (col > 0)             ns.push(index - 1)
  if (col < CR_COLS - 1)   ns.push(index + 1)
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
 * @returns {{ board: string[], steps: Array<{ exploded: number[], converted: number[] }> }}
 *   steps: one entry per explosion wave.
 *   exploded = indices that fired that wave (ascending).
 *   converted = neighbour indices that received an orb that wave (ascending, may overlap with exploded from prior waves).
 */
export function applyPlacement(board, index, symbol) {
  const newBoard = [...board]

  // Place one orb.
  const { count: c0 } = decodeCell(newBoard[index])
  newBoard[index] = encodeCell(symbol, c0 + 1)

  const steps = []
  const MAX_WAVES = CR_CELL_COUNT * 10
  let safetyWaves = 0

  // Seed the first wave: if the placed cell is now at or above critical mass.
  let currentLevel = c0 + 1 >= criticalMass(index) ? [index] : []

  while (currentLevel.length && safetyWaves++ < MAX_WAVES) {
    // Deduplicate and sort ascending for determinism.
    const toExplode = [...new Set(currentLevel)].sort((a, b) => a - b)
    const nextLevel = []
    const convertedSet = new Set()

    for (const idx of toExplode) {
      const cm = criticalMass(idx)
      const { owner, count } = decodeCell(newBoard[idx])
      if (count < cm) continue // no longer critical (resolved by a prior step this wave)

      // Explode: shed criticalMass orbs, remainder stays with original owner.
      const remainder = count - cm
      newBoard[idx] = encodeCell(owner, remainder)

      for (const n of neighbours(idx)) {
        const { count: nc } = decodeCell(newBoard[n])
        newBoard[n] = encodeCell(symbol, nc + 1)
        convertedSet.add(n)
        if (nc + 1 >= criticalMass(n)) {
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

// Check winner after the board is stable.
// Returns { winner } or null.
// `crMoves` is the total move count *after* this move (≥2 means both players moved).
function checkWinner(board, crMoves) {
  if (crMoves < 2) return null // need at least one move each
  const hasX = board.some(c => c && c[0] === 'X')
  const hasO = board.some(c => c && c[0] === 'O')
  if (!hasX) return { winner: 'O' }
  if (!hasO) return { winner: 'X' }
  return null
}

/**
 * Apply a Chain Reaction move.
 * @param {object} params
 * @param {string[]} params.board  - current board (string[48])
 * @param {object}  params.game   - full game node (for crMoves)
 * @param {number}  params.index  - target cell index
 * @param {string}  params.symbol - 'X' or 'O'
 * @returns {{ updates, result } | null}  null = invalid move (ignored by Game.jsx)
 */
export function applyChainReactionMove({ board, game, index, symbol }) {
  if (index < 0 || index >= CR_CELL_COUNT) return null

  const cell = board[index]
  if (cell && cell[0] !== symbol) return null // opponent's cell — illegal

  const { board: newBoard } = applyPlacement(board, index, symbol)

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
