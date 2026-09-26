import { describe, it, expect } from 'vitest'
import { JUST_ONE_WORDS } from './justone'
import { isDenied } from '../moderationDenylist'

describe('JUST_ONE_WORDS deck', () => {
  it('has at least 300 words', () => {
    expect(JUST_ONE_WORDS.length).toBeGreaterThanOrEqual(300)
  })

  it('is lowercase single words, 2–14 letters', () => {
    for (const w of JUST_ONE_WORDS) expect(w, w).toMatch(/^[a-z]{2,14}$/)
  })

  it('has no duplicates', () => {
    expect(new Set(JUST_ONE_WORDS).size).toBe(JUST_ONE_WORDS.length)
  })

  it('contains no denylisted word', () => {
    expect(JUST_ONE_WORDS.filter(isDenied)).toEqual([])
  })
})
