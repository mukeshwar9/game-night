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
  drawMatchOrder,
  matchQuestions,
  orderOf,
  questionMultiplier,
  FINAL_MULTIPLIER,
  scoringWindow,
  questionDeadline,
} from './triviaLogic'
import { markSeen } from './seenHistory'
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

describe('drawMatchOrder (per-room seen history)', () => {
  it('is deterministic for the same seed + seen', () => {
    const a = drawMatchOrder(TRIVIA_DECK, 42, { 3: 1 })
    const b = drawMatchOrder(TRIVIA_DECK, 42, { 3: 1 })
    expect(a).toEqual(b)
    expect(a).toHaveLength(MATCH_QUESTIONS)
    expect(new Set(a).size).toBe(MATCH_QUESTIONS)
  })

  it('avoids questions the room has already seen', () => {
    const seen = {}
    TRIVIA_DECK.forEach((_, i) => { if (i % 2 === 0) seen[i] = i + 1 })
    for (const seed of [1, 7, 99, 123456]) {
      const order = drawMatchOrder(TRIVIA_DECK, seed, seen)
      expect(order.every(i => seen[i] == null)).toBe(true)
    }
  })

  it('never repeats a question across back-to-back matches until the deck runs out', () => {
    let seen = {}
    const used = new Set()
    const matches = Math.floor(TRIVIA_DECK.length / MATCH_QUESTIONS)
    for (let m = 0; m < matches; m++) {
      const order = drawMatchOrder(TRIVIA_DECK, 1000 + m, seen)
      for (const i of order) {
        expect(used.has(i)).toBe(false)
        used.add(i)
      }
      seen = markSeen(seen, order)
    }
  })

  it('still draws a full, repeat-free match once everything has been seen', () => {
    const seen = {}
    TRIVIA_DECK.forEach((_, i) => { seen[i] = i + 1 })
    const order = drawMatchOrder(TRIVIA_DECK, 5, seen)
    expect(order).toHaveLength(MATCH_QUESTIONS)
    expect(new Set(order).size).toBe(MATCH_QUESTIONS)
    // Falls back to the least recently seen half.
    expect(order.every(i => i < Math.ceil(TRIVIA_DECK.length / 2) + 1)).toBe(true)
  })

  it('presents easy → hard', () => {
    const order = drawMatchOrder(TRIVIA_DECK, 77, null)
    const diffs = order.map(i => TRIVIA_DECK[i].diff ?? 1)
    expect(diffs).toEqual([...diffs].sort((x, y) => x - y))
  })
})

describe('matchQuestions / orderOf', () => {
  it('maps the stored order to deck questions, reading Firebase objects by key', () => {
    const round = { order: { 1: 5, 0: 2 } }
    expect(orderOf(round)).toEqual([2, 5])
    expect(matchQuestions(TRIVIA_DECK, round)).toEqual([TRIVIA_DECK[2], TRIVIA_DECK[5]])
  })
  it('drops out-of-range indexes', () => {
    expect(orderOf({ order: [1, 99999, 'x', 3] }, TRIVIA_DECK.length)).toEqual([1, 3])
  })
  it('falls back to the legacy seededDraw when no order is stored', () => {
    expect(matchQuestions(TRIVIA_DECK, { deckSeed: 9 })).toEqual(seededDraw(TRIVIA_DECK, 9, MATCH_QUESTIONS))
  })
})

describe('final-question catch-up', () => {
  it('doubles only the last question', () => {
    expect(questionMultiplier(0)).toBe(1)
    expect(questionMultiplier(MATCH_QUESTIONS - 2)).toBe(1)
    expect(questionMultiplier(MATCH_QUESTIONS - 1)).toBe(FINAL_MULTIPLIER)
    expect(FINAL_MULTIPLIER).toBe(2)
  })
  it('doubles the whole delta including streak bonus', () => {
    const single = scoreAnswer(true, START + 3000, START, 3)
    expect(scoreAnswer(true, START + 3000, START, 3, { multiplier: 2 })).toBe(single * 2)
    const { deltas } = applyRoundScores(
      { a: { choice: 2, at: START } }, { answer: 2, qStartAt: START }, {}, { multiplier: 2 },
    )
    expect(deltas.a).toBe((BASE_POINTS + SPEED_POINTS) * 2)
  })
})

describe('timer scale', () => {
  it('default scale keeps today\'s window', () => {
    expect(scoringWindow(undefined)).toEqual({ windowMs: QUESTION_MS, noDeadline: false })
    expect(questionDeadline(START, 1)).toBe(START + QUESTION_MS)
  })
  it('relaxed doubles the window and measures speed against it', () => {
    const opts = scoringWindow(2)
    expect(opts.windowMs).toBe(QUESTION_MS * 2)
    expect(questionDeadline(START, 2)).toBe(START + QUESTION_MS * 2)
    // Answering at 20 s is late at 1× but on time at 2×.
    expect(scoreAnswer(true, START + 20000, START, 0)).toBe(0)
    expect(scoreAnswer(true, START + 20000, START, 0, opts)).toBeGreaterThan(BASE_POINTS)
  })
  it('off: no deadline, nothing is late, base points still count', () => {
    const opts = scoringWindow(0)
    expect(opts).toEqual({ windowMs: QUESTION_MS, noDeadline: true })
    expect(questionDeadline(START, 0)).toBeNull()
    expect(scoreAnswer(true, START + 120000, START, 0, opts)).toBe(BASE_POINTS)
    const { deltas, newStreaks } = applyRoundScores(
      { a: { choice: 2, at: START + 120000 } }, { answer: 2, qStartAt: START }, {}, opts,
    )
    expect(deltas.a).toBe(BASE_POINTS)
    expect(newStreaks.a).toBe(1)
  })
})
