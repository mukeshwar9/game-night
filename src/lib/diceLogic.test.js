import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  PIG_TARGET, rollDie, applyDiceMove,
  generateSeedHex, commitSeed, deriveSeed, rollFaceAsync,
} from './diceLogic'

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
  it('returns null for an invalid symbol', async () => {
    expect(await applyDiceMove({}, 'roll', 'Z')).toBeNull()
    expect(await applyDiceMove({}, 'roll', '')).toBeNull()
  })

  it('returns null for an invalid action', async () => {
    expect(await applyDiceMove({}, 'hold', 'X')).toBeNull()
    expect(await applyDiceMove({}, '', 'X')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// applyDiceMove — roll (legacy, no seed → Math.random)
// ---------------------------------------------------------------------------
describe('applyDiceMove roll (legacy)', () => {
  it('adds a safe roll to the at-risk turn score and keeps the turn', async () => {
    forceDie(5)
    const game = { diceScoreX: 0, diceScoreO: 0, diceTurnScore: 10, currentTurn: 'X' }
    const { updates, result } = await applyDiceMove(game, 'roll', 'X')
    expect(result).toBeNull()
    expect(updates.diceLast).toBe(5)
    expect(updates.diceTurnScore).toBe(15)
    expect(updates.currentTurn).toBe('X')
  })

  it('appends the roll to diceRolls trail and bumps diceRollIndex', async () => {
    forceDie(4)
    const game = { diceTurnScore: 6, diceRolls: [2, 4], diceRollIndex: 2, currentTurn: 'X' }
    const { updates } = await applyDiceMove(game, 'roll', 'X')
    expect(updates.diceRolls).toEqual([2, 4, 4])
    expect(updates.diceRollIndex).toBe(3)
  })

  it('treats a missing turn score as 0', async () => {
    forceDie(4)
    const { updates } = await applyDiceMove({ currentTurn: 'O' }, 'roll', 'O')
    expect(updates.diceTurnScore).toBe(4)
    expect(updates.currentTurn).toBe('O')
  })

  it('on a 1 wipes the turn score and flips the turn (X→O)', async () => {
    forceDie(1)
    const game = { diceScoreX: 30, diceScoreO: 20, diceTurnScore: 22, diceRolls: [5, 6], diceRollIndex: 2, currentTurn: 'X' }
    const { updates, result } = await applyDiceMove(game, 'roll', 'X')
    expect(result).toBeNull()
    expect(updates.diceLast).toBe(1)
    expect(updates.diceTurnScore).toBe(0)
    expect(updates.diceRolls).toEqual([])
    expect(updates.diceRollIndex).toBe(3)
    expect(updates.currentTurn).toBe('O')
  })

  it('on a 1 flips the turn (O→X)', async () => {
    forceDie(1)
    const { updates } = await applyDiceMove({ diceTurnScore: 9, currentTurn: 'O' }, 'roll', 'O')
    expect(updates.diceTurnScore).toBe(0)
    expect(updates.currentTurn).toBe('X')
  })

  it('a roll never mutates banked scores', async () => {
    forceDie(6)
    const { updates } = await applyDiceMove({ diceScoreX: 40, diceScoreO: 55, diceTurnScore: 0, currentTurn: 'X' }, 'roll', 'X')
    expect(updates).not.toHaveProperty('diceScoreX')
    expect(updates).not.toHaveProperty('diceScoreO')
  })
})

// ---------------------------------------------------------------------------
// applyDiceMove — bank
// ---------------------------------------------------------------------------
describe('applyDiceMove bank', () => {
  it('adds turn score to the mover and flips the turn', async () => {
    const game = { diceScoreX: 30, diceScoreO: 12, diceTurnScore: 18, currentTurn: 'X' }
    const { updates, result } = await applyDiceMove(game, 'bank', 'X')
    expect(result).toBeNull()
    expect(updates.diceScoreX).toBe(48)
    expect(updates.diceTurnScore).toBe(0)
    expect(updates.diceRolls).toEqual([])
    expect(updates.diceLast).toBeNull()
    expect(updates.currentTurn).toBe('O')
  })

  it('banks to the O score key when O moves', async () => {
    const game = { diceScoreX: 0, diceScoreO: 25, diceTurnScore: 7, currentTurn: 'O' }
    const { updates } = await applyDiceMove(game, 'bank', 'O')
    expect(updates.diceScoreO).toBe(32)
    expect(updates).not.toHaveProperty('diceScoreX')
    expect(updates.currentTurn).toBe('X')
  })

  it('returns a winner when a banked score reaches the target', async () => {
    const game = { diceScoreX: 90, diceScoreO: 50, diceTurnScore: 10, currentTurn: 'X' }
    const { updates, result } = await applyDiceMove(game, 'bank', 'X')
    expect(updates.diceScoreX).toBe(PIG_TARGET)
    expect(result).toEqual({ winner: 'X' })
  })

  it('returns a winner when a banked score exceeds the target', async () => {
    const game = { diceScoreX: 0, diceScoreO: 95, diceTurnScore: 12, currentTurn: 'O' }
    const { result } = await applyDiceMove(game, 'bank', 'O')
    expect(result).toEqual({ winner: 'O' })
  })

  it('does not win just below the target', async () => {
    const game = { diceScoreX: 90, diceScoreO: 0, diceTurnScore: 9, currentTurn: 'X' }
    const { updates, result } = await applyDiceMove(game, 'bank', 'X')
    expect(updates.diceScoreX).toBe(99)
    expect(result).toBeNull()
  })

  it('banking a zero turn score keeps the score and still flips the turn', async () => {
    const game = { diceScoreX: 40, diceScoreO: 40, diceTurnScore: 0, currentTurn: 'X' }
    const { updates, result } = await applyDiceMove(game, 'bank', 'X')
    expect(updates.diceScoreX).toBe(40)
    expect(updates.currentTurn).toBe('O')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Deterministic rolls (anti-cheat)
// ---------------------------------------------------------------------------
describe('deterministic seeded rolls', () => {
  it('rollFaceAsync is stable for a given seed+index', async () => {
    const seed = await deriveSeed(await generateSeedHex(), await generateSeedHex())
    const a = await rollFaceAsync(seed, 0)
    const b = await rollFaceAsync(seed, 0)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(1)
    expect(a).toBeLessThanOrEqual(6)
  })

  it('different seeds produce (very likely) different first faces', async () => {
    const s1 = await deriveSeed('aaaa', 'bbbb')
    const s2 = await deriveSeed('cccc', 'dddd')
    // Not strictly guaranteed distinct, but with 32-bit hashes the chance
    // of a collision on a single face is ~1/6 — pick a few indices to be safe.
    let diffs = 0
    for (let i = 0; i < 6; i++) {
      if (await rollFaceAsync(s1, i) !== await rollFaceAsync(s2, i)) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })

  it('applyDiceMove uses the deterministic face when a seed is set', async () => {
    // Find an index whose deterministic face is safe (≠ 1) so the trail is
    // populated; the bust branch (face === 1) is covered by the legacy bust tests.
    const seed = await deriveSeed('a1b2c3d4e5f6a1b2', '0123456789abcdef')
    let idx = 0
    while (await rollFaceAsync(seed, idx) === 1) idx++
    const expected = await rollFaceAsync(seed, idx)
    const game = { diceSeed: seed, diceRollIndex: idx, diceTurnScore: 0, currentTurn: 'X' }
    const { updates } = applyDiceMove(game, 'roll', 'X', expected)
    expect(updates.diceLast).toBe(expected)
    expect(updates.diceRollIndex).toBe(idx + 1)
    expect(updates.diceRolls).toEqual([expected])
    expect(updates.currentTurn).toBe('X')
  })

  it('applyDiceMove refuses a seeded roll without a precomputed face (no insecure fallback)', async () => {
    const seed = await deriveSeed('a1b2c3d4e5f6a1b2', '0123456789abcdef')
    const game = { diceSeed: seed, diceRollIndex: 0, diceTurnScore: 0, currentTurn: 'X' }
    expect(applyDiceMove(game, 'roll', 'X')).toBeNull()
  })

  it('commitSeed is consistent and derives a stable combined seed', async () => {
    const a = await generateSeedHex()
    const b = await generateSeedHex()
    const c1 = await commitSeed(a)
    const c2 = await commitSeed(a)
    expect(c1).toBe(c2)
    const s1 = await deriveSeed(a, b)
    const s2 = await deriveSeed(a, b)
    expect(s1).toBe(s2)
  })
})