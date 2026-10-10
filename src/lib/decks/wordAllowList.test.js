import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALLOW_WORDS, HANGWOMAN_ONLY_WORDS } from './wordAllowList'
import { isFamilySafe } from '../wordDenylist'
import { createDictionary, solveGrid } from '../wordhuntLogic'
import { dictionaryFromText } from '../wordhuntDictionary'
import { validateSetterWord, WORD_RULE_DICTIONARY } from '../hangmanLogic'

const TEXT = readFileSync(new URL('../../../public/wordhunt-dict.txt', import.meta.url), 'utf8')
const raw = createDictionary(TEXT.split('\n'))
const dict = dictionaryFromText(TEXT)

describe('word allow-list', () => {
  it('holds clean, unique, family-safe words that the raw list lacks', () => {
    const all = [...ALLOW_WORDS, ...HANGWOMAN_ONLY_WORDS]
    expect(new Set(all).size).toBe(all.length)
    for (const word of all) {
      expect(word, word).toMatch(/^[a-z]{3,}$/)
      expect(isFamilySafe(word), word).toBe(true)
      expect(raw.has(word), `${word} is already in wordhunt-dict.txt`).toBe(false)
    }
  })

  it('reproduces the audit gap: BIRYANI and EMAIL were refused by the raw list', () => {
    expect(validateSetterWord('BIRYANI', { rule: WORD_RULE_DICTIONARY, dictionary: raw }).reason).toBe('dictionary')
    expect(raw.has('email')).toBe(false)
  })

  it('merges every allow-list word into the shared dictionary', () => {
    for (const word of ALLOW_WORDS) expect(dict.has(word), word).toBe(true)
    expect(dict.size).toBe(raw.size + ALLOW_WORDS.length)
    expect(dict.has('aah')).toBe(true)
    expect(dict.hasPrefix('biry')).toBe(true)
  })

  it('accepts the words as Hangwoman setter words', () => {
    for (const word of ALLOW_WORDS.filter(w => w.length >= 4)) {
      expect(validateSetterWord(word, { rule: WORD_RULE_DICTIONARY, dictionary: dict }).ok, word).toBe(true)
    }
  })

  it('accepts festivals and rivers in Hangwoman but keeps them out of Word Hunt', () => {
    for (const word of HANGWOMAN_ONLY_WORDS) {
      expect(validateSetterWord(word, { rule: WORD_RULE_DICTIONARY, dictionary: dict }), word).toMatchObject({ ok: true })
      expect(dict.has(word), word).toBe(false)
    }
  })

  it('lets the Word Hunt solver find them on a grid', () => {
    // CHAI across the top row; EMAIL across row 3 and down into the corner.
    const grid = 'chai' + 'xxxx' + 'emai' + 'xxxl'
    const found = solveGrid(grid, dict)
    expect(found).toContain('chai')
    expect(found).toContain('email')
    expect(solveGrid(grid, raw)).not.toContain('chai')
  })
})
