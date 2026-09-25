// @ts-check
// Pure game logic for Blockade — a 9x9 pawn-race + wall-blocking abstract strategy game.
// No DOM, no network. See docs/prds/blockade.md for the full design rationale.

export const BK_SIZE = 9
export const BK_CELL_COUNT = BK_SIZE ** 2 // 81
export const BK_WALL_SLOT_COUNT = 128 // 64 horizontal + 64 vertical
export const BK_WALLS_PER_PLAYER = 10
export const BK_START_X = 76 // row 8, col 4 — bottom center; X's goal is row 0
export const BK_START_O = 4 // row 0, col 4 — top center; O's goal is row 8

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] // up, down, left, right

// --- Slot indexing -----------------------------------------------------

export const hSlot = (r, c) => r * 8 + c
export const vSlot = (r, c) => 64 + r * 8 + c

export function decodeSlot(slot) {
  if (slot < 64) return { orientation: 'h', r: Math.floor(slot / 8), c: slot % 8 }
  const s = slot - 64
  return { orientation: 'v', r: Math.floor(s / 8), c: s % 8 }
}

export function cellAt(r, c) {
  if (r < 0 || r > 8 || c < 0 || c > 8) return -1
  return r * 9 + c
}

export function orthogonalNeighbors(cell) {
  const r = Math.floor(cell / 9)
  const c = cell % 9
  const out = []
  for (const [dr, dc] of DIRS) {
    const n = cellAt(r + dr, c + dc)
    if (n !== -1) out.push(n)
  }
  return out
}

// --- Wall-edge blocking (the core primitive) ----------------------------

export function isEdgeBlocked(walls, cellA, cellB) {
  const rA = Math.floor(cellA / 9), cA = cellA % 9
  const rB = Math.floor(cellB / 9), cB = cellB % 9

  if (rA === rB && Math.abs(cA - cB) === 1) {
    // horizontally adjacent — blocked by a VERTICAL wall at this row-gap's column
    const r = rA, c = Math.min(cA, cB)
    if (r <= 7 && walls[vSlot(r, c)]) return true
    if (r >= 1 && walls[vSlot(r - 1, c)]) return true
    return false
  }
  if (cA === cB && Math.abs(rA - rB) === 1) {
    // vertically adjacent — blocked by a HORIZONTAL wall at this column-gap's row
    const c = cA, r = Math.min(rA, rB)
    if (c <= 7 && walls[hSlot(r, c)]) return true
    if (c >= 1 && walls[hSlot(r, c - 1)]) return true
    return false
  }
  return true // not orthogonally adjacent at all — treat as impassable
}

// --- Pawn moves: steps, straight jump, diagonal jump --------------------

export function legalPawnMoves(pawns, walls, symbol) {
  const opp = symbol === 'X' ? 'O' : 'X'
  const mine = pawns[symbol]
  const oppCell = pawns[opp]
  const r0 = Math.floor(mine / 9), c0 = mine % 9
  const moves = new Set()

  for (const [dr, dc] of DIRS) {
    const adj = cellAt(r0 + dr, c0 + dc)
    if (adj === -1) continue
    if (isEdgeBlocked(walls, mine, adj)) continue

    if (adj !== oppCell) {
      moves.add(adj) // plain orthogonal step
      continue
    }

    // adjacent cell holds the opponent's pawn — try the straight jump
    const ar = Math.floor(adj / 9), ac = adj % 9
    const far = cellAt(ar + dr, ac + dc)
    if (far !== -1 && !isEdgeBlocked(walls, adj, far)) {
      moves.add(far) // straight jump over the opponent
      continue
    }

    // straight jump blocked (board edge OR a wall) — diagonals around the opponent
    const perpDirs = dr !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]
    for (const [pdr, pdc] of perpDirs) {
      const diag = cellAt(ar + pdr, ac + pdc)
      if (diag !== -1 && !isEdgeBlocked(walls, adj, diag)) {
        moves.add(diag) // diagonal jump
      }
    }
  }

  return [...moves]
}

// --- Wall conflict matrix + cheap placement validity ---------------------

export function wallConflictSlots(slot) {
  const { orientation, r, c } = decodeSlot(slot)
  const out = []
  if (orientation === 'h') {
    if (c - 1 >= 0) out.push(hSlot(r, c - 1))
    if (c + 1 <= 7) out.push(hSlot(r, c + 1))
    out.push(vSlot(r, c))
  } else {
    if (r - 1 >= 0) out.push(vSlot(r - 1, c))
    if (r + 1 <= 7) out.push(vSlot(r + 1, c))
    out.push(hSlot(r, c))
  }
  return out
}

