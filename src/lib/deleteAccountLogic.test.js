import { describe, expect, it } from 'vitest'
import { deletionPatch } from './deleteAccountLogic'

describe('deletionPatch', () => {
  it('nulls every node keyed by the uid', () => {
    const patch = deletionPatch('u1')
    expect(patch).toMatchObject({ 'profiles/u1': null, 'presence/u1': null, 'blocks/u1': null, 'funnelSeen/u1': null })
  })
  it('deletes friendships in both directions, requests, invites and the friend code', () => {
    const patch = deletionPatch('u1', { friendUids: ['a', 'b'], requestUids: ['c'], inviteIds: ['i1'], code: 'ABC234' })
    expect(patch['friends/u1/a']).toBeNull()
    expect(patch['friends/a/u1']).toBeNull()
    expect(patch['friends/b/u1']).toBeNull()
    expect(patch['friendRequests/u1/c']).toBeNull()
    expect(patch['invites/u1/i1']).toBeNull()
    expect(patch['codes/ABC234']).toBeNull()
  })
  it('only ever writes null and never touches another user’s other data', () => {
    const patch = deletionPatch('u1', { friendUids: ['a'], code: 'ABC234' })
    for (const [path, value] of Object.entries(patch)) {
      expect(value).toBeNull()
      expect(path.includes('u1') || path.startsWith('codes/')).toBe(true)
    }
  })
  it('does nothing without a uid, and skips a missing code', () => {
    expect(deletionPatch('')).toEqual({})
    expect(Object.keys(deletionPatch('u1', { code: null })).some(k => k.startsWith('codes/'))).toBe(false)
  })
})
