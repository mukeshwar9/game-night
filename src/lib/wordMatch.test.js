import { describe, it, expect } from 'vitest'
import { normalizeWord, isSingleWord, stemWord, sameFamily, overlapsWord } from './wordMatch'

describe('normalizeWord', () => {
  it('lowercases, strips accents and non-letters', () => {
    expect(normalizeWord('  Crème-Brûlée! ')).toBe('cremebrulee')
    expect(normalizeWord("O'Clock")).toBe('oclock')
    expect(normalizeWord(null)).toBe('')
  })
})

describe('isSingleWord', () => {
  it('accepts plain, hyphenated and apostrophe words', () => {
    for (const w of ['apple', 'Apple', 't-rex', "o'clock", 'café', ' ocean ']) expect(isSingleWord(w), w).toBe(true)
  })
  it('rejects spaces, digits, symbols and empties', () => {
    for (const w of ['ice cream', 'r2d2', 'hi!', '', '-', 'a--b', null]) expect(isSingleWord(w), String(w)).toBe(false)
  })
})

describe('stemWord', () => {
  it('folds plurals', () => {
    expect(stemWord('cats')).toBe(stemWord('cat'))
    expect(stemWord('boxes')).toBe(stemWord('box'))
    expect(stemWord('berries')).toBe(stemWord('berry'))
    expect(stemWord('churches')).toBe(stemWord('church'))
  })
  it('folds -ing / -ed / silent e', () => {
    expect(stemWord('running')).toBe(stemWord('run'))
    expect(stemWord('baked')).toBe(stemWord('bake'))
    expect(stemWord('baking')).toBe(stemWord('bake'))
    expect(stemWord('jumped')).toBe(stemWord('jump'))
  })
  it('leaves -ss / -us / -is and short words alone', () => {
    expect(stemWord('glass')).toBe('glass')
    expect(stemWord('bus')).toBe('bus')
    expect(stemWord('octopus')).toBe('octopus')
    expect(stemWord('tennis')).toBe('tennis')
    expect(stemWord('ice')).toBe('ice')
  })
})

describe('sameFamily', () => {
  it('matches case, plural and ending variants', () => {
    expect(sameFamily('Fruit', 'fruits')).toBe(true)
    expect(sameFamily('SWIM', 'swimming')).toBe(true)
    expect(sameFamily('Pony', 'ponies')).toBe(true)
  })
  it('keeps different words apart', () => {
    expect(sameFamily('fruit', 'apple')).toBe(false)
    expect(sameFamily('car', 'cart')).toBe(false)
    expect(sameFamily('', '')).toBe(false)
  })
})

describe('overlapsWord', () => {
  it('flags compounds built on a 4+ letter word', () => {
    expect(overlapsWord('fire', 'firefly')).toBe(true)
    expect(overlapsWord('sunflower', 'flower')).toBe(true)
    expect(overlapsWord('Apples', 'apple')).toBe(true)
  })
  it('does not flag short words inside long ones', () => {
    expect(overlapsWord('ant', 'elephant')).toBe(false)
    expect(overlapsWord('car', 'scary')).toBe(false)
    expect(overlapsWord('moon', 'ocean')).toBe(false)
  })
})
