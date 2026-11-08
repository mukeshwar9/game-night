import { describe, expect, it } from 'vitest'
import { MANCALA_BOT_LEVELS, pickMancalaPit } from './mancalaBot'
import { applyMancalaMove, INITIAL_PITS, legalPits } from './mancalaLogic'

// Pits 0-5 are X's, 6 is X's store, 7-12 are O's, 13 is O's store.
const board = (spec) => { const p = Array(14).fill(0); for (const [i, n] of Object.entries(spec)) p[Number(i)] = n; return p }

describe('pickMancalaPit', () => {
  it('lists the levels, with NORMAL as the greedy bot', () => {
    expect(Object.keys(MANCALA_BOT_LEVELS)).toEqual(['easy', 'normal', 'hard'])
    expect(MANCALA_BOT_LEVELS.normal).toEqual({ randomRate: 0, depth: 0 })
  })

  it('returns null with no legal pit, and always a legal pit otherwise', () => {
    expect(pickMancalaPit(board({ 0: 3 }), 'O')).toBeNull()
    const pits = INITIAL_PITS()
    for (const level of ['easy', 'normal', 'hard']) {
      expect(legalPits(pits, 'O')).toContain(pickMancalaPit(pits, 'O', level))
    }
  })

  it('NORMAL takes the sow that lands in its store (extra turn)', () => {
    // O pit 12 with 1 seed lands in store 13; pit 7 with 1 just moves on.
    const pits = board({ 12: 1, 7: 1, 0: 4 })
    expect(pickMancalaPit(pits, 'O', 'normal', () => 0)).toBe(12)
  })

  it('NORMAL reads an unknown level as itself', () => {
    const pits = board({ 12: 1, 7: 1, 0: 4 })
    expect(pickMancalaPit(pits, 'O', 'nonsense', () => 0)).toBe(pickMancalaPit(pits, 'O', 'normal', () => 0))
  })

  it('EASY plays a random legal pit on a random turn and the greedy pit otherwise', () => {
    const pits = board({ 12: 1, 7: 1, 8: 2, 0: 4 })
    // rng 0: under randomRate → random pick of legal[0] (pit 7), not the extra-turn pit 12.
    expect(pickMancalaPit(pits, 'O', 'easy', () => 0)).toBe(7)
    expect(pickMancalaPit(pits, 'O', 'easy', () => 0.99)).toBe(12)
  })

  it('HARD sees a capture the greedy score undervalues', () => {
    // Playing pit 11 (1 seed) lands in empty 12 and captures X's pit 0 (opposite).
    // Pit 9 (6 seeds) reaches the store for an extra turn but leaves the pile.
    const pits = board({ 0: 9, 11: 1, 12: 0, 7: 1 })
    const pick = pickMancalaPit(pits, 'O', 'hard', () => 0)
    const moved = applyMancalaMove(pits, pick, 'O')
    expect(moved.captured + moved.pits[13]).toBeGreaterThan(0)
  })

  it('HARD finishes a won game rather than dithering', () => {
    // O is far ahead; playing out its last seed ends the game with a win.
    const pits = board({ 13: 30, 6: 5, 12: 1, 0: 1 })
    expect(pickMancalaPit(pits, 'O', 'hard', () => 0)).toBe(12)
  })

  it('HARD beats NORMAL over a seeded run of full games', () => {
    let seed = 7
    const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    let hardWins = 0, normalWins = 0
    for (let g = 0; g < 12; g++) {
      let pits = INITIAL_PITS()
      let side = g % 2 === 0 ? 'X' : 'O'
      const level = { X: 'hard', O: 'normal' }
      if (g % 2) { level.X = 'normal'; level.O = 'hard' }
      for (let ply = 0; ply < 400; ply++) {
        const pit = pickMancalaPit(pits, side, level[side], rng)
        if (pit == null) break
        const moved = applyMancalaMove(pits, pit, side)
        pits = moved.pits
        if (moved.result) {
          const w = moved.result.winner
          if (w !== 'draw') (level[w] === 'hard' ? hardWins++ : normalWins++)
          break
        }
        if (!moved.extraTurn) side = side === 'X' ? 'O' : 'X'
      }
    }
    expect(hardWins).toBeGreaterThan(normalWins)
  })
})
