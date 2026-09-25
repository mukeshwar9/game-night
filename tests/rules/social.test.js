// The profile split (users = private, profiles = public, presence = friends)
// and the friend graph: friendships need a pending request, and a recipient
// can only clear requests, never forge one.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)

describe('users (private half)', () => {
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
