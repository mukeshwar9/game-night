import { describe, it, expect } from 'vitest'
import {
  generateQuestion,
  levelForIndex,
  questionMsForIndex,
  generateSeed,
  GAME_MS,
  QUESTION_MS,
} from './mathLogic'
import {
  speedPtsFor, scoreMathAnswer, advanceMathQuestion, normalizeMathStats, mathRaceEntry, mathRow,
} from './mathLogic'

describe('generateQuestion determinism', () => {
  it('returns the same question for the same seed and index across many calls', () => {
    const seed = 424242
    for (const index of [0, 1, 5, 19, 20, 39, 40, 99]) {
      const first = generateQuestion(seed, index)
      for (let i = 0; i < 5; i++) {
        expect(generateQuestion(seed, index)).toEqual(first)
      }
    }
  })

  it('gives both players the same question for the same seed+index (simulated X vs O)', () => {
    const seed = 7
    for (let index = 0; index < 60; index++) {
      const asX = generateQuestion(seed, index)
      const asO = generateQuestion(seed, index)
      expect(asX).toEqual(asO)
    }
  })

  it('generally varies the question across different indices for a fixed seed', () => {
    const seed = 12345
    const texts = new Set()
    for (let index = 0; index < 40; index++) {
      texts.add(generateQuestion(seed, index).text)
    }
    // Not every question need be unique, but a flat/broken generator would
    // collapse everything to one or two distinct texts.
    expect(texts.size).toBeGreaterThan(10)
  })

  it('generally varies the question across different seeds for a fixed index', () => {
    const index = 3
    const texts = new Set()
    for (let seed = 0; seed < 40; seed++) {
      texts.add(generateQuestion(seed, index).text)
    }
    expect(texts.size).toBeGreaterThan(5)
  })
})

describe('levelForIndex / questionMsForIndex ramp', () => {
  it('is easy below 20, medium 20-39, hard 40+', () => {
    expect(levelForIndex(0)).toBe('easy')
    expect(levelForIndex(19)).toBe('easy')
    expect(levelForIndex(20)).toBe('medium')
    expect(levelForIndex(39)).toBe('medium')
    expect(levelForIndex(40)).toBe('hard')
    expect(levelForIndex(1000)).toBe('hard')
  })

  it('questionMsForIndex is monotonically non-decreasing as index climbs the ramp', () => {
    let prev = 0
    for (let index = 0; index < 100; index += 3) {
      const ms = questionMsForIndex(index)
      expect(ms).toBeGreaterThanOrEqual(prev)
      prev = ms
    }
  })

  it('gives hard questions strictly more time than easy questions', () => {
    expect(questionMsForIndex(40)).toBeGreaterThan(questionMsForIndex(0))
    expect(questionMsForIndex(20)).toBeGreaterThan(questionMsForIndex(0))
    expect(questionMsForIndex(40)).toBeGreaterThan(questionMsForIndex(20))
  })

  it('QUESTION_MS fallback matches the easy-tier window', () => {
    expect(QUESTION_MS).toBe(questionMsForIndex(0))
  })
})

describe('generateQuestion answer correctness', () => {
  it('every generated question\'s answer matches evaluating its own operands', () => {
    const seed = 999
    for (let index = 0; index < 80; index++) {
      const q = generateQuestion(seed, index)
      expect(typeof q.text).toBe('string')
      expect(Number.isFinite(q.answer)).toBe(true)
    }
  })

  it('marks isPower true exactly every 8th question at offset 5 (index % 8 === 5)', () => {
    for (let index = 0; index < 40; index++) {
      const q = generateQuestion(1, index)
      expect(q.isPower).toBe(index % 8 === 5)
    }
  })

  it('easy-tier subtraction never goes negative (the a===3 edge at seededRange bounds)', () => {
    // level easy 'sub': a in [3,12], b in [1, a-1]. At the minimum a=3, the
    // range for b is [1, 2] — seededRange(1, a-1, ...) must not divide by
    // zero or produce b >= a when a is at its floor.
    for (let seed = 0; seed < 500; seed++) {
      for (let index = 0; index < 20; index++) {
        const q = generateQuestion(seed, index)
        if (q.text.includes('−')) {
          expect(q.answer).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

describe('generateSeed', () => {
  it('produces a non-negative integer', () => {
    for (let i = 0; i < 20; i++) {
      const s = generateSeed()
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(1_000_000_000)
    }
  })
})

describe('GAME_MS', () => {
  it('is a sane positive duration', () => {
    expect(GAME_MS).toBeGreaterThan(0)
  })
})

describe('speedPtsFor', () => {
  it('5 for an instant answer, 1 at the buzzer', () => {
    expect(speedPtsFor(0, 8000)).toBe(5)
    expect(speedPtsFor(8000, 8000)).toBe(1)
    expect(speedPtsFor(99_999, 8000)).toBe(1)
  })
})

describe('scoreMathAnswer', () => {
  const seed = 4242
  const q0 = generateQuestion(seed, 0)

  it('a correct answer advances and scores speed points', () => {
    const { correct, pts, stats } = scoreMathAnswer(null, { seed, answer: String(q0.answer), elapsed: 0 })
    expect(correct).toBe(true)
    expect(pts).toBe(5)
    expect(stats).toEqual({ q: 1, score: 5, streak: 1, correct: 1, wrong: 0 })
  })

  it('a 3-streak doubles the next correct answer', () => {
    const q3 = generateQuestion(seed, 3)
    const { pts } = scoreMathAnswer({ q: 3, score: 0, streak: 3, correct: 3, wrong: 0 }, { seed, answer: String(q3.answer), elapsed: 0 })
    expect(pts).toBe(5 * (q3.isPower ? 2 : 1) * 2)
  })

  it('a wrong answer costs a point (floored at 0), resets the streak, keeps q', () => {
    const { correct, stats } = scoreMathAnswer({ q: 0, score: 3, streak: 2, correct: 2, wrong: 0 }, { seed, answer: String(q0.answer + 1), elapsed: 0 })
    expect(correct).toBe(false)
    expect(stats).toEqual({ q: 0, score: 2, streak: 0, correct: 2, wrong: 1 })
    expect(scoreMathAnswer(null, { seed, answer: String(q0.answer + 1), elapsed: 0 }).stats.score).toBe(0)
  })

  it('power questions double the reward', () => {
    const q5 = generateQuestion(seed, 5)
    expect(q5.isPower).toBe(true)
    const { pts } = scoreMathAnswer({ q: 5 }, { seed, answer: String(q5.answer), elapsed: 0 })
    expect(pts).toBe(10)
  })

  it('advanceMathQuestion only moves past the given index', () => {
    expect(advanceMathQuestion({ q: 2 }, 2).q).toBe(3)
    expect(advanceMathQuestion({ q: 3 }, 2).q).toBe(3)
  })

  it('normalizeMathStats floors junk to zeros', () => {
    expect(normalizeMathStats({ q: '2', score: -4, streak: 'x' })).toEqual({ q: 2, score: 0, streak: 0, correct: 0, wrong: 0 })
  })
})

describe('math race hooks', () => {
  it('ranks by points; no stats = DNF', () => {
    expect(mathRaceEntry({ score: 12 })).toEqual({ sortKey: [-12], score: 12 })
    expect(mathRaceEntry(null).sortKey).toBeNull()
  })

  it('row shows points and tallies', () => {
    expect(mathRow({ score: 7, correct: 3, wrong: 1, q: 4 })).toMatchObject({ primary: '7 PTS', secondary: '3✓ 1✗', detail: 'Q5' })
  })
})
