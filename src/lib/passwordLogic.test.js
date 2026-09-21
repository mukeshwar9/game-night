import { describe, expect, it } from 'vitest'
import { PASSWORD_DECK } from './decks/password'
import {
  CLUE_POINTS, GUESS_SECONDS, MAX_CLUES, MAX_ROUNDS, TARGET_SCORE,
  advanceAfterReveal, applyClue, applyGuess, applyGuessTimeout, createInitialRound,
  getMatchWinner, guessSecondsForClueNumber, isCorrectGuess, nextRoles, normalizeText,
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

  it('times guesses 30/30/25/25/20 by clue number', () => {
    expect(GUESS_SECONDS).toEqual([30, 30, 25, 25, 20])
    expect(guessSecondsForClueNumber(1)).toBe(30)
    expect(guessSecondsForClueNumber(2)).toBe(30)
    expect(guessSecondsForClueNumber(3)).toBe(25)
    expect(guessSecondsForClueNumber(4)).toBe(25)
    expect(guessSecondsForClueNumber(5)).toBe(20)
    expect(guessSecondsForClueNumber(9)).toBe(20)
    expect(guessSecondsForClueNumber(0)).toBe(30)
  })

  it('arms the guess clock on every clue', () => {
    const round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue', word: 'planet' }
    const first = applyClue(round, 'orbit', 1000)
    expect(first.endsAt).toBe(1000 + 30 * 1000)
    const second = applyClue({ ...applyGuess(first, 'nope', 'planet', 2000), word: 'planet' }, 'space', 3000)
    expect(second.endsAt).toBe(3000 + 30 * 1000)
  })

  it('rejects guesses after the clock and times the slot out instead', () => {
    const round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue', word: 'planet' }
    const guessing = applyClue(round, 'orbit', 1000)
    expect(applyGuess(guessing, 'planet', 'planet', guessing.endsAt + 1)).toBeNull()
    const timedOut = applyGuessTimeout(guessing, guessing.endsAt + 1)
    expect(timedOut.phase).toBe('clue')
    expect(timedOut.guesses).toHaveLength(1)
    expect(timedOut.guesses[0]).toMatchObject({ correct: false, timeout: true })
    expect(timedOut.endsAt).toBeNull()
    expect(applyGuessTimeout(guessing, guessing.endsAt)).toBeNull()
  })

  it('a timeout on the last clue goes to reveal', () => {
    let round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue', word: 'planet' }
    for (let i = 0; i < MAX_CLUES - 1; i += 1) {
      round = applyClue(round, `hint${i}`, i)
      round = applyGuess(round, 'nope', 'planet', i)
    }
    round = applyClue(round, 'last', 50)
    const timedOut = applyGuessTimeout(round, round.endsAt + 1)
    expect(timedOut.phase).toBe('reveal')
    expect(timedOut.guesses).toHaveLength(MAX_CLUES)
  })

  it('finishes at target or max rounds, including draw', () => {
    expect(getMatchWinner({ X: TARGET_SCORE, O: 0 }, 1)).toBe('X')
    expect(getMatchWinner({ X: 7, O: 5 }, MAX_ROUNDS)).toBe('X')
    expect(getMatchWinner({ X: 6, O: 6 }, MAX_ROUNDS)).toBe('draw')
    expect(getMatchWinner({ X: 2, O: 1 }, MAX_ROUNDS - 1)).toBe(null)
  })
})
