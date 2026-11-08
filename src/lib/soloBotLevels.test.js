import { describe, expect, it } from 'vitest'
import {
  REACTION_BOT_MS, AIM_BOT_GAP_MS, TYPING_BOT_WPM, MATH_BOT, TRIVIA_BOT_ACCURACY,
  rollBetween, reactionBotMs, aimBotGapMs, typingBotWpm, mathBot, triviaBotAccuracy,
} from './soloBotLevels'

const LEVELS = ['easy', 'normal', 'hard']

describe('soloBotLevels', () => {
  it('has all three levels in every table, easiest first', () => {
    for (const table of [REACTION_BOT_MS, AIM_BOT_GAP_MS, TYPING_BOT_WPM, MATH_BOT, TRIVIA_BOT_ACCURACY]) {
      expect(Object.keys(table)).toEqual(LEVELS)
    }
  })

  it('keeps NORMAL at the numbers the demos shipped with', () => {
    expect(REACTION_BOT_MS.normal).toEqual([180, 380])
    expect(AIM_BOT_GAP_MS.normal).toEqual([400, 750])
    expect(TYPING_BOT_WPM.normal).toBe(55)
    expect(MATH_BOT.normal).toEqual({ delayMs: [1000, 3000], accuracy: 0.7 })
    expect(TRIVIA_BOT_ACCURACY.normal).toEqual({ 1: 0.75, 2: 0.55, 3: 0.4 })
  })

  it('is faster at every step up the levels', () => {
    const mid = ([a, b]) => (a + b) / 2
    for (const table of [REACTION_BOT_MS, AIM_BOT_GAP_MS]) {
      expect(mid(table.easy)).toBeGreaterThan(mid(table.normal))
      expect(mid(table.normal)).toBeGreaterThan(mid(table.hard))
    }
    expect(TYPING_BOT_WPM.easy).toBeLessThan(TYPING_BOT_WPM.normal)
    expect(TYPING_BOT_WPM.normal).toBeLessThan(TYPING_BOT_WPM.hard)
    expect(mid(MATH_BOT.easy.delayMs)).toBeGreaterThan(mid(MATH_BOT.normal.delayMs))
    expect(mid(MATH_BOT.normal.delayMs)).toBeGreaterThan(mid(MATH_BOT.hard.delayMs))
    expect(MATH_BOT.easy.accuracy).toBeLessThan(MATH_BOT.normal.accuracy)
    expect(MATH_BOT.normal.accuracy).toBeLessThan(MATH_BOT.hard.accuracy)
  })

  it('never makes a bot superhuman: HARD still reacts slower than a physical limit', () => {
    expect(REACTION_BOT_MS.hard[0]).toBeGreaterThanOrEqual(120)
    expect(AIM_BOT_GAP_MS.hard[0]).toBeGreaterThanOrEqual(200)
    expect(TYPING_BOT_WPM.hard).toBeLessThanOrEqual(100)
    expect(MATH_BOT.hard.accuracy).toBeLessThan(1)
  })

  it('answers trivia better at every difficulty as the level rises, and worse on harder questions', () => {
    for (const diff of [1, 2, 3]) {
      expect(triviaBotAccuracy('easy', diff)).toBeLessThan(triviaBotAccuracy('normal', diff))
      expect(triviaBotAccuracy('normal', diff)).toBeLessThan(triviaBotAccuracy('hard', diff))
      expect(triviaBotAccuracy('hard', diff)).toBeLessThan(1)
    }
    for (const level of LEVELS) {
      expect(triviaBotAccuracy(level, 1)).toBeGreaterThan(triviaBotAccuracy(level, 3))
    }
    expect(triviaBotAccuracy('normal', 9)).toBe(0.5)
  })

  it('rolls inside the range, ends included', () => {
    expect(rollBetween([100, 200], () => 0)).toBe(100)
    expect(rollBetween([100, 200], () => 0.5)).toBe(150)
    expect(rollBetween([100, 200], () => 0.999999)).toBe(200)
  })

  it('reads an unknown level as NORMAL', () => {
    expect(reactionBotMs('hard')).toBe(REACTION_BOT_MS.hard)
    expect(reactionBotMs('nope')).toBe(REACTION_BOT_MS.normal)
    expect(aimBotGapMs(undefined)).toBe(AIM_BOT_GAP_MS.normal)
    expect(typingBotWpm('easy')).toBe(35)
    expect(typingBotWpm(null)).toBe(55)
    expect(mathBot('x')).toBe(MATH_BOT.normal)
  })
})
