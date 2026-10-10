import { describe, expect, it } from 'vitest'
import { PASSWORD_DECK } from './decks/password'
import {
  CLUE_MS, GUESS_SECONDS, MAX_CLUES, applyClue, applyGuess, createInitialRound, startCluePhase, validateClue,
} from './passwordLogic'
import { BOT_CLUE_DECK, BOT_GUESS_ACCURACY, advanceDemoClock, pickBotClue, pickBotGuess } from './passwordBot'

const wordsOf = deck => deck.map(entry => entry.word)

describe('passwordBot', () => {
  it('ships curated words that all live in the public deck', () => {
    const deck = new Set(wordsOf(PASSWORD_DECK))
    expect(BOT_CLUE_DECK.every(entry => deck.has(entry.word))).toBe(true)
    expect(BOT_CLUE_DECK.length).toBeGreaterThanOrEqual(12)
  })

  it('ships only clues that validate for their own word', () => {
    for (const entry of BOT_CLUE_DECK) {
      for (const clue of entry.clues) {
        const check = validateClue({ clue, word: entry.word })
        expect(check.valid, `${entry.word} -> ${clue}: ${check.reason}`).toBe(true)
      }
    }
  })

  it('never repeats a clue across a full round', () => {
    const previousClues = []
    for (let i = 0; i < MAX_CLUES; i += 1) {
      const clue = pickBotClue({ word: 'apple', previousClues })
      expect(typeof clue).toBe('string')
      expect(validateClue({ clue, word: 'apple', previousClues }).valid).toBe(true)
      previousClues.push({ text: clue })
    }
    expect(new Set(previousClues.map(item => item.text)).size).toBe(MAX_CLUES)
  })

  it('produces a valid fallback clue for a word outside the bank', () => {
    const clue = pickBotClue({ word: 'zebra', previousClues: [] })
    expect(validateClue({ clue, word: 'zebra' }).valid).toBe(true)
  })

  it('guesses the word when the accuracy roll succeeds', () => {
    const deck = [{ word: 'alpha' }, { word: 'beta' }, { word: 'gamma' }]
    expect(pickBotGuess({ word: 'beta', deck, clueNumber: 1, rng: () => 0 })).toBe('beta')
    expect(pickBotGuess({ word: 'beta', deck, clueNumber: 99, rng: () => 0 })).toBe('beta')
  })

  it('falls back to a wrong deck word when the accuracy roll fails', () => {
    const deck = [{ word: 'alpha' }, { word: 'beta' }, { word: 'gamma' }]
    let call = 0
    const rng = () => (call++ === 0 ? 0.999 : 0)
    const guess = pickBotGuess({ word: 'beta', deck, clueNumber: 1, rng })
    expect(guess).toBe('alpha')
  })

  it('keeps accuracy monotonic across clue numbers', () => {
    for (let i = 1; i < BOT_GUESS_ACCURACY.length; i += 1) {
      expect(BOT_GUESS_ACCURACY[i]).toBeGreaterThan(BOT_GUESS_ACCURACY[i - 1])
    }
  })
})

describe('advanceDemoClock', () => {
  const t0 = 1_000_000
  // A demo round mid-guess: one clue given at t0, so the guess clock runs out
  // GUESS_SECONDS[0] later.
  const guessing = () => {
    const intro = { ...createInitialRound({ starter: 'O', seed: 's', wordIndex: 0, wordLength: 6 }), word: 'kangaroo', endsAt: t0 }
    const clue = startCluePhase(intro, t0)
    return { ...applyClue({ ...clue, word: 'kangaroo' }, 'pouch', t0), word: 'kangaroo' }
  }

  it('reproduces the soft-lock: a late guess is refused until the clock is advanced', () => {
    const round = guessing()
    const late = t0 + GUESS_SECONDS[0] * 1000 + 10_000
    expect(applyGuess(round, 'kangaroo', 'kangaroo', late)).toBeNull()

    const advanced = advanceDemoClock(round, late)
    expect(advanced.phase).toBe('clue')
    expect(advanced.guesses.at(-1)).toMatchObject({ timeout: true, correct: false })
    expect(advanced.endsAt).toBe(late + CLUE_MS)
    // Play goes on: the next clue is accepted and the right guess scores.
    const reclued = { ...applyClue(advanced, 'marsupial', late + 1000), word: 'kangaroo' }
    const solved = applyGuess(reclued, 'kangaroo', 'kangaroo', late + 2000)
    expect(solved.phase).toBe('reveal')
    expect(solved.teamScore).toBeGreaterThan(0)
  })

  it('does nothing before a deadline', () => {
    const round = guessing()
    expect(advanceDemoClock(round, t0 + 1000)).toBeNull()
  })

  it('ends the intro with the clue clock armed', () => {
    const intro = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0 }), endsAt: t0 }
    expect(advanceDemoClock(intro, t0 - 1)).toBeNull()
    expect(advanceDemoClock(intro, t0)).toMatchObject({ phase: 'clue', endsAt: t0 + CLUE_MS })
  })

  it('burns an expired clue slot and finishes the round after the last one', () => {
    let round = startCluePhase({ ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0 }), word: 'apple' }, t0)
    let now = t0
    for (let slot = 0; slot < MAX_CLUES; slot += 1) {
      now = round.endsAt + 1
      round = advanceDemoClock(round, now)
    }
    expect(round.phase).toBe('reveal')
    expect(round.teamScore).toBe(0)
    expect(advanceDemoClock(round, now + CLUE_MS * 10)).toBeNull()
  })
})
