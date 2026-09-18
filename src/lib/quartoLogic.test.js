import { describe, it, expect } from 'vitest'
import {
  QRT_LINES,
  attrBit, lineWins, findQuartoLine, getQuartoWinner,
  giveOptions, applyQuartoMove, dealQuarto,
  normalizeQuartoBoard, normalizeIds,
} from './quartoLogic'

// ---------------------------------------------------------------------------
// Piece attributes
// ---------------------------------------------------------------------------

describe('piece encoding', () => {
  it('attrBit extracts bits 0-3', () => {
    expect(attrBit(0b1010, 0)).toBe(0)
    expect(attrBit(0b1010, 1)).toBe(1)
    expect(attrBit(0b1010, 3)).toBe(1)
    expect(attrBit(15, 0)).toBe(1)
    expect(attrBit('x', 0)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Line / win detection
// ---------------------------------------------------------------------------

describe('lines', () => {
  it('has exactly 10 lines', () => {
    expect(QRT_LINES).toHaveLength(10)
  })

  it('lineWins needs four placed ids sharing one bit', () => {
    // All even → share bit0=0.
    expect(lineWins([0, 2, 4, 8])).toBe(true)
    // All have bit3 set → share light/dark.
    expect(lineWins([8, 9, 10, 15])).toBe(true)
    // 0(0000) 5(0101) 10(1010) 15(1111): every bit has two 0s/two 1s → none shared.
    expect(lineWins([0, 5, 10, 15])).toBe(false)
    // 0..3 all have bits 2,3 = 0 → they DO share (common Quarto surprise).
    expect(lineWins([0, 1, 2, 3])).toBe(true)
    // Incomplete or empty slots never win.
    expect(lineWins([0, 2, 4])).toBe(false)
    expect(lineWins([0, 2, 4, ''])).toBe(false)
  })

  it('finds the winning line cells', () => {
    const board = Array(16).fill('')
    // Row 0: cells 0..3, all even ids.
    board[0] = 0; board[1] = 2; board[2] = 4; board[3] = 8
    expect(findQuartoLine(board)).toEqual([0, 1, 2, 3])
    // Column 1: cells 1,5,9,13.
    const b2 = Array(16).fill('')
    b2[1] = 8; b2[5] = 9; b2[9] = 10; b2[13] = 15
    expect(findQuartoLine(b2)).toEqual([1, 5, 9, 13])
    // Nothing placed → null.
    expect(findQuartoLine(Array(16).fill(''))).toBeNull()
  })

  it('getQuartoWinner returns draw on a full board without a line', () => {
    // A 4×4 Latin square where every row, column AND both diagonals contain
    // all four indices of P = {0,5,10,15} (bit-mixed — no four share a bit).
    const P = [0, 5, 10, 15]
    const M = [
      [0, 1, 2, 3],
      [2, 3, 0, 1],
      [3, 2, 1, 0],
      [1, 0, 3, 2],
    ]
    const board = M.flat().map(k => P[k])
    expect(getQuartoWinner(board)).toEqual({ winner: 'draw' })
  })

  it('getQuartoWinner returns null mid-game', () => {
    const board = Array(16).fill('')
    board[0] = 0; board[5] = 1
    expect(getQuartoWinner(board)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Give options
// ---------------------------------------------------------------------------

describe('giveOptions', () => {
  it('offers only unplaced pieces, excluding pending and board pieces', () => {
    const board = Array(16).fill('')
    board[0] = 3
    const unplaced = [3, 5, 7, 9] // 3 is stale/corrupt on the shelf
    expect(giveOptions(board, unplaced, 7)).toEqual([5, 9])
  })

  it('normalizes junk inputs', () => {
    expect(giveOptions(null, null, null)).toEqual([])
    expect(normalizeIds([1, '2', 99, -1, 2, 1])).toEqual([1, 2])
    expect(normalizeQuartoBoard(null)).toHaveLength(16)
  })
})

// ---------------------------------------------------------------------------
// applyQuartoMove: the two-part action
// ---------------------------------------------------------------------------

describe('applyQuartoMove', () => {
  const fresh = () => {
    const { unplaced, pending } = dealQuarto()
    return { board: Array(16).fill(''), unplaced, pending }
  }

  it('fresh deal hands X a pending piece and a full shelf', () => {
    const s = fresh()
    expect(s.unplaced).toHaveLength(16)
    expect(Number.isInteger(s.pending)).toBe(true)
  })

  it('rejects bad cells, missing shelf pieces, and missing give', () => {
    const s = fresh()
    expect(applyQuartoMove(s.board, { place: -1, give: 0 }, 'X', s)).toBeNull()
    expect(applyQuartoMove(s.board, { place: 16, give: 0 }, 'X', s)).toBeNull()
    expect(applyQuartoMove(s.board, { place: 'x', give: 0 }, 'X', s)).toBeNull()
    // No give while pieces remain → illegal.
    expect(applyQuartoMove(s.board, { place: 0 }, 'X', s)).toBeNull()
    // Giving the piece just placed is impossible (it left the shelf).
    expect(applyQuartoMove(s.board, { place: 0, give: s.pending }, 'X', s)).toBeNull()
    expect(applyQuartoMove(s.board, { place: 0, give: 99 }, 'X', s)).toBeNull()
  })

  it('rejects giving a placed or non-existent piece', () => {
    const s = fresh()
    // Place pending legally, try to give the piece just placed.
    expect(applyQuartoMove(s.board, { place: s.pending, give: s.pending }, 'X', s)).toBeNull()
    expect(applyQuartoMove(s.board, { place: s.pending, give: 99 }, 'X', s)).toBeNull()
  })

  it('places the pending piece on the chosen cell and hands over', () => {
    const s = fresh()
    const cell = 0
    const give = s.unplaced.find(v => v !== s.pending)
    const res = applyQuartoMove(s.board, { place: cell, give }, 'X', s)
    expect(res).not.toBeNull()
    expect(res.board[cell]).toBe(s.pending)
    expect(res.unplaced).not.toContain(s.pending)
    expect(res.pending).toBe(give)
    expect(res.currentTurn).toBe('O')
    expect(res.result).toBeNull()
  })

  it('line completion wins for the mover', () => {
    // Scripted: three even pieces in row 0, mover places the 4th even piece
    // (pending 8) on cell 3.
    const board = Array(16).fill('')
    board[0] = 0; board[1] = 2; board[2] = 4
    const pending = 8 // even → completes the even-line
    const unplaced = [8, 9, 10]
    const res = applyQuartoMove(board, { place: 3, give: 9 }, 'O', { board, unplaced, pending })
    expect(res?.result).toEqual({ winner: 'O', line: [0, 1, 2, 3] })
    expect(res?.pending).toBeNull() // win: no handover
  })

  it('winning with the FINAL piece needs no give', () => {
    const board = Array(16).fill('')
    board[0] = 0; board[1] = 2; board[2] = 4
    const pending = 8
    const unplaced = [8] // final piece
    const res = applyQuartoMove(board, { place: 3 }, 'X', { board, unplaced, pending })
    expect(res?.result).toEqual({ winner: 'X', line: [0, 1, 2, 3] })
  })

  it('rejects corrupt state (pending off the shelf, pending missing, occupied cell)', () => {
    const board = Array(16).fill('')
    board[0] = 0
    // pending 0 was placed and left the shelf → not placeable.
    expect(applyQuartoMove(board, { place: 5, give: 1 }, 'X',
      { board, unplaced: [1, 2], pending: 0 })).toBeNull()
    // Missing pending.
    expect(applyQuartoMove(board, { place: 5, give: 2 }, 'X',
      { board, unplaced: [1, 2], pending: null })).toBeNull()
    // Occupied target cell.
    expect(applyQuartoMove(board, { place: 0, give: 2 }, 'X',
      { board, unplaced: [1, 2], pending: 1 })).toBeNull()
  })

  it('full playouts terminate with a legal winner', () => {
    for (let seed = 0; seed < 8; seed++) {
      const s = fresh()
      let { board, unplaced, pending } = s
      let turn = 'X'
      let result = null
      let plies = 0
      while (!result && plies < 20) {
        expect(pending).not.toBeNull()
        const empty = board.map((v, i) => (v === '' ? i : -1)).filter(i => i >= 0)
        const cell = empty[Math.floor(Math.random() * empty.length)]
        const give = unplaced.find(v => v !== pending) ?? null
        const res = applyQuartoMove(board, { place: cell, give }, turn, { board, unplaced, pending })
        expect(res).not.toBeNull()
        board = res.board
        unplaced = res.unplaced
        pending = res.pending
        turn = res.currentTurn
        result = res.result
        plies++
      }
      expect(result).not.toBeNull()
      expect(['X', 'O', 'draw']).toContain(result.winner)
      if (result.winner === 'draw') expect(board.every(v => v !== '')).toBe(true)
    }
  })

  it('structural: the shelf always shrinks by one per ply', () => {
    const s = fresh()
    let { board, unplaced, pending } = s
    let turn = 'X'
    for (let i = 0; i < 16; i++) {
      const empty = board.map((v, j) => (v === '' ? j : -1)).filter(j => j >= 0)
      if (!empty.length || pending == null) break
      const cell = empty[0]
      const give = unplaced.find(v => v !== pending) ?? null
      const res = applyQuartoMove(board, { place: cell, give }, turn, { board, unplaced, pending })
      if (!res || res.result) break
      expect(res.unplaced.length).toBe(unplaced.length - 1)
      board = res.board; unplaced = res.unplaced; pending = res.pending
      turn = res.currentTurn
    }
  })
})
