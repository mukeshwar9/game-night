import { describe, expect, it } from 'vitest'
import {
  FINISH_GRACE_MS,
  applyGuessForPlayer,
  compareRace,
  getDoneState,
  getRaceReason,
  markGuess,
  nextRound,
  pickAnswer,
  shouldReveal,
} from './wordraceLogic'

const baseRound = {
  phase: 'playing',
  roundNum: 1,
  used: [0],
  guessesX: [],
  guessesO: [],
  doneX: null,
  doneO: null,
}

describe('wordraceLogic', () => {
  it('picks deterministic answers and skips used indexes', () => {
    const words = ['apple', 'cabin', 'crown', 'dream']
    const first = pickAnswer(words, 'seed-1')
    expect(first).toBe(pickAnswer(words, 'seed-1'))
    expect(pickAnswer(words, 'seed-1', [first])).not.toBe(first)
  })

  it('marks a solving guess and records done state', () => {
    const next = applyGuessForPlayer(baseRound, 'X', 'crown', 'crown', 120)
    expect(next.guessesX[0]).toMatchObject({ word: 'crown', marks: 'GGGGG', at: 120 })
    expect(next.doneX).toEqual({ solved: true, guesses: 1, at: 120 })
  })

  it('marks sixth wrong guess as failed', () => {
    const guesses = Array.from({ length: 5 }, (_, i) => ({ word: `guess${i}`, marks: 'BBBBB', at: i }))
    const next = applyGuessForPlayer({ ...baseRound, guessesX: guesses }, 'X', 'apple', 'crown', 500)
    expect(next.doneX).toEqual({ solved: false, guesses: 6, at: 500 })
  })

  it('rejects invalid words and guesses after done', () => {
    expect(applyGuessForPlayer(baseRound, 'X', 'zzzzz', 'crown', 1)).toBeNull()
    expect(applyGuessForPlayer({ ...baseRound, doneX: { solved: true, guesses: 1, at: 1 } }, 'X', 'crown', 'crown', 2)).toBeNull()
  })

  it('compares solve, guess count, speed, and fail outcomes', () => {
    expect(compareRace({ solved: true, guesses: 3, at: 300 }, { solved: false, guesses: 6, at: 400 })).toBe('X')
    expect(compareRace({ solved: true, guesses: 3, at: 300 }, { solved: true, guesses: 4, at: 400 })).toBe('X')
    expect(compareRace({ solved: true, guesses: 3, at: 500 }, { solved: true, guesses: 3, at: 400 })).toBe('O')
    expect(compareRace({ solved: true, guesses: 3, at: 400 }, { solved: true, guesses: 3, at: 400 })).toBe('draw')
    expect(compareRace({ solved: false, guesses: 6, at: 500 }, { solved: false, guesses: 6, at: 400 })).toBe('draw')
    expect(getRaceReason({ solved: true, guesses: 3, at: 400 }, { solved: true, guesses: 3, at: 400 })).toBe('speed')
    expect(getRaceReason({ solved: false, guesses: 6, at: 400 }, { solved: false, guesses: 6, at: 400 })).toBe('fail')
  })

  it('waits for both done or the finish grace after a solve', () => {
    const solved = { solved: true, guesses: 2, at: 1_000 }
    expect(shouldReveal({ ...baseRound, doneX: solved }, 1_000 + FINISH_GRACE_MS - 1)).toBe(false)
    expect(shouldReveal({ ...baseRound, doneX: solved }, 1_000 + FINISH_GRACE_MS)).toBe(true)
    expect(shouldReveal({ ...baseRound, doneX: solved, doneO: { solved: false, guesses: 6, at: 1_100 } }, 1_100)).toBe(true)
    expect(shouldReveal({ ...baseRound, doneX: null, doneO: { solved: false, guesses: 6, at: 1_100 } }, 99_999)).toBe(false)
  })

  it('reuses Word Duel duplicate-letter marking', () => {
    expect(markGuess('GEESE', 'THOSE')).toBe('BBBGG')
    const next = applyGuessForPlayer(baseRound, 'X', 'geese', 'those', 50)
    expect(next.guessesX[0].marks).toBe('BBBGG')
  })

  it('starts a clean non-repeating next round', () => {
    const next = nextRound({ ...baseRound, roundNum: 2, used: [0, 2] }, 'seed-3', 4)
    expect(next).toMatchObject({ phase: 'playing', roundNum: 3, seed: 'seed-3', answerIndex: 4, startedAt: null })
    expect(next.used).toEqual([0, 2, 4])
    expect(getDoneState(next.guessesX, 1)).toBeNull()
  })
})
