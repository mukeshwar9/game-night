import { describe, it, expect } from 'vitest'
import { CODE_WORDS } from './codewords'
import { isDenied } from '../wordDenylist'

describe('CODE_WORDS deck', () => {
  it('has at least 400 words', () => {
    expect(CODE_WORDS.length).toBeGreaterThanOrEqual(400)
  })

  it('is lowercase single words, 2–14 letters', () => {
    for (const w of CODE_WORDS) expect(w, w).toMatch(/^[a-z]{2,14}$/)
  })

  it('has no duplicates', () => {
    expect(new Set(CODE_WORDS).size).toBe(CODE_WORDS.length)
  })

  it('contains no denylisted word', () => {
    expect(CODE_WORDS.filter(isDenied)).toEqual([])
  })
})
