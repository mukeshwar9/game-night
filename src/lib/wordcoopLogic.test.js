import { describe, expect, it } from 'vitest'
import {
  MAX_GUESSES, PARTNER_OFFLINE_SOLO_MS, applySharedGuess, buildWordCoopRoundStart, canSubmitGuess,
  collectUsedAnswers, createNextRound, getRoundOutcome, isSoloMode, nextTurn, normalizeCoopStats,
  pickAnswer, sanitizeDraft, updateCoopStats,
} from './wordcoopLogic'

const round = (overrides = {}) => createNextRound({ seed: 'seed', starter: 'X', answerIndex: 0, ...overrides })

describe('wordcoopLogic', () => {
  it('alternates turns after a wrong guess', () => {
    const next = applySharedGuess(round(), { player: 'X', guess: 'hello', answer: 'crane', at: 1 })
    expect(next.currentTurn).toBe('O')
    expect(next.guesses[0]).toMatchObject({ by: 'X', word: 'HELLO', marks: 'BYBBB' })
  })

  it('ends round as shared win when either player solves', () => {
    const next = applySharedGuess(round(), { player: 'X', guess: 'crane', answer: 'crane', at: 1 })
    expect(next.phase).toBe('reveal')
    expect(getRoundOutcome(next)).toBe('win')
    expect(next.result).toMatchObject({ solvedBy: 'X', answer: 'CRANE' })
  })

  it('ends round as shared loss after sixth wrong guess', () => {
    let state = round()
    for (let i = 0; i < MAX_GUESSES; i++) {
      state = applySharedGuess(state, {
        player: i % 2 ? 'O' : 'X', guess: 'hello', answer: 'crane', at: i,
      })
    }
    expect(state.phase).toBe('reveal')
    expect(getRoundOutcome(state)).toBe('loss')
    expect(state.result.answer).toBe('CRANE')
  })

  it('rejects a guess from the wrong seat', () => {
    expect(canSubmitGuess(round(), 'O')).toBe(false)
    expect(applySharedGuess(round(), { player: 'O', guess: 'hello', answer: 'crane' })).toBeNull()
  })

  it('picks deterministic answers and excludes used words', () => {
    const answers = ['apple', 'crane', 'plant']
    expect(pickAnswer(answers, 'same')).toBe(pickAnswer(answers, 'same'))
    const selected = pickAnswer(answers, 'same', [answers[pickAnswer(answers, 'same')]])
    expect(selected).not.toBe(pickAnswer(answers, 'same'))
  })

  it('creates a fresh round with requested starter', () => {
    const next = createNextRound({ previousRound: round(), seed: 'next', starter: 'O', answerIndex: 2 })
    expect(next).toMatchObject({ phase: 'playing', seed: 'next', answerIndex: 2, currentTurn: 'O', guesses: [], result: null })
  })

  it('reuses Word Duel duplicate marking', () => {
    const next = applySharedGuess(round(), { player: 'X', guess: 'robot', answer: 'books' })
    expect(next.guesses[0].marks).toBe('BGYYB')
  })

  it('flips turns', () => {
    expect(nextTurn('X')).toBe('O')
    expect(nextTurn('O')).toBe('X')
  })

  it('accumulates used answers for the next round', () => {
    const answers = ['apple', 'crane', 'plant']
    const prev = { answerIndex: 1, used: [0] }
    expect(collectUsedAnswers(prev)).toEqual([0, 1])
    const next = buildWordCoopRoundStart({
      answerList: answers,
      previousRound: prev,
      seed: 'next',
      starter: 'O',
    })
    expect(next.used).toEqual([0, 1])
    expect(next.answerIndex).not.toBe(0)
    expect(next.answerIndex).not.toBe(1)
  })

  it('regression: an offline partner no longer freezes the board — solo play takes their turn', () => {
    const r = round() // X to play
    expect(canSubmitGuess(r, 'O')).toBe(false)
    expect(canSubmitGuess(r, 'O', { solo: true })).toBe(true)
    const next = applySharedGuess(r, { player: 'O', guess: 'hello', answer: 'crane', at: 1, solo: true })
    expect(next.guesses[0].by).toBe('O')
    expect(next.currentTurn).toBe('X')
    // Still solo on the partner's next turn.
    expect(applySharedGuess(next, { player: 'O', guess: 'crane', answer: 'crane', at: 2, solo: true }).result.outcome).toBe('win')
  })

  it('switches to solo only after the partner has been offline long enough', () => {
    expect(isSoloMode({ partnerOnline: false, offlineSince: 1000, now: 1000 + PARTNER_OFFLINE_SOLO_MS - 1 })).toBe(false)
    expect(isSoloMode({ partnerOnline: false, offlineSince: 1000, now: 1000 + PARTNER_OFFLINE_SOLO_MS })).toBe(true)
    expect(isSoloMode({ partnerOnline: true, offlineSince: 1000, now: 1e9 })).toBe(false)
    expect(isSoloMode({ partnerOnline: undefined, offlineSince: 1000, now: 1e9 })).toBe(false)
  })

  it('tracks current streak, best streak and losses', () => {
    let stats = updateCoopStats(null, 'win')
    stats = updateCoopStats(stats, 'win')
    expect(stats).toEqual({ streak: 2, bestStreak: 2, wins: 2, losses: 0 })
    stats = updateCoopStats(stats, 'loss')
    expect(stats).toEqual({ streak: 0, bestStreak: 2, wins: 2, losses: 1 })
    stats = updateCoopStats(stats, 'win')
    expect(stats).toEqual({ streak: 1, bestStreak: 2, wins: 3, losses: 1 })
    expect(normalizeCoopStats({ streak: '3', losses: -1 })).toEqual({ streak: 3, bestStreak: 0, wins: 0, losses: 0 })
  })

  it('records the result into the round stats', () => {
    const won = applySharedGuess(round({ stats: { streak: 2, bestStreak: 4 } }), { player: 'X', guess: 'crane', answer: 'crane' })
    expect(won.stats).toMatchObject({ streak: 3, bestStreak: 4, wins: 1 })
    let lost = round({ stats: { streak: 2, bestStreak: 4 } })
    for (let i = 0; i < MAX_GUESSES; i++) lost = applySharedGuess(lost, { player: i % 2 ? 'O' : 'X', guess: 'hello', answer: 'crane' })
    expect(lost.stats).toMatchObject({ streak: 0, bestStreak: 4, losses: 1 })
  })

  it('carries stats into the next round for Play Again and New Match', () => {
    const prev = { answerIndex: 1, used: [0], stats: { streak: 3, bestStreak: 5, wins: 7, losses: 2 } }
    const next = buildWordCoopRoundStart({ answerList: ['apple', 'crane', 'plant'], previousRound: prev, seed: 's', starter: 'X' })
    expect(next.stats).toEqual(prev.stats)
    expect(createNextRound({ previousRound: prev, seed: 's', answerIndex: 2 }).stats).toEqual(prev.stats)
    expect(createNextRound({ seed: 's', answerIndex: 2 }).stats).toBeUndefined()
  })

  it('clears the locked draft and sanitizes partner drafts', () => {
    const next = applySharedGuess(round({ draftX: 'HELL' }), { player: 'X', guess: 'hello', answer: 'crane' })
    expect(next.draftX).toBeNull()
    expect(sanitizeDraft('ab1c<d>ef')).toBe('ABCDE')
    expect(sanitizeDraft(null)).toBe('')
  })
})
