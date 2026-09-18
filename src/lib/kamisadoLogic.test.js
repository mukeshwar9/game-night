import { describe, it, expect } from 'vitest'
import {
  KM_SIZE,
  KM_CELL_COUNT,
  KM_COLORS,
  KM_COLOR_VARS,
  KM_COLOR_NAMES,
  indexOf,
  normalizeKmBoard,
  INITIAL_KAMISADO,
  INITIAL_KAMISADO_TOWERS,
  kmTowerCellOf,
  kmStepRow,
  kmTowerMoves,
  hasAnyKamisadoMove,
  applyKamisadoMove,
  getKamisadoWinner,
  assertKmConsistent,
} from './kamisadoLogic'

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------
describe('structure', () => {
  it('is an 8x8 board with 8 colors', () => {
    expect(KM_SIZE).toBe(8)
    expect(KM_CELL_COUNT).toBe(64)
    expect(KM_COLORS).toHaveLength(64)
    expect(new Set(KM_COLORS).size).toBe(8)
    expect(KM_COLOR_VARS).toHaveLength(8)
    expect(KM_COLOR_NAMES).toHaveLength(8)
  })

  it('each color appears exactly 8 times', () => {
    for (let k = 0; k < 8; k++) {
      expect(KM_COLORS.filter(c => c === k)).toHaveLength(8)
    }
  })

  it('each home row holds all 8 colors exactly once (one tower per color)', () => {
    for (const row of [0, 7]) {
      const colors = KM_COLORS.slice(row * 8, row * 8 + 8)
      expect(new Set(colors).size).toBe(8)
    }
  })

  it('initial board: 8 X towers on row 7, 8 O towers on row 0', () => {
    const b = INITIAL_KAMISADO()
    expect(b.filter(v => v === 'X')).toHaveLength(8)
    expect(b.filter(v => v === 'O')).toHaveLength(8)
    for (let c = 0; c < 8; c++) {
      expect(b[indexOf(7, c)]).toBe('X')
      expect(b[indexOf(0, c)]).toBe('O')
    }
  })

  it('kmStepRow: X up, O down', () => {
    expect(kmStepRow('X')).toBe(-1)
    expect(kmStepRow('O')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// normalizeKmBoard / kmTowerCellOf
// ---------------------------------------------------------------------------
describe('normalizeKmBoard / kmTowerCellOf', () => {
  it('accepts sparse arrays and numeric-keyed objects', () => {
    const sparse = []
    sparse[9] = 'X'
    expect(normalizeKmBoard(sparse)[9]).toBe('X')
    expect(normalizeKmBoard(sparse)).toHaveLength(64)
    expect(normalizeKmBoard({ 5: 'O' })[5]).toBe('O')
    expect(normalizeKmBoard(null)).toHaveLength(64)
  })

  it('kmTowerCellOf locates each color tower on the home row', () => {
    const b = INITIAL_KAMISADO()
    const towers = INITIAL_KAMISADO_TOWERS()
    const seen = new Set()
    for (let k = 0; k < 8; k++) {
      const xi = kmTowerCellOf(b, 'X', k, towers)
      expect(xi).toBeGreaterThanOrEqual(0)
      expect(Math.floor(xi / 8)).toBe(7)
      expect(KM_COLORS[xi]).toBe(k)
      seen.add(xi)
    }
    expect(seen.size).toBe(8) // all distinct towers
    for (let k = 0; k < 8; k++) {
      const oi = kmTowerCellOf(b, 'O', k, INITIAL_KAMISADO_TOWERS())
      expect(Math.floor(oi / 8)).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// kmTowerMoves
// ---------------------------------------------------------------------------
describe('kmTowerMoves', () => {
  it('a tower on its home row can move straight and diagonally forward', () => {
    const b = INITIAL_KAMISADO()
    // X tower on (7,3): straight (6,3),(5,3)... plus diagonals.
    const dests = kmTowerMoves(b, 'X', KM_COLORS[indexOf(7, 3)]).map(m => m.to)
    expect(dests).toContain(indexOf(6, 3))
    expect(dests).toContain(indexOf(6, 2))
    expect(dests).toContain(indexOf(6, 4))
    expect(dests).not.toContain(indexOf(0, 3)) // row 0 holds O towers — blocked before then
  })

  it('slides are blocked by the first occupied square', () => {
    const b = INITIAL_KAMISADO()
    // X tower at (7,0): the straight ray up column 0 is empty until row 0
    // where O sits; diagonal rays hit nothing until row 0 too.
    const dests = kmTowerMoves(b, 'X', KM_COLORS[indexOf(7, 0)]).map(m => m.to)
    expect(dests).not.toContain(indexOf(0, 0)) // O tower occupies row 0
    expect(dests).toContain(indexOf(1, 0)) // last empty square on the ray
  })

  it('a tower with a piece directly ahead can still slide diagonals', () => {
    const b = INITIAL_KAMISADO()
    b[indexOf(6, 3)] = 'X' // extra tower directly ahead of (7,3)
    const dests = kmTowerMoves(b, 'X', KM_COLORS[indexOf(7, 3)]).map(m => m.to)
    expect(dests).not.toContain(indexOf(6, 3))
    expect(dests).toContain(indexOf(6, 2))
    expect(dests).toContain(indexOf(6, 4))
  })

  it('a fully surrounded tower has no moves; hasAnyKamisadoMove reflects it', () => {
    const b = Array(64).fill('')
    // X tower of color KM_COLORS[indexOf(3,3)] at (3,3), all 8 neighbors O.
    b[indexOf(3, 3)] = 'X'
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      b[indexOf(3 + dr, 3 + dc)] = 'O'
    }
    const k = KM_COLORS[indexOf(3, 3)]
    expect(kmTowerMoves(b, 'X', k)).toHaveLength(0)
    // other X towers elsewhere would still move; put none, so no moves at all
    expect(hasAnyKamisadoMove(b, 'X')).toBe(false)
  })

  it('X towers never propose backward or sideways landings', () => {
    const b = INITIAL_KAMISADO()
    for (let k = 0; k < 8; k++) {
      for (const m of kmTowerMoves(b, 'X', k)) {
        expect(Math.floor(m.to / 8)).toBeLessThan(Math.floor(m.from / 8))
      }
    }
  })
})

// ---------------------------------------------------------------------------
// applyKamisadoMove
// ---------------------------------------------------------------------------
describe('applyKamisadoMove', () => {
  it('moves the tower and returns the landed color as the next forced color', () => {
    const b = INITIAL_KAMISADO()
    const from = indexOf(7, 3)
    const to = indexOf(4, 3)
    const res = applyKamisadoMove(b, { from, to }, 'X', null)
    expect(res.board[from]).toBe('')
    expect(res.board[to]).toBe('X')
    expect(res.forcedColor).toBe(KM_COLORS[to])
    expect(res.extraTurn).toBe(false)
    expect(res.result).toBeNull()
  })

  it('rejects moves of the wrong tower when a color is forced', () => {
    const b = INITIAL_KAMISADO()
    const from = indexOf(7, 0) // color A
    const to = indexOf(5, 0)
    const forced = KM_COLORS[indexOf(7, 3)] // a different tower's color
    if (forced !== KM_COLORS[from]) {
      expect(applyKamisadoMove(b, { from, to }, 'X', forced)).toBeNull()
    }
  })

  it('rejects illegal slides (backward, through pieces, off-board)', () => {
    const b = INITIAL_KAMISADO()
    const from = indexOf(7, 3)
    expect(applyKamisadoMove(b, { from, to: indexOf(7, 4) }, 'X', null)).toBeNull() // sideways
    expect(applyKamisadoMove(b, { from, to: indexOf(0, 3) }, 'X', null)).toBeNull() // through O towers? (0,3) occupied by O
    expect(applyKamisadoMove(b, { from, to: indexOf(9, 3) }, 'X', null)).toBeNull() // off board
    expect(applyKamisadoMove(b, { from: indexOf(0, 3), to: indexOf(5, 3) }, 'X', null)).toBeNull() // not X's tower
  })

  it('extraTurn fires when the opponent is forced onto a stuck tower', () => {
    // Build: X tower to land on a color whose O tower is boxed in, while O's
    // other towers can still move.
    const b = Array(64).fill('')
    // O tower of color KM_COLORS[indexOf(2,3)] sits at (2,3), surrounded.
    const stuckColor = KM_COLORS[indexOf(2, 3)]
    b[indexOf(2, 3)] = 'O'
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      if (b[indexOf(2 + dr, 3 + dc)] === '') b[indexOf(2 + dr, 3 + dc)] = 'X'
    }
    // (3,4) is an X now; X needs a movable tower of another color to move
    // and land on a square of stuckColor.
    // X's other tower at (7,0); O gets a SECOND, movable tower of a DIFFERENT
    // color (row 6 col 6 = color 3 ≠ stuckColor) so the position isn't a dead
    // no-move position — bonus move requires the opponent to have some legal
    // move, just not with the forced tower. Note: each player owns exactly one
    // tower per color, so the second O tower must not repeat stuckColor.
    const xTower = indexOf(7, 0)
    b[xTower] = 'X'
    b[indexOf(6, 6)] = 'O'
    // search any X destination with KM_COLORS === stuckColor reachable from (7,0)
    let landing = -1
    outer: for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 8; c++) {
        const i = indexOf(r, c)
        if (b[i] === '' && KM_COLORS[i] === stuckColor) {
          // straight-line forward reachable from (7,0)? column 0 or diagonals from col 0
          const dc = c - 0
          if (c === 0 || Math.abs(dc) === 7 - r) { landing = i; break outer }
        }
      }
    }
    expect(landing).toBeGreaterThanOrEqual(0)
    const res = applyKamisadoMove(b, { from: xTower, to: landing }, 'X', KM_COLORS[xTower])
    expect(res).not.toBeNull()
    expect(res.extraTurn).toBe(true)
    // Bonus move: constraint lifted — the mover may move ANY tower next.
    expect(res.forcedColor).toBeNull()
  })

  it('reaching the far home row wins the round', () => {
    const b = Array(64).fill('')
    b[indexOf(1, 4)] = 'X'
    b[indexOf(6, 0)] = 'O'
    const res = applyKamisadoMove(b, { from: indexOf(1, 4), to: indexOf(0, 4) }, 'X', KM_COLORS[indexOf(1, 4)])
    expect(res.result).toEqual({ winner: 'X' })
    expect(getKamisadoWinner(res.board)).toEqual({ winner: 'X' })
  })

  it('O wins by reaching row 7', () => {
    const b = Array(64).fill('')
    b[indexOf(6, 2)] = 'O'
    b[indexOf(1, 5)] = 'X'
    const res = applyKamisadoMove(b, { from: indexOf(6, 2), to: indexOf(7, 2) }, 'O', KM_COLORS[indexOf(6, 2)])
    expect(res.result).toEqual({ winner: 'O' })
  })

  it('does not mutate the input board', () => {
    const b = INITIAL_KAMISADO()
    const before = [...b]
    applyKamisadoMove(b, { from: indexOf(7, 3), to: indexOf(4, 3) }, 'X', null)
    expect(b).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// Fuzz — random legal play always stays consistent
// ---------------------------------------------------------------------------
describe('kamisado random playouts', () => {
  it('forced-color chain stays legal and games terminate', () => {
    let seed = 0x4b1d5 // deterministic PRNG seed
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >> 17
      seed ^= seed << 5; seed >>>= 0
      return seed / 0xffffffff
    }
    for (let trial = 0; trial < 60; trial++) {
      let board = INITIAL_KAMISADO()
      let forced = null
      let turn = 'X'
      let guard = 0
      let winner = null
      while (!winner && guard++ < 400) {
        // collect all legal moves for turn (respecting forced color)
        let all = []
        if (forced == null) {
          for (let k = 0; k < 8; k++) all.push(...kmTowerMoves(board, turn, k))
        } else {
          all = kmTowerMoves(board, turn, forced)
        }
        if (!all.length) {
          // Forced tower stuck: bonus move — same player, any tower.
          // (If they have NO movable tower the position is dead; declare the
          // other side the winner — defensive, unreachable in real play.)
          if (!hasAnyKamisadoMove(board, turn)) {
            winner = turn === 'X' ? 'O' : 'X'
            break
          }
          forced = null
          continue
        }
        const m = all[Math.floor(rand() * all.length)]
        const res = applyKamisadoMove(board, m, turn, forced)
        expect(res).not.toBeNull()
        board = res.board
        forced = res.forcedColor
        if (res.result) { winner = res.result.winner; break }
        if (!res.extraTurn) turn = turn === 'X' ? 'O' : 'X'
      }
      expect(winner).not.toBeNull()
      expect(['X', 'O']).toContain(winner)
    }
  })
})

// ---------------------------------------------------------------------------
// Tower IDENTITY regression — the shipped bug: towers were located by the
// color of the square they STAND on, so after a cross-color march the forced
// tower resolved to -1 (spurious extra turns / soft-locked forced turns).

describe('tower identity survives cross-color marches', () => {
  // X's color-0 tower marched to (3,1) — a square whose color is 7. Its
  // identity is still color 0; no X tower stands on any color-0 square.
  const mkCrossed = () => {
    const towers = INITIAL_KAMISADO_TOWERS()
    towers.X[0] = indexOf(3, 1)
    const board = Array(KM_CELL_COUNT).fill('')
    board[indexOf(3, 1)] = 'X'
    board[indexOf(0, 7)] = 'O'
    return { board, towers }
  }

  it('kmTowerCellOf resolves by identity map, not square color', () => {
    const { board, towers } = mkCrossed()
    expect(KM_COLORS[indexOf(3, 1)]).toBe(7) // sanity: square color ≠ 0
    expect(kmTowerCellOf(board, 'X', 0, towers)).toBe(indexOf(3, 1))
    // No X tower stands on a color-0 square → the legacy positional scan
    // would return -1 for color 0. The map must not.
  })

  it('a mapped tower still generates glide moves after crossing colors', () => {
    const { board, towers } = mkCrossed()
    const moves = kmTowerMoves(board, 'X', 0, towers)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.from === indexOf(3, 1))).toBe(true)
  })

  it('forcedColor is enforced against tower IDENTITY (old code used square color)', () => {
    const { board, towers } = mkCrossed()
    const step = { from: indexOf(3, 1), to: indexOf(2, 1) }
    // Old code: KM_COLORS[from] === 7 → accepted a color-0 tower under a
    // color-7 force (wrong tower). Identity says k=0 ≠ 7 → reject.
    expect(applyKamisadoMove(board, step, 'X', 7, { towers })).toBeNull()
    // Forced to its true color 0 → the same step is legal.
    expect(applyKamisadoMove(board, step, 'X', 0, { towers })).not.toBeNull()
  })

  it('playout with the identity map keeps board/tower state consistent', () => {
    for (let seed = 0; seed < 8; seed++) {
      let s = seed * 2654435761 % 2147483647
      const rand = () => { s = (s * 48271) % 2147483647; return s / 2147483647 }
      let board = INITIAL_KAMISADO()
      let towers = INITIAL_KAMISADO_TOWERS()
      let forced = null
      let turn = 'X'
      let winner = null
      for (let ply = 0; ply < 120 && !winner; ply++) {
        let all = []
        if (forced == null) {
          for (let k = 0; k < 8; k++) all.push(...kmTowerMoves(board, turn, k, towers))
        } else {
          all = kmTowerMoves(board, turn, forced, towers)
        }
        if (!all.length) {
          if (hasAnyKamisadoMove(board, turn, towers)) { forced = null; continue }
          winner = turn === 'X' ? 'O' : 'X'
          break
        }
        const m = all[Math.floor(rand() * all.length)]
        const res = applyKamisadoMove(board, m, turn, forced, { towers })
        expect(res).not.toBeNull()
        board = res.board
        towers = res.towers
        forced = res.forcedColor
        if (res.result) { winner = res.result.winner; break }
        if (!res.extraTurn) turn = turn === 'X' ? 'O' : 'X'
        expect(assertKmConsistent(board, towers)).toEqual([])
      }
      expect(winner).not.toBeNull()
    }
  })
})
