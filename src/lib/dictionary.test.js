import { describe, it, expect } from 'vitest'
import * as dictionary from './dictionary'
import { has, isAnswerWord, getAnswerList } from './dictionary'
import { isBannedWord, isFamilySafe } from './wordDenylist'

const ANSWERS = getAnswerList()

// Representative words removed from the auto-served answer list. Each one is
// still allowed as a guess unless it is banned outright.
const PROPER_NAMES = ['allan', 'barry', 'james', 'putin', 'trump', 'lohan', 'jesus', 'moses', 'oscar', 'tyler']
const BRANDS_AND_PLACES = ['pepsi', 'fedex', 'xerox', 'yahoo', 'honda', 'linux', 'texas', 'japan', 'paris', 'vegas', 'wales', 'swiss']
const WEB_SLANG_FOREIGN = ['ezine', 'howto', 'warez', 'ments', 'gonna', 'wanna', 'kinda', 'whats', 'nicht', 'homme', 'nuevo', 'thanx']
const UK_SPELLINGS = ['fibre', 'litre', 'metre', 'tyres', 'maths']
const PLAIN_PLURALS = ['acids', 'areas', 'backs', 'gives', 'makes', 'seems', 'users', 'items', 'costs', 'rules']

describe('dictionary exports', () => {
  it('keeps the same public API', () => {
    expect(Object.keys(dictionary).sort()).toEqual(['getAnswerList', 'has', 'isAnswerWord'])
  })

  it('is case-insensitive', () => {
    expect(has('CRANE')).toBe(true)
    expect(isAnswerWord('Crane')).toBe(true)
  })

  it('returns the answers in a stable order', () => {
    expect(getAnswerList()).toEqual(ANSWERS)
  })
})

describe('answer list', () => {
  it('has at least 1,500 unique five-letter words', () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(1500)
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length)
    for (const w of ANSWERS) expect(w, w).toMatch(/^[a-z]{5}$/)
  })

  it('only serves family-safe words', () => {
    expect(ANSWERS.filter(w => !isFamilySafe(w))).toEqual([])
  })

  it('every answer is a valid guess', () => {
    expect(ANSWERS.filter(w => !has(w))).toEqual([])
  })

  it('serves no proper names, brands, places or web/foreign junk', () => {
    for (const w of [...PROPER_NAMES, ...BRANDS_AND_PLACES, ...WEB_SLANG_FOREIGN]) {
      expect(isAnswerWord(w), w).toBe(false)
    }
  })

  it('prefers US spellings and drops plain -s plurals, but keeps them guessable', () => {
    for (const w of [...UK_SPELLINGS, ...PLAIN_PLURALS]) {
      expect(isAnswerWord(w), w).toBe(false)
      expect(has(w), w).toBe(true)
    }
    for (const w of ['fiber', 'liter', 'meter', 'color', 'humor']) {
      expect(isAnswerWord(w), w).toBe(true)
    }
  })

  it('keeps common words and plurals that are words in their own right', () => {
    for (const w of ['crane', 'glass', 'dress', 'jeans', 'pants', 'goods', 'means', 'chaos', 'brass', 'spicy']) {
      expect(isAnswerWord(w), w).toBe(true)
    }
  })
})

describe('valid guess list', () => {
  it('accepts no banned word as a guess', () => {
    for (const w of ['bitch', 'whore', 'dildo', 'pussy', 'porno', 'sluts', 'nigga', 'spics', 'kikes', 'twats']) {
      expect(has(w), w).toBe(false)
    }
  })

  it('still accepts innocent words the denylist once caught', () => {
    for (const w of ['spicy', 'spice', 'brass', 'class', 'japan', 'titan']) {
      expect(has(w), w).toBe(true)
    }
  })
})

// Full sweep of the valid list: reads the source so it can check every word,
// not just the samples above.
describe('valid guess list (full sweep)', () => {
  it('contains no word isBannedWord rejects', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./dictionary.js', import.meta.url), 'utf8')
    const validBlock = src.slice(src.indexOf('const _VALID'), src.indexOf('export function'))
    const words = [...validBlock.matchAll(/'([a-z]+)'/g)].map(m => m[1])
    expect(words.length).toBeGreaterThan(14000)
    expect(words.filter(isBannedWord)).toEqual([])
    expect(words.filter(w => !has(w))).toEqual([])
  })
})
