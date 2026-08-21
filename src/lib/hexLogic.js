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
// Returns null while unresolved, else { winner, winningLine } where
// winningLine is the shortest connecting path (variable length, ≥ 11 cells).
export function getHexWinner(rawBoard) {
  const board = normalizeBoard(rawBoard, HEX_CELL_COUNT);
  const xPath = shortestPath(
    board,
    'X',
    i => i % HEX_SIZE === 0,
    i => i % HEX_SIZE === HEX_SIZE - 1,
  );
  if (xPath) return { winner: 'X', winningLine: xPath };
  const oPath = shortestPath(
    board,
    'O',
    i => i < HEX_SIZE,
    i => i >= HEX_CELL_COUNT - HEX_SIZE,
  );
  if (oPath) return { winner: 'O', winningLine: oPath };
  return null;
}

export const getMoveIndex = (board, i) => (board[i] ? -1 : i);
