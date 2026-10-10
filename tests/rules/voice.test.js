// Party voice: the client directory voice/{gameId}/{uid} is owner-written and
// member-read (a member may only flip someone's hostMuted); the server's
// session records (voiceSessions, voiceUsers) are never readable or writable
// by a client, so nobody can see or spoof another person's SFU session.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, partyNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)
const entry = (over = {}) => ({ on: true, muted: false, at: 1, ...over })

describe('voice directory', () => {
  it('lets a party member publish their own entry and members read it', async () => {
    await put('games/p1', partyNode({ uids: ['alice', 'bob'], extra: { partyRoom: true } }))
    await assertSucceeds(as('alice').ref('voice/p1/alice').set(entry()))
    await assertSucceeds(as('bob').ref('voice/p1').get())
    await assertFails(as('mallory').ref('voice/p1').get())
  })

  it('denies writing someone else’s entry, extra fields, and non-members', async () => {
    await put('games/p1', partyNode({ uids: ['alice', 'bob'], extra: { partyRoom: true } }))
    await assertFails(as('bob').ref('voice/p1/alice').set(entry()))
    await assertFails(as('alice').ref('voice/p1/alice').set(entry({ sessionId: 'S1' })))
    await assertFails(as('mallory').ref('voice/p1/mallory').set(entry()))
  })

  it('denies voice in public rooms, non-party rooms, and for removed members', async () => {
    await put('games/p1', partyNode({ uids: ['alice'], extra: { partyRoom: true, visibility: 'public' } }))
    await assertFails(as('alice').ref('voice/p1/alice').set(entry()))
    await put('games/p2', partyNode({ uids: ['alice'] }))
    await assertFails(as('alice').ref('voice/p2/alice').set(entry()))
    await put('games/p3', partyNode({ uids: ['alice', 'bob'], extra: { partyRoom: true, removed: { bob: true } } }))
    await put('voice/p3/bob', entry())
    await assertFails(as('bob').ref('voice/p3/bob').set(entry({ muted: true })))
    await assertSucceeds(as('bob').ref('voice/p3/bob').remove())
  })

  it('lets a queued party member use voice while the party plays a 2P game', async () => {
    await put('games/g1', gameNode({ x: 'alice', o: 'bob', status: 'playing', extra: { partyRoom: true, queue: { carol: { name: 'carol', playerId: 'carol', joinedAt: 3, at: 4 } } } }))
    await assertSucceeds(as('carol').ref('voice/g1/carol').set(entry()))
    await assertSucceeds(as('alice').ref('voice/g1').get())
  })

  it('lets any member set hostMuted on someone’s entry (a soft mute), nothing else', async () => {
    await put('games/p1', partyNode({ uids: ['alice', 'bob'], extra: { partyRoom: true } }))
    await put('voice/p1/bob', entry())
    await assertSucceeds(as('alice').ref('voice/p1/bob/hostMuted').set(true))
    await assertFails(as('alice').ref('voice/p1/bob/on').set(false))
    await assertFails(as('mallory').ref('voice/p1/bob/hostMuted').set(true))
  })
})

describe('voice server records', () => {
  it('are never readable or writable by a client', async () => {
    await put('voiceSessions/p1/alice', { sessionId: 'S1', trackName: 'mic-a', mid: '0', attempt: 'a1', at: 1 })
    await put('voiceUsers/alice', { gameId: 'p1' })
    await assertFails(as('alice').ref('voiceSessions/p1/alice').get())
    await assertFails(as('alice').ref('voiceSessions/p1/alice').set({ sessionId: 'S2' }))
    await assertFails(as('bob').ref('voiceSessions/p1').get())
    await assertFails(as('alice').ref('voiceUsers/alice').get())
    await assertFails(as('alice').ref('voiceUsers/alice').set({ gameId: 'p2' }))
  })
})
