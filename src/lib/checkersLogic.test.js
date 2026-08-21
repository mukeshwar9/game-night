import { describe, it, expect } from "vitest";
import {
  CELL_COUNT,
  INITIAL_CHECKERS,
  normalizeCheckers,
  getLegalMoves,
  applyCheckersMove,
  getCheckersWinner,
} from "./checkersLogic";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const idx = (r, c) => r * 8 + c;

function emptyBoard() {
  return Array(CELL_COUNT).fill("");
}

function boardWith(pieces) {
  const b = emptyBoard();
  for (const [cell, p] of Object.entries(pieces)) b[cell] = p;
  return b;
}

function movesTo(board, symbol) {
  return getLegalMoves(board, symbol).map((m) => [m.from, m.to]);
}

// ---------------------------------------------------------------------------
// INITIAL_CHECKERS
// ---------------------------------------------------------------------------
describe("INITIAL_CHECKERS", () => {
  it("places 12 men per side", () => {
    const b = INITIAL_CHECKERS();
    const joined = b.join("");
    expect(joined.split("x").length - 1).toBe(12);
    expect(joined.split("o").length - 1).toBe(12);
  });

  it("occupies only dark squares", () => {
    const b = INITIAL_CHECKERS();
    b.forEach((p, i) => {
      if (p) expect((Math.floor(i / 8) + (i % 8)) % 2).toBe(1);
    });
  });

  it("puts X on rows 5-7 and O on rows 0-2", () => {
    const b = INITIAL_CHECKERS();
    b.forEach((p, i) => {
      if (!p) return;
      const r = Math.floor(i / 8);
      if (p === "x") expect(r).toBeGreaterThanOrEqual(5);
      if (p === "o") expect(r).toBeLessThanOrEqual(2);
    });
  });

  it("returns a fresh board each call", () => {
    const a = INITIAL_CHECKERS();
    const c = INITIAL_CHECKERS();
    expect(a).not.toBe(c);
    expect(a).toEqual(c);
  });
});

// ---------------------------------------------------------------------------
// normalizeCheckers
// ---------------------------------------------------------------------------
describe("normalizeCheckers", () => {
  it("returns 64 empty cells for null/undefined", () => {
    expect(normalizeCheckers(null)).toHaveLength(64);
    expect(normalizeCheckers(undefined)).toEqual(Array(64).fill(""));
  });

  it("keeps a full valid array as-is", () => {
    const b = INITIAL_CHECKERS();
    expect(normalizeCheckers(b)).toEqual(b);
  });

  it("converts numeric-keyed objects (Firebase shape)", () => {
    const obj = { 1: "x", 3: "O", 5: "o" };
    const b = normalizeCheckers(obj);
    expect(b[1]).toBe("x");
    expect(b[3]).toBe("O");
    expect(b[5]).toBe("o");
    expect(b).toHaveLength(64);
    expect(b.filter((p) => p)).toHaveLength(3);
  });

  it("drops junk values and out-of-range keys", () => {
    const obj = { 0: "zz", 1: "x", 2: null, 99: "o", 4: 5 };
    const b = normalizeCheckers(obj);
    expect(b[0]).toBe("");
    expect(b[2]).toBe("");
    expect(b[4]).toBe("");
    expect(b[99]).toBeUndefined();
    expect(b[1]).toBe("x");
  });
});

// ---------------------------------------------------------------------------
// man move generation
// ---------------------------------------------------------------------------
describe("man moves", () => {
  it("allows one forward diagonal step to an empty square", () => {
    const b = boardWith({ [idx(5, 2)]: "x", [idx(2, 5)]: "o" });
    expect(movesTo(b, "X")).toContainEqual([idx(5, 2), idx(4, 1)]);
    expect(movesTo(b, "X")).toContainEqual([idx(5, 2), idx(4, 3)]);
    expect(movesTo(b, "O")).toContainEqual([idx(2, 5), idx(3, 4)]);
    expect(movesTo(b, "O")).toContainEqual([idx(2, 5), idx(3, 6)]);
  });

  it("rejects backward steps for men", () => {
    const b = boardWith({ [idx(5, 2)]: "x", [idx(2, 5)]: "o" });
    expect(movesTo(b, "X")).not.toContainEqual([idx(5, 2), idx(6, 1)]);
    expect(movesTo(b, "O")).not.toContainEqual([idx(2, 5), idx(1, 4)]);
  });

  it("rejects steps onto occupied squares and off-board", () => {
    // x at (5,0): forward-left is off-board, forward-right occupied by o, and
    // the jump landing (3,2) is blocked by another x — nothing legal remains.
    const b = boardWith({ [idx(5, 0)]: "x", [idx(4, 1)]: "o", [idx(3, 2)]: "x" });
    expect(getLegalMoves(b, "X").filter((m) => m.from === idx(5, 0))).toHaveLength(0);
  });

  it("only generates moves for the requested side", () => {
    const b = boardWith({ [idx(5, 2)]: "x", [idx(2, 5)]: "o" });
    getLegalMoves(b, "X").forEach((m) => expect(b[m.from].toUpperCase()).toBe("X"));
    getLegalMoves(b, "O").forEach((m) => expect(b[m.from].toUpperCase()).toBe("O"));
  });
});

