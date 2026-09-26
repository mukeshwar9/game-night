import { describe, expect, it } from 'vitest'
import { BOT_LEVELS, botCandidates, jitter, pickBotDrop, scoreCandidate } from './animalStackBot'
import { AIM_LIMIT_CM, runDrop } from './animalStackLogic'
import { mulberry32 } from './detMath'

describe('animal stack bot', () => {
  it('tries more candidates on harder levels, always including centre', () => {
    const rng = mulberry32(1)
    expect(botCandidates('easy', 0, rng)).toHaveLength(BOT_LEVELS.easy.tries + 1)
    expect(botCandidates('hard', 0, rng)).toHaveLength(BOT_LEVELS.hard.tries + 1)
    expect(botCandidates('normal', 4, rng)[0]).toEqual({ k: 4, x: 0, r: 0 })
  })

  it('scores a toppling drop far below a safe one', () => {
    expect(scoreCandidate([], { k: 3, x: 320, r: 0 })).toBe(-1e6)
    expect(scoreCandidate([], { k: 3, x: 0, r: 0 })).toBeGreaterThan(-100)
  })

  it('HARD never topples an empty island', () => {
    const d = pickBotDrop('hard', [], 7, mulberry32(3))
    expect(runDrop([], d).fell).toBe(false)
  })

  it('keeps jittered aim inside the aim range', () => {
    const rng = () => 1
    expect(jitter('easy', { k: 0, x: AIM_LIMIT_CM, r: 0 }, rng).x).toBe(AIM_LIMIT_CM)
    expect(jitter('hard', { k: 0, x: 50, r: 0 }, rng).x).toBe(50)
  })
})
