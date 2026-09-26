import { describe, it, expect } from 'vitest'
import { matchTargetFor, isMatchFinish, isCoopGame, COOP_GAMES, SINGLE_ROUND_GAMES } from './matchRules'
import { GAME_TYPES } from './games'
import { MATCH_TARGET as ANAGRAMS_MATCH_TARGET } from './anagramsLogic'
import { TARGET_SCORE as PASSWORD_TARGET } from './passwordLogic'
import { ARROWS_MATCH_TARGET, ARROWS_MAX_ROUNDS } from './arrowsLogic'

describe('matchTargetFor', () => {
  it('is first to 3 round wins for standard games', () => {
    expect(matchTargetFor({ gameType: 'tictactoe' })).toBe(3)
    expect(matchTargetFor({ gameType: 'connectfour' })).toBe(3)
  })

  it('is one round for the single-round real-time games', () => {
    for (const gameType of SINGLE_ROUND_GAMES) expect(matchTargetFor({ gameType })).toBe(1)
  })

  it('uses each game-specific target', () => {
    expect(matchTargetFor({ gameType: 'password' })).toBe(PASSWORD_TARGET)
    expect(matchTargetFor({ gameType: 'anagrams' })).toBe(ANAGRAMS_MATCH_TARGET)
    expect(matchTargetFor({ gameType: 'arrows' })).toBe(ARROWS_MATCH_TARGET)
  })

  it("reads Pong's host-chosen match length, defaulting to 3", () => {
    expect(matchTargetFor({ gameType: 'pong' })).toBe(3)
    expect(matchTargetFor({ gameType: 'pong', matchLength: null })).toBe(3)
    expect(matchTargetFor({ gameType: 'pong', matchLength: 5 })).toBe(5)
  })
})

describe('isMatchFinish', () => {
  it('ends the match once either side reaches the target', () => {
    expect(isMatchFinish({ gameType: 'tictactoe', scores: { X: 2, O: 2 } })).toBe(false)
    expect(isMatchFinish({ gameType: 'tictactoe', scores: { X: 3, O: 1 } })).toBe(true)
    expect(isMatchFinish({ gameType: 'tictactoe', scores: { X: 0, O: 3 } })).toBe(true)
    expect(isMatchFinish({ gameType: 'tictactoe' })).toBe(false)
    expect(isMatchFinish({ gameType: 'tron', scores: { O: 1 } })).toBe(true)
  })

  it('always ends a Password match, whatever the points', () => {
    expect(isMatchFinish({ gameType: 'password', scores: { X: 4, O: 2 } })).toBe(true)
  })

  it('ends Arrows on the final round even below the target', () => {
    const last = ARROWS_MAX_ROUNDS - 1
    expect(isMatchFinish({ gameType: 'arrows', status: 'finished', arrowsRound: 0, scores: { X: 1, O: 0 } })).toBe(false)
    expect(isMatchFinish({ gameType: 'arrows', status: 'finished', arrowsRound: last, scores: { X: 1, O: 1 } })).toBe(true)
    expect(isMatchFinish({ gameType: 'arrows', status: 'finished', scores: { X: ARROWS_MATCH_TARGET, O: 0 } })).toBe(true)
  })
})

describe('registry agreement', () => {
  it('matches every registry matchTarget', () => {
    for (const cfg of GAME_TYPES) {
      if (cfg.matchTarget) expect(matchTargetFor({ gameType: cfg.type }), cfg.type).toBe(cfg.matchTarget)
    }
  })

  it('lists exactly the registry co-op games', () => {
    const registryCoop = GAME_TYPES.filter(cfg => cfg.coop).map(cfg => cfg.type).sort()
    expect([...COOP_GAMES].sort()).toEqual(registryCoop)
    expect(isCoopGame('password')).toBe(true)
    expect(isCoopGame('tictactoe')).toBe(false)
    expect(isCoopGame(undefined)).toBe(false)
  })
})
