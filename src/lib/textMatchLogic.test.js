import { describe, it, expect } from 'vitest'
import { normalizeText, singularize, matchKey, editDistance, isSameAnswer, isCloseMatch } from './textMatchLogic'

describe('normalizeText', () => {
  it('lowercases, strips accents and punctuation, maps & to and', () => {
    expect(normalizeText('  Crème Brûlée! ')).toBe('creme brulee')
    expect(normalizeText('Mac & Cheese')).toBe('mac and cheese')
    expect(normalizeText("Rock'n'roll")).toBe('rocknroll')
    expect(normalizeText('SCOTLAND.')).toBe('scotland')
  })
})

describe('singularize', () => {
  it('folds regular, -ies, -es and -oes plurals', () => {
    expect(singularize('dogs')).toBe('dog')
    expect(singularize('cows')).toBe('cow')
    expect(singularize('keys')).toBe('key')
    expect(singularize('emus')).toBe('emu')
    expect(singularize('cherries')).toBe('cherry')
    expect(singularize('strawberries')).toBe('strawberry')
    expect(singularize('tomatoes')).toBe('tomato')
    expect(singularize('boxes')).toBe('box')
    expect(singularize('glasses')).toBe('glass')
    expect(singularize('dishes')).toBe('dish')
    expect(singularize('shoes')).toBe('shoe')
  })

  it('leaves non-plurals and short words alone', () => {
    expect(singularize('bus')).toBe('bus')
    expect(singularize('gas')).toBe('gas')
    expect(singularize('news')).toBe('news')
    expect(singularize('glass')).toBe('glass')
    expect(singularize('cactus')).toBe('cactus')
    expect(singularize('cat')).toBe('cat')
  })

  it('handles common irregular plurals', () => {
    expect(singularize('mice')).toBe('mouse')
    expect(singularize('teeth')).toBe('tooth')
    expect(singularize('children')).toBe('child')
  })
})

describe('matchKey', () => {
  it('groups answers that players would call the same (regression: Herd Mind split these)', () => {
    const same = [
      ['dog', 'dogs'], ['cat', 'Cats'], ['cherry', 'cherries'], ['Strawberry', 'strawberries'],
      ['tomato', 'tomatoes'], ['mac and cheese', 'Mac & Cheese'], ['hot dog', 'hotdog'],
      ['ice cream', 'ice-cream'], ['a dog', 'dog'], ['The Beatles', 'beatles'], ['yo-yo', 'yo yo'],
    ]
    for (const [a, b] of same) expect(matchKey(a)).toBe(matchKey(b))
  })

  it('keeps different answers apart', () => {
    expect(matchKey('cat')).not.toBe(matchKey('car'))
    expect(matchKey('glass')).toBe(matchKey('glasses'))
    expect(matchKey('apple')).not.toBe(matchKey('apple pie'))
  })

  it('does not strip a lone article', () => {
    expect(matchKey('a')).toBe('a')
    expect(matchKey('')).toBe('')
  })
})

describe('editDistance', () => {
  it('computes Levenshtein distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('apple', 'aple')).toBe(1)
    expect(editDistance('same', 'same')).toBe(0)
  })

  it('stops early past max', () => {
    expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2)
  })
})

describe('isSameAnswer / isCloseMatch', () => {
  it('accepts plurals and spacing variants', () => {
    expect(isSameAnswer('cats', 'cat')).toBe(true)
    expect(isCloseMatch('icecream', 'ice cream')).toBe(true)
    expect(isCloseMatch('apples', 'apple')).toBe(true)
  })

  it('accepts one typo only on longer words', () => {
    expect(isCloseMatch('elephnt', 'elephant')).toBe(true)
    expect(isCloseMatch('car', 'cat')).toBe(false)
    expect(isCloseMatch('aple', 'apple')).toBe(false)
    expect(isCloseMatch('elepant', 'elephant', { typoMinLength: 99 })).toBe(false)
  })

  it('rejects empty input', () => {
    expect(isSameAnswer('', '')).toBe(false)
    expect(isCloseMatch('', 'dog')).toBe(false)
  })
})
