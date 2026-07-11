import { describe, it, expect } from 'vitest'
import {
  BK_CELL_COUNT,
  BK_WALL_SLOT_COUNT,
  BK_WALLS_PER_PLAYER,
  BK_START_X,
  BK_START_O,
  hSlot,
  vSlot,
  decodeSlot,
  cellAt,
  orthogonalNeighbors,
  isEdgeBlocked,
  legalPawnMoves,
  wallConflictSlots,
  isWallPlacementValid,
  shortestPathToGoal,
  hasPathToGoal,
  isWallMoveLegal,
  applyPawnMove,
  applyWallMove,
  computeBotMove,
} from './blockadeLogic'

const emptyWalls = () => Array(BK_WALL_SLOT_COUNT).fill('')

describe('slot indexing helpers', () => {
  it('hSlot produces the documented range', () => {
    expect(hSlot(0, 0)).toBe(0)
    expect(hSlot(0, 7)).toBe(7)
    expect(hSlot(7, 7)).toBe(63)
    expect(hSlot(3, 4)).toBe(28)
  })

  it('vSlot produces the documented range', () => {
    expect(vSlot(0, 0)).toBe(64)
    expect(vSlot(0, 7)).toBe(71)
    expect(vSlot(7, 7)).toBe(127)
    expect(vSlot(3, 4)).toBe(92)
  })

  it('decodeSlot round-trips hSlot/vSlot including 0 and 7 boundaries', () => {
    for (let r = 0; r <= 7; r++) {
      for (const c of [0, 3, 7]) {
        expect(decodeSlot(hSlot(r, c))).toEqual({ orientation: 'h', r, c })
        expect(decodeSlot(vSlot(r, c))).toEqual({ orientation: 'v', r, c })
      }
    }
  })

  it('cellAt returns -1 out of bounds and the right index otherwise', () => {
    expect(cellAt(-1, 0)).toBe(-1)
    expect(cellAt(0, -1)).toBe(-1)
    expect(cellAt(9, 0)).toBe(-1)
    expect(cellAt(0, 9)).toBe(-1)
    expect(cellAt(0, 0)).toBe(0)
    expect(cellAt(8, 8)).toBe(80)
    expect(cellAt(4, 4)).toBe(40)
  })

  it('orthogonalNeighbors returns 2/3/4 neighbors for corner/edge/interior cells', () => {
    expect(orthogonalNeighbors(cellAt(0, 0))).toHaveLength(2) // corner
    expect(orthogonalNeighbors(cellAt(0, 4))).toHaveLength(3) // top edge
    expect(orthogonalNeighbors(cellAt(4, 4))).toHaveLength(4) // interior
  })
})

