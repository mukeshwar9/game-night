import { describe, expect, it } from 'vitest'
import { PASSWORD_DECK } from './decks/password'
import { MAX_CLUES, validateClue } from './passwordLogic'
import { BOT_CLUE_DECK, BOT_GUESS_ACCURACY, pickBotClue, pickBotGuess } from './passwordBot'

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