// ---------------------------------------------------------------------------
// king move generation
// ---------------------------------------------------------------------------
describe("king moves", () => {
  it("moves diagonally in all four directions", () => {
    const b = boardWith({ [idx(3, 4)]: "X" });
    const targets = getLegalMoves(b, "X").map((m) => m.to);
    expect(targets).toEqual(
      expect.arrayContaining([idx(2, 3), idx(2, 5), idx(4, 3), idx(4, 5)]),
    );
    expect(targets).toHaveLength(4);
  });

  it("captures in both directions (backward jump)", () => {
    const b = boardWith({ [idx(3, 4)]: "X", [idx(4, 5)]: "o" });
    const jumps = getLegalMoves(b, "X").filter((m) => m.captures.length > 0);
    expect(jumps).toHaveLength(1);
    expect(jumps[0]).toMatchObject({ from: idx(3, 4), to: idx(5, 6), captures: [idx(4, 5)] });
  });
});

// ---------------------------------------------------------------------------
// forced capture
// ---------------------------------------------------------------------------
describe("forced capture", () => {
  it("rejects plain moves when any capture exists", () => {
    // x at (5,2) can jump o at (4,3); another x at (5,6) would like to step.
    const b = boardWith({ [idx(5, 2)]: "x", [idx(4, 3)]: "o", [idx(5, 6)]: "x" });
    const moves = getLegalMoves(b, "X");
    expect(moves.every((m) => m.captures.length > 0)).toBe(true);
    expect(movesTo(b, "X")).toContainEqual([idx(5, 2), idx(3, 4)]);
    expect(movesTo(b, "X")).not.toContainEqual([idx(5, 6), idx(4, 5)]);
    expect(applyCheckersMove(b, idx(5, 6), idx(4, 5))).toBeNull();
  });

  it("rejects jumping own pieces or empty squares", () => {
    const b = boardWith({ [idx(5, 2)]: "x", [idx(4, 3)]: "x" });
    expect(applyCheckersMove(b, idx(5, 2), idx(3, 4))).toBeNull();
  });

  it("applies a single jump: mover lands, victim removed", () => {
    const b = boardWith({ [idx(5, 2)]: "x", [idx(4, 3)]: "o" });
    const applied = applyCheckersMove(b, idx(5, 2), idx(3, 4));
    expect(applied).not.toBeNull();
    expect(applied.board[idx(5, 2)]).toBe("");
    expect(applied.board[idx(4, 3)]).toBe("");
    expect(applied.board[idx(3, 4)]).toBe("x");
    expect(applied.promoted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// multi-jump chains
// ---------------------------------------------------------------------------
describe("multi-jump chains", () => {
  function doubleJumpBoard() {
    // x at (7,2)? too low — use x at (5,4); victims at (4,3) and (4,... chain:
    // (5,4) jumps (4,5) → lands (3,6); from (3,6) jumps (2,5)?? that's up-left
    // over (2,5) landing (1,4). Both victims are 'o'.
    return boardWith({
      [idx(5, 4)]: "x",
      [idx(4, 5)]: "o",
      [idx(2, 5)]: "o",
    });
  }

  it("expands a double jump into one move with full path", () => {
    const b = doubleJumpBoard();
    const moves = getLegalMoves(b, "X");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      from: idx(5, 4),
      to: idx(1, 4),
      path: [idx(3, 6), idx(1, 4)],
      captures: [idx(4, 5), idx(2, 5)],
    });
  });

  it("removes captured pieces mid-path when applied", () => {
    const b = doubleJumpBoard();
    const applied = applyCheckersMove(b, idx(5, 4), idx(1, 4));
    expect(applied).not.toBeNull();
    expect(applied.board[idx(5, 4)]).toBe("");
    expect(applied.board[idx(4, 5)]).toBe("");
    expect(applied.board[idx(2, 5)]).toBe("");
    expect(applied.board[idx(3, 6)]).toBe("");
    expect(applied.board[idx(1, 4)]).toBe("x");
    expect(applied.promoted).toBe(false);
  });

  it("stops the intermediate square being a legal stopping point", () => {
    // mandatory continuation: no move ending on the first landing square
    const b = doubleJumpBoard();
    expect(movesTo(b, "X")).not.toContainEqual([idx(5, 4), idx(3, 6)]);
  });

  it("chains across separate board regions (two hops, two victims)", () => {
    const b = boardWith({
      [idx(6, 1)]: "x",
      [idx(5, 2)]: "o",
      [idx(3, 2)]: "o",
      [idx(1, 4)]: "o",
    });
    // (6,1)→(4,3) over (5,2), then (4,3)→(2,1) over (3,2); the o at (1,4) is
    // out of reach and must survive.
    const moves = getLegalMoves(b, "X");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      from: idx(6, 1),
      to: idx(2, 1),
      path: [idx(4, 3), idx(2, 1)],
      captures: [idx(5, 2), idx(3, 2)],
    });
    const applied = applyCheckersMove(b, idx(6, 1), idx(2, 1));
    expect(applied.board[idx(1, 4)]).toBe("o");
  });

  it("emits each branch of a branching jump separately", () => {
    const b = boardWith({
      [idx(5, 4)]: "x",
      [idx(4, 5)]: "o",
      [idx(4, 3)]: "o",
    });
    const moves = getLegalMoves(b, "X").filter((m) => m.from === idx(5, 4));
    const destinations = moves.map((m) => m.to).sort((a, c) => a - c);
    expect(destinations).toEqual([idx(3, 2), idx(3, 6)]);
    moves.forEach((m) => expect(m.captures).toHaveLength(1));
  });

  it("dedupes a clockwise/counter-clockwise loop into one canonical move", () => {
    // King at (3,3) surrounded by four enemies forming a diamond: the full loop
    // can be flown in either direction and both end back at (3,3). One move
    // survives — equal captures, so the lexicographically smaller path wins
    // (counter-clockwise: [13, 31, 45]).
    const b = boardWith({
      [idx(3, 3)]: "X",
      [idx(4, 4)]: "o",
      [idx(4, 6)]: "o",
      [idx(2, 6)]: "o",
      [idx(2, 4)]: "o",
    });
    const moves = getLegalMoves(b, "X");
    expect(moves).toHaveLength(1);
    expect(moves[0].from).toBe(idx(3, 3));
    expect(moves[0].to).toBe(idx(3, 3));
    expect(moves[0].path).toEqual([idx(1, 5), idx(3, 7), idx(5, 5), idx(3, 3)]);
    expect(moves[0].captures).toEqual([idx(2, 4), idx(2, 6), idx(4, 6), idx(4, 4)]);
  });

  it("applies the loop atomically: all four victims removed, king home", () => {
    const b = boardWith({
      [idx(3, 3)]: "X",
      [idx(4, 4)]: "o",
      [idx(4, 6)]: "o",
      [idx(2, 6)]: "o",
      [idx(2, 4)]: "o",
    });
    const applied = applyCheckersMove(b, idx(3, 3), idx(3, 3));
    expect(applied).not.toBeNull();
    expect(applied.promoted).toBe(false);
    expect(applied.board.filter((p) => p === "")).toHaveLength(63);
    expect(applied.board[idx(3, 3)]).toBe("X");
  });
});

// ---------------------------------------------------------------------------
// promotion
// ---------------------------------------------------------------------------
describe("promotion", () => {
  it("crowns a man reaching the last row", () => {
    const b = boardWith({ [idx(1, 2)]: "x" });
    const moves = getLegalMoves(b, "X").filter((m) => m.from === idx(1, 2));
    moves.forEach((m) => expect(m.promotes).toBe(true));
    const applied = applyCheckersMove(b, idx(1, 2), idx(0, 1));
    expect(applied.promoted).toBe(true);
    expect(applied.board[idx(0, 1)]).toBe("X");
  });

  it("ends the move on crowning even if further jumps exist", () => {
    // x at (2,1) jumps o at (1,2) → lands (0,3) promoted; an o at (1,4) would
    // invite a king continuation but must be left standing.
    const b = boardWith({ [idx(2, 1)]: "x", [idx(1, 2)]: "o", [idx(1, 4)]: "o" });
    const moves = getLegalMoves(b, "X").filter((m) => m.from === idx(2, 1));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ to: idx(0, 3), promotes: true, captures: [idx(1, 2)] });
    expect(movesTo(b, "X")).not.toContainEqual([idx(2, 1), idx(2, 5)]);
    const applied = applyCheckersMove(b, idx(2, 1), idx(0, 3));
    expect(applied.board[idx(0, 3)]).toBe("X");
    expect(applied.board[idx(1, 4)]).toBe("o"); // survived — chain ended
    expect(applied.board[idx(1, 2)]).toBe(""); // first victim gone
  });

  it("does not re-promote kings", () => {
    const b = boardWith({ [idx(1, 2)]: "X" });
    const moves = getLegalMoves(b, "X").filter((m) => m.from === idx(1, 2));
    moves.forEach((m) => expect(m.promotes).toBe(false));
    const applied = applyCheckersMove(b, idx(1, 2), idx(0, 1));
    expect(applied.promoted).toBe(false);
    expect(applied.board[idx(0, 1)]).toBe("X");
  });

  it("crowns O on row 7", () => {
    const b = boardWith({ [idx(6, 3)]: "o" });
    const moves = getLegalMoves(b, "O").filter((m) => m.from === idx(6, 3));
    moves.forEach((m) => expect(m.promotes).toBe(true));
    const applied = applyCheckersMove(b, idx(6, 3), idx(7, 4));
    expect(applied.board[idx(7, 4)]).toBe("O");
  });
});

