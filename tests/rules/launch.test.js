// Launch hardening: the abuse paths a signed-in stranger could take against the
// public lobby and shared nodes (audit probes A1-A10), the funnel counters, and
// the deletion writes behind "Delete my data". Each block says which probe it
// closes; A4 (status flips) and A10 (rooms readable by code) are covered in the
// last block because they are deliberate or handled elsewhere.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)
const FAR = 9e15
const DAY = 86_400_000
const TODAY = new Date().toISOString().slice(0, 10)
const increment = { '.sv': { increment: 1 } }

const waitingRoom = (over = {}) => ({
  ...gameNode({ x: 'mallory', visibility: 'public' }),
  createdAt: Date.now(), lastActivityAt: Date.now(), ...over,
})
const listing = (over = {}) => ({
  gameId: 'SPAM01', gameType: 'tictactoe', visibility: 'public', hostUid: 'mallory', hostName: 'Mallory',
  hostOnline: true, createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + DAY, ...over,
})

describe('A1: rooms cannot be dated into the future', () => {
  it('accepts a normal public waiting room', async () => {
    await assertSucceeds(as('mallory').ref('games/SPAM01').set(waitingRoom()))
  })
  it('rejects far-future createdAt / lastActivityAt', async () => {
    await assertFails(as('mallory').ref('games/SPAM01').set(waitingRoom({ createdAt: FAR, lastActivityAt: FAR })))
    await assertFails(as('mallory').ref('games/SPAM01').set(waitingRoom({ lastActivityAt: FAR })))
    await assertFails(as('mallory').ref('games/SPAM01').set(waitingRoom({ createdAt: Date.now() + DAY })))
  })
  it('rejects pushing an existing room’s lastActivityAt into the future', async () => {
    await put('games/R1', waitingRoom())
    await assertFails(as('mallory').ref('games/R1/lastActivityAt').set(FAR))
    await assertSucceeds(as('mallory').ref('games/R1/lastActivityAt').set(Date.now()))
  })
  it('still accepts a write to a room whose old timestamps are unchanged', async () => {
    await put('games/R2', { ...waitingRoom(), createdAt: 1, lastActivityAt: 1 })
    await assertSucceeds(as('mallory').ref('games/R2').update({ scores: { X: 1, O: 0 } }))
  })
  it('rejects a far-future join time on a seat', async () => {
    await put('games/R3', { ...gameNode({ x: 'mallory' }), createdAt: Date.now() })
    await assertFails(as('bob').ref('games/R3/players/O').set({ name: 'Bob', joinedAt: FAR, playerId: 'bob' }))
    await assertSucceeds(as('bob').ref('games/R3/players/O').set({ name: 'Bob', joinedAt: Date.now(), playerId: 'bob' }))
  })
})

describe('A2: lobby listings are bounded and named', () => {
  const seedRoom = () => put('games/SPAM01', waitingRoom())
  it('accepts an honest listing', async () => {
    await seedRoom()
    await assertSucceeds(as('mallory').ref('matchmaking/SPAM01').set(listing()))
  })
  it('accepts the republish of a room created earlier the same day', async () => {
    const created = Date.now() - 20 * 3_600_000
    await put('games/SPAM01', waitingRoom({ createdAt: created }))
    await assertSucceeds(as('mallory').ref('matchmaking/SPAM01').set(listing({ createdAt: created, expiresAt: created + DAY })))
  })
  it('rejects far-future createdAt, expiresAt and updatedAt', async () => {
    await seedRoom()
    await assertFails(as('mallory').ref('matchmaking/SPAM01').set(listing({ createdAt: FAR })))
    await assertFails(as('mallory').ref('matchmaking/SPAM01').set(listing({ expiresAt: FAR })))
    await assertFails(as('mallory').ref('matchmaking/SPAM01').set(listing({ expiresAt: Date.now() + 30 * DAY })))
    await assertFails(as('mallory').ref('matchmaking/SPAM01').set(listing({ updatedAt: FAR })))
  })
  it('rejects a listing dated long ago (it would sort under real rooms and never expire)', async () => {
    await seedRoom()
    await assertFails(as('mallory').ref('matchmaking/SPAM01').set(listing({ createdAt: Date.now() - 5 * DAY, expiresAt: Date.now() + DAY })))
  })
  it('caps and requires the host name', async () => {
    await seedRoom()
    await assertFails(as('mallory').ref('matchmaking/SPAM01').set(listing({ hostName: 'x'.repeat(41) })))
    await assertFails(as('mallory').ref('matchmaking/SPAM01').set(listing({ hostName: '' })))
  })
  it('lets the host refresh an existing listing without touching its old dates', async () => {
    const created = Date.now() - 2 * DAY
    await put('games/SPAM01', waitingRoom({ createdAt: created }))
    await put('matchmaking/SPAM01', listing({ createdAt: created, expiresAt: created + DAY }))
    await assertSucceeds(as('mallory').ref('matchmaking/SPAM01/hostOnline').set(false))
    await assertFails(as('mallory').ref('matchmaking/SPAM01/updatedAt').set(FAR))
  })
})

