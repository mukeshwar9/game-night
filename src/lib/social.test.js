import { describe, it, expect } from 'vitest'
import {
  randomFriendCode, normalizeFriendCode, isValidFriendCode,
  CODE_ALPHABET, CODE_LENGTH,
} from './social'

describe('friend codes', () => {
  it('randomFriendCode returns CODE_LENGTH chars, all from the alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = randomFriendCode()
      expect(code).toHaveLength(CODE_LENGTH)
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch)
    }
  })

  it('randomFriendCode is deterministic given a seeded rng', () => {
    expect(randomFriendCode(() => 0)).toBe(CODE_ALPHABET[0].repeat(CODE_LENGTH))
    expect(randomFriendCode(() => 0.999999)).toBe(CODE_ALPHABET[CODE_ALPHABET.length - 1].repeat(CODE_LENGTH))
  })

  it('alphabet excludes ambiguous characters (0/O, 1/I/L)', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      expect(CODE_ALPHABET).not.toContain(ch)
    }
  })

  it('normalizeFriendCode uppercases and drops separators', () => {
    expect(normalizeFriendCode('abc234')).toBe('ABC234')
    expect(normalizeFriendCode(' a b c 2 3 4 ')).toBe('ABC234')
    expect(normalizeFriendCode('ab-cd-23')).toBe('ABCD23')
  })

  it('normalizeFriendCode strips ambiguous chars and caps length', () => {
    expect(normalizeFriendCode('OIL010')).toBe('')          // all excluded
    expect(normalizeFriendCode('ABCDEFGH')).toBe('ABCDEF')  // capped at 6
    expect(normalizeFriendCode('A1B0C2')).toBe('ABC2')      // 1 and 0 dropped
  })

  it('normalizeFriendCode handles nullish input', () => {
    expect(normalizeFriendCode(undefined)).toBe('')
    expect(normalizeFriendCode(null)).toBe('')
  })

  it('isValidFriendCode requires exactly 6 in-alphabet chars', () => {
    expect(isValidFriendCode('ABC234')).toBe(true)
    expect(isValidFriendCode('ABC23')).toBe(false)   // too short
    expect(isValidFriendCode('ABC2345')).toBe(false) // too long
    expect(isValidFriendCode('ABC23O')).toBe(false)  // O not allowed
    expect(isValidFriendCode('abc234')).toBe(false)  // lowercase not in alphabet
    expect(isValidFriendCode('')).toBe(false)
    expect(isValidFriendCode(undefined)).toBe(false)
  })

  it('a normalized random code is always valid', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidFriendCode(normalizeFriendCode(randomFriendCode()))).toBe(true)
    }
  })
})
