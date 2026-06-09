const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function getWinner(board) {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every(cell => cell)) return { winner: 'draw', line: [] };
  return null;
}

export function generateGameId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function normalizeBoard(raw, size = 9) {
  const board = Array(size).fill('');
  if (!raw) return board;
  const entries = Array.isArray(raw)
    ? raw.map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k), v]);
  entries.forEach(([i, v]) => { if (i < size) board[i] = v || ''; });
  return board;
}
