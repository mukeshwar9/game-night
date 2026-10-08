import { describe, expect, it } from 'vitest'
import { canChallenge, challengePath, challengeText, parseBeat } from './soloChallengeLogic'

describe('challengePath', () => {
  it('carries the score to beat', () => {
    expect(challengePath('cupshuffle', 7)).toBe('/solo/cupshuffle?beat=7')
  })
  it('drops fractions and omits a missing or non-positive score', () => {
    expect(challengePath('anagrams', 41.9)).toBe('/solo/anagrams?beat=41')
    expect(challengePath('anagrams', 0)).toBe('/solo/anagrams')
    expect(challengePath('anagrams', NaN)).toBe('/solo/anagrams')
  })
})

describe('parseBeat', () => {
  it('reads a positive whole score', () => {
    expect(parseBeat('?beat=12')).toBe(12)
    expect(parseBeat('?ref=ad&beat=3')).toBe(3)
  })
  it('ignores anything else', () => {
    for (const s of ['', '?beat=', '?beat=0', '?beat=-4', '?beat=1.5', '?beat=abc', '?beat=99999999', '?x=1']) {
      expect(parseBeat(s)).toBeNull()
    }
  })
  it('round-trips challengePath', () => {
    expect(parseBeat(`?${challengePath('nback', 23).split('?')[1]}`)).toBe(23)
  })
})

describe('challengeText', () => {
  it('names the game and the score', () => {
    expect(challengeText({ label: 'CUP SHUFFLE', score: 9, unit: 'LEVELS' })).toContain('CUP SHUFFLE: 9 LEVELS')
    expect(challengeText({ label: 'PULP RUSH', score: 120 })).toContain('PULP RUSH: 120.')
  })
})

describe('canChallenge', () => {
  it('only for a new best above zero', () => {
    expect(canChallenge({ isNewBest: true, score: 5 })).toBe(true)
    expect(canChallenge({ isNewBest: false, score: 5 })).toBe(false)
    expect(canChallenge({ isNewBest: true, score: 0 })).toBe(false)
  })
})
