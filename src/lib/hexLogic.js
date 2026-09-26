import { normalizeBoard } from './gameLogic'

export const HEX_SIZE = 11;
export const HEX_CELL_COUNT = 121; // 11 × 11

// Hex adjacency for cell (r, c): (r, c±1), (r±1, c), (r-1, c+1), (r+1, c-1).
// No wraparound across row boundaries.
export function neighbors(i) {
  const r = Math.floor(i / HEX_SIZE);
  const c = i % HEX_SIZE;
  const out = [];
  if (c > 0) out.push(i - 1);
  if (c < HEX_SIZE - 1) out.push(i + 1);
  if (r > 0) out.push(i - HEX_SIZE);
  if (r < HEX_SIZE - 1) out.push(i + HEX_SIZE);
  if (r > 0 && c < HEX_SIZE - 1) out.push(i - HEX_SIZE + 1);
  if (r < HEX_SIZE - 1 && c > 0) out.push(i + HEX_SIZE - 1);
  return out;
}

// BFS from a virtual start edge over `symbol` stones; returns the shortest
// connecting path (array of cell indices) once the goal edge is reached.
function shortestPath(board, symbol, isStart, isGoal) {
  const parent = new Map();
  const queue = [];
  for (let i = 0; i < HEX_CELL_COUNT; i++) {
    if (isStart(i) && board[i] === symbol) {
      parent.set(i, -1);
      queue.push(i);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (isGoal(cur)) {
      const path = [];
      for (let n = cur; n !== -1; n = parent.get(n)) path.push(n);
      return path.reverse();
    }
    for (const nb of neighbors(cur)) {
      if (!parent.has(nb) && board[nb] === symbol) {
        parent.set(nb, cur);
        queue.push(nb);
      }
    }
  }
  return null;
}

// X connects left↔right edges, O connects top↔bottom. Draws are impossible:
// a full board always yields exactly one winner, so there is no draw branch.
// Returns null while unresolved, else { winner, line } where line is the
// shortest connecting path (variable length, ≥ 11 cells). Key is `line` to
// match every other logic module's getWinner contract (see gameLogic.js).
export function getHexWinner(rawBoard) {
  const board = normalizeBoard(rawBoard, HEX_CELL_COUNT);
  const xPath = shortestPath(
    board,
    'X',
    i => i % HEX_SIZE === 0,
    i => i % HEX_SIZE === HEX_SIZE - 1,
  );
  if (xPath) return { winner: 'X', line: xPath };
  const oPath = shortestPath(
    board,
    'O',
    i => i < HEX_SIZE,
    i => i >= HEX_CELL_COUNT - HEX_SIZE,
  );
  if (oPath) return { winner: 'O', line: oPath };
  return null;
}

// ---------------------------------------------------------------------------
// Swap (pie) rule — standard in Hex, where the opening move is a proven
// first-player advantage. After the very first stone of a round, the second
// player may SWAP instead of placing: the opening stone becomes theirs,
// reflected across the long diagonal ((r, c) → (c, r)) so it serves their own
// pair of edges exactly as it served the opener's (X runs left-right, O
// top-bottom). The turn then passes back to the opener. One swap per round:
// the room's `pieSwap` flag blocks a swap-back, and every placement clears it.
// ---------------------------------------------------------------------------
export const SWAP_ACTION = 'swap'
export const isSwapMove = move => move?.action === SWAP_ACTION

// (r, c) → (c, r). Maps X's left/right edges onto O's top/bottom edges.
export const hexMirror = i => (i % HEX_SIZE) * HEX_SIZE + Math.floor(i / HEX_SIZE)

// Index of the only stone on the board, or -1 unless exactly one exists.
function loneStone(board) {
  let found = -1
  for (let i = 0; i < HEX_CELL_COUNT; i++) {
    if (!board[i]) continue
    if (found !== -1) return -1
    found = i
  }
  return found
}

// Legal only on the second move of a round: exactly one stone, owned by the
// opponent of `symbol`, and no swap yet this round.
export function canHexSwap(rawBoard, symbol, swapped = false) {
  if (swapped || (symbol !== 'X' && symbol !== 'O')) return false
  const board = normalizeBoard(rawBoard, HEX_CELL_COUNT)
  const i = loneStone(board)
  return i !== -1 && board[i] !== symbol
}

// One Hex turn: a placement (cell index) or a swap ({ action: 'swap' }).
// Returns null when illegal, else { board, index, swapped, result } — index is
// the cell that changed (the mirrored cell for a swap), swapped is true only
// for a swap, result is getHexWinner's verdict (always null after a swap: one
// stone never spans the board).
export function applyHexMove(rawBoard, move, symbol, swapped = false) {
  const board = normalizeBoard(rawBoard, HEX_CELL_COUNT)
  if (isSwapMove(move)) {
    if (!canHexSwap(board, symbol, swapped)) return null
    const from = loneStone(board)
    const to = hexMirror(from)
    const next = [...board]
    next[from] = ''
    next[to] = symbol
    return { board: next, index: to, swapped: true, result: null }
  }
  if (!Number.isInteger(move) || move < 0 || move >= HEX_CELL_COUNT || board[move]) return null
  const next = [...board]
  next[move] = symbol
  return { board: next, index: move, swapped: false, result: getHexWinner(next) }
}

// A swap resolves to the stone it takes over (-1 when there is no lone stone);
// ownership and once-per-round checks live in applyHexMove.
export const getMoveIndex = (board, i) => {
  if (isSwapMove(i)) return loneStone(normalizeBoard(board, HEX_CELL_COUNT))
  return board[i] ? -1 : i
};