// ---------------------------------------------------------------------------
// win / draw detection
// ---------------------------------------------------------------------------
describe("getCheckersWinner", () => {
  it("returns null mid-game", () => {
    expect(getCheckersWinner(INITIAL_CHECKERS())).toBeNull();
  });

  it("wins by elimination", () => {
    const b = boardWith({ [idx(5, 2)]: "x" });
    expect(getCheckersWinner(b)).toEqual({ winner: "X" });
    expect(getCheckersWinner(boardWith({ [idx(2, 5)]: "o" }))).toEqual({ winner: "O" });
  });

  it("wins when opponent is fully blocked (no legal moves)", () => {
    // o at (0,1): forward squares (1,0),(1,2),(2,3) occupied by X; jumps land
    // off-board or on X at (2,3) — O cannot move, X can.
    const b = boardWith({
      [idx(0, 1)]: "o",
      [idx(1, 0)]: "x",
      [idx(1, 2)]: "x",
      [idx(2, 3)]: "x",
      [idx(7, 6)]: "x",
    });
    expect(getCheckersWinner(b)).toEqual({ winner: "X" });
  });

  it("draws when neither side can move", () => {
    // Fill every dark square — no empty landing square exists anywhere.
    const b = Array(CELL_COUNT).fill("");
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) b[idx(r, c)] = c < 4 ? "o" : "x";
      }
    }
    expect(getCheckersWinner(b)).toEqual({ winner: "draw" });
  });
});

