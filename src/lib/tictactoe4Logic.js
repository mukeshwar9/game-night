export const TTT4_SIZE = 4
export const TTT4_CELL_COUNT = 16
export const TTT4_WIN_LINES = [
  [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
  [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
  [0, 5, 10, 15], [3, 6, 9, 12],
]

export function getTicTacToe4Winner(board) {
  for (const line of TTT4_WIN_LINES) {
    const [a, b, c, d] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c] && board[a] === board[d]) {
      return { winner: board[a], line }
    }
  }
  if (board.every(c => c !== '')) return { winner: 'draw', line: [] }
  return null
}