describe('wall conflict matrix', () => {
  it('h(r,c) conflict list includes v(r,c) always, and h neighbors only in range', () => {
    expect(wallConflictSlots(hSlot(3, 0))).toEqual(
      expect.arrayContaining([hSlot(3, 1), vSlot(3, 0)]),
    )
    expect(wallConflictSlots(hSlot(3, 0))).not.toContain(hSlot(3, -1))
    expect(wallConflictSlots(hSlot(3, 0))).toHaveLength(2) // no c-1 at boundary

    expect(wallConflictSlots(hSlot(3, 7))).toEqual(
      expect.arrayContaining([hSlot(3, 6), vSlot(3, 7)]),
    )
    expect(wallConflictSlots(hSlot(3, 7))).toHaveLength(2) // no c+1 at boundary

    expect(wallConflictSlots(hSlot(3, 4))).toEqual(
      expect.arrayContaining([hSlot(3, 3), hSlot(3, 5), vSlot(3, 4)]),
    )
    expect(wallConflictSlots(hSlot(3, 4))).toHaveLength(3)
  })

  it('v(r,c) conflict list includes h(r,c) always, and v neighbors only in range', () => {
    expect(wallConflictSlots(vSlot(0, 3))).toEqual(
      expect.arrayContaining([vSlot(1, 3), hSlot(0, 3)]),
    )
    expect(wallConflictSlots(vSlot(0, 3))).toHaveLength(2) // no r-1 at boundary

    expect(wallConflictSlots(vSlot(7, 3))).toEqual(
      expect.arrayContaining([vSlot(6, 3), hSlot(7, 3)]),
    )
    expect(wallConflictSlots(vSlot(7, 3))).toHaveLength(2) // no r+1 at boundary

    expect(wallConflictSlots(vSlot(4, 3))).toEqual(
      expect.arrayContaining([vSlot(3, 3), vSlot(5, 3), hSlot(4, 3)]),
    )
    expect(wallConflictSlots(vSlot(4, 3))).toHaveLength(3)
  })

  it('isWallPlacementValid rejects out-of-range slots', () => {
    expect(isWallPlacementValid(emptyWalls(), 10, -1)).toBe(false)
    expect(isWallPlacementValid(emptyWalls(), 10, 128)).toBe(false)
  })

  it('isWallPlacementValid rejects an already-occupied slot', () => {
    const walls = emptyWalls()
    walls[hSlot(2, 2)] = 'X'
    expect(isWallPlacementValid(walls, 10, hSlot(2, 2))).toBe(false)
  })

  it('isWallPlacementValid rejects when wallsRemaining <= 0', () => {
    expect(isWallPlacementValid(emptyWalls(), 0, hSlot(2, 2))).toBe(false)
  })

  it('isWallPlacementValid rejects each conflict-matrix overlap individually', () => {
    const base = hSlot(3, 4)
    for (const conflict of wallConflictSlots(base)) {
      const walls = emptyWalls()
      walls[conflict] = 'X'
      expect(isWallPlacementValid(walls, 10, base)).toBe(false)
    }
  })

  it('isWallPlacementValid accepts a clean non-conflicting slot with walls remaining', () => {
    expect(isWallPlacementValid(emptyWalls(), 10, hSlot(3, 4))).toBe(true)
  })
})

describe('isEdgeBlocked', () => {
  it('unblocked adjacent pair -> false', () => {
    expect(isEdgeBlocked(emptyWalls(), cellAt(4, 4), cellAt(4, 5))).toBe(false)
    expect(isEdgeBlocked(emptyWalls(), cellAt(4, 4), cellAt(5, 4))).toBe(false)
  })

  it('each of the 2 vertical-wall slots blocks a horizontal pair', () => {
    const a = cellAt(4, 4), b = cellAt(4, 5) // horizontally adjacent, gap column c=4, row r=4
    let walls = emptyWalls(); walls[vSlot(4, 4)] = 'X'
    expect(isEdgeBlocked(walls, a, b)).toBe(true)

    walls = emptyWalls(); walls[vSlot(3, 4)] = 'X'
    expect(isEdgeBlocked(walls, a, b)).toBe(true)
  })

  it('each of the 2 horizontal-wall slots blocks a vertical pair', () => {
    const a = cellAt(4, 4), b = cellAt(5, 4) // vertically adjacent, gap row r=4, col c=4
    let walls = emptyWalls(); walls[hSlot(4, 4)] = 'X'
    expect(isEdgeBlocked(walls, a, b)).toBe(true)

    walls = emptyWalls(); walls[hSlot(4, 3)] = 'X'
    expect(isEdgeBlocked(walls, a, b)).toBe(true)
  })

  it('non-adjacent or diagonal cell pair -> true (impassable)', () => {
    expect(isEdgeBlocked(emptyWalls(), cellAt(4, 4), cellAt(4, 6))).toBe(true) // 2 apart
    expect(isEdgeBlocked(emptyWalls(), cellAt(4, 4), cellAt(5, 5))).toBe(true) // diagonal
  })
})

