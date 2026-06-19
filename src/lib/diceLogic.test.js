import { describe, it, expect, afterEach, vi } from 'vitest'
import { PIG_TARGET, rollDie, applyDiceMove } from './diceLogic'

afterEach(() => {
  vi.restoreAllMocks()
})

// Force rollDie() (which uses Math.random) to return a specific face.
// Math.floor(random * 6) + 1 === face  ⇒  random in [(face-1)/6, face/6)
function forceDie(face) {
  vi.spyOn(Math, 'random').mockReturnValue((face - 1) / 6)
}

// ---------------------------------------------------------------------------
// rollDie
// ---------------------------------------------------------------------------
describe('rollDie', () => {
  it('always returns an integer in 1..6 over many rolls', () => {
    for (let i = 0; i < 1000; i++) {
      const r = rollDie()
      expect(Number.isInteger(r)).toBe(true)
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(6)
    }
  })

  it('maps random 0 to a 1 and near-1 to a 6', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(rollDie()).toBe(1)
    vi.restoreAllMocks()
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(rollDie()).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// applyDiceMove — validation
// ---------------------------------------------------------------------------
describe('applyDiceMove validation', () => {
  it('returns null for an invalid symbol', () => {
    expect(applyDiceMove({}, 'roll', 'Z')).toBeNull()
    expect(applyDiceMove({}, 'roll', '')).toBeNull()
  })

  it('returns null for an invalid action', () => {
    expect(applyDiceMove({}, 'hold', 'X')).toBeNull()
    expect(applyDiceMove({}, '', 'X')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// applyDiceMove — roll
// ---------------------------------------------------------------------------
describe('applyDiceMove roll', () => {
  it('adds a safe roll to the at-risk turn score and keeps the turn', () => {
    forceDie(5)
    const game = { diceScoreX: 0, diceScoreO: 0, diceTurnScore: 10, currentTurn: 'X' }
    const { updates, result } = applyDiceMove(game, 'roll', 'X')
    expect(result).toBeNull()
    expect(updates.diceLast).toBe(5)
    expect(updates.diceTurnScore).toBe(15)
    expect(updates.currentTurn).toBe('X')
  })

  it('treats a missing turn score as 0', () => {
    forceDie(4)
    const { updates } = applyDiceMove({ currentTurn: 'O' }, 'roll', 'O')
    expect(updates.diceTurnScore).toBe(4)
    expect(updates.currentTurn).toBe('O')
  })

  it('on a 1 wipes the turn score and flips the turn (X→O)', () => {
    forceDie(1)
    const game = { diceScoreX: 30, diceScoreO: 20, diceTurnScore: 22, currentTurn: 'X' }
    const { updates, result } = applyDiceMove(game, 'roll', 'X')
    expect(result).toBeNull()
    expect(updates.diceLast).toBe(1)
    expect(updates.diceTurnScore).toBe(0)
    expect(updates.currentTurn).toBe('O')
  })

  it('on a 1 flips the turn (O→X)', () => {
    forceDie(1)
    const { updates } = applyDiceMove({ diceTurnScore: 9, currentTurn: 'O' }, 'roll', 'O')
    expect(updates.diceTurnScore).toBe(0)
    expect(updates.currentTurn).toBe('X')
  })

  it('a roll never mutates banked scores', () => {
    forceDie(6)
    const { updates } = applyDiceMove({ diceScoreX: 40, diceScoreO: 55, diceTurnScore: 0, currentTurn: 'X' }, 'roll', 'X')
    expect(updates).not.toHaveProperty('diceScoreX')
    expect(updates).not.toHaveProperty('diceScoreO')
  })
})

// ---------------------------------------------------------------------------
// applyDiceMove — bank
// ---------------------------------------------------------------------------
describe('applyDiceMove bank', () => {
  it('adds turn score to the mover and flips the turn', () => {
    const game = { diceScoreX: 30, diceScoreO: 12, diceTurnScore: 18, currentTurn: 'X' }
    const { updates, result } = applyDiceMove(game, 'bank', 'X')
    expect(result).toBeNull()
    expect(updates.diceScoreX).toBe(48)
    expect(updates.diceTurnScore).toBe(0)
    expect(updates.currentTurn).toBe('O')
  })

  it('banks to the O score key when O moves', () => {
    const game = { diceScoreX: 0, diceScoreO: 25, diceTurnScore: 7, currentTurn: 'O' }
    const { updates } = applyDiceMove(game, 'bank', 'O')
    expect(updates.diceScoreO).toBe(32)
    expect(updates).not.toHaveProperty('diceScoreX')
    expect(updates.currentTurn).toBe('X')
  })

  it('returns a winner when a banked score reaches the target', () => {
    const game = { diceScoreX: 90, diceScoreO: 50, diceTurnScore: 10, currentTurn: 'X' }
    const { updates, result } = applyDiceMove(game, 'bank', 'X')
    expect(updates.diceScoreX).toBe(PIG_TARGET)
    expect(result).toEqual({ winner: 'X' })
  })

  it('returns a winner when a banked score exceeds the target', () => {
    const game = { diceScoreX: 0, diceScoreO: 95, diceTurnScore: 12, currentTurn: 'O' }
    const { result } = applyDiceMove(game, 'bank', 'O')
    expect(result).toEqual({ winner: 'O' })
  })

  it('does not win just below the target', () => {
    const game = { diceScoreX: 90, diceScoreO: 0, diceTurnScore: 9, currentTurn: 'X' }
    const { updates, result } = applyDiceMove(game, 'bank', 'X')
    expect(updates.diceScoreX).toBe(99)
    expect(result).toBeNull()
  })

  it('banking a zero turn score keeps the score and still flips the turn', () => {
    const game = { diceScoreX: 40, diceScoreO: 40, diceTurnScore: 0, currentTurn: 'X' }
    const { updates, result } = applyDiceMove(game, 'bank', 'X')
    expect(updates.diceScoreX).toBe(40)
    expect(updates.currentTurn).toBe('O')
    expect(result).toBeNull()
  })
})
