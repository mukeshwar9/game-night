export const REVERSI_SIZE = 64
export const REVERSI_DIM = 8

// 8 directions: N, NE, E, SE, S, SW, W, NW (as [dr, dc])
const DIRECTIONS = [
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
]

const opponentOf = symbol => (symbol === 'X' ? 'O' : 'X')

// Standard Othello opening: top-left & bottom-right of the centre 2×2 are 'X',
// the other diagonal is 'O'.
//   (3,3)=27='X'  (3,4)=28='O'
//   (4,3)=35='O'  (4,4)=36='X'
export function reversiInitialBoard() {
  const board = Array(REVERSI_SIZE).fill('')
  board[27] = 'X'
  board[28] = 'O'
  board[35] = 'O'
  board[36] = 'X'
  return board
}

// Returns the list of discs that would be flipped if `symbol` plays at `index`.
// Empty array means the move is illegal (flanks nothing). Cell must be empty.
export function flippedBy(board, index, symbol) {
  if (index < 0 || index >= REVERSI_SIZE) return []
  if (board[index] !== '') return []

  const opp = opponentOf(symbol)
  const row = Math.floor(index / REVERSI_DIM)
  const col = index % REVERSI_DIM
  const flips = []

  for (const [dr, dc] of DIRECTIONS) {
    const line = []
    let r = row + dr
    let c = col + dc
    while (r >= 0 && r < REVERSI_DIM && c >= 0 && c < REVERSI_DIM) {
      const cell = board[r * REVERSI_DIM + c]
      if (cell === opp) {
        line.push(r * REVERSI_DIM + c)
      } else if (cell === symbol) {
        // Closed the bracket on our own disc — everything in line flips,
        // but only if there was at least one opponent disc between.
        if (line.length) flips.push(...line)
        break
      } else {
        // Empty cell — bracket never closes in this direction.
        break
      }
      r += dr
      c += dc
    }
  }

  return flips
}

// All indices where `symbol` has a legal move (flanks ≥1 disc).
export function legalMoves(board, symbol) {
  const moves = []
  for (let i = 0; i < REVERSI_SIZE; i++) {
    if (board[i] !== '') continue
    if (flippedBy(board, i, symbol).length) moves.push(i)
  }
  return moves
}

// True if `symbol` has at least one legal move.
export function hasAnyMove(board, symbol) {
  for (let i = 0; i < REVERSI_SIZE; i++) {
    if (board[i] !== '') continue
    if (flippedBy(board, i, symbol).length) return true
  }
  return false
}

// Pure move application. Returns null if the move is out of range, the cell is
// occupied, or it flanks nothing. Returns { board } with a new array where the
// disc is placed and all bracketed discs are flipped to `symbol`.
export function applyReversiMove(board, index, symbol) {
  if (index < 0 || index >= REVERSI_SIZE) return null
  if (board[index] !== '') return null

  const flips = flippedBy(board, index, symbol)
  if (!flips.length) return null

  const newBoard = [...board]
  newBoard[index] = symbol
  for (const f of flips) newBoard[f] = symbol

  return { board: newBoard }
}

// Returns a winner object or null. Call when the game is over — i.e. neither
// side has a legal move OR the board is full. More discs wins; equal = draw.
// Returns null while the game is still playable (caller decides), but as a
// safety it also returns null if either side still has a move and the board
// is not full.
export function getReversiWinner(board) {
  const full = !board.includes('')
  if (!full && (hasAnyMove(board, 'X') || hasAnyMove(board, 'O'))) return null

  let x = 0
  let o = 0
  for (const cell of board) {
    if (cell === 'X') x++
    else if (cell === 'O') o++
  }

  if (x > o) return { winner: 'X' }
  if (o > x) return { winner: 'O' }
  return { winner: 'draw' }
}