export function isWallPlacementValid(walls, wallsRemaining, slot) {
  if (slot < 0 || slot >= 128) return false
  if (walls[slot]) return false
  if (wallsRemaining <= 0) return false
  return !wallConflictSlots(slot).some(s => walls[s])
}

// --- Path-sealing BFS -----------------------------------------------------

export function shortestPathToGoal(walls, fromCell, goalRow) {
  const visited = new Array(81).fill(false)
  const parent = new Array(81).fill(-1)
  visited[fromCell] = true
  const queue = [fromCell]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    if (Math.floor(cur / 9) === goalRow) {
      const path = []
      for (let n = cur; n !== -1; n = parent[n]) path.unshift(n)
      return { distance: path.length - 1, path }
    }
    for (const n of orthogonalNeighbors(cur)) {
      if (!visited[n] && !isEdgeBlocked(walls, cur, n)) {
        visited[n] = true
        parent[n] = cur
        queue.push(n)
      }
    }
  }
  return { distance: Infinity, path: [] }
}

export const hasPathToGoal = (walls, fromCell, goalRow) =>
  shortestPathToGoal(walls, fromCell, goalRow).distance !== Infinity

export function isWallMoveLegal(walls, pawns, wallsRemaining, slot, symbol) {
  if (!isWallPlacementValid(walls, wallsRemaining, slot)) return false
  const trial = [...walls]
  trial[slot] = symbol
  return hasPathToGoal(trial, pawns.X, 0) && hasPathToGoal(trial, pawns.O, 8)
}

// --- Move appliers ---------------------------------------------------------

export function applyPawnMove({ walls, pawns, symbol, to }) {
  const legal = legalPawnMoves(pawns, walls, symbol)
  if (!legal.includes(to)) return null
  const goalRow = symbol === 'X' ? 0 : 8
  const winner = Math.floor(to / 9) === goalRow ? symbol : null
  return { winner }
}

export function applyWallMove({ walls, pawns, wallsRemaining, symbol, slot }) {
  if (!isWallMoveLegal(walls, pawns, wallsRemaining, slot, symbol)) return null
  const next = [...walls]
  next[slot] = symbol
  return { walls: next }
}

// --- Zero-legal-move detection ---------------------------------------------

// True if `symbol` has ANY legal move at all — a pawn step/jump, or a legal
// wall placement (if any walls remain). Used to guard against the freeze
// case where legalPawnMoves() legitimately returns [] (both diagonals AND
// the straight jump blocked — see the blockadeLogic.test.js case for it)
// while the player is also out of walls or every wall placement is illegal
// (occupied/conflicting/would seal someone's path).
export function hasAnyLegalMove(walls, pawns, wallsRemaining, symbol) {
  if (legalPawnMoves(pawns, walls, symbol).length > 0) return true
  if (wallsRemaining <= 0) return false
  for (let slot = 0; slot < BK_WALL_SLOT_COUNT; slot++) {
    if (isWallMoveLegal(walls, pawns, wallsRemaining, slot, symbol)) return true
  }
  return false
}

// --- Whole-move applier (house rule: skip a trapped player's turn) --------

// Mirrors the { updates, result } contract the GAME_TYPES registry's
// `applyMove` hook returns (see src/lib/games.js's 'blockade' entry, which
// currently duplicates this inline calling applyPawnMove/applyWallMove
// directly). This version additionally applies the house rule: if the move
// leaves the OPPONENT with zero legal moves at all (hasAnyLegalMove false —
// a freak wall-lockout position), currentTurn stays on the mover instead of
// flipping, so the trapped player's turn is skipped rather than the game
// freezing on an unclickable board with no pass button.
// NOTE: games.js's registry entry does not yet call this function (it has
// its own inline copy without the skip rule) — wiring it in is a one-line
// change to games.js, outside this file's edit scope.
export function applyBlockadeMove({ board, game, move, symbol }) {
  const pawns = { X: game.blockadePawnX ?? BK_START_X, O: game.blockadePawnO ?? BK_START_O }
  const wallsRemaining = {
    X: game.blockadeWallsX ?? BK_WALLS_PER_PLAYER,
    O: game.blockadeWallsO ?? BK_WALLS_PER_PLAYER,
  }
  const opp = symbol === 'X' ? 'O' : 'X'

  if (move?.type === 'pawn') {
    const applied = applyPawnMove({ walls: board, pawns, symbol, to: move.to })
    if (!applied) return null
    const nextPawns = { ...pawns, [symbol]: move.to }
    const nextTurn = hasAnyLegalMove(board, nextPawns, wallsRemaining[opp], opp) ? opp : symbol
    return {
      updates: {
        [`blockadePawn${symbol}`]: move.to,
        currentTurn: nextTurn,
        blockadeMoves: (game.blockadeMoves ?? 0) + 1,
      },
      result: applied.winner ? { winner: applied.winner } : null,
    }
  }
  if (move?.type === 'wall') {
    const applied = applyWallMove({
      walls: board, pawns, wallsRemaining: wallsRemaining[symbol], symbol, slot: move.slot,
    })
    if (!applied) return null
    const nextWallsRemaining = { ...wallsRemaining, [symbol]: wallsRemaining[symbol] - 1 }
    const nextTurn = hasAnyLegalMove(applied.walls, pawns, nextWallsRemaining[opp], opp) ? opp : symbol
    return {
      updates: {
        board: applied.walls,
        [`blockadeWalls${symbol}`]: nextWallsRemaining[symbol],
        currentTurn: nextTurn,
        blockadeMoves: (game.blockadeMoves ?? 0) + 1,
      },
      result: null,
    }
  }
  return null
}

