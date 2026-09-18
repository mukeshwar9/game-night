import { describe, it, expect } from 'vitest'
import {
  ST_SIZE, ST_CELL_COUNT,
  indexOf, rowColOf, neighbors,
  INITIAL_SANTORINI, normalizeStBoard, normalizeStWorkers,
  moveTargets, buildTargetsAfter, legalStTurns, hasAnyStTurn,
  getStWinner, applyStMove,
} from './santoriniLogic'

const mk = (heights, xw, ow) => ({ board: heights, workers: { X: xw, O: ow } })

// ---------------------------------------------------------------------------
// Geometry & normalization
// ---------------------------------------------------------------------------

describe('geometry', () => {
  it('5×5 board, corner has 3 neighbors, center has 8', () => {
    expect(ST_SIZE).toBe(5)
    expect(ST_CELL_COUNT).toBe(25)
    expect(neighbors(0).sort()).toEqual([1, 5, 6])
    expect(neighbors(12)).toHaveLength(8)
    expect(rowColOf(24)).toEqual([4, 4])
    expect(indexOf(4, 4)).toBe(24)
  })

  it('normalizes heights into 0-4', () => {
    expect(normalizeStBoard(null)).toHaveLength(25)
    const b = normalizeStBoard([-3, 0.7, 9, 'x'])
    expect(b[0]).toBe(0)
    expect(b[1]).toBe(0) // 0.7 floors to 0
    expect(b[2]).toBe(4)
    expect(b[3]).toBe(0)
  })

  it('normalizes workers with corrupt-state fallback', () => {
    // A 1-list is corrupt (workers always come in pairs) → whole side falls
    // back to the default spawn pair.
    const w = normalizeStWorkers({ X: [3], O: 'junk' })
    expect(w.X).toEqual([20, 24])
    expect(w.O).toEqual([0, 4])
    expect(normalizeStWorkers(null).X).toEqual([20, 24])
  })
})

// ---------------------------------------------------------------------------
// Move targets (climb rule, domes, occupancy)
// ---------------------------------------------------------------------------

describe('moveTargets', () => {
  it('allows flat, down, and one-level-up moves only', () => {
    const heights = Array(25).fill(0)
    heights[12] = 2
    heights[11] = 3 // climbable (2+1)
    heights[13] = 4 // dome — blocked
    heights[7] = 4 // dome — blocked
    heights[6] = 1 // higher than 2+1 — blocked
    const workers = { X: [12], O: [] }
    // 12's neighbors: 6 (blocked, +1>2... wait 1 < 3 so climb ok? 6 is height 1,
    // 12 is height 2 → DOWN, legal!), 7 (dome), 8, 11 (climb), 13 (dome),
    // 16 (down), 17 (down), 18 (down).
    expect(moveTargets(heights, workers, 12).sort((a, b) => a - b))
      .toEqual([6, 8, 11, 16, 17, 18])
  })

  it('blocks occupied squares (either side)', () => {
    const heights = Array(25).fill(0)
    const workers = { X: [12], O: [11, 7] }
    const targets = moveTargets(heights, workers, 12)
    expect(targets).not.toContain(11)
    expect(targets).not.toContain(7)
    expect(targets).toContain(13)
  })
})

// ---------------------------------------------------------------------------
// Build targets
// ---------------------------------------------------------------------------

describe('buildTargetsAfter', () => {
  it('includes the destination itself (build under self), excludes workers and domes', () => {
    const heights = Array(25).fill(0)
    heights[13] = 4 // dome
    const workersAfter = { X: [12], O: [6] }
    const targets = buildTargetsAfter(heights, workersAfter, 12)
    expect(targets).toContain(12) // under self
    expect(targets).not.toContain(13) // dome
    expect(targets).not.toContain(6) // O worker (adjacent to 12? yes: 6 = row1,col1)
    expect(targets).toContain(7)
  })
})

// ---------------------------------------------------------------------------
// Turn generation & immobilization
// ---------------------------------------------------------------------------