describe('legalPawnMoves — jump + diagonal-jump cases', () => {
  it('no opponent nearby -> plain orthogonal steps only', () => {
    const pawns = { X: cellAt(4, 4), O: cellAt(0, 0) }
    const moves = legalPawnMoves(pawns, emptyWalls(), 'X')
    expect(moves.sort((a, b) => a - b)).toEqual(
      [cellAt(3, 4), cellAt(5, 4), cellAt(4, 3), cellAt(4, 5)].sort((a, b) => a - b),
    )
  })

  it('walls correctly exclude blocked directions', () => {
    const pawns = { X: cellAt(4, 4), O: cellAt(0, 0) }
    const walls = emptyWalls()
    walls[hSlot(4, 4)] = 'X' // blocks (4,4)<->(5,4)
    const moves = legalPawnMoves(pawns, walls, 'X')
    expect(moves).not.toContain(cellAt(5, 4))
    expect(moves).toContain(cellAt(3, 4)) // other directions unaffected
  })

  it('opponent directly adjacent, straight jump unblocked -> only the far cell is legal', () => {
    // X at (4,4), O at (3,4) (directly above X)
    const pawns = { X: cellAt(4, 4), O: cellAt(3, 4) }
    const moves = legalPawnMoves(pawns, emptyWalls(), 'X')
    expect(moves).toContain(cellAt(2, 4)) // straight jump over O
    expect(moves).not.toContain(cellAt(3, 4)) // opponent's own cell never legal
    expect(moves).not.toContain(cellAt(2, 3)) // diagonals not legal when straight jump is open
    expect(moves).not.toContain(cellAt(2, 5))
  })

  it('straight jump blocked by a wall behind opponent -> both diagonals legal', () => {
    // X at (4,4), O at (3,4). Wall blocks (3,4)<->(2,4).
    const pawns = { X: cellAt(4, 4), O: cellAt(3, 4) }
    const walls = emptyWalls()
    walls[hSlot(2, 3)] = 'X' // hSlot(r,c) spans cols c..c+1 at row-gap r; blocks (2,4)<->(3,4)
    const moves = legalPawnMoves(pawns, walls, 'X')
    expect(moves).not.toContain(cellAt(2, 4)) // straight jump now blocked
    expect(moves).toContain(cellAt(3, 3)) // diagonal left
    expect(moves).toContain(cellAt(3, 5)) // diagonal right
  })

  it('straight jump blocked by the board edge -> both diagonals legal', () => {
    // X at (1,4), O at (0,4) (O standing on its own goal row / board edge)
    const pawns = { X: cellAt(1, 4), O: cellAt(0, 4) }
    const moves = legalPawnMoves(pawns, emptyWalls(), 'X')
    expect(moves).not.toContain(-1)
    expect(moves).toContain(cellAt(0, 3))
    expect(moves).toContain(cellAt(0, 5))
  })

  it('straight jump blocked, one diagonal additionally blocked by a wall -> only the other diagonal legal', () => {
    const pawns = { X: cellAt(1, 4), O: cellAt(0, 4) }
    const walls = emptyWalls()
    // block (0,4)<->(0,3): horizontally adjacent, row r=0, col=min(4,3)=3 -> vSlot(0,3) or vSlot(-1,3) (invalid)
    walls[vSlot(0, 3)] = 'X'
    const moves = legalPawnMoves(pawns, walls, 'X')
    expect(moves).not.toContain(cellAt(0, 3))
    expect(moves).toContain(cellAt(0, 5))
  })

  it('straight jump blocked, both diagonals blocked -> zero legal moves in that direction, others unaffected', () => {
    // X at (4,4), O directly above at (3,4).
    const pawns = { X: cellAt(4, 4), O: cellAt(3, 4) }
    const walls = emptyWalls()
    walls[hSlot(2, 3)] = 'X' // blocks the straight jump (2,4)<->(3,4)
    walls[vSlot(2, 3)] = 'X' // blocks the left diagonal (3,4)<->(3,3)
    walls[vSlot(2, 4)] = 'X' // blocks the right diagonal (3,4)<->(3,5)
    const moves = legalPawnMoves(pawns, walls, 'X')
    expect(moves).not.toContain(cellAt(2, 4)) // straight jump
    expect(moves).not.toContain(cellAt(3, 3)) // left diagonal
    expect(moves).not.toContain(cellAt(3, 5)) // right diagonal
    expect(moves).not.toContain(cellAt(3, 4)) // opponent's cell
    // other directions (left/right/down from X) still available
    expect(moves).toContain(cellAt(4, 3))
    expect(moves).toContain(cellAt(4, 5))
    expect(moves).toContain(cellAt(5, 4))
  })
})

