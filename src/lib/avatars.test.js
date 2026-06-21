import { describe, it, expect } from 'vitest'
import { AVATARS, isValidAvatar, defaultAvatarForId } from './avatars'

describe('avatars', () => {
  it('AVATARS is a non-empty list of unique keys', () => {
    expect(AVATARS.length).toBeGreaterThan(0)
    expect(new Set(AVATARS).size).toBe(AVATARS.length)
    for (const key of AVATARS) expect(typeof key).toBe('string')
  })

  it('isValidAvatar accepts known keys and rejects everything else', () => {
    expect(isValidAvatar(AVATARS[0])).toBe(true)
    expect(isValidAvatar('definitely-not-an-avatar')).toBe(false)
    expect(isValidAvatar('')).toBe(false)
    expect(isValidAvatar(undefined)).toBe(false)
    expect(isValidAvatar(null)).toBe(false)
  })

  it('defaultAvatarForId returns a valid avatar', () => {
    for (const id of ['abc123', 'firebase-uid-xyz', 'A', 'zzzzzzzzzz']) {
      expect(AVATARS).toContain(defaultAvatarForId(id))
    }
  })

  it('defaultAvatarForId is deterministic for the same id', () => {
    expect(defaultAvatarForId('same-id')).toBe(defaultAvatarForId('same-id'))
  })

  it('defaultAvatarForId tolerates empty / nullish ids', () => {
    expect(AVATARS).toContain(defaultAvatarForId(''))
    expect(AVATARS).toContain(defaultAvatarForId(undefined))
    expect(AVATARS).toContain(defaultAvatarForId(null))
  })

  it('spreads ids across multiple avatars (not all identical)', () => {
    const picks = new Set(Array.from({ length: 200 }, (_, i) => defaultAvatarForId(`user-${i}`)))
    expect(picks.size).toBeGreaterThan(1)
  })
})
