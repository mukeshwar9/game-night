import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  PIG_TARGET, rollDie, applyDiceMove, applyDiceBigMove,
  generateSeedHex, commitSeed, deriveSeed, rollFace, rollFacePair, rollFaces,
  pendingRoll, resolvePendingRoll, lastRollMatches,
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

  it('refuses to bank a zero turn score (no free turn pass)', async () => {
    const game = { diceScoreX: 40, diceScoreO: 40, diceTurnScore: 0, currentTurn: 'X' }
    expect(await applyDiceMove(game, 'bank', 'X')).toBeNull()
  })

  it('refuses to bank when diceTurnScore is missing (defaults to 0)', async () => {
    expect(await applyDiceMove({ diceScoreX: 0, currentTurn: 'X' }, 'bank', 'X')).toBeNull()
  })

  it('a roll never sets lastMove (dead field dropped from both variants)', async () => {
    forceDie(3)
    const { updates } = await applyDiceMove({ diceTurnScore: 0, currentTurn: 'X' }, 'roll', 'X')
    expect(updates).not.toHaveProperty('lastMove')
  })
})

// ---------------------------------------------------------------------------
// applyDiceBigMove — Pig Big (two dice, only snake eyes bust)
// ---------------------------------------------------------------------------
describe('applyDiceBigMove roll', () => {
  it('a safe pair adds the sum to the turn score, keeps the turn, and appends to the trail', () => {
    const game = { diceTurnScore: 10, diceRolls: [[2, 3]], currentTurn: 'X' }
    const { updates, result } = applyDiceBigMove(game, 'roll', 'X', [4, 5])
    expect(result).toBeNull()
    expect(updates.diceLast).toEqual([4, 5])
    expect(updates.diceTurnScore).toBe(19)
    expect(updates.diceRolls).toEqual([[2, 3], [4, 5]])
    expect(updates.currentTurn).toBe('X')
  })

  it('a single 1 (not snake eyes) still scores — only double-1 busts', () => {
    const { updates, result } = applyDiceBigMove({ diceTurnScore: 6, currentTurn: 'X' }, 'roll', 'X', [1, 4])
    expect(result).toBeNull()
    expect(updates.diceTurnScore).toBe(11)
    expect(updates.currentTurn).toBe('X')
  })

  it('snake eyes (1,1) wipes the turn score AND clears the roll trail, then flips the turn', () => {
    const game = { diceTurnScore: 14, diceRolls: [[3, 4], [2, 6]], currentTurn: 'X' }
    const { updates, result } = applyDiceBigMove(game, 'roll', 'X', [1, 1])
    expect(result).toBeNull()
    expect(updates.diceTurnScore).toBe(0)
    expect(updates.diceRolls).toEqual([])
    expect(updates.currentTurn).toBe('O')
  })

  it('never sets lastMove (dropped for consistency with applyDiceMove)', () => {
    const { updates } = applyDiceBigMove({ diceTurnScore: 0, currentTurn: 'X' }, 'roll', 'X', [2, 3])
    expect(updates).not.toHaveProperty('lastMove')
    const bust = applyDiceBigMove({ diceTurnScore: 0, currentTurn: 'X' }, 'roll', 'X', [1, 1])
    expect(bust.updates).not.toHaveProperty('lastMove')
  })
})

