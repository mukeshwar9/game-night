import { describe, it, expect } from 'vitest'
import {
  generateQuestion, levelForIndex, questionMsForIndex, generateSeed, GAME_MS, QUESTION_MS,
  MATH_OPERATIONS, MATH_RANGES, DEFAULT_MATH_CONFIG, normalizeMathConfig, isValidMathConfig,
  speedPtsFor, scoreMathAnswer, timeoutMathQuestion, advanceMathQuestion, normalizeMathStats,
  mathRaceEntry, mathRow,
} from './mathLogic'

const fullConfig = (over = {}) => normalizeMathConfig({
  ...DEFAULT_MATH_CONFIG,
  operations: Object.fromEntries(MATH_OPERATIONS.map(op => [op, true])),
  ...over,
})

describe('math configuration', () => {
  it('defaults to +, −, × with 120 seconds and shared progressive difficulty', () => {
    expect(normalizeMathConfig(null)).toEqual(DEFAULT_MATH_CONFIG)
    expect(DEFAULT_MATH_CONFIG).toMatchObject({ durationSeconds: 120, difficulty: 'progressive', range: 99 })
    expect(DEFAULT_MATH_CONFIG.operations).toEqual({ add: true, subtract: true, multiply: true, divide: false })
  })

  it('normalizes invalid choices and never leaves an empty operation set', () => {
    expect(normalizeMathConfig({ durationSeconds: 45, difficulty: 'wild', range: 100, operations: {} }))
      .toEqual(DEFAULT_MATH_CONFIG)
    expect(isValidMathConfig(DEFAULT_MATH_CONFIG)).toBe(true)
    expect(isValidMathConfig({ ...DEFAULT_MATH_CONFIG, durationSeconds: 45 })).toBe(false)
    expect(isValidMathConfig({ ...DEFAULT_MATH_CONFIG, range: 100 })).toBe(false)
    expect(isValidMathConfig({ ...DEFAULT_MATH_CONFIG, operations: { add: false, subtract: false, multiply: false, divide: false } })).toBe(false)
    expect(isValidMathConfig({ ...DEFAULT_MATH_CONFIG, extra: true })).toBe(false)
  })
})

describe('difficulty and question timer', () => {
  it('uses the progressive easy/medium/hard ramp and fixed easy/hard modes', () => {
    expect(levelForIndex(0)).toBe('easy')
    expect(levelForIndex(19)).toBe('easy')
    expect(levelForIndex(20)).toBe('medium')
    expect(levelForIndex(39)).toBe('medium')
    expect(levelForIndex(40)).toBe('hard')
    expect(levelForIndex(1000)).toBe('hard')
    expect(levelForIndex(80, 'easy')).toBe('easy')
    expect(levelForIndex(0, 'hard')).toBe('hard')
  })

  it('gives longer windows to harder questions', () => {
    expect(questionMsForIndex(0)).toBe(8_000)
    expect(questionMsForIndex(20)).toBe(10_000)
    expect(questionMsForIndex(40)).toBe(13_000)
    expect(questionMsForIndex(100, 'easy')).toBe(8_000)
    expect(questionMsForIndex(0, 'hard')).toBe(13_000)
    expect(QUESTION_MS).toBe(8_000)
  })
})

describe('deterministic question generation', () => {
  it('returns one identical question for the same seed, index, and config', () => {
    const config = fullConfig({ range: 999 })
    for (let index = 0; index < 100; index++) {
      expect(generateQuestion(424242, index, config)).toEqual(generateQuestion(424242, index, config))
    }
  })

  it('produces varied questions and all enabled operations', () => {
    const config = fullConfig({ range: 999 })
    const texts = new Set()
    const operations = new Set()
    for (let seed = 0; seed < 100; seed++) {
      for (let index = 0; index < 60; index++) {
        const q = generateQuestion(seed, index, config)
        texts.add(q.text)
        operations.add(q.operation)
      }
    }
    expect(texts.size).toBeGreaterThan(100)
    expect(operations).toEqual(new Set(MATH_OPERATIONS))
  })

  it('uses only enabled operations for every subset and difficulty', () => {
    for (const operation of MATH_OPERATIONS) {
      const config = normalizeMathConfig({
        ...DEFAULT_MATH_CONFIG,
        operations: Object.fromEntries(MATH_OPERATIONS.map(op => [op, op === operation])),
      })
      for (const difficulty of ['easy', 'progressive', 'hard']) {
        const selected = { ...config, difficulty }
        for (let seed = 0; seed < 20; seed++) {
          for (let index = 0; index < 60; index++) {
            expect(generateQuestion(seed, index, selected).operation).toBe(operation)
          }
        }
      }
    }
  })

  it('keeps every operand within selected range and every answer exact, positive-or-zero integer', () => {
    for (const range of MATH_RANGES) {
      const config = fullConfig({ range })
      for (const difficulty of ['easy', 'progressive', 'hard']) {
        for (let seed = 0; seed < 40; seed++) {
          for (let index = 0; index < 60; index++) {
            const q = generateQuestion(seed, index, { ...config, difficulty })
            expect(Number.isSafeInteger(q.answer)).toBe(true)
            expect(q.answer).toBeGreaterThanOrEqual(0)
            expect(q.explanation.length).toBeGreaterThan(5)
            expect(q.operands.length).toBeGreaterThan(0)
            expect(q.operands.every(n => Number.isSafeInteger(n) && n >= 0 && n <= range)).toBe(true)
            expect(q.text).not.toContain('NaN')
          }
        }
      }
    }
  })

  it('includes exact division, missing operands, doubles, friendly percents, and squares', () => {
    const config = fullConfig({ range: 999 })
    const families = new Set()
    for (let seed = 0; seed < 500; seed++) {
      for (let index = 0; index < 80; index++) {
        const q = generateQuestion(seed, index, config)
        families.add(q.family)
        if (q.operation === 'divide') {
          expect(Number.isInteger(q.answer)).toBe(true)
          if (q.family === 'standard') {
            const [dividend, divisor] = q.text.split(' ÷ ').map(Number)
            expect(dividend % divisor).toBe(0)
            expect(dividend / divisor).toBe(q.answer)
          }
        }
        if (q.family === 'percent') {
          const [, pct, base] = q.text.match(/^(\d+)% of (\d+)$/) ?? []
          expect(Number(base) * Number(pct) % 100).toBe(0)
          expect(Number(base) * Number(pct) / 100).toBe(q.answer)
        }
        if (q.family === 'square') {
          const n = Number(q.text.replace('²', ''))
          expect(n * n).toBe(q.answer)
        }
      }
    }
    for (const family of ['missing', 'double', 'percent', 'square']) expect(families.has(family)).toBe(true)
  })

  it('marks power questions every eighth question at offset five', () => {
    for (let index = 0; index < 40; index++) {
      expect(generateQuestion(1, index).isPower).toBe(index % 8 === 5)
    }
  })
})

