const DEFAULT_COLS = 7;
const DEFAULT_ROWS = 6;
const DEFAULT_WIN = 4;

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function getWinnerWithConfig(board, cols, rows, winRun) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = board[row * cols + col];
      if (!cell) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const line = [];
        for (let k = 0; k < winRun; k++) {
          const r = row + dr * k;
          const c = col + dc * k;
          if (r < 0 || r >= rows || c < 0 || c >= cols) break;
          if (board[r * cols + c] !== cell) break;
          line.push(r * cols + c);
        }
        if (line.length === winRun) return { winner: cell, line };
      }
    }
  }
  if (board.every(c => c)) return { winner: 'draw', line: [] };
  return null;
}

function getDropWithConfig(board, col, cols, rows) {
  if (col < 0 || col >= cols) return -1;
  if (board[col] !== '') return -1
  for (let row = rows - 1; row >= 0; row--) {
    if (!board[row * cols + col]) return row * cols + col;
  }
  return -1;
}

export function getConnectFourWinner(board, config) {
  if (config && typeof config.cols === 'number') {
    return getWinnerWithConfig(board, config.cols, config.rows, config.winRun ?? DEFAULT_WIN)
  }
  return getWinnerWithConfig(board, DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_WIN)
}

export function getConnectFourDrop(board, col, config) {
  if (config && typeof config.cols === 'number') {
    return getDropWithConfig(board, col, config.cols, config.rows)
  }
  // legacy col-only call: col is number, config undefined
  if (typeof col === 'number' && typeof config === 'undefined') {
    return getDropWithConfig(board, col, DEFAULT_COLS, DEFAULT_ROWS)
  }
  return getDropWithConfig(board, col, DEFAULT_COLS, DEFAULT_ROWS)
}

export const CF_COLS = DEFAULT_COLS;
export const CF_ROWS = DEFAULT_ROWS;
export const CF_BOARD_SIZE = DEFAULT_ROWS * DEFAULT_COLS;

export const CF5_COLS = 9;
export const CF5_ROWS = 7;
export const CF5_BOARD_SIZE = 63;
export const CF5 = { cols: 9, rows: 7, winRun: 5 };

// Classic Connect Four now plays on a 9×7 grid (four in a row still wins).
// Pop Out keeps the original 7×6 board, so the DEFAULT_* constants above stay
// at 7×6 and the bigger classic board passes this config explicitly.
export const CF_BIG_COLS = 9;
export const CF_BIG_ROWS = 7;
export const CF_BIG_BOARD_SIZE = 63;
export const CF_BIG = { cols: 9, rows: 7, winRun: 4 };
