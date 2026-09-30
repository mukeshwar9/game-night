import { describe, expect, it } from 'vitest'
import { CALLSIGN_WORDS_4, CALLSIGN_WORDS_5, callsignWords } from './callsignWords'
import { isBannedWord, isFamilySafe } from '../wordDenylist'
import { isDenied } from '../moderationDenylist'

describe('callsign word lists', () => {
  it.each([[4, CALLSIGN_WORDS_4], [5, CALLSIGN_WORDS_5]])('%i-letter list: enough uppercase A-Z words, right length, unique', (len, list) => {
    expect(list.length).toBeGreaterThanOrEqual(60)
    expect(new Set(list).size).toBe(list.length)
    list.forEach(w => {
      expect(w, w).toMatch(/^[A-Z]+$/)
      expect(w, w).toHaveLength(len)
    })
  })

  it('no word is banned, family-unsafe or on the moderation denylist', () => {
    for (const w of [...CALLSIGN_WORDS_4, ...CALLSIGN_WORDS_5]) {
      expect(isBannedWord(w), w).toBe(false)
      expect(isFamilySafe(w), w).toBe(true)
      expect(isDenied(w), w).toBe(false)
    }
  })

  it('callsignWords picks the list by length', () => {
    expect(callsignWords(4)).toBe(CALLSIGN_WORDS_4)
    expect(callsignWords(5)).toBe(CALLSIGN_WORDS_5)
  })
})
