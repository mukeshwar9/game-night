import { describe, expect, it } from 'vitest'
import { PASSWORD_DECK } from './decks/password'
import {
  CLUE_POINTS, GUESS_SECONDS, MAX_CLUES, MAX_ROUNDS, MAX_TEAM_SCORE, STAR_THRESHOLDS, TARGET_SCORE,
  advanceAfterReveal, applyClue, applyGuess, applyGuessTimeout, bestRound, createInitialRound,
  getMatchWinner, guessSecondsForClueNumber, isCorrectGuess, nextRoles, normalizeText,
  pickWord, scoreForClueNumber, starRating, teamScoreOf, teamScoresFor, toList, validateClue,
} from './passwordLogic'

const deck = [{ word: 'planet', tier: 1 }, { word: 'chair', tier: 1 }, { word: 'secret', tier: 3 }]

// Plays one round from its clue phase: misses `misses` clues, then solves on
// the next one (or never, when solveOn is null). Returns the reveal round.
function playRound(round, word, { solveOn = 1 } = {}) {
  let current = { ...round, phase: 'clue' }
  for (let clue = 1; clue <= MAX_CLUES; clue += 1) {
    current = applyClue({ ...current, word }, `hint${clue}x`, clue * 10)
    const solved = solveOn != null && clue === solveOn
    current = applyGuess(current, solved ? word : 'nope', word, clue * 10 + 1)
    if (current.phase === 'reveal') return current
  }
  return current
}

// Plays a whole match, solving every round on `solveOn`; returns each
// advance result plus the final one.
function playMatch({ starter = 'X', solveOn = 1 } = {}) {
  const bigDeck = Array.from({ length: 20 }, (_, i) => ({ word: `word${String.fromCharCode(97 + i)}zz`, tier: 1 }))
  let round = createInitialRound({ starter, seed: 'm', wordIndex: 0, wordLength: 7 })
  const guessers = []
  let result = null
  for (let n = 0; n < MAX_ROUNDS + 2; n += 1) {
    guessers.push(round.guesser)
    const reveal = playRound(round, bigDeck[round.wordIndex].word, { solveOn })
    result = advanceAfterReveal(reveal, {}, bigDeck, 1000 * n)
    if (result.status === 'finished') break
    round = result.round
  }
  return { guessers, result }
}

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

  it('banks every solved round into one shared team total', () => {
    const round = createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 })
    expect(round.teamScore).toBe(0)
    const reveal = playRound(round, 'planet', { solveOn: 2 })
    expect(reveal.teamScore).toBe(4)
    expect(reveal.history).toEqual([{ roundNum: 1, wordIndex: 0, clueGiver: 'X', guesser: 'O', points: 4, clueNumber: 2 }])
    const advanced = advanceAfterReveal(reveal, {}, deck, 100)
    expect(advanced.scores).toEqual({ X: 4, O: 4 })
    expect(advanced.round.teamScore).toBe(4)
    const second = playRound(advanced.round, deck[advanced.round.wordIndex].word, { solveOn: 1 })
    expect(second.teamScore).toBe(9)
    expect(second.history).toHaveLength(2)
    expect(second.history[1]).toMatchObject({ roundNum: 2, clueGiver: 'O', guesser: 'X', points: 5 })
  })

  it('records a missed round in the recap with zero points', () => {
    const reveal = playRound(createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), 'planet', { solveOn: null })
    expect(reveal.teamScore).toBe(0)
    expect(reveal.lastDelta).toBeNull()
    expect(reveal.history).toEqual([{ roundNum: 1, wordIndex: 0, clueGiver: 'X', guesser: 'O', points: 0, clueNumber: 0 }])
  })

  it('plays a fixed 12 rounds — no early finish once the team passes 15', () => {
    const { guessers, result } = playMatch({ solveOn: 1 })
    expect(guessers).toHaveLength(MAX_ROUNDS)
    expect(result.status).toBe('finished')
    expect(result.winner).toBe('draw')
    expect(result.round.phase).toBe('finished')
    expect(result.round.teamScore).toBe(MAX_TEAM_SCORE)
    expect(result.scores).toEqual({ X: 60, O: 60 })
    expect(result.round.history).toHaveLength(MAX_ROUNDS)
  })

  it('gives each player the same six guessing turns from either starter', () => {
    for (const starter of ['X', 'O']) {
      const { guessers } = playMatch({ starter, solveOn: 3 })
      expect(guessers.filter(s => s === 'X')).toHaveLength(6)
      expect(guessers.filter(s => s === 'O')).toHaveLength(6)
      expect(guessers[0]).toBe(starter === 'X' ? 'O' : 'X')
      guessers.slice(1).forEach((s, i) => expect(s).not.toBe(guessers[i]))
    }
  })

  it('ends the match as a co-op draw only after the last round', () => {
    expect(getMatchWinner({ X: TARGET_SCORE, O: TARGET_SCORE }, MAX_ROUNDS - 1)).toBeNull()
    expect(getMatchWinner({ X: 7, O: 5 }, MAX_ROUNDS)).toBe('draw')
    expect(TARGET_SCORE).toBe(MAX_TEAM_SCORE)
    expect(MAX_TEAM_SCORE).toBe(60)
  })

  it('rates the team total with stars at the exported thresholds', () => {
    expect(STAR_THRESHOLDS).toEqual([20, 30, 40])
    expect(starRating(0)).toBe(0)
    expect(starRating(19)).toBe(0)
    expect(starRating(20)).toBe(1)
    expect(starRating(30)).toBe(2)
    expect(starRating(39)).toBe(2)
    expect(starRating(40)).toBe(3)
    expect(starRating(60)).toBe(3)
  })

  it('mirrors the team total onto both seats and reads it back', () => {
    expect(teamScoresFor(17)).toEqual({ X: 17, O: 17 })
    expect(teamScoresFor(undefined)).toEqual({ X: 0, O: 0 })
    expect(teamScoreOf({ teamScore: 12 }, { X: 99, O: 3 })).toBe(12)
    expect(teamScoreOf({ teamScore: 0 }, { X: 5, O: 5 })).toBe(0)
    expect(teamScoreOf({}, { X: 8, O: 8 })).toBe(8)
  })

  it('finds the best round of the recap, earliest on a tie', () => {
    const history = [
      { roundNum: 1, points: 3 }, { roundNum: 2, points: 5 }, { roundNum: 3, points: 5 }, { roundNum: 4, points: 0 },
    ]
    expect(bestRound(history).roundNum).toBe(2)
    expect(bestRound([{ roundNum: 1, points: 0 }])).toBeNull()
    expect(bestRound(undefined)).toBeNull()
  })

  it('normalizes sparse Firebase lists by key', () => {
    expect(toList(undefined)).toEqual([])
    expect(toList({ 1: 'b', 0: 'a', 10: 'c' })).toEqual(['a', 'b', 'c'])
    expect(toList(['a', 'b'])).toEqual(['a', 'b'])
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
})
