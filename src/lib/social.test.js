import { describe, it, expect } from 'vitest'
import {
  randomFriendCode, normalizeFriendCode, isValidFriendCode,
  CODE_ALPHABET, CODE_LENGTH, isGuestStyleName, freshInvites, INVITE_TTL_MS, guestName,
  publicProfile, mergeFriendProfile,
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

describe('isGuestStyleName', () => {
  it('flags empty and placeholder names', () => {
    expect(isGuestStyleName('')).toBe(true)
    expect(isGuestStyleName(null)).toBe(true)
    expect(isGuestStyleName('Guest-AB12')).toBe(true)
    expect(isGuestStyleName(' guest-ab12 ')).toBe(true)
    expect(isGuestStyleName(guestName('xyz9abcdef'))).toBe(true)
  })

  it('accepts chosen names, including ones that merely start with Guest', () => {
    expect(isGuestStyleName('Alice')).toBe(false)
    expect(isGuestStyleName('Guest-ABCDE')).toBe(false)
    expect(isGuestStyleName('Guesty')).toBe(false)
  })
})

describe('freshInvites', () => {
  const now = 1_000_000_000
  it('drops invites older than 24 h and ones without a timestamp, newest first', () => {
    const val = {
      a: { gameId: 'A', at: now - 1000 },
      b: { gameId: 'B', at: now - INVITE_TTL_MS - 1 },
      c: { gameId: 'C', at: now - 10 },
      d: { gameId: 'D' },
      e: { gameId: 'E', at: now - INVITE_TTL_MS },
    }
    expect(freshInvites(val, now).map(i => i.id)).toEqual(['c', 'a', 'e'])
  })

  it('handles an empty node', () => {
    expect(freshInvites(null, now)).toEqual([])
  })
})

describe('profile split', () => {
  it('publicProfile keeps only the public fields, trimmed and capped', () => {
    const p = { displayName: '  Ada  ', avatar: 'kid.p1', code: 'ABC234', stats: { wins: 3 }, online: true }
    expect(publicProfile(p, 5)).toEqual({ displayName: 'Ada', nameLower: 'ada', avatar: 'kid.p1', updatedAt: 5 })
    expect(publicProfile({ displayName: 'x'.repeat(60) }, 5).displayName).toHaveLength(40)
  })

  it('publicProfile has nothing to publish without a name', () => {
    expect(publicProfile(null)).toBeNull()
    expect(publicProfile({ displayName: '   ', avatar: 'kid.p1' })).toBeNull()
  })

  it('mergeFriendProfile adds presence, and reads a missing presence as offline', () => {
    const pub = { displayName: 'Ada', avatar: 'kid.p1' }
    expect(mergeFriendProfile(pub, { online: true, lastSeen: 9 })).toEqual({ ...pub, online: true, lastSeen: 9 })
    expect(mergeFriendProfile(pub, null)).toEqual({ ...pub, online: false, lastSeen: null })
    expect(mergeFriendProfile(null, null)).toBeNull()
  })
})