describe('applyDiceBigMove bank', () => {
  it('adds the turn score to the mover and flips the turn', () => {
    const game = { diceScoreX: 20, diceScoreO: 5, diceTurnScore: 15, currentTurn: 'X' }
    const { updates, result } = applyDiceBigMove(game, 'bank', 'X')
    expect(updates.diceScoreX).toBe(35)
    expect(updates.diceRolls).toEqual([])
    expect(updates.currentTurn).toBe('O')
    expect(result).toBeNull()
  })

  it('returns a winner when the banked score reaches the target', () => {
    const game = { diceScoreX: 92, diceTurnScore: 10, currentTurn: 'X' }
    const { result } = applyDiceBigMove(game, 'bank', 'X')
    expect(result).toEqual({ winner: 'X' })
  })

  it('refuses to bank a zero turn score (no free turn pass)', () => {
    const game = { diceScoreX: 10, diceScoreO: 10, diceTurnScore: 0, currentTurn: 'X' }
    expect(applyDiceBigMove(game, 'bank', 'X')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Deterministic rolls (anti-cheat)
// ---------------------------------------------------------------------------
describe('fair seeded rolls', () => {
  const AT = 1_700_000_000_000

  it('rollFace is stable for a given seed, index and server time', async () => {
    const seed = await deriveSeed(generateSeedHex(), generateSeedHex())
    const a = rollFace(seed, 0, AT)
    expect(rollFace(seed, 0, AT)).toBe(a)
    expect(a).toBeGreaterThanOrEqual(1)
    expect(a).toBeLessThanOrEqual(6)
    const pair = rollFacePair(seed, 0, AT)
    expect(pair).toHaveLength(2)
    expect(pair[0]).toBe(a)
  })

  it('the seed alone does not predict a roll: the server time changes the faces', async () => {
    // Regression: faces used to be H(seed : index), so every client could
    // compute every future roll from the diceSeed stored in the room.
    const seed = await deriveSeed('a1b2c3d4e5f6a1b2', '0123456789abcdef')
    const faces = new Set()
    for (let ms = 0; ms < 60; ms++) faces.add(rollFace(seed, 0, AT + ms))
    expect(faces.size).toBe(6)
  })

  it('every face is equally likely (no modulo bias)', () => {
    const counts = [0, 0, 0, 0, 0, 0]
    const n = 60_000
    for (let i = 0; i < n; i++) counts[rollFace('seed', i, AT) - 1]++
    // Chi-square with 5 degrees of freedom; 20.5 is the 0.1% critical value.
    const chi = counts.reduce((sum, c) => sum + (c - n / 6) ** 2 / (n / 6), 0)
    expect(chi).toBeLessThan(20.5)
  })

  it('skips hash bytes of 252 and up instead of folding them onto 1–4', () => {
    // 1 + (byte % 6) over all 256 bytes would make 1–4 likelier than 5–6.
    for (let i = 0; i < 2000; i++) {
      const [d] = rollFaces('s', i, AT)
      expect(d).toBeGreaterThanOrEqual(1)
      expect(d).toBeLessThanOrEqual(6)
    }
  })

  it('applyDiceMove uses the fair face when a seed is set', () => {
    const seed = 'cd'.repeat(32)
    let at = AT
    while (rollFace(seed, 0, at) === 1) at++
    const expected = rollFace(seed, 0, at)
    const game = { diceSeed: seed, diceRollIndex: 0, diceTurnScore: 0, currentTurn: 'X' }
    const { updates } = applyDiceMove(game, 'roll', 'X', expected)
    expect(updates.diceLast).toBe(expected)
    expect(updates.diceRollIndex).toBe(1)
    expect(updates.diceRolls).toEqual([expected])
    expect(updates.currentTurn).toBe('X')
  })
})

describe('roll requests', () => {
  const room = (extra = {}) => ({
    gameType: 'dice', status: 'playing', currentTurn: 'X', diceSeed: 'ef'.repeat(32),
    diceScoreX: 10, diceScoreO: 0, diceTurnScore: 5, diceRollIndex: 7, diceRolls: [5],
    diceRoll: { i: 7, by: 'X', at: 1_700_000_000_555 }, ...extra,
  })

  it('pendingRoll is the request only while it is for the current roll', () => {
    expect(pendingRoll(room())).toEqual({ i: 7, by: 'X', at: 1_700_000_000_555 })
    expect(pendingRoll(room({ diceRollIndex: 8 }))).toBeNull()
    expect(pendingRoll(room({ diceRoll: null }))).toBeNull()
    expect(pendingRoll(room({ diceRoll: { i: 7, by: 'Z', at: 1 } }))).toBeNull()
  })

  it('resolvePendingRoll applies the faces the request fixes', () => {
    const cur = room()
    const face = rollFace(cur.diceSeed, 7, cur.diceRoll.at)
    const next = resolvePendingRoll(cur)
    expect(next.diceRollIndex).toBe(8)
    expect(next.diceLast).toBe(face)
    expect(next.diceTurnScore).toBe(face === 1 ? 0 : 5 + face)
    expect(next.diceRoll).toEqual(cur.diceRoll)
    expect(lastRollMatches(next)).toBe(true)
    expect(lastRollMatches({ ...next, diceLast: face === 6 ? 5 : face + 1 })).toBe(false)
  })

  it('resolvePendingRoll rolls two dice for PIG BIG', () => {
    const cur = room({ gameType: 'dice-big' })
    const next = resolvePendingRoll(cur, { isBig: true })
    expect(next.diceLast).toEqual(rollFacePair(cur.diceSeed, 7, cur.diceRoll.at))
    expect(lastRollMatches(next, { isBig: true })).toBe(true)
  })

  it('resolvePendingRoll aborts once resolved, or when the request no longer fits', () => {
    const resolved = resolvePendingRoll(room())
    expect(resolvePendingRoll(resolved)).toBeUndefined()
    expect(resolvePendingRoll(room({ currentTurn: 'O' }))).toBeUndefined()
    expect(resolvePendingRoll(room({ status: 'finished' }))).toBeUndefined()
    expect(resolvePendingRoll(room({ diceSeed: null }))).toBeUndefined()
  })

  it('lastRollMatches has nothing to check before the first roll', () => {
    expect(lastRollMatches(room({ diceRollIndex: 0, diceLast: null }))).toBeNull()
  })
})

describe('seed protocol', () => {
  it('applyDiceMove refuses a seeded roll without a fair face (no insecure fallback)', async () => {
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