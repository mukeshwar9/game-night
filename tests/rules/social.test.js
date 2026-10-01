// The profile split (users = private, profiles = public, presence = friends)
// and the friend graph: friendships need a pending request, and a recipient
// can only clear requests, never forge one.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, seed, rulesEnvFor } from './helpers.js'
import { DEFAULTS, encodeAvatar, defaultKitAvatar } from '../../src/lib/avatarKit/catalog.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)

describe('users (private half)', () => {
  it('holds push tokens owner-only with shape check', async () => {
    const tok = { token: 'fcm-token-abc-1234567890-long-enough-value', at: 1 }
    await assertSucceeds(as('alice').ref('users/alice/fcmTokens/ab12').set(tok))
    await assertFails(as('bob').ref('users/alice/fcmTokens/ab12').set(tok))
    await assertFails(as('bob').ref('users/alice/fcmTokens/ab12').get())
    await assertFails(as('alice').ref('users/alice/fcmTokens/ab12').set({ token: 'short', at: 1 }))
    await assertFails(as('alice').ref('users/alice/fcmTokens/ab12').set({ token: tok.token }))
  })

  it('tags a push token with its platform: web, ios or android, nothing else', async () => {
    const tok = { token: 'fcm-token-abc-1234567890-long-enough-value', at: 1 }
    const at = (hash) => as('alice').ref(`users/alice/fcmTokens/${hash}`)
    for (const platform of ['web', 'ios', 'android']) {
      await assertSucceeds(at(`p-${platform}`).set({ ...tok, platform }))
    }
    // Records written before the field existed stay valid.
    await assertSucceeds(at('legacy').set(tok))
    await assertSucceeds(at('with-ua').set({ ...tok, ua: 'Mozilla/5.0', platform: 'web' }))
    for (const bad of ['windows', 'iOS', '', 'web ']) {
      await assertFails(at('bad').set({ ...tok, platform: bad }))
    }
    await assertFails(at('bad').set({ ...tok, platform: 1 }))
    await assertFails(at('bad').set({ ...tok, platform: true }))
    await assertFails(at('bad').set({ ...tok, platform: { os: 'ios' } }))
    // Still owner-only, and other keys are still refused.
    await assertFails(as('bob').ref('users/alice/fcmTokens/p-ios').set({ ...tok, platform: 'ios' }))
    await assertFails(at('bad').set({ ...tok, platform: 'ios', extra: 1 }))
  })

  it('is readable and writable by its owner only', async () => {
    await put('users/alice', { displayName: 'Alice', code: 'ABC234', stats: { wins: 3 } })
    await assertSucceeds(as('alice').ref('users/alice').get())
    await assertFails(as('bob').ref('users/alice').get())
    await assertFails(as('bob').ref('users/alice/stats').get())
    await assertSucceeds(as('alice').ref('users/alice').update({ updatedAt: 2 }))
    await assertFails(as('bob').ref('users/alice').update({ updatedAt: 2 }))
  })

  it('keeps the feedback cooldown stamp: set only to now, never deleted', async () => {
    await put('users/alice', { displayName: 'Alice', lastFeedbackAt: 1 })
    await assertFails(as('alice').ref('users/alice/lastFeedbackAt').remove())
    await assertFails(as('alice').ref('users/alice/lastFeedbackAt').set(0))
    await assertFails(as('alice').ref('users/alice').set({ displayName: 'Alice' }))
  })
})

describe('profiles (public half)', () => {
  const pub = { displayName: 'Alice', nameLower: 'alice', avatar: 'kid.p1', updatedAt: 1 }

  it('is readable by signed-in users and written by its owner', async () => {
    await assertSucceeds(as('alice').ref('profiles/alice').set(pub))
    await assertFails(as('bob').ref('profiles/alice').set(pub))
    await assertSucceeds(as('bob').ref('profiles/alice').get())
    await assertFails(as(null).ref('profiles/alice').get())
  })

  it('holds public fields only, with a non-empty name', async () => {
    await assertFails(as('alice').ref('profiles/alice').set({ ...pub, code: 'ABC234' }))
    await assertFails(as('alice').ref('profiles/alice').set({ ...pub, displayName: '' }))
    await assertFails(as('alice').ref('profiles/alice').set({ ...pub, displayName: 'x'.repeat(41) }))
  })
})

// Avatars are one string per player: the 'K1…' kit form (25 characters) lives in the same
// fields the old 'shape.tone' ids did, under the same 200-character cap.
describe('kit avatar strings', () => {
  const kit = encodeAvatar({ ...DEFAULTS, hat: 'halo', hairColor: 'holo', frame: 'neon' })

  it('is stored in the private and public profile, and survives an update', async () => {
    await put('users/alice', { displayName: 'Alice', code: 'ABC234' })
    await assertSucceeds(as('alice').ref('users/alice/avatar').set(kit))
    await assertSucceeds(as('alice').ref('profiles/alice').set({ displayName: 'Alice', nameLower: 'alice', avatar: kit, updatedAt: 1 }))
    await assertSucceeds(as('alice').ref('profiles/alice').update({ avatar: defaultKitAvatar('alice'), updatedAt: 2 }))
  })

  it('stays under the 200-character cap on profiles and invites', async () => {
    await assertFails(as('alice').ref('profiles/alice').set({ displayName: 'Alice', nameLower: 'alice', avatar: `K1${'0'.repeat(199)}`, updatedAt: 1 }))
    await put('friends/alice/bob', { since: 1 })
    await assertSucceeds(as('bob').ref('invites/alice/i1').set({ gameId: 'ABC123', gameType: 'hex', fromUid: 'bob', fromName: 'Bob', fromAvatar: kit, at: 1 }))
    await assertFails(as('bob').ref('invites/alice/i2').set({ gameId: 'ABC123', gameType: 'hex', fromUid: 'bob', fromName: 'Bob', fromAvatar: `K1${'0'.repeat(199)}`, at: 1 }))
  })

  it('is never longer than the 32 characters the leaderboard copy keeps', () => {
    if (kit.length > 32) throw new Error(`kit avatar is ${kit.length} chars`)
  })
})

describe('presence (friends only)', () => {
  it('is written by its owner and readable by them and their friends', async () => {
    await assertSucceeds(as('alice').ref('presence/alice').set({ online: true, lastSeen: 1 }))
    await assertFails(as('bob').ref('presence/alice').set({ online: false, lastSeen: 1 }))
    await assertFails(as('bob').ref('presence/alice').get())
    await put('friends/alice/bob', { since: 1 })
    await assertSucceeds(as('bob').ref('presence/alice').get())
    await assertSucceeds(as('alice').ref('presence/alice').get())
    await assertFails(as('alice').ref('presence/alice/code').set('ABC234'))
  })
})

describe('friend codes', () => {
  it('only takes well-formed codes', async () => {
    await assertFails(as('alice').ref('codes/abc').set('alice'))
    await assertSucceeds(as('alice').ref('codes/ABC234ABC234').set('alice'))
  })
})

describe('friend requests and friendships', () => {
  it('denies a recipient forging an incoming request (and so a friendship)', async () => {
    await assertFails(as('mallory').ref('friendRequests/mallory/alice').set({ name: 'Alice', at: 1 }))
    await assertFails(as('mallory').ref().update({
      'friends/mallory/alice': { since: 1 }, 'friends/alice/mallory': { since: 1 },
    }))
  })

  it('denies a request to yourself', async () => {
    await assertFails(as('alice').ref('friendRequests/alice/alice').set({ name: 'Alice', at: 1 }))
  })

  it('lets the recipient accept a real request in one multi-path update', async () => {
    await put('friendRequests/alice/bob', { name: 'Bob', at: 1 })
    await assertSucceeds(as('alice').ref().update({
      'friends/alice/bob': { since: 2 }, 'friends/bob/alice': { since: 2 }, 'friendRequests/alice/bob': null,
    }))
  })

  it('lets either side remove the friendship', async () => {
    await put('friends', { alice: { bob: { since: 1 } }, bob: { alice: { since: 1 } } })
    await assertSucceeds(as('bob').ref().update({ 'friends/alice/bob': null, 'friends/bob/alice': null }))
  })

  it('caps request and invite fields', async () => {
    await assertFails(as('bob').ref('friendRequests/alice/bob').set({ name: 'Bob', avatar: 'x'.repeat(201), at: 1 }))
    await put('friends/alice/bob', { since: 1 })
    await assertFails(as('bob').ref('invites/alice/i1').set({ gameId: 'x'.repeat(41), fromUid: 'bob', fromName: 'Bob', at: 1 }))
    await assertSucceeds(as('bob').ref('invites/alice/i1').set({ gameId: 'ABC123', gameType: 'hex', fromUid: 'bob', fromName: 'Bob', fromAvatar: 'kid.p2', at: 1 }))
  })
})