describe('seal rejection via BFS', () => {
  // Build a conflict-free 1x1 "box" around cell (4,4) from 4 mutually
  // non-conflicting wall slots (verified via wallConflictSlots below): each
  // wall blocks exactly one of the cell's 4 orthogonal edges, so placing 3
  // of them leaves exactly one opening, and the 4th ("sealing") wall is a
  // legitimate, conflict-free placement per isWallPlacementValid -- it must
  // be rejected purely by hasPathToGoal, not by the conflict matrix. (A prior
  // version of these fixtures used walls whose own conflict-matrix overlap
  // rejected the seal slot before hasPathToGoal ever ran; this construction
  // asserts isWallPlacementValid is true for the seal slot to rule that out.)
  const boxCell = cellAt(4, 4)
  const upWall = hSlot(3, 3) // blocks (3,4)<->(4,4)
  const leftWall = vSlot(4, 3) // blocks (4,3)<->(4,4)
  const rightWall = vSlot(3, 4) // blocks (4,4)<->(4,5)
  const downWall = hSlot(4, 4) // blocks (4,4)<->(5,4) -- the sealing wall

  it('the 4 box walls are mutually non-conflicting', () => {
    for (const slot of [upWall, leftWall, rightWall, downWall]) {
      const others = [upWall, leftWall, rightWall, downWall].filter(s => s !== slot)
      expect(wallConflictSlots(slot).some(c => others.includes(c))).toBe(false)
    }
  })

  it('wall placement that seals the opponent\'s last route -> isWallMoveLegal false', () => {
    // O (goal row 8) is boxed in at (4,4); X places the sealing wall.
    const pawns = { X: BK_START_X, O: boxCell }
    const walls = emptyWalls()
    walls[upWall] = 'X'
    walls[leftWall] = 'X'
    walls[rightWall] = 'X'
    // One opening (down) remains -- O can still reach its goal row.
    expect(hasPathToGoal(walls, boxCell, 8)).toBe(true)
    // The sealing wall is itself a legitimate, conflict-free placement...
    expect(isWallPlacementValid(walls, 1, downWall)).toBe(true)
    // ...yet it's illegal because it would strand O with zero path to goal.
    expect(isWallMoveLegal(walls, pawns, 1, downWall, 'X')).toBe(false)
  })

  it('symmetric case: seals the placer\'s own last route -> also false', () => {
    // X (goal row 0) is boxed in at (4,4) and is itself the one placing the
    // sealing wall -- its own last route is what gets cut off.
    const pawns = { X: boxCell, O: BK_START_O }
    const walls = emptyWalls()
    walls[upWall] = 'O'
    walls[leftWall] = 'O'
    walls[rightWall] = 'O'
    expect(hasPathToGoal(walls, boxCell, 0)).toBe(true)
    expect(isWallPlacementValid(walls, 1, downWall)).toBe(true)
    expect(isWallMoveLegal(walls, pawns, 1, downWall, 'X')).toBe(false)
  })

  it('wall placement that narrows but does not fully close a path -> true', () => {
    const pawns = { X: BK_START_X, O: BK_START_O }
    const walls = emptyWalls()
    // Non-conflicting placements blocking row0/row1 columns 0-1, 2-3, 4-5; column 8 stays open.
    walls[hSlot(0, 0)] = 'X'
    walls[hSlot(0, 2)] = 'X'
    walls[hSlot(0, 4)] = 'X'
    // one more non-conflicting slot narrows further (blocks columns 6-7) but column 8 stays open
    expect(isWallMoveLegal(walls, pawns, 1, hSlot(0, 6), 'X')).toBe(true)
  })

  it('shortestPathToGoal returns Manhattan distance on an open board', () => {
    const { distance } = shortestPathToGoal(emptyWalls(), BK_START_X, 0)
    expect(distance).toBe(8) // row 8 -> row 0
  })

  it('shortestPathToGoal distance increases after a wall forces a detour', () => {
    const openDist = shortestPathToGoal(emptyWalls(), cellAt(4, 4), 0).distance
    const walls = emptyWalls()
    walls[hSlot(3, 3)] = 'X' // forces a detour around columns 3/4 at row-gap 3
    const detourDist = shortestPathToGoal(walls, cellAt(4, 4), 0).distance
    expect(detourDist).toBeGreaterThanOrEqual(openDist)
  })
})

