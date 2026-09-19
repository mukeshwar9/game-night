import { describe, expect, it } from 'vitest'
import { PASSWORD_DECK } from './decks/password'
import {
  CLUE_POINTS, MAX_CLUES, MAX_ROUNDS, TARGET_SCORE,
  advanceAfterReveal, applyClue, applyGuess, createInitialRound,
  getMatchWinner, isCorrectGuess, nextRoles, normalizeText,
  pickWord, scoreForClueNumber, validateClue,
} from './passwordLogic'

const deck = [{ word: 'planet', tier: 1 }, { word: 'chair', tier: 1 }, { word: 'secret', tier: 3 }]

describe('passwordLogic', () => {
  it('ships a large unique common-word deck', () => {
    const words = PASSWORD_DECK.map(entry => entry.word)
    expect(words.length).toBeGreaterThanOrEqual(250)
    expect(words.length).toBeLessThanOrEqual(400)
    expect(new Set(words).size).toBe(words.length)
    expect(PASSWORD_DECK.every(entry => [1, 2, 3].includes(entry.tier))).toBe(true)
  })

  it('normalizes punctuation, case, and whitespace', () => {
    expect(normalizeText('  Hello,   WORLD! ')).toBe('hello world')
    expect(isCorrectGuess(' PLANET! ', 'planet')).toBe(true)
  })

  it('validates one-word clues and rejects leaks or repeats', () => {
    expect(validateClue({ clue: 'galaxy', word: 'planet' }).valid).toBe(true)
    expect(validateClue({ clue: 'two words', word: 'planet' }).valid).toBe(false)
    expect(validateClue({ clue: 'plan', word: 'planet' }).valid).toBe(false)
    expect(validateClue({ clue: 'planet', word: 'planet' }).valid).toBe(false)
    expect(validateClue({ clue: 'galaxy', word: 'planet', previousClues: ['Galaxy'] }).valid).toBe(false)
  })

  it('maps clue number to 5-to-1 scoring', () => {
    expect(CLUE_POINTS).toEqual([5, 4, 3, 2, 1])
    expect(scoreForClueNumber(1)).toBe(5)
    expect(scoreForClueNumber(MAX_CLUES)).toBe(1)
    expect(scoreForClueNumber(0)).toBe(0)
    expect(scoreForClueNumber(6)).toBe(0)
  })

  it('alternates roles', () => {
    expect(nextRoles('X')).toEqual({ clueGiver: 'O', guesser: 'X' })
    expect(nextRoles('O')).toEqual({ clueGiver: 'X', guesser: 'O' })
  })

  it('picks deterministic unused words and changes with seed', () => {
    expect(pickWord(deck, 'seed-a', [])).toBe(pickWord(deck, 'seed-a', []))
    expect(pickWord(deck, 'seed-a', [pickWord(deck, 'seed-a', [])])).not.toBe(-1)
    expect(pickWord(deck, 'seed-a', [])).not.toBe(pickWord(deck, 'seed-b', []))
  })

  it('runs clue and guess phases', () => {
    const round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue' }
    const withClue = applyClue({ ...round, word: 'planet' }, 'orbit', 10)
    expect(withClue.phase).toBe('guess')
    const withGuess = applyGuess(withClue, 'wrong', 'planet', 20)
    expect(withGuess.phase).toBe('clue')
    const secondClue = applyClue({ ...withGuess, word: 'planet' }, 'space', 25)
    const reveal = applyGuess(secondClue, 'PLANET!', 'planet', 30)
    expect(reveal.phase).toBe('reveal')
    expect(reveal.lastDelta).toEqual({ player: 'O', points: 4, clueNumber: 2 })
  })

  it('ends after five misses and advances with a fresh non-repeating word', () => {
    let round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue', word: 'planet' }
    for (let i = 0; i < MAX_CLUES; i += 1) {
      round = applyClue(round, `hint${i}`, i) 
      round = applyGuess(round, 'nope', 'planet', i)
    }
    expect(round.phase).toBe('reveal')
    const advanced = advanceAfterReveal(round, { X: 0, O: 0 }, deck, 100)
    expect(advanced.round.roundNum).toBe(2)
    expect(advanced.round.clueGiver).toBe('O')
    expect(advanced.round.used).toHaveLength(2)
  })

  it('finishes at target or max rounds, including draw', () => {
    expect(getMatchWinner({ X: TARGET_SCORE, O: 0 }, 1)).toBe('X')
    expect(getMatchWinner({ X: 7, O: 5 }, MAX_ROUNDS)).toBe('X')
    expect(getMatchWinner({ X: 6, O: 6 }, MAX_ROUNDS)).toBe('draw')
    expect(getMatchWinner({ X: 2, O: 1 }, MAX_ROUNDS - 1)).toBe(null)
  })
})
