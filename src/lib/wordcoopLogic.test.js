import { describe, expect, it } from 'vitest'
import {
  MAX_GUESSES, applySharedGuess, buildWordCoopRoundStart, canSubmitGuess,
  collectUsedAnswers, createNextRound, getRoundOutcome, nextTurn, pickAnswer,
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
})