// --- Bot heuristic (casual /demo opponent) ---------------------------------

// The up-to-8 wall slots whose 2x2 footprint touches this cell's corners —
// a cheap proxy for "walls that could plausibly block movement near here".
export function slotsNearCell(cell) {
  const r = Math.floor(cell / 9), c = cell % 9
  const slots = []
  for (const dr of [-1, 0]) {
    for (const dc of [-1, 0]) {
      const rr = r + dr, cc = c + dc
      if (rr >= 0 && rr <= 7 && cc >= 0 && cc <= 7) { slots.push(hSlot(rr, cc)); slots.push(vSlot(rr, cc)) }
    }
  }
  return slots
}

export function computeBotMove(game, symbol) {
  const walls = game.board || Array(128).fill('')
  const pawns = { X: game.blockadePawnX ?? 76, O: game.blockadePawnO ?? 4 }
  const wallsRemaining = { X: game.blockadeWallsX ?? 10, O: game.blockadeWallsO ?? 10 }
  const opp = symbol === 'X' ? 'O' : 'X'
  const myGoal = symbol === 'X' ? 0 : 8
  const oppGoal = opp === 'X' ? 0 : 8

  const myDist = shortestPathToGoal(walls, pawns[symbol], myGoal).distance
  const oppDist = shortestPathToGoal(walls, pawns[opp], oppGoal).distance

  function bestStep() {
    const legal = legalPawnMoves(pawns, walls, symbol)
    if (!legal.length) return null // possible in a wall-lockout position — see hasAnyLegalMove
    let best = legal[0], bestD = Infinity
    for (const to of legal) {
      const d = shortestPathToGoal(walls, to, myGoal).distance
      if (d < bestD) { bestD = d; best = to }
    }
    return { type: 'pawn', to: best }
  }

  function bestWall() {
    if (wallsRemaining[symbol] <= 0) return null
    // Behind — look for a wall that hurts the opponent's path more than it hurts ours.
    const oppPath = shortestPathToGoal(walls, pawns[opp], oppGoal).path
    const candidates = new Set()
    for (const cell of oppPath) for (const slot of slotsNearCell(cell)) candidates.add(slot)

    let bestSlot = null, bestGain = 0
    for (const slot of candidates) {
      if (!isWallMoveLegal(walls, pawns, wallsRemaining[symbol], slot, symbol)) continue
      const trial = [...walls]; trial[slot] = symbol
      const newOppDist = shortestPathToGoal(trial, pawns[opp], oppGoal).distance
      const newMyDist = shortestPathToGoal(trial, pawns[symbol], myGoal).distance
      const gain = (newOppDist - oppDist) - (newMyDist - myDist)
      if (gain > bestGain) { bestGain = gain; bestSlot = slot }
    }
    return bestSlot !== null ? { type: 'wall', slot: bestSlot } : null
  }

  // Any legal wall placement at all, ignoring heuristic gain — last-resort
  // fallback so the bot only ever "passes" (returns null) when hasAnyLegalMove
  // would also say false.
  function anyLegalWall() {
    if (wallsRemaining[symbol] <= 0) return null
    for (let slot = 0; slot < BK_WALL_SLOT_COUNT; slot++) {
      if (isWallMoveLegal(walls, pawns, wallsRemaining[symbol], slot, symbol)) return { type: 'wall', slot }
    }
    return null
  }

  // Ahead or tied on distance, or out of walls: just walk your shortest path.
  // (A move landing on the goal row has distance 0 post-move, so this also
  // naturally prefers an immediate winning step over any other option.)
  const primary = (wallsRemaining[symbol] <= 0 || myDist <= oppDist) ? bestStep() : (bestWall() ?? bestStep())

  // Defensive fallback chain: never return null while ANY legal move exists
  // for this symbol (pawn or wall) — only a true hasAnyLegalMove()===false
  // position should surface as null (a pass, which callers already tolerate;
  // see demoBots.js's doc comment).
  return primary ?? bestWall() ?? anyLegalWall()
}
