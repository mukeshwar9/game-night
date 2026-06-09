const ROWS = 6;
const COLS = 7;

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function getConnectFourWinner(board) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row * COLS + col];
      if (!cell) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const line = [];
        for (let k = 0; k < 4; k++) {
          const r = row + dr * k;
          const c = col + dc * k;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
          if (board[r * COLS + c] !== cell) break;
          line.push(r * COLS + c);
        }
        if (line.length === 4) return { winner: cell, line };
      }
    }
  }
  if (board.every(c => c)) return { winner: 'draw', line: [] };
  return null;
}

export function getConnectFourDrop(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (!board[row * COLS + col]) return row * COLS + col;
  }
  return -1;
}

export const CF_COLS = COLS;
export const CF_BOARD_SIZE = ROWS * COLS;
