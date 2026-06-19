export const GOMOKU_SIZE = 15;
export const GOMOKU_CELL_COUNT = 225; // 15 × 15
export const GOMOKU_WIN_RUN = 5;

// [dr, dc] for 4 canonical directions: right, down, down-right, down-left.
// Generalized from src/lib/connectFourLogic.js — scans for a run of >= 5.
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// Scan every cell × 4 directions for a run of >= 5 same marks.
// board: string[225], '' for empty, 'X'/'O' for stones.
// Returns { winner, line } with the 5 winning indices, { winner: 'draw' }
// when the board is full with no run, else null.
export function getGomokuWinner(board) {
  for (let row = 0; row < GOMOKU_SIZE; row++) {
    for (let col = 0; col < GOMOKU_SIZE; col++) {
      const cell = board[row * GOMOKU_SIZE + col];
      if (!cell) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const line = [];
        for (let k = 0; k < GOMOKU_WIN_RUN; k++) {
          const r = row + dr * k;
          const c = col + dc * k;
          if (r < 0 || r >= GOMOKU_SIZE || c < 0 || c >= GOMOKU_SIZE) break;
          if (board[r * GOMOKU_SIZE + c] !== cell) break;
          line.push(r * GOMOKU_SIZE + c);
        }
        if (line.length === GOMOKU_WIN_RUN) return { winner: cell, line };
      }
    }
  }
  if (board.every(c => c)) return { winner: 'draw' };
  return null;
}

export const getMoveIndex = (board, i) => (board[i] ? -1 : i);
