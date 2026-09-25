import { describe, it, expect } from 'vitest'
import { isBannedWord, isFamilySafe, familySafeOnly, wordForms } from './wordDenylist'

describe('isBannedWord', () => {
  it('bans the G-01 examples and their inflections', () => {
    for (const w of ['nigger', 'niggers', 'cunt', 'cunts', 'fuck', 'fucking', 'motherfucking', 'faggot', 'faggots', 'kike', 'spics', 'retarded', 'whores', 'bitches', 'dildo']) {
      expect(isBannedWord(w), w).toBe(true)
    }
  })

  it('does not ban innocent words that merely share letters', () => {
    for (const w of ['spice', 'japan', 'japes', 'cocktail', 'assassin', 'class', 'scrap', 'button', 'shiver', 'dickens', 'titan', 'bass', 'grape', 'therapist', 'niggle']) {
      expect(isBannedWord(w), w).toBe(false)
    }
  })

  it('does not ban homographs outright (players may find them)', () => {
    for (const w of ['tit', 'ass', 'cock', 'dick', 'balls']) expect(isBannedWord(w), w).toBe(false)
  })
})

describe('isFamilySafe', () => {
  it('rejects banned, sensitive and homograph words', () => {
    for (const w of ['nigger', 'bitch', 'dicks', 'boobs', 'dildo', 'negro', 'rapes', 'tits', 'cocks']) {
      expect(isFamilySafe(w), w).toBe(false)
    }
  })

  it('keeps ordinary words', () => {
    for (const w of ['apple', 'crane', 'planet', 'teacher', 'glass', 'passes', 'titan', 'scrape']) {
      expect(isFamilySafe(w), w).toBe(true)
    }
  })

  it('filters a list', () => {
    expect(familySafeOnly(['apple', 'boobs', 'crane', 'dicks'])).toEqual(['apple', 'crane'])
  })
})

describe('wordForms', () => {
  it('includes the word and plausible roots', () => {
    expect(wordForms('slurring')).toContain('slur')
    expect(wordForms('cherries')).toContain('cherry')
    expect(wordForms('dogs')).toContain('dog')
  })
})
