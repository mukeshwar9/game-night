import { describe, it, expect } from 'vitest'
import { DENYLIST, isDenied, normalizeForDenylist } from './wordDenylist'

describe('DENYLIST', () => {
  it('is a non-trivial set of normalized lowercase a-z entries', () => {
    expect(DENYLIST).toBeInstanceOf(Set)
    expect(DENYLIST.size).toBeGreaterThan(200)
    for (const word of DENYLIST) {
      expect(word, word).toMatch(/^[a-z]+$/)
      expect(normalizeForDenylist(word)).toBe(word)
    }
  })

  it('covers the entries flagged by the G-01 review', () => {
    for (const word of ['cunt', 'fuck', 'slut', 'whore']) expect(DENYLIST.has(word), word).toBe(true)
  })

  it('lists inflections explicitly', () => {
    for (const word of ['fucking', 'fucked', 'sluts', 'whores', 'raped', 'rapist', 'faggots', 'niggers']) {
      expect(DENYLIST.has(word), word).toBe(true)
    }
  })
})

describe('normalizeForDenylist', () => {
  it('lowercases, strips accents and non-letters', () => {
    expect(normalizeForDenylist('  Crème-Brûlée! ')).toBe('cremebrulee')
    expect(normalizeForDenylist(null)).toBe('')
    expect(normalizeForDenylist(42)).toBe('')
  })
})

describe('isDenied', () => {
  it('matches regardless of case, whitespace and punctuation', () => {
    expect(isDenied('FUCK')).toBe(true)
    expect(isDenied(' Whore ')).toBe(true)
    expect(isDenied('f.u.c.k')).toBe(true)
    expect(isDenied('s-l-u-t')).toBe(true)
    expect(isDenied('Faggot!')).toBe(true)
  })

  it('matches accented and look-alike spellings', () => {
    expect(isDenied('sh1t')).toBe(true)
    expect(isDenied('b!tch')).toBe(true)
    expect(isDenied('a$$hole')).toBe(true)
    expect(isDenied('n1gger')).toBe(true)
    expect(isDenied('cünt')).toBe(true)
    expect(isDenied('wh0re')).toBe(true)
  })

  it('matches stretched letters', () => {
    expect(isDenied('fuuuuuck')).toBe(true)
    expect(isDenied('shiiiit')).toBe(true)
    expect(isDenied('cooooon')).toBe(true)
  })

  it('does not flag innocent words that merely contain or resemble a denied term', () => {
    const innocent = [
      'scunthorpe', 'therapist', 'grape', 'drape', 'cocktail', 'peacock', 'cockpit', 'cocky',
      'spice', 'spicy', 'spiced', 'japan', 'jape', 'japes', 'japed', 'dickens', 'assassin', 'class',
      'bass', 'passage', 'shiitake', 'analysis', 'button', 'hancock', 'con', 'cocoon', 'raccoon',
      'tit', 'title', 'poof', 'nigh', 'sextet', 'essex', 'cumin', 'document', 'scrap', 'crap', 'hell',
    ]
    for (const word of innocent) expect(isDenied(word), word).toBe(false)
  })

  it('is whole-word only (callers tokenize sentences themselves)', () => {
    expect(isDenied('what the fuck')).toBe(false)
    expect(isDenied('fuck')).toBe(true)
  })

  it('handles empty and non-string input', () => {
    expect(isDenied('')).toBe(false)
    expect(isDenied(null)).toBe(false)
    expect(isDenied(undefined)).toBe(false)
    expect(isDenied(12345)).toBe(false)
    expect(isDenied('!!!')).toBe(false)
  })
})
