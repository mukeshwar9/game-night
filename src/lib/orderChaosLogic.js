export const OC_SIZE = 6
export const OC_CELL_COUNT = 36
export const OC_RUN = 5

// [dr, dc] for 4 canonical directions: right, down, down-right, down-left
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

// Self-contained 5-in-a-row scan (does NOT import gomoku).
// Returns the first run of OC_RUN identical non-empty letters as an
// ascending index array, or null if none exists. Bounds-checked per step
// to prevent wraparound across rows/columns.
export function findRun(board) {
  for (let row = 0; row < OC_SIZE; row++) {
    for (let col = 0; col < OC_SIZE; col++) {
      const cell = board[row * OC_SIZE + col]
      if (!cell) continue
      for (const [dr, dc] of DIRECTIONS) {
        const line = []
        for (let k = 0; k < OC_RUN; k++) {
          const r = row + dr * k
          const c = col + dc * k
          if (r < 0 || r >= OC_SIZE || c < 0 || c >= OC_SIZE) break
          if (board[r * OC_SIZE + c] !== cell) break
          line.push(r * OC_SIZE + c)
        }
        if (line.length === OC_RUN) {
          return [...line].sort((a, b) => a - b)
        }
      }
    }
  }
  return null
}

// Pure move application.
// Returns null if index is out of range, cell is occupied, or letter is
// not 'X'/'O'. Returns { board } with a new array.
export function applyOrderChaosMove(board, index, letter) {
  if (index < 0 || index >= OC_CELL_COUNT) return null
  if (board[index] !== '') return null
  if (letter !== 'X' && letter !== 'O') return null

  const newBoard = [...board]
  newBoard[index] = letter
  return { board: newBoard }
}

// Order (seat X) wins by making any 5-in-a-row of either letter.
// Chaos (seat O) wins if the board fills with no 5-run.
// Returns { winner: 'X', line } | { winner: 'O' } | null.
export function getOrderChaosWinner(board) {
  const line = findRun(board)
  if (line) return { winner: 'X', line }
  if (board.every(c => c !== '')) return { winner: 'O' }
  return null
}