describe('win detection (applyPawnMove)', () => {
  it('reports winner: symbol when to lands on the goal row, across the whole row', () => {
    for (let c = 0; c <= 8; c++) {
      const pawns = { X: cellAt(1, c), O: cellAt(0, (c + 1) % 9) }
      const result = applyPawnMove({ walls: emptyWalls(), pawns, symbol: 'X', to: cellAt(0, c) })
      // to must be legal: only true if adjacent and unblocked and not landing on O
      if (pawns.O !== cellAt(0, c)) {
        expect(result).toEqual({ winner: 'X' })
      }
    }
  })

  it('reports winner: null for a non-goal-row destination', () => {
    const pawns = { X: cellAt(4, 4), O: cellAt(0, 0) }
    const result = applyPawnMove({ walls: emptyWalls(), pawns, symbol: 'X', to: cellAt(3, 4) })
    expect(result).toEqual({ winner: null })
  })

  it('returns null when to is not in legalPawnMoves', () => {
    const pawns = { X: cellAt(4, 4), O: cellAt(0, 0) }
    const result = applyPawnMove({ walls: emptyWalls(), pawns, symbol: 'X', to: cellAt(2, 4) })
    expect(result).toBeNull()
  })
})

describe('applyMove full contract', () => {
  it('illegal pawn move -> null', () => {
    const pawns = { X: BK_START_X, O: BK_START_O }
    expect(applyPawnMove({ walls: emptyWalls(), pawns, symbol: 'X', to: cellAt(0, 0) })).toBeNull()
  })

  it('illegal wall move: occupied slot -> null', () => {
    const pawns = { X: BK_START_X, O: BK_START_O }
    const walls = emptyWalls()
    walls[hSlot(2, 2)] = 'O'
    expect(applyWallMove({ walls, pawns, wallsRemaining: 10, symbol: 'X', slot: hSlot(2, 2) })).toBeNull()
  })

  it('illegal wall move: conflict -> null', () => {
    const pawns = { X: BK_START_X, O: BK_START_O }
    const walls = emptyWalls()
    walls[vSlot(2, 2)] = 'O'
    expect(applyWallMove({ walls, pawns, wallsRemaining: 10, symbol: 'X', slot: hSlot(2, 2) })).toBeNull()
  })

  it('illegal wall move: no walls remaining -> null', () => {
    const pawns = { X: BK_START_X, O: BK_START_O }
    expect(applyWallMove({ walls: emptyWalls(), pawns, wallsRemaining: 0, symbol: 'X', slot: hSlot(2, 2) })).toBeNull()
  })

  it('illegal wall move: sealing -> null', () => {
    const pawns = { X: BK_START_X, O: cellAt(0, 4) }
    const walls = emptyWalls()
    for (let c = 0; c <= 6; c++) walls[hSlot(0, c)] = 'X'
    expect(applyWallMove({ walls, pawns, wallsRemaining: 1, symbol: 'X', slot: hSlot(0, 7) })).toBeNull()
  })

  it('legal pawn move -> return shape is exactly { winner }', () => {
    const pawns = { X: cellAt(1, 4), O: cellAt(8, 8) }
    const result = applyPawnMove({ walls: emptyWalls(), pawns, symbol: 'X', to: cellAt(0, 4) })
    expect(Object.keys(result)).toEqual(['winner'])
    expect(result.winner).toBe('X')
  })

  it('legal wall move -> return shape is exactly { walls }, input not mutated, ownership set', () => {
    const pawns = { X: BK_START_X, O: BK_START_O }
    const walls = emptyWalls()
    const wallsCopy = [...walls]
    const result = applyWallMove({ walls, pawns, wallsRemaining: 10, symbol: 'X', slot: hSlot(3, 4) })
    expect(Object.keys(result)).toEqual(['walls'])
    expect(result.walls).toHaveLength(128)
    expect(result.walls[hSlot(3, 4)]).toBe('X')
    expect(walls).toEqual(wallsCopy) // input untouched
  })
})