describe('blocks (synced block list)', () => {
  const blocked = { name: 'Mal', at: Date.now() }
  const invite = (from) => ({ gameId: 'g1', gameType: 'tictactoe', fromUid: from, fromName: 'Bob', at: 1 })

  it('is owner-only to read and write, with a shape check', async () => {
    await assertSucceeds(as('alice').ref('blocks/alice/mal').set(blocked))
    await assertSucceeds(as('alice').ref('blocks/alice').get())
    await assertFails(as('bob').ref('blocks/alice').get())
    await assertFails(as('bob').ref('blocks/alice/bob').set(blocked))
    await assertFails(as('alice').ref('blocks/alice/alice').set(blocked))
    await assertFails(as('alice').ref('blocks/alice/mal').set({ name: 'x'.repeat(41), at: 1 }))
    await assertFails(as('alice').ref('blocks/alice/mal').set({ name: 'Mal' }))
    await assertFails(as('alice').ref('blocks/alice/mal').set({ ...blocked, junk: 1 }))
    await assertSucceeds(as('alice').ref('blocks/alice/mal').remove())
  })

  it('refuses a friend request from someone the recipient blocked', async () => {
    await put('blocks/alice/mal', blocked)
    await assertFails(as('mal').ref('friendRequests/alice/mal').set({ name: 'Mal', at: Date.now() }))
    await assertSucceeds(as('bob').ref('friendRequests/alice/bob').set({ name: 'Bob', at: Date.now() }))
  })

  it('refuses a friend request to someone the sender blocked', async () => {
    await put('blocks/mal/alice', { name: 'Alice', at: 1 })
    await assertFails(as('mal').ref('friendRequests/alice/mal').set({ name: 'Mal', at: Date.now() }))
  })

  it('still lets the blocked sender withdraw a request and the recipient clear one', async () => {
    await put('friendRequests/alice/mal', { name: 'Mal', at: 1 })
    await put('blocks/alice/mal', blocked)
    await assertSucceeds(as('alice').ref('friendRequests/alice/mal').remove())
    await put('friendRequests/alice/mal', { name: 'Mal', at: 1 })
    await assertSucceeds(as('mal').ref('friendRequests/alice/mal').remove())
  })

  it('refuses an invite from a blocked friend, in either direction', async () => {
    await put('friends/alice/bob', { since: 1 })
    await put('friends/bob/alice', { since: 1 })
    await assertSucceeds(as('bob').ref('invites/alice/i0').set(invite('bob')))
    await put('blocks/alice/bob', { name: 'Bob', at: 1 })
    await assertFails(as('bob').ref('invites/alice/i1').set(invite('bob')))
    await put('blocks/alice/bob', null)
    await put('blocks/bob/alice', { name: 'Alice', at: 1 })
    await assertFails(as('bob').ref('invites/alice/i2').set(invite('bob')))
  })

  it('lets the recipient dismiss an invite while a block exists', async () => {
    await put('invites/alice/i1', invite('bob'))
    await put('blocks/alice/bob', { name: 'Bob', at: 1 })
    await assertSucceeds(as('alice').ref('invites/alice/i1').remove())
  })
})
