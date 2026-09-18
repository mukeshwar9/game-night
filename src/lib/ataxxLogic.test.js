import { describe, it, expect } from 'vitest'
import {
  AX_COLS,
  AX_ROWS,
  AX_CELL_COUNT,
  AX_START_X,
  AX_START_O,
  indexOf,
  normalizeAxBoard,
  INITIAL_ATAXX,
  chebyshev,
  legalAtaxxMoves,
  hasAnyAtaxxMove,
  countAtaxx,
  ataxxNeighbors,
  applyAtaxxMove,
  getAtaxxWinner,
  ATAXX_MOVE_CAP,
} from './ataxxLogic'

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------
describe('structure', () => {
  it('is a 7x7 board with corners diagonal', () => {
    expect(AX_COLS).toBe(7)
    expect(AX_ROWS).toBe(7)
    expect(AX_CELL_COUNT).toBe(49)
    expect(AX_START_X).toBe(42) // bottom-left
    expect(AX_START_O).toBe(0) // top-right
    const b = INITIAL_ATAXX()
    expect(b[0]).toBe('O')
    expect(b[42]).toBe('X')
    expect(countAtaxx(b, 'X')).toBe(1)
    expect(countAtaxx(b, 'O')).toBe(1)
  })

  it('chebyshev distance matches king geometry', () => {
    expect(chebyshev(indexOf(0, 0), indexOf(0, 1))).toBe(1)
    expect(chebyshev(indexOf(0, 0), indexOf(1, 1))).toBe(1)
    expect(chebyshev(indexOf(0, 0), indexOf(1, 2))).toBe(2)
    expect(chebyshev(indexOf(0, 0), indexOf(6, 6))).toBe(6)
  })

  it('ataxxNeighbors: interior 8, edge 5, corner 3, never out of bounds', () => {
    expect(ataxxNeighbors(indexOf(3, 3))).toHaveLength(8)
    expect(ataxxNeighbors(indexOf(0, 3))).toHaveLength(5)
    expect(ataxxNeighbors(indexOf(0, 0))).toHaveLength(3)
    for (let i = 0; i < AX_CELL_COUNT; i++) {
      for (const nb of ataxxNeighbors(i)) {
        expect(nb).toBeGreaterThanOrEqual(0)
        expect(nb).toBeLessThan(AX_CELL_COUNT)
        expect(chebyshev(i, nb)).toBe(1)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// normalizeAxBoard
// ---------------------------------------------------------------------------
describe('normalizeAxBoard', () => {
  it('accepts sparse arrays, numeric-keyed objects, null', () => {
    const sparse = []
    sparse[10] = 'X'
    expect(normalizeAxBoard(sparse)[10]).toBe('X')
    expect(normalizeAxBoard(sparse)).toHaveLength(49)
    expect(normalizeAxBoard({ 5: 'O' })[5]).toBe('O')
    expect(normalizeAxBoard(null)).toHaveLength(49)
    expect(normalizeAxBoard({ 5: 'z' })[5]).toBe('')
  })
})

// ---------------------------------------------------------------------------
// legalAtaxxMoves
// ---------------------------------------------------------------------------
describe('legalAtaxxMoves', () => {
  it('lone corner piece has 3 clones and 5 jumps', () => {
    const b = INITIAL_ATAXX()
    const xMoves = legalAtaxxMoves(b, 'X').filter(m => m.kind === 'clone')
    const xJumps = legalAtaxxMoves(b, 'X').filter(m => m.kind === 'jump')
    expect(xMoves).toHaveLength(3)
    expect(xJumps).toHaveLength(5)
  })

  it('cannot land on occupied squares', () => {
    const b = INITIAL_ATAXX()
    for (const m of legalAtaxxMoves(b, 'X')) {
      expect(b[m.to]).toBe('')
      expect(m.to).not.toBe(AX_START_O)
    }
  })

  it('never proposes distance-0 or distance>2 landings', () => {
    const b = INITIAL_ATAXX()
    for (const m of legalAtaxxMoves(b, 'X')) {
      const d = chebyshev(m.from, m.to)
      expect(d === 1 || d === 2).toBe(true)
    }
  })

  it('empty board for the mover means no moves', () => {
    const b = Array(49).fill('')
    expect(legalAtaxxMoves(b, 'X')).toHaveLength(0)
    expect(hasAnyAtaxxMove(b, 'X')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applyAtaxxMove
// ---------------------------------------------------------------------------
describe('applyAtaxxMove', () => {
  it('clone keeps the source piece', () => {
    const b = INITIAL_ATAXX()
    const res = applyAtaxxMove(b, { from: 42, to: 43 }, 'X') // (6,0) -> (6,1)
    expect(res.board[42]).toBe('X')
    expect(res.board[43]).toBe('X')
    expect(res.converted).toBe(0)
  })

  it('jump vacates the source', () => {
    const b = INITIAL_ATAXX()
    const res = applyAtaxxMove(b, { from: 42, to: 28 }, 'X')
    expect(res.board[42]).toBe('')
    expect(res.board[28]).toBe('X')
  })

  it('converts adjacent enemy pieces after landing', () => {
    const b = Array(49).fill('')
    b[indexOf(3, 3)] = 'X'
    b[indexOf(3, 4)] = 'O'
    b[indexOf(4, 4)] = 'O'
    const res = applyAtaxxMove(b, { from: indexOf(3, 3), to: indexOf(3, 2) }, 'X')
    // landing (3,2): neighbors include (3,3)X and (2,1),(2,2),(2,3),(3,1),(4,1),(4,2),(4,3)
    // (3,4) is NOT adjacent to (3,2) — distance 2. (4,4) not adjacent either.
    expect(res.converted).toBe(0)
    // now land next to both
    const b2 = Array(49).fill('')
    b2[indexOf(3, 3)] = 'X'
    b2[indexOf(2, 4)] = 'O'
    b2[indexOf(4, 4)] = 'O'
    const res2 = applyAtaxxMove(b2, { from: indexOf(3, 3), to: indexOf(3, 4) }, 'X')
    expect(res2.board[indexOf(2, 4)]).toBe('X')
    expect(res2.board[indexOf(4, 4)]).toBe('X')
    expect(res2.converted).toBe(2)
  })

  it('does not convert own pieces', () => {
    const b = Array(49).fill('')
    b[indexOf(3, 3)] = 'X'
    b[indexOf(2, 4)] = 'X'
    const res = applyAtaxxMove(b, { from: indexOf(3, 3), to: indexOf(3, 4) }, 'X')
    expect(res.board[indexOf(2, 4)]).toBe('X')
    expect(countAtaxx(res.board, 'X')).toBe(3)
  })

  it('rejects illegal payloads: wrong owner, occupied target, bad distance', () => {
    const b = INITIAL_ATAXX()
    expect(applyAtaxxMove(b, { from: 0, to: 1 }, 'X')).toBeNull() // O's piece
    expect(applyAtaxxMove(b, { from: 42, to: 0 }, 'X')).toBeNull() // occupied by O
    expect(applyAtaxxMove(b, { from: 42, to: 14 }, 'X')).toBeNull() // distance 4
    expect(applyAtaxxMove(b, { from: 42 }, 'X')).toBeNull()
    expect(applyAtaxxMove(b, null, 'X')).toBeNull()
    expect(applyAtaxxMove(b, { from: 42, to: 49 }, 'X')).toBeNull() // out of range
  })

  it('does not mutate the input board', () => {
    const b = INITIAL_ATAXX()
    const before = [...b]
    applyAtaxxMove(b, { from: 42, to: 41 }, 'X')
    expect(b).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// getAtaxxWinner
// ---------------------------------------------------------------------------
describe('getAtaxxWinner', () => {
  it('null while the game is live', () => {
    expect(getAtaxxWinner(INITIAL_ATAXX())).toBeNull()
  })

  it('full board decides by majority', () => {
    const b = Array(49).fill('')
    for (let i = 0; i < 49; i++) b[i] = i < 25 ? 'X' : 'O' // 25 vs 24
    const r = getAtaxxWinner(b)
    expect(r.winner).toBe('X')
    expect(r.scoreX).toBe(25)
    expect(r.scoreO).toBe(24)
  })

  it('move cap forces resolution on a cycling position', () => {
    const b = Array(49).fill('')
    b[indexOf(0, 0)] = 'X'
    b[indexOf(6, 6)] = 'O'
    // Below the cap the game is live; at/after the cap it resolves.
    expect(getAtaxxWinner(b, 0)).toBeNull()
    const r = getAtaxxWinner(b, ATAXX_MOVE_CAP)
    expect(r).not.toBeNull()
  })

  it('full board with an even split is a draw — impossible on 49 cells, so majority always decides', () => {
    const b = Array(49).fill('')
    for (let i = 0; i < 49; i++) b[i] = i < 24 ? 'X' : 'O' // 24 vs 25
    const r = getAtaxxWinner(b)
    expect(r.winner).toBe('O')
  })

  it('zero pieces = that side is stuck → game over immediately', () => {
    const b = Array(49).fill('')
    b[indexOf(3, 3)] = 'X'
    const r = getAtaxxWinner(b)
    expect(r.winner).toBe('X')
    expect(r.scoreX).toBe(1)
    expect(r.scoreO).toBe(0)
  })

  it('both sides unable to move decides by count', () => {
    // A stuck-both position can't occur on an open 7x7; exercise the branch
    // with a full board (neither side can move — board full).
    const b = Array(49).fill('')
    for (let i = 0; i < 49; i++) b[i] = i % 2 === 0 ? 'X' : 'O' // 25 X / 24 O
    const r = getAtaxxWinner(b)
    expect(r.winner).toBe('X')
  })

  it('random playouts always terminate with a decisive or drawn result', () => {
    let seed = 0xadd1c7
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >> 17
      seed ^= seed << 5; seed >>>= 0
      return seed / 0xffffffff
    }
    for (let trial = 0; trial < 60; trial++) {
      let board = INITIAL_ATAXX()
      let turn = 'X'
      let moveCount = 0
      let result = null
      while (!result && moveCount < 200) {
        const moves = legalAtaxxMoves(board, turn)
        if (!moves.length) {
          // pass: turn stays with the same player only if the OTHER side can
          // move; if neither can move, the game is over.
          const opp = turn === 'X' ? 'O' : 'X'
          if (!hasAnyAtaxxMove(board, opp)) {
            result = getAtaxxWinner(board, moveCount)
            break
          }
          // formal pass — in the real registry this keeps currentTurn; here we
          // just flip to keep the playout moving.
          turn = opp
          continue
        }
        const m = moves[Math.floor(rand() * moves.length)]
        board = applyAtaxxMove(board, m, turn).board
        moveCount++
        result = getAtaxxWinner(board, moveCount)
        turn = turn === 'X' ? 'O' : 'X'
      }
      expect(result).not.toBeNull()
      expect(['X', 'O', 'draw']).toContain(result.winner)
      // Termination can be early-elimination (unfilled board) or a full board.
      expect(result.scoreX + result.scoreO).toBeLessThanOrEqual(49)
      expect(result.scoreX + result.scoreO).toBeGreaterThanOrEqual(2)
    }
  })
})