describe('seed and game duration', () => {
  it('produces a non-negative integer seed', () => {
    for (let i = 0; i < 20; i++) {
      const seed = generateSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(1_000_000_000)
    }
  })

  it('keeps the legacy default duration positive', () => {
    expect(GAME_MS).toBe(120_000)
  })
})

describe('speed and score accounting', () => {
  it('awards five speed points instantly and one at the buzzer', () => {
    expect(speedPtsFor(0, 8_000)).toBe(5)
    expect(speedPtsFor(8_000, 8_000)).toBe(1)
    expect(speedPtsFor(99_999, 8_000)).toBe(1)
  })

  it('records speed, power and streak bonuses explicitly', () => {
    const seed = 4242
    const q0 = generateQuestion(seed, 0)
    const result = scoreMathAnswer(null, { seed, answer: String(q0.answer), elapsed: 0 })
    expect(result).toMatchObject({ correct: true, pts: 5, speed: 5, powerMultiplier: 1, streakMultiplier: 1 })
    expect(result.stats).toMatchObject({ q: 1, score: 5, streak: 1, correct: 1, wrong: 0, speedPoints: 5 })

    const q5 = generateQuestion(seed, 5)
    const power = scoreMathAnswer({ q: 5 }, { seed, answer: String(q5.answer), elapsed: 0 })
    expect(q5.isPower).toBe(true)
    expect(power).toMatchObject({ pts: 10, powerMultiplier: 2, stats: { score: 10, powerBonus: 5 } })

    const q3 = generateQuestion(seed, 3)
    const streak = scoreMathAnswer({ q: 3, streak: 3 }, { seed, answer: String(q3.answer), elapsed: 0 })
    expect(streak).toMatchObject({ streakMultiplier: 2 })
    expect(streak.pts).toBe(10 * (q3.isPower ? 2 : 1))
  })

  it('resets streak and reveals answer on a wrong answer without deducting points', () => {
    const seed = 4242
    const q0 = generateQuestion(seed, 0)
    const outcome = scoreMathAnswer({ q: 0, score: 17, streak: 2, correct: 2 }, {
      seed, answer: String(q0.answer + 1), elapsed: 0,
    })
    expect(outcome).toMatchObject({ correct: false, pts: 0, answer: q0.answer, explanation: q0.explanation })
    expect(outcome.stats).toMatchObject({ q: 0, score: 17, streak: 0, wrong: 1 })
  })

  it('rejects partial numeric strings and times out as a miss that clears streak', () => {
    const seed = 77
    const q0 = generateQuestion(seed, 0)
    expect(scoreMathAnswer(null, { seed, answer: `${q0.answer}x`, elapsed: 0 }).correct).toBe(false)
    expect(timeoutMathQuestion({ q: 2, streak: 4, score: 9 }, 2)).toMatchObject({ q: 2, streak: 0, score: 9, wrong: 1 })
    expect(advanceMathQuestion({ q: 2 }, 2).q).toBe(3)
    expect(advanceMathQuestion({ q: 3 }, 2).q).toBe(3)
  })

  it('normalizes malformed legacy stats without losing current score', () => {
    expect(normalizeMathStats({ q: '2', score: 8, streak: -4, speedPoints: '6' })).toMatchObject({
      q: 2, score: 8, streak: 0, correct: 0, wrong: 0, speedPoints: 6, powerBonus: 0, streakBonus: 0,
    })
  })

  it('ranks by points and shows question counters', () => {
    expect(mathRaceEntry({ score: 12 })).toEqual({ sortKey: [-12], score: 12 })
    expect(mathRaceEntry(null).sortKey).toBeNull()
    expect(mathRow({ score: 7, correct: 3, wrong: 1, q: 4 })).toMatchObject({
      primary: '7 PTS', secondary: '3✓ 1✗', detail: 'Q5',
    })
  })
})
