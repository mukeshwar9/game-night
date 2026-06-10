export const SOS_SIZE = 7
export const SOS_CELL_COUNT = 49

export function normalizeSosLines(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.values(raw)
}

// Returns array of [a,b,c] triples (ascending) that spell S-O-S and include index.
// board must already have the letter placed at index.
// Scans 4 canonical directions × 3 offsets; checks row/col bounds to prevent wraparound.
export function findNewSosLines(board, index) {
  const row = Math.floor(index / SOS_SIZE)
  const col = index % SOS_SIZE
  const lines = []

  // [dr, dc] for 4 canonical directions: right, down, down-right, down-left
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]

  for (const [dr, dc] of directions) {
    // placed cell can be the 1st, 2nd, or 3rd cell of the S-O-S triple
    for (let offset = 0; offset < 3; offset++) {
      // The triple starts at (row - offset*dr, col - offset*dc)
      const r0 = row - offset * dr
      const c0 = col - offset * dc

      // Build the three cell positions
      const cells = []
      let valid = true
      for (let k = 0; k < 3; k++) {
        const r = r0 + k * dr
        const c = c0 + k * dc
        if (r < 0 || r >= SOS_SIZE || c < 0 || c >= SOS_SIZE) {
          valid = false
          break
        }
        cells.push(r * SOS_SIZE + c)
      }

      if (!valid) continue

      const [a, b, c] = cells
      if (
        board[a] === 'S' &&
        board[b] === 'O' &&
        board[c] === 'S'
      ) {
        // Return in ascending order
        const sorted = [a, b, c].sort((x, y) => x - y)
        lines.push(sorted)
      }
    }
  }

  return lines
}

// Pure move application.
// Returns null if index is out of range, cell is occupied, or letter is not 'S'/'O'.
// Returns { board, sosLines, completedCount } with new arrays.
export function applySosMove(board, sosLines, index, letter, symbol) {
  if (index < 0 || index >= SOS_CELL_COUNT) return null
  if (board[index] !== '') return null
  if (letter !== 'S' && letter !== 'O') return null

  const newBoard = [...board]
  newBoard[index] = letter

  const newLines = findNewSosLines(newBoard, index)
  const newSosLines = [
    ...sosLines,
    ...newLines.map(cells => ({ cells, by: symbol })),
  ]

  return {
    board: newBoard,
    sosLines: newSosLines,
    completedCount: newLines.length,
  }
}

// Returns null unless every cell is filled.
// Then counts lines by each player and returns winner object.
export function getSosWinner(board, sosLines) {
  if (board.some(c => c === '')) return null

  let x = 0
  let o = 0
  for (const line of sosLines) {
    if (line.by === 'X') x++
    else if (line.by === 'O') o++
  }

  if (x > o) return { winner: 'X' }
  if (o > x) return { winner: 'O' }
  return { winner: 'draw' }
}
