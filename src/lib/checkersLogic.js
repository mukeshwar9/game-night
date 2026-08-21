export const CELL_COUNT = 64;

const SIZE = 8;
const DIRS_X = [
  [-1, -1],
  [-1, 1],
]; // X moves up (decreasing row)
const DIRS_O = [
  [1, -1],
  [1, 1],
]; // O moves down
const KING_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

// Cell encoding: '' | 'x' | 'X' | 'o' | 'O' — lowercase = man, uppercase = king.
// Row-major index: cell = r * 8 + c, r 0 = top. Playable (dark) squares: (r+c)%2===1.

export function INITIAL_CHECKERS() {
  const board = Array(CELL_COUNT).fill("");
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) board[r * SIZE + c] = "o";
    }
  }
  for (let r = 5; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) board[r * SIZE + c] = "x";
    }
  }
  return board;
}

export function normalizeCheckers(raw) {
  const board = Array(CELL_COUNT).fill("");
  if (!raw) return board;
  const entries = Array.isArray(raw)
    ? raw.map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k, 10), v]);
  entries.forEach(([i, v]) => {
    if (i >= 0 && i < CELL_COUNT && typeof v === "string" && "xXoO".includes(v)) {
      board[i] = v;
    }
  });
  return board;
}

const idx = (r, c) => r * SIZE + c;
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const sideOf = (p) => (p ? p.toUpperCase() : null);
const isKingPiece = (p) => !!p && p === p.toUpperCase();

function dirsFor(piece) {
  if (isKingPiece(piece)) return KING_DIRS;
  return piece === "x" ? DIRS_X : DIRS_O;
}

// Expand all maximal jump chains for the piece standing on `from`.
// Captured pieces come off the working board immediately (no re-jumping them);
// crowning ends the chain. Returns [{ path, captures, promotes }] where `path`
// lists every landing cell in order (final element === `to`) and `captures[i]`
// is the jumped square between path[i-1] (or `from`) and path[i].
function captureChains(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const startR = Math.floor(from / SIZE);
  const startC = from % SIZE;
  const results = [];
  const rec = (b, r, c, path, caps) => {
    const p = b[idx(r, c)];
    const king = isKingPiece(p);
    let extended = false;
    for (const [dr, dc] of dirsFor(p)) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      if (!inBounds(lr, lc)) continue;
      const mid = b[idx(mr, mc)];
      if (!mid || sideOf(mid) === sideOf(p)) continue;
      if (b[idx(lr, lc)] !== "") continue;
      extended = true;
      const nb = b.slice();
      nb[idx(r, c)] = "";
      nb[idx(mr, mc)] = "";
      const promotes = !king && (p === "x" ? lr === 0 : lr === 7);
      const nextPath = [...path, idx(lr, lc)];
      const nextCaps = [...caps, idx(mr, mc)];
      if (promotes) {
        // Crowning ends the move — no continuing the chain as a king.
        results.push({ path: nextPath, captures: nextCaps, promotes: true });
      } else {
        nb[idx(lr, lc)] = p;
        rec(nb, lr, lc, nextPath, nextCaps);
      }
    }
    if (!extended && path.length > 0) {
      results.push({ path, captures: caps, promotes: false });
    }
  };
  rec(board, startR, startC, [], []);
  return results;
}

// Deterministic pick between two moves sharing (from,to): more captures wins,
// ties broken by lexicographically smallest path.
function beatsCandidate(m, prev) {
  if (m.captures.length !== prev.captures.length) {
    return m.captures.length > prev.captures.length;
  }
  const len = Math.min(m.path.length, prev.path.length);
  for (let i = 0; i < len; i++) {
    if (m.path[i] !== prev.path[i]) return m.path[i] < prev.path[i];
  }
  return m.path.length < prev.path.length;
}

// All legal moves for `symbol` ('X'|'O'). Forced capture: when any jump exists,
// only jumps are returned. Each multi-jump chain is expanded into a single move
// { from, to, path, captures, promotes }; one canonical (max-capture) move is
// kept per (from,to) so lookup stays unambiguous.
export function getLegalMoves(board, symbol) {
  const b = normalizeCheckers(board);
  const s = symbol === "O" ? "O" : "X";
  const raw = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const p = b[i];
    if (!p || sideOf(p) !== s) continue;
    const chains = captureChains(b, i);
    if (chains.length > 0) {
      for (const ch of chains) {
        raw.push({
          from: i,
          to: ch.path[ch.path.length - 1],
          path: ch.path,
          captures: ch.captures,
          promotes: ch.promotes,
        });
      }
    } else {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      for (const [dr, dc] of dirsFor(p)) {
        const sr = r + dr;
        const sc = c + dc;
        if (!inBounds(sr, sc) || b[idx(sr, sc)] !== "") continue;
        const promotes = !isKingPiece(p) && (s === "X" ? sr === 0 : sr === 7);
        raw.push({ from: i, to: idx(sr, sc), path: [idx(sr, sc)], captures: [], promotes });
      }
    }
  }
  const captures = raw.filter((m) => m.captures.length > 0);
  const candidates = captures.length > 0 ? captures : raw;
  const best = new Map();
  for (const m of candidates) {
    const key = `${m.from}:${m.to}`;
    const prev = best.get(key);
    if (!prev || beatsCandidate(m, prev)) best.set(key, m);
  }
  return [...best.values()].sort((a, b2) => a.from - b2.from || a.to - b2.to);
}

// Validate + apply one full move (multi-jump chains resolve atomically).
// Returns null when illegal; otherwise { board, promoted }.
export function applyCheckersMove(board, from, to) {
  const b = normalizeCheckers(board);
  const p = b[from];
  if (!p) return null;
  const move = getLegalMoves(b, sideOf(p)).find((m) => m.from === from && m.to === to);
  if (!move) return null;
  const nb = b.slice();
  nb[from] = "";
  for (const cap of move.captures) nb[cap] = "";
  nb[to] = move.promotes ? p.toUpperCase() : p;
  return { board: nb, promoted: move.promotes };
}

// Side with no pieces loses; side with no legal moves loses; nobody able to
// move is a draw. Purely board-derived — safe to call after any completed move.
export function getCheckersWinner(board) {
  const b = normalizeCheckers(board);
  let xCount = 0;
  let oCount = 0;
  for (const p of b) {
    if (p === "x" || p === "X") xCount++;
    else if (p === "o" || p === "O") oCount++;
  }
  if (xCount === 0 && oCount === 0) return { winner: "draw" };
  if (xCount === 0) return { winner: "O" };
  if (oCount === 0) return { winner: "X" };
  const xCan = getLegalMoves(b, "X").length > 0;
  const oCan = getLegalMoves(b, "O").length > 0;
  if (xCan && oCan) return null;
  if (!xCan && !oCan) return { winner: "draw" };
  return { winner: oCan ? "O" : "X" };
}