describe('computeBotMove sanity', () => {
  function randomGame(seed) {
    // deterministic pseudo-random game state generator
    let s = seed
    const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }

    const walls = Array(128).fill('')
    let pawnX = BK_START_X
    let pawnO = BK_START_O

    // scatter a handful of legal-ish walls (best-effort; skip if illegal)
    let wallsRemaining = { X: BK_WALLS_PER_PLAYER, O: BK_WALLS_PER_PLAYER }
    for (let i = 0; i < 6; i++) {
      const slot = Math.floor(rand() * BK_WALL_SLOT_COUNT)
      const symbol = rand() < 0.5 ? 'X' : 'O'
      const pawns = { X: pawnX, O: pawnO }
      if (isWallMoveLegal(walls, pawns, wallsRemaining[symbol], slot, symbol)) {
        walls[slot] = symbol
        wallsRemaining[symbol] -= 1
      }
    }

    // place pawns at random reachable-ish interior cells (avoid overlap)
    pawnX = Math.floor(rand() * BK_CELL_COUNT)
    do { pawnO = Math.floor(rand() * BK_CELL_COUNT) } while (pawnO === pawnX)

    return {
      board: walls,
      blockadePawnX: pawnX,
      blockadePawnO: pawnO,
      blockadeWallsX: wallsRemaining.X,
      blockadeWallsO: wallsRemaining.O,
    }
  }

  it('never returns an illegal move across many random-ish states, both symbols', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const game = randomGame(seed)
      for (const symbol of ['X', 'O']) {
        const pawns = { X: game.blockadePawnX, O: game.blockadePawnO }
        const move = computeBotMove(game, symbol)
        expect(move).not.toBeNull()
        if (move.type === 'pawn') {
          expect(legalPawnMoves(pawns, game.board, symbol)).toContain(move.to)
        } else if (move.type === 'wall') {
          const wallsRemaining = symbol === 'X' ? game.blockadeWallsX : game.blockadeWallsO
          expect(isWallMoveLegal(game.board, pawns, wallsRemaining, move.slot, symbol)).toBe(true)
        } else {
          throw new Error(`unexpected move type: ${move.type}`)
        }
      }
    }
  })

  it('takes the winning pawn move over a wall move when one legal step away from goal', () => {
    const game = {
      board: Array(128).fill(''),
      blockadePawnX: cellAt(1, 4),
      blockadePawnO: cellAt(8, 0),
      blockadeWallsX: 10,
      blockadeWallsO: 10,
    }
    const move = computeBotMove(game, 'X')
    expect(move).toEqual({ type: 'pawn', to: cellAt(0, 4) })
  })

  it('bot with 0 walls remaining never returns a wall move', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const game = randomGame(seed)
      game.blockadeWallsX = 0
      const move = computeBotMove(game, 'X')
      expect(move.type).toBe('pawn')
    }
  })
})
