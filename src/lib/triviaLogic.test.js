import { describe, it, expect } from 'vitest'
import {
  MATCH_QUESTIONS,
  QUESTION_MS,
  GRACE_MS,
  BASE_POINTS,
  SPEED_POINTS,
  STREAK_STEP,
  STREAK_CAP,
  seededDraw,
  scoreAnswer,
  applyRoundScores,
} from './triviaLogic'
import { TRIVIA_DECK } from './decks/trivia'

const Q = { q: 'x', options: ['a', 'b', 'c', 'd'], answer: 2, cat: 'test', diff: 1 }
const START = 1000000

describe('deck sanity', () => {
  it('ships at least 60 questions with valid shape', () => {
    expect(TRIVIA_DECK.length).toBeGreaterThanOrEqual(60)
    for (const item of TRIVIA_DECK) {
      expect(item.options).toHaveLength(4)
      expect(item.answer).toBeGreaterThanOrEqual(0)
      expect(item.answer).toBeLessThanOrEqual(3)
      expect([1, 2, 3]).toContain(item.diff)
      expect(typeof item.cat).toBe('string')
    }
  })
  it('spreads correct answers across positions (no position above 50%)', () => {
    const counts = [0, 0, 0, 0]
    for (const item of TRIVIA_DECK) counts[item.answer]++
    const max = Math.max(...counts)
    expect(max / TRIVIA_DECK.length).toBeLessThanOrEqual(0.5)
  })
})

describe('seededDraw', () => {
  it('is deterministic per seed', () => {
    expect(seededDraw(TRIVIA_DECK, 42)).toEqual(seededDraw(TRIVIA_DECK, 42))
  })
  it('differs across seeds', () => {
    const a = seededDraw(TRIVIA_DECK, 1).map(q => q.q).join()
    const b = seededDraw(TRIVIA_DECK, 2).map(q => q.q).join()
    expect(a).not.toEqual(b)
  })
  it('draws exactly n questions without repeats', () => {
    const drawn = seededDraw(TRIVIA_DECK, 7, MATCH_QUESTIONS)
    expect(drawn).toHaveLength(MATCH_QUESTIONS)
    expect(new Set(drawn.map(q => q.q)).size).toBe(MATCH_QUESTIONS)
  })
  it('orders easy → hard by difficulty tier', () => {
    const drawn = seededDraw(TRIVIA_DECK, 99, 20)
    const diffs = drawn.map(q => q.diff)
    expect(diffs).toEqual([...diffs].sort((a, b) => a - b))
  })
  it('handles n larger than the deck', () => {
    expect(seededDraw([{ ...Q }, { ...Q, q: 'y' }], 5, 10)).toHaveLength(2)
  })
})

describe('scoreAnswer', () => {
  it('wrong answer scores zero', () => {
    expect(scoreAnswer(false, START + 100, START, 0)).toBe(0)
  })
  it('instant correct ≈ base + full speed bonus', () => {
    const pts = scoreAnswer(true, START, START, 0)
    expect(pts).toBe(BASE_POINTS + SPEED_POINTS)
  })
  it('last-moment correct still earns base', () => {
    const pts = scoreAnswer(true, START + QUESTION_MS - 50, START, 0)
    expect(pts).toBeGreaterThanOrEqual(BASE_POINTS)
    expect(pts).toBeLessThan(BASE_POINTS + SPEED_POINTS)
  })
  it('beyond the grace window scores zero', () => {
    expect(scoreAnswer(true, START + QUESTION_MS + GRACE_MS + 1, START, 0)).toBe(0)
  })
  it('within the grace window still scores something', () => {
    expect(scoreAnswer(true, START + QUESTION_MS + GRACE_MS - 1, START, 0)).toBeGreaterThan(0)
  })
  it('missing timestamps score zero', () => {
    expect(scoreAnswer(true, null, START, 0)).toBe(0)
    expect(scoreAnswer(true, START, null, 0)).toBe(0)
  })
  it('streak bonus accumulates and caps', () => {
    const noStreak = scoreAnswer(true, START, START, 0)
    const s1 = scoreAnswer(true, START, START, 1)
    const s2 = scoreAnswer(true, START, START, 2)
    const s9 = scoreAnswer(true, START, START, 9)
    expect(s1 - noStreak).toBe(0) // first correct has no bonus
    expect(s2 - noStreak).toBe(STREAK_STEP)
    expect(s9 - noStreak).toBe(STREAK_CAP) // capped
  })
})

describe('applyRoundScores', () => {
  const question = { answer: 1, qStartAt: START }

  it('correct answers gain points and extend streaks', () => {
    const { deltas, newStreaks } = applyRoundScores(
      { u1: { choice: 1, at: START + 1000 } },
      question,
      {},
    )
    expect(deltas.u1).toBeGreaterThan(BASE_POINTS)
    expect(newStreaks.u1).toBe(1)
  })
  it('wrong or missing answers reset streaks to zero', () => {
    const { deltas, newStreaks } = applyRoundScores(
      { u1: { choice: 0, at: START + 100 }, u2: undefined },
      question,
      { u1: 3, u2: 5 },
    )
    expect(deltas.u1).toBe(0)
    expect(deltas.u2).toBe(0)
    expect(newStreaks.u1).toBe(0)
    expect(newStreaks.u2).toBe(0)
  })
  it('late answers beyond grace score zero but keep… nothing — streak resets', () => {
    const { deltas, newStreaks } = applyRoundScores(
      { u1: { choice: 1, at: START + QUESTION_MS + GRACE_MS + 500 } },
      question,
      { u1: 4 },
    )
    expect(deltas.u1).toBe(0)
    expect(newStreaks.u1).toBe(0)
  })
  it('streaks carry forward across rounds', () => {
    const { newStreaks } = applyRoundScores(
      { u1: { choice: 1, at: START } },
      question,
      { u1: 2 },
    )
    expect(newStreaks.u1).toBe(3)
  })
  it('is deterministic — same inputs, same outputs', () => {
    const answers = { a: { choice: 1, at: START + 500 }, b: { choice: 3, at: START + 9000 } }
    const one = applyRoundScores(answers, question, { a: 1, b: 0 })
    const two = applyRoundScores(answers, question, { a: 1, b: 0 })
    expect(one).toEqual(two)
  })
  it('empty input yields empty output', () => {
    expect(applyRoundScores({}, question, {})).toEqual({ deltas: {}, newStreaks: {} })
  })
})