describe('A3: rooms accept only known keys', () => {
  it('rejects an arbitrary key, accepts known ones', async () => {
    await put('games/R1', waitingRoom())
    await assertFails(as('mallory').ref('games/R1/junk').set('x'.repeat(1024)))
    await assertSucceeds(as('mallory').ref('games/R1/scores').set({ X: 0, O: 0 }))
    await assertSucceeds(as('mallory').ref('games/R1/lastActivityAt').set(Date.now()))
  })
})

describe('A5: profile names stay length-bounded', () => {
  it('rejects empty and over-long display names (content is masked at render)', async () => {
    await assertFails(as('mallory').ref('profiles/mallory').set({ displayName: 'x'.repeat(41) }))
    await assertFails(as('mallory').ref('profiles/mallory').set({ displayName: '' }))
    await assertFails(as('mallory').ref('profiles/mallory').set({ displayName: 'ok', junk: 'x' }))
    await assertSucceeds(as('mallory').ref('profiles/mallory').set({ displayName: 'ok' }))
  })
})

describe('A6: friend requests are small and shaped', () => {
  it('rejects an extra field and a missing name', async () => {
    await assertFails(as('mallory').ref('friendRequests/victim/mallory').set({ name: 'hi', at: Date.now(), junk: 'x'.repeat(1024) }))
    await assertFails(as('mallory').ref('friendRequests/victim/mallory').set({ at: Date.now() }))
    await assertFails(as('mallory').ref('friendRequests/victim/mallory').set({ name: 'hi', at: FAR }))
    await assertSucceeds(as('mallory').ref('friendRequests/victim/mallory').set({ name: 'hi', avatar: 'cat', code: 'ABC234', at: Date.now() }))
  })
})

describe('A7: the private profile takes only known keys', () => {
  it('rejects an arbitrary key under users/{uid}', async () => {
    await assertFails(as('mallory').ref('users/mallory/junk').set('x'.repeat(1024)))
    await assertSucceeds(as('mallory').ref('users/mallory').set({ displayName: 'Mallory', isAnonymous: true, createdAt: Date.now(), updatedAt: Date.now(), theme: 'matcha' }))
  })
})

describe('A8: error reports are capped per account', () => {
  const report = () => ({ at: Date.now(), kind: 'error', msg: 'm', route: '/', build: 'b', ua: 'u', uid: 'mallory' })
  it('holds one account to 20 slots a day', async () => {
    for (let i = 0; i < 20; i++) await assertSucceeds(as('mallory').ref(`errors/${TODAY}/mallory-${i}`).set(report()))
    await assertFails(as('mallory').ref(`errors/${TODAY}/mallory-20`).set(report()))
    await assertFails(as('mallory').ref(`errors/${TODAY}/mallory-0`).set(report()))
    await assertFails(as('mallory').ref(`errors/${TODAY}/${'a'.repeat(20)}`).set(report()))
  })
})

describe('A9: chat cannot be dated into the future', () => {
  it('rejects a far-future ts', async () => {
    await put('games/R3', gameNode({ x: 'alice', extra: { createdAt: Date.now() } }))
    await assertSucceeds(as('mallory').ref('games/R3/spectators/mallory/c1').set({ name: 'm', at: Date.now() }))
    await assertFails(as('mallory').ref('games/R3/chatLog/m1').set({ by: 'mallory', name: 'Mallory', text: 'hi', ts: FAR }))
    await assertSucceeds(as('mallory').ref('games/R3/chatLog/m2').set({ by: 'mallory', name: 'Mallory', text: 'hi', ts: Date.now() }))
  })
  it('rejects a far-future spectator join', async () => {
    await put('games/R3', gameNode({ x: 'alice', extra: { createdAt: Date.now() } }))
    await assertFails(as('mallory').ref('games/R3/spectators/mallory/c1').set({ name: 'm', at: FAR }))
  })
})

