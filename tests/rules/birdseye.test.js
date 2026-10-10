// BIRDSEYE duel room inputs: a fort index and an append-only, turn-owned
// list of integer shots ({ by, b, a, p, k }) every client replays.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { quantShot } from '../../src/lib/birdseyeCore.js'
import { assertFails, assertSucceeds, dbAs, gameNode, rulesEnvFor, seed } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const shot = (by = 'X', over = {}) => ({ by, ...quantShot('pip', 0.6, 0.8, -1), ...over })
const duel = (extra = {}) => gameNode({ x: 'alice', o: 'bob', status: 'playing', extra: {
  gameType: 'birdseye', currentTurn: 'X', bsFort: 0, ...extra,
} })

const put = (room) => seed(T.env, 'games/g1', room)

describe('BIRDSEYE', () => {
  it('accepts the current seat’s bounded shot and rejects forged, out-of-turn or malformed ones', async () => {
    await put(duel())
    await assertSucceeds(as('alice').ref('games/g1/bsShots/-Oabc123').set(shot('X')))
    await assertFails(as('bob').ref('games/g1/bsShots/-Oabc124').set(shot('X')))
    await assertFails(as('bob').ref('games/g1/bsShots/-Oabc124').set(shot('O')))
    await assertFails(as('mallory').ref('games/g1/bsShots/-Oabc124').set(shot('X')))
    await assertFails(as('alice').ref('games/g1/bsShots/-Oabc124').set(shot('X', { b: 'eagle' })))
    await assertFails(as('alice').ref('games/g1/bsShots/-Oabc124').set(shot('X', { p: 1001 })))
    await assertFails(as('alice').ref('games/g1/bsShots/-Oabc124').set(shot('X', { a: 913 })))
    await assertFails(as('alice').ref('games/g1/bsShots/-Oabc124').set(shot('X', { a: -111 })))
    await assertFails(as('alice').ref('games/g1/bsShots/-Oabc124').set(shot('X', { k: 541 })))
    await assertFails(as('alice').ref('games/g1/bsShots/-Oabc124').set(shot('X', { a: 10.5 })))
    await assertFails(as('alice').ref('games/g1/bsShots/-Oabc124').set(shot('X', { note: 'hi' })))
    await assertFails(as('alice').ref('games/g1/bsShots/-Oabc124').set({ by: 'X', b: 'pip', a: 10, p: 500 }))
  })

  it('accepts the boundary values normalizeShot accepts', async () => {
    await put(duel())
    await assertSucceeds(as('alice').ref('games/g1/bsShots/lo').set(shot('X', { a: -110, p: 0, k: -1 })))
    await put(duel())
    await assertSucceeds(as('alice').ref('games/g1/bsShots/hi').set(shot('X', { a: 912, p: 1000, k: 540 })))
  })

  it('keeps a recorded shot’s fields immutable', async () => {
    await put(duel({ currentTurn: 'O', bsShots: { s1: shot('X') } }))
    await assertFails(as('alice').ref('games/g1/bsShots/s1/p').set(1000))
  })

  it('allows the room transaction to append a shot and flip the turn atomically', async () => {
    await put(duel())
    await assertSucceeds(as('alice').ref('games/g1').transaction(current => ({
      ...current, bsShots: { ...(current?.bsShots || {}), s1: shot('X') }, currentTurn: 'O',
    })))
    // the rival's reply re-sends the unchanged first shot without tripping validation
    await assertSucceeds(as('bob').ref('games/g1').transaction(current => ({
      ...current, bsShots: { ...current?.bsShots, s2: shot('O') }, currentTurn: 'X',
    })))
    // a chat line from a bystander seat does not invalidate the unchanged shots
    await assertSucceeds(as('alice').ref('games/g1').transaction(current => ({ ...current, lastActivityAt: Date.now() })))
  })

  it('refuses shots on a room that is not a birdseye game', async () => {
    await put(duel({ gameType: 'artillery' }))
    await assertFails(as('alice').ref('games/g1/bsShots/s1').set(shot('X')))
  })

  it('bounds the fort index and lets the room clear both keys', async () => {
    await put(duel())
    await assertSucceeds(as('alice').ref('games/g1/bsFort').set(4))
    await assertFails(as('alice').ref('games/g1/bsFort').set(5))
    await assertFails(as('alice').ref('games/g1/bsFort').set(-1))
    await assertFails(as('alice').ref('games/g1/bsFort').set(1.5))
    await assertFails(as('alice').ref('games/g1/bsFort').set('2'))
    await put(duel({ bsShots: { s1: shot('X') } }))
    await assertSucceeds(as('alice').ref('games/g1').update({ bsFort: 2, bsShots: null }))
  })
})
