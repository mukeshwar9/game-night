import { describe, expect, it } from 'vitest'
import {
  didWinWireMatch, difficultyForLevel, getWireDifficulty, isWireMatchComplete,
  levelForDifficulty, nextWireBomb, registerWireClient, WIRE_BOMBS_PER_MATCH, WIRE_MAX_LEVEL,
} from './wireMatchLogic'

describe('difficulty mapping', () => {
  it('maps three named choices onto existing generator profiles', () => {
    expect(levelForDifficulty('easy')).toBe(1)
    expect(levelForDifficulty('normal')).toBe(3)
    expect(levelForDifficulty('hard')).toBe(5)
    expect(difficultyForLevel(2)).toBe('easy')
    expect(difficultyForLevel(4)).toBe('normal')
    expect(difficultyForLevel(6)).toBe('hard')
    expect(getWireDifficulty({ generatorVersion: 2, level: 0 })).toBeNull()
    expect(getWireDifficulty({ generatorVersion: 2, level: 3, difficulty: 'normal' })).toBe('normal')
    expect(getWireDifficulty({ level: 4 })).toBe('normal') // legacy room
  })
})

describe('generator version handshake', () => {
  it('upgrades only after both seats acknowledge while first bomb is ready', () => {
    const base = { generatorVersion: 1, level: 1, bombNo: 1, phase: 'ready' }
    const x = registerWireClient(base, 'X')
    expect(x).toMatchObject({ clientVersionX: 2, generatorVersion: 1, level: 1 })
    const both = registerWireClient(x, 'O')
    expect(both).toMatchObject({
      clientVersionX: 2, clientVersionO: 2, generatorVersion: 2, level: 0,
    })
    expect(registerWireClient({ ...base, phase: 'armed', clientVersionX: 2 }, 'O'))
      .toMatchObject({ generatorVersion: 1, level: 1 })
  })
})

describe('nextWireBomb', () => {
  it('starts a fresh legacy-compatible room at level 1 with X as Tech', () => {
    expect(nextWireBomb(null, 42)).toEqual({
      seed: '42', level: 1, generatorVersion: 1, bombNo: 1, tech: 'X', phase: 'ready', strikes: 0, stats: null,
    })
  })

  it('preserves legacy climb/hold behavior for old clients and rooms', () => {
    const stats = { streak: 1, best: 1, defused: 1, booms: 0 }
    const won = nextWireBomb({ level: 2, bombNo: 2, tech: 'X', result: { outcome: 'defused' }, stats }, 's')
    expect(won).toMatchObject({ level: 3, bombNo: 3, generatorVersion: 1, tech: 'O', stats })
    const lost = nextWireBomb({ level: 2, tech: 'O', result: { outcome: 'boom' } }, 's')
    expect(lost).toMatchObject({ level: 2, tech: 'X' })
    expect(nextWireBomb({ level: WIRE_MAX_LEVEL, result: { outcome: 'defused' } }, 's').level).toBe(WIRE_MAX_LEVEL)
  })

  it('keeps v2 difficulty fixed for exactly two bombs and swaps Tech', () => {
    const stats = { streak: 1, best: 1, defused: 1, booms: 0 }
    const bomb2 = nextWireBomb({
      level: 3, difficulty: 'normal', generatorVersion: 2, bombNo: 1, tech: 'X',
      result: { outcome: 'defused' }, stats, clientVersionX: 2, clientVersionO: 2,
    }, 's')
    expect(bomb2).toMatchObject({
      level: 3, difficulty: 'normal', generatorVersion: 2, bombNo: 2, tech: 'O', stats,
      clientVersionX: 2, clientVersionO: 2,
    })
    const retryAfterBoom = nextWireBomb({
      level: 5, difficulty: 'hard', generatorVersion: 2, bombNo: 1, tech: 'O', result: { outcome: 'boom' },
    }, 's2')
    expect(retryAfterBoom).toMatchObject({ level: 5, difficulty: 'hard', bombNo: 2, tech: 'X' })
    expect(WIRE_BOMBS_PER_MATCH).toBe(2)
  })
})

describe('two-bomb result', () => {
  it('counts match as complete after second bomb and wins only if both were defused', () => {
    expect(isWireMatchComplete({ generatorVersion: 2, phase: 'over', bombNo: 1 })).toBe(false)
    expect(isWireMatchComplete({ generatorVersion: 2, phase: 'ready', bombNo: 2 })).toBe(false)
    expect(isWireMatchComplete({ generatorVersion: 2, phase: 'over', bombNo: 2 })).toBe(true)
    expect(didWinWireMatch({ generatorVersion: 2, phase: 'over', bombNo: 2, stats: { defused: 2, booms: 0 } })).toBe(true)
    expect(didWinWireMatch({ generatorVersion: 2, phase: 'over', bombNo: 2, stats: { defused: 1, booms: 1 } })).toBe(false)
  })
})