// ---------------------------------------------------------------------------
// applyCheckersMove validation
// ---------------------------------------------------------------------------
describe("applyCheckersMove validation", () => {
  it("returns null for illegal geometry", () => {
    const b = boardWith({ [idx(5, 4)]: "x" });
    expect(applyCheckersMove(b, idx(5, 4), idx(5, 5))).toBeNull(); // straight
    expect(applyCheckersMove(b, idx(5, 4), idx(3, 4))).toBeNull(); // two-step non-jump
    expect(applyCheckersMove(b, idx(5, 4), idx(4, 4))).toBeNull(); // vertical
  });

  it("returns null when source is empty", () => {
    expect(applyCheckersMove(INITIAL_CHECKERS(), idx(3, 4), idx(4, 3))).toBeNull();
  });

  it("does not mutate the input board", () => {
    const b = INITIAL_CHECKERS();
    const snapshot = b.join("|");
    applyCheckersMove(b, idx(5, 0), idx(4, 1));
    expect(b.join("|")).toBe(snapshot);
  });

  it("leaves the rest of the board untouched around a move", () => {
    const b = boardWith({ [idx(5, 2)]: "x", [idx(2, 5)]: "o", [idx(7, 4)]: "x" });
    const applied = applyCheckersMove(b, idx(5, 2), idx(4, 1));
    expect(applied.board[idx(2, 5)]).toBe("o");
    expect(applied.board[idx(7, 4)]).toBe("x");
  });
});
