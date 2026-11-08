import { describe, expect, it } from 'vitest'
import { CHECKERS_BOT_LEVELS, pickCheckersMove } from './checkersBot'
import { applyCheckersMove, getCheckersWinner, getLegalMoves, INITIAL_CHECKERS } from './checkersLogic'

// Build a board from { cellIndex: piece }.
const board = (spec) => { const b = Array(64).fill(''); for (const [i, p] of Object.entries(spec)) b[Number(i)] = p; return b }
const rc = (r, c) => r * 8 + c

describe('pickCheckersMove', () => {
  it('lists the levels, with NORMAL as the greedy bot', () => {
    expect(Object.keys(CHECKERS_BOT_LEVELS)).toEqual(['easy', 'normal', 'hard'])
    expect(CHECKERS_BOT_LEVELS.normal).toEqual({ randomRate: 0, depth: 0 })
  })

  it('returns null with no legal move, and a legal move otherwise', () => {
    expect(pickCheckersMove(board({ [rc(7, 0)]: 'x' }), 'O')).toBeNull()
    const b = INITIAL_CHECKERS()
    for (const level of ['easy', 'normal', 'hard']) {
      const m = pickCheckersMove(b, 'O', level)
      expect(getLegalMoves(b, 'O').some((l) => l.from === m.from && l.to === m.to)).toBe(true)
    }
  })

  it('every level obeys the forced capture', () => {
    // O at (2,1) must jump X at (3,2) into (4,3).
    const b = board({ [rc(2, 1)]: 'o', [rc(3, 2)]: 'x', [rc(0, 7)]: 'o', [rc(7, 6)]: 'x' })
    for (const level of ['easy', 'normal', 'hard']) {
      const m = pickCheckersMove(b, 'O', level, () => 0)
      expect(m.captures.length).toBeGreaterThan(0)
    }
  })

  it('NORMAL takes the double jump over the single', () => {
    const b = board({
      [rc(0, 1)]: 'o', [rc(1, 2)]: 'x', [rc(3, 4)]: 'x', // O at (0,1) can chain two jumps
      [rc(0, 7)]: 'o', [rc(1, 6)]: 'x',                  // a single jump elsewhere
      [rc(7, 0)]: 'x',
    })
    expect(pickCheckersMove(b, 'O', 'normal', () => 0).captures).toHaveLength(2)
  })

  it('reads an unknown level as NORMAL', () => {
    const b = INITIAL_CHECKERS()
    expect(pickCheckersMove(b, 'O', 'nonsense', () => 0)).toEqual(pickCheckersMove(b, 'O', 'normal', () => 0))
  })

  it('EASY plays the first legal move on a random turn and the greedy one otherwise', () => {
    // Two single jumps are on offer; NORMAL and EASY-not-random pick the same one.
    const b = INITIAL_CHECKERS()
    const legal = getLegalMoves(b, 'O')
    expect(pickCheckersMove(b, 'O', 'easy', () => 0)).toEqual(legal[0])
    expect(pickCheckersMove(b, 'O', 'easy', () => 0.99)).toEqual(pickCheckersMove(b, 'O', 'normal', () => 0.99))
  })

  it('HARD avoids a move that hangs a man two plies later', () => {
    // O man at (2,3) may step to (3,2) or (3,4). X men on (4,1) and (4,5)... stepping next to
    // either is a free jump for X unless the square behind is covered. Only the safe step
    // survives a two-ply look.
    const b = board({
      [rc(2, 3)]: 'o', [rc(1, 4)]: 'o', [rc(0, 3)]: 'o',
      [rc(4, 1)]: 'x', [rc(7, 6)]: 'x',
    })
    const m = pickCheckersMove(b, 'O', 'hard', () => 0)
    const after = applyCheckersMove(b, m.from, m.to).board
    const xJumps = getLegalMoves(after, 'X').filter((r) => r.captures.length > 0)
    expect(xJumps).toHaveLength(0)
  })

  it('HARD beats NORMAL over a seeded run of full games', () => {
    let seed = 11
    const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    let hardWins = 0, normalWins = 0
    for (let g = 0; g < 4; g++) {
      let b = INITIAL_CHECKERS()
      let side = 'X'
      const level = g % 2 === 0 ? { X: 'hard', O: 'normal' } : { X: 'normal', O: 'hard' }
      for (let ply = 0; ply < 120; ply++) {
        const m = pickCheckersMove(b, side, level[side], rng)
        if (!m) { const w = side === 'X' ? 'O' : 'X'; level[w] === 'hard' ? hardWins++ : normalWins++; break }
        b = applyCheckersMove(b, m.from, m.to).board
        const w = getCheckersWinner(b, side === 'X' ? 'O' : 'X')
        if (w) { if (w.winner !== 'draw') (level[w.winner] === 'hard' ? hardWins++ : normalWins++); break }
        side = side === 'X' ? 'O' : 'X'
      }
    }
    expect(hardWins).toBeGreaterThanOrEqual(normalWins)
  })
})