describe('legalStTurns / immobilization', () => {
  it('opening position has many turns for both sides', () => {
    const init = INITIAL_SANTORINI()
    expect(legalStTurns(init.board, init.workers, 'X').length).toBeGreaterThan(10)
    expect(legalStTurns(init.board, init.workers, 'O').length).toBeGreaterThan(10)
  })

  it('a fully domed-in worker contributes nothing; total isolation loses', () => {
    // X worker at 12, every neighbor domed, second X worker ALSO domed in.
    const heights = Array(25).fill(0)
    for (const n of neighbors(12)) heights[n] = 4
    for (const n of neighbors(24)) heights[n] = 4
    const workers = { X: [12, 24], O: [0] }
    expect(hasAnyStTurn(heights, workers, 'X')).toBe(false)
    // O at 0 still has open ground → O fine.
    expect(hasAnyStTurn(heights, workers, 'O')).toBe(true)
    // All-domes board: the player to move loses.
    const heights2 = Array(25).fill(4)
    const workers2 = { X: [12, 24], O: [0, 4] }
    expect(hasAnyStTurn(heights2, workers2, 'O')).toBe(false)
    expect(getStWinner(heights2, workers2, 'X')).toEqual({ winner: 'X' })
  })
})

// ---------------------------------------------------------------------------
// applyStMove
// ---------------------------------------------------------------------------

describe('applyStMove', () => {
  it('rejects moves by foreign workers, bad climbs, and bad builds', () => {
    const init = INITIAL_SANTORINI()
    // Moving O's worker as X → no.
    expect(applyStMove(init, { worker: 0, to: 5, build: 1 }, 'X')).toBeNull()
    // Teleport → no.
    expect(applyStMove(init, { worker: 20, to: 2, build: 1 }, 'X')).toBeNull()
    // Legal move but build off to nowhere → no.
    expect(applyStMove(init, { worker: 20, to: 15, build: 99 }, 'X')).toBeNull()
    expect(applyStMove(init, { worker: 20, to: 15 }, 'X')).toBeNull() // build required
  })

  it('applies move+build and passes the turn', () => {
    const init = INITIAL_SANTORINI()
    const res = applyStMove(init, { worker: 20, to: 15, build: 10 }, 'X')
    expect(res).not.toBeNull()
    expect(res.workers.X).toContain(15)
    expect(res.workers.X).not.toContain(20)
    expect(res.board[10]).toBe(1)
    expect(res.currentTurn).toBe('O')
    expect(res.result).toBeNull()
  })

  it('climbing to level 3 wins immediately without a build', () => {
    const heights = Array(25).fill(0)
    heights[11] = 3
    heights[12] = 2 // X worker stands here; 11 is one up
    const state = mk(heights, [12, 24], [0, 4])
    const res = applyStMove(state, { worker: 12, to: 11, build: 0 }, 'X')
    expect(res?.result).toEqual({ winner: 'X', how: 'summit' })
    expect(res?.board[0]).toBe(0) // no build applied
  })

  it('cannot climb two levels', () => {
    const heights = Array(25).fill(0)
    heights[11] = 2 // two above 0
    const state = mk(heights, [12, 24], [0, 4])
    expect(applyStMove(state, { worker: 12, to: 11, build: 0 }, 'X')).toBeNull()
  })

  it('immobilizing the opponent wins after the build', () => {
    // O worker cornered at 0 (both O workers domed in); X moves+builds
    // somewhere harmless → O has no turn → X wins.
    const heights = Array(25).fill(0)
    for (const n of [1, 5, 6]) heights[n] = 4 // walls around O's corner
    for (const n of [23, 24, 19]) heights[n] = 4 // walls around O's other worker at 20... it's O's, at 24? O = [0, 24]: 24's neighbors are 18,19,23 → dome them
    const state = mk(heights, [12, 8], [0, 24])
    // X at 12 → 17, build 18. O at 0: neighbors 1,5,6 all domes. O at 24:
    // neighbors 18,19,23 — 19 and 23 domes, 18 now built to 1 (not a dome!)...
    // O can still move 24→18 (down). So build 13 instead and dome nothing —
    // we need ALL of 18,19,23 domed for the immobilization.
    for (const n of [18, 19, 23]) heights[n] = 4
    const res = applyStMove(state, { worker: 12, to: 17, build: 13 }, 'X')
    expect(res?.result).toEqual({ winner: 'X' })
  })

  it('full playouts terminate with a legal winner', () => {
    for (let seed = 0; seed < 8; seed++) {
      const init = INITIAL_SANTORINI()
      let { board, workers } = init
      let turn = 'X'
      let result = null
      let plies = 0
      while (!result && plies < 120) {
        const turns = legalStTurns(board, workers, turn)
        if (!turns.length) {
          result = { winner: turn === 'X' ? 'O' : 'X' }
          break
        }
        const move = turns[Math.floor(Math.random() * turns.length)]
        const res = applyStMove({ board, workers }, move, turn)
        expect(res).not.toBeNull()
        board = res.board
        workers = res.workers
        turn = res.currentTurn
        result = res.result
        plies++
      }
      expect(result).not.toBeNull()
      expect(['X', 'O']).toContain(result.winner)
    }
  })
})