describe('A4 / A10: what stays by design', () => {
  it('lets a stranger read a room they know the code of (rooms are party-game private by code)', async () => {
    await put('games/PRIV01', gameNode({ x: 'alice', visibility: 'private' }))
    const snap = await assertSucceeds(as('stranger').ref('games/PRIV01').get())
    expect(snap.val().players.X.playerId).toBe('alice')
  })
})

describe('funnelDaily: anonymous source counters', () => {
  const path = (step, source = 'instagram', campaign = 'launch1') => `funnelDaily/${TODAY}/${source}/${campaign}/${step}`
  const bump = (uid, step, source, campaign) => as(uid).ref().update({
    [path(step, source, campaign)]: increment,
    [`funnelSeen/${uid}/${step}`]: true,
  })

  it('counts each step once per account', async () => {
    await assertSucceeds(bump('alice', 'landed'))
    await assertFails(bump('alice', 'landed'))
    await assertSucceeds(bump('bob', 'landed'))
    await assertSucceeds(bump('alice', 'named'))
    await put('users/boss', { displayName: 'Boss', admin: true })
    const snap = await assertSucceeds(as('boss').ref(path('landed')).get())
    expect(snap.val()).toBe(2)
  })
  it('rejects a counter bumped without the once-per-account marker, or by more than one', async () => {
    await assertFails(as('alice').ref(path('landed')).set(increment))
    await assertFails(as('alice').ref().update({ [path('landed')]: { '.sv': { increment: 5 } }, 'funnelSeen/alice/landed': true }))
  })
  it('rejects unknown steps, bad sources and dates', async () => {
    await assertFails(bump('alice', 'joined'))
    await assertFails(bump('alice', 'landed', 'Bad Source!'))
    await assertFails(bump('alice', 'landed', 'x'.repeat(41)))
    await assertFails(as('alice').ref().update({ [`funnelDaily/today/instagram/-/landed`]: increment, 'funnelSeen/alice/landed': true }))
  })
  it('accepts the no-campaign placeholder', async () => {
    await assertSucceeds(bump('alice', 'landed', 'direct', '-'))
  })
  it('lets another account not mark someone else’s steps, and keeps counters admin-read', async () => {
    await assertFails(as('mallory').ref('funnelSeen/alice/landed').set(true))
    await put('users/boss', { displayName: 'Boss', admin: true })
    await assertFails(as('alice').ref('funnelDaily').get())
    await assertSucceeds(as('boss').ref('funnelDaily').get())
  })
})

describe('attribution on the private profile', () => {
  const touch = () => ({ source: 'instagram', medium: 'paid', campaign: 'launch1', click: 'fbclid', refHost: '', landing: '/solo/connectfour', at: Date.now() })
  it('is written once', async () => {
    await put('users/alice', { displayName: 'Alice' })
    await assertSucceeds(as('alice').ref('users/alice/attribution').set(touch()))
    await assertFails(as('alice').ref('users/alice/attribution').set({ ...touch(), source: 'tiktok' }))
    await assertFails(as('alice').ref('users/alice/attribution/junk').set('x'))
  })
})

describe('delete my data', () => {
  it('lets a user delete their own private profile, code and public copies', async () => {
    await put('users/alice', { displayName: 'Alice', code: 'ABC234' })
    await put('codes/ABC234', 'alice')
    await put('profiles/alice', { displayName: 'Alice' })
    await put('presence/alice', { online: true })
    await put('friends/alice/bob', { since: 1 })
    await put('friends/bob/alice', { since: 1 })
    for (const path of ['users/alice', 'codes/ABC234', 'profiles/alice', 'presence/alice', 'friends/bob/alice', 'friends/alice/bob']) {
      await assertSucceeds(as('alice').ref(path).remove())
    }
  })
  it('does not let one user delete another’s profile or code', async () => {
    await put('users/alice', { displayName: 'Alice', code: 'ABC234' })
    await put('codes/ABC234', 'alice')
    await assertFails(as('mallory').ref('users/alice').remove())
    await assertFails(as('mallory').ref('codes/ABC234').remove())
  })
  it('keeps the feedback cooldown: no delete-and-recreate inside 30 s', async () => {
    await put('users/alice', { displayName: 'Alice', lastFeedbackAt: Date.now() - 5000 })
    await assertFails(as('alice').ref('users/alice').remove())
    await put('users/alice', { displayName: 'Alice', lastFeedbackAt: Date.now() - 60_000 })
    await assertSucceeds(as('alice').ref('users/alice').remove())
  })
})
