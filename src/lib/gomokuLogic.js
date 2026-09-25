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

// ---------------------------------------------------------------------------
// Swap (pie) rule — the GOMOKU SWAP variant. Freestyle Gomoku is a proven,
// human-executable first-player win, so after the very first stone the second
// player may SWAP instead of placing: the opening stone becomes theirs, in
// place (the board is symmetric, so no reflection is needed), and the turn
// passes back to the opener. One swap per round: the room's `pieSwap` flag
// blocks a swap-back, and every placement clears it.
// ---------------------------------------------------------------------------
export const SWAP_ACTION = 'swap'
export const isSwapMove = move => move?.action === SWAP_ACTION

// Index of the only stone on the board, or -1 unless exactly one exists.
function loneStone(board) {
  let found = -1
  for (let i = 0; i < GOMOKU_CELL_COUNT; i++) {
    if (!board[i]) continue
    if (found !== -1) return -1
    found = i
  }
  return found
}

// Legal only on the second move of a round: exactly one stone, owned by the
// opponent of `symbol`, and no swap yet this round.
export function canGomokuSwap(board, symbol, swapped = false) {
  if (swapped || (symbol !== 'X' && symbol !== 'O')) return false
  const i = loneStone(board)
  return i !== -1 && board[i] !== symbol
}

// One GOMOKU SWAP turn: a placement (cell index) or a swap ({ action: 'swap' }).
// Returns null when illegal, else { board, index, swapped, result } — index is
// the cell that changed, swapped is true only for a swap, result is
// getGomokuWinner's verdict (always null after a swap).
export function applyGomokuMove(board, move, symbol, swapped = false) {
  if (isSwapMove(move)) {
    if (!canGomokuSwap(board, symbol, swapped)) return null
    const index = loneStone(board)
    const next = [...board]
    next[index] = symbol
    return { board: next, index, swapped: true, result: null }
  }
  if (!Number.isInteger(move) || move < 0 || move >= GOMOKU_CELL_COUNT || board[move]) return null
  const next = [...board]
  next[move] = symbol
  return { board: next, index: move, swapped: false, result: getGomokuWinner(next) }
}

// A swap resolves to the stone it takes over (-1 when there is no lone stone);
// ownership and once-per-round checks live in applyGomokuMove.
export const getMoveIndex = (board, i) => {
  if (isSwapMove(i)) return loneStone(board)
  return board[i] ? -1 : i
};
