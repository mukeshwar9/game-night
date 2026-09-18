import { describe, it, expect } from 'vitest'
import {
  indexOf,
  INITIAL_LOA, normalizeLoaBoard,
  lineCount, loaMoves, hasAnyLoaMove,
  isUnited, getLoaWinner, applyLoaMove,
} from './loaLogic'

const mk = (map) => {
  const b = Array(64).fill('')
  for (const [i, v] of Object.entries(map)) b[Number(i)] = v
  return b
}

// ---------------------------------------------------------------------------
// Setup & normalization
// ---------------------------------------------------------------------------

describe('setup', () => {
  it('12 per side, corners empty, 64 cells, NEITHER side pre-united', () => {
    const b = INITIAL_LOA()
    expect(b).toHaveLength(64)
    expect(b.filter(v => v === 'X')).toHaveLength(12)
    expect(b.filter(v => v === 'O')).toHaveLength(12)
    expect(b.filter(v => v === '')).toHaveLength(40)
    // O on rows, X on columns, corners empty.
    expect(b[indexOf(0, 0)]).toBe('')
    expect(b[indexOf(0, 3)]).toBe('O')
    expect(b[indexOf(7, 3)]).toBe('O')
    expect(b[indexOf(3, 0)]).toBe('X')
    expect(b[indexOf(3, 7)]).toBe('X')
    expect(isUnited(b, 'X')).toBe(false)
    expect(isUnited(b, 'O')).toBe(false)
  })

  it('normalizes junk', () => {
    expect(normalizeLoaBoard(null)).toHaveLength(64)
    expect(normalizeLoaBoard(['X', 'junk', 5]).filter(v => v === 'X')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// lineCount — the signature rule
// ---------------------------------------------------------------------------

describe('lineCount', () => {
  it('counts both colors along the row', () => {
    const b = mk({ 8: 'X', 12: 'O', 10: 'X' }) // row 1
    // From 10: row count = 3.
    expect(lineCount(b, 10, 0, 1)).toBe(3)
    // Empty column through 10: only itself.
    expect(lineCount(b, 10, 1, 0)).toBe(1)
  })

  it('counts along diagonals', () => {
    const b = mk({ 0: 'X', 9: 'O', 18: 'X' }) // main diagonal
    expect(lineCount(b, 9, 1, 1)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// loaMoves — exact-distance + no-enemy-jumping
// ---------------------------------------------------------------------------

describe('loaMoves', () => {
  it('opening X piece moves per line counts (X lives on the COLUMNS)', () => {
    const b = INITIAL_LOA()
    // X at 48 (row 6, col 0). Column 0: 7 X pieces → exactly-7 up = 0 (path
    // 40..8 all own, landing empty) ✓. Row 6: 48 + O at 49? no — O sits on
    // rows 0/7; row 6 has only 48 → count 1 → right 1 = 49 ✓. Diagonal
    // (−1,+1): count 2 (48 + X at 42? r5c1... X only on cols 0/7 → 42 empty)
    // → count 1 → up-right 41 ✓. Down-right (1,1): land 55 empty → ✓.
    const moves = loaMoves(b, 48, 'X')
    expect(moves).toEqual([50, 0, 34])
  })

  it('cannot jump over enemy pieces', () => {
    const b = mk({ 24: 'X', 27: 'O' }) // row 3: X at 24, O at 27
    // From 24: row count = 2 → exactly 2 squares: 26 (empty, passes 25 empty).
    const moves = loaMoves(b, 24, 'X')
    expect(moves).toContain(26)
    expect(moves).not.toContain(25) // wrong distance
    expect(moves).not.toContain(27) // wrong distance (would pass 26 empty but distance is 3)
    // From 27 (O): row count 2 → right 2 = 29 legal; LEFT 2 = 25 passes 26
    // (empty) → also legal. The enemy at 24 is 3 away — unreachable, not
    // merely blocked.
    const omoves = loaMoves(b, 27, 'O')
    expect(omoves).toContain(29)
    expect(omoves).toContain(25)
    expect(omoves).not.toContain(24)
    // Real jump test: O at 25 (r3,c1), X at 26 (c2) → row count 2 → exactly-2
    // right = 27, but the ray PASSES the X at 26 → blocked. Left 2 off-board.
    const b2 = mk({ 25: 'O', 26: 'X' })
    const omoves2 = loaMoves(b2, 25, 'O')
    expect(omoves2).not.toContain(27)
    // With the X one further (27), exactly-2 right = 27 = the enemy itself,
    // passing only empty 26 → legal capture.
    const b3 = mk({ 25: 'O', 27: 'X' })
    expect(loaMoves(b3, 25, 'O')).toContain(27)
  })

  it('capture by landing on enemy, never on own', () => {
    const b = mk({ 24: 'X', 26: 'O' })
    // Row count = 2 → from 24 exactly 2 → 26 (enemy) capturable.
    const moves = loaMoves(b, 24, 'X')
    expect(moves).toContain(26)
    // Own piece at landing → excluded.
    const b2 = mk({ 24: 'X', 26: 'X' })
    expect(loaMoves(b2, 24, 'X')).not.toContain(26)
  })

  it('exact distance with edge truncation', () => {
    const b = mk({ 56: 'X', 57: 'X', 58: 'X', 59: 'X', 60: 'X', 61: 'X', 62: 'X' })
    // From 56: row count 7 → 7 squares right = 63 (empty, over own pieces).
    const moves = loaMoves(b, 56, 'X')
    expect(moves).toContain(63)
    // A row of 8 pieces gives count 8 — from the leftmost piece, 8 right is
    // off-board; only the left ray matters (off-board too) → no row moves.
    const b2 = mk({ 56: 'X', 57: 'X', 58: 'X', 59: 'X', 60: 'X', 61: 'X', 62: 'X', 63: 'X' })
    const moves2 = loaMoves(b2, 56, 'X')
    expect(moves2).not.toContain(63) // own piece
    expect(moves2.every(t => t < 56 || t > 63)).toBe(true) // no row moves at all
  })

  it('stuck detection', () => {
    const b = mk({ 0: 'O', 63: 'X' })
    expect(hasAnyLoaMove(b, 'O')).toBe(true) // lone piece always has line-count 1 moves... every neighbor
    expect(hasAnyLoaMove(b, 'X')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Unity (win condition)
// ---------------------------------------------------------------------------

describe('isUnited', () => {
  it('diagonal adjacency connects', () => {
    const b = mk({ 0: 'X', 9: 'X', 18: 'X' })
    expect(isUnited(b, 'X')).toBe(true)
  })

  it('scattered pieces are not united', () => {
    const b = mk({ 0: 'X', 9: 'X', 20: 'X' })
    // 9 and 18 are adjacent? 9 (r1c1), 20 (r2c4) — not adjacent. 0-9 adjacent.
    expect(isUnited(b, 'X')).toBe(false)
  })

  it('single piece and zero pieces', () => {
    expect(isUnited(mk({ 5: 'X' }), 'X')).toBe(true)
    expect(isUnited(mk({}), 'X')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getLoaWinner
// ---------------------------------------------------------------------------

describe('getLoaWinner', () => {
  it('mover united wins', () => {
    const b = mk({ 0: 'X', 1: 'X', 9: 'X', 40: 'O', 41: 'O' })
    expect(getLoaWinner(b, 'X')).toEqual({ winner: 'X' })
  })

  it('opponent eliminated wins for mover', () => {
    const b = mk({ 0: 'X', 1: 'X' })
    expect(getLoaWinner(b, 'X')).toEqual({ winner: 'X' })
  })

  it('mover priority when both unite on the same ply', () => {
    const b = mk({ 0: 'X', 1: 'X', 40: 'O', 41: 'O' })
    expect(getLoaWinner(b, 'X')).toEqual({ winner: 'X' })
    expect(getLoaWinner(b, 'O')).toEqual({ winner: 'O' })
  })

  it('null mid-game', () => {
    const b = mk({ 0: 'X', 20: 'X', 40: 'O', 60: 'O' })
    expect(getLoaWinner(b, 'X')).toBeNull()
  })

  it('playout plumb: applyLoaMove feeds getLoaWinner with a united opponent (edge)', () => {
    // X mistakenly hands O the win by capturing down to one enemy piece
    // while X remains scattered.
    const board = mk({ 0: 'X', 24: 'X', 26: 'O', 44: 'O' })
    const res = applyLoaMove(board, { from: 24, to: 26 }, 'X')
    expect(res?.captured).toBe(true)
    expect(res?.result).toEqual({ winner: 'O' })
    const b = res.board
    expect(isUnited(b, 'O')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyLoaMove
// ---------------------------------------------------------------------------

describe('applyLoaMove', () => {
  it('rejects foreign pieces, identity moves, wrong distances', () => {
    const b = INITIAL_LOA()
    expect(applyLoaMove(b, { from: 2, to: 10 }, 'X')).toBeNull() // O's piece
    expect(applyLoaMove(b, { from: 50, to: 50 }, 'X')).toBeNull()
    expect(applyLoaMove(b, { from: 50, to: 55 }, 'X')).toBeNull() // col 7? distance wrong
    expect(applyLoaMove(b, null, 'X')).toBeNull()
  })

  it('performs a capture; the mover is then united and wins (mover priority)', () => {
    const b = mk({ 24: 'X', 26: 'O', 40: 'O' })
    const res = applyLoaMove(b, { from: 24, to: 26 }, 'X')
    expect(res).not.toBeNull()
    expect(res.board[26]).toBe('X')
    expect(res.board[24]).toBe('')
    expect(res.captured).toBe(true)
    expect(res.currentTurn).toBe('O')
    // After the capture X is a lone piece → united → mover priority wins.
    expect(res.result).toEqual({ winner: 'X' })
  })

  it('capturing down to one enemy piece can hand THEM the win (when mover not united)', () => {
    const b2 = mk({ 0: 'X', 24: 'X', 26: 'O', 44: 'O' })
    // Row 3: 24(X), 26(O) → count 2 → 24+2=26 (capture, passes 25 empty).
    const res = applyLoaMove(b2, { from: 24, to: 26 }, 'X')
    expect(res?.captured).toBe(true)
    // X now: 0, 26 — not adjacent → NOT united. O now: lone 44 → united →
    // X's move handed O the win.
    expect(res?.result).toEqual({ winner: 'O' })
  })

  it('full playouts from the standard setup terminate with a legal winner', () => {
    for (let seed = 0; seed < 6; seed++) {
      let board = INITIAL_LOA()
      let turn = 'X'
      let result = null
      let plies = 0
      while (!result && plies < 1000) {
        // Collect all moves for `turn`.
        const all = []
        for (let i = 0; i < 64; i++) {
          if (board[i] === turn) {
            for (const to of loaMoves(board, i, turn)) all.push({ from: i, to })
          }
        }
        if (!all.length) {
          result = { winner: turn === 'X' ? 'O' : 'X' }
          break
        }
        const move = all[Math.floor(Math.random() * all.length)]
        const res = applyLoaMove(board, move, turn)
        expect(res).not.toBeNull()
        board = res.board
        turn = res.currentTurn
        result = res.result
        plies++
      }
      expect(result).not.toBeNull()
      expect(['X', 'O']).toContain(result.winner)
    }
  })
})
