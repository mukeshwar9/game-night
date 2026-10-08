// Rules for the arrival moment: the anonymous `arriving/{uid}` stamp ("someone
// opened your link") and the `startsAt` server timestamp that starts the 3·2·1
// before a duel's first move.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, partyNode, seed, rulesEnvFor } from './helpers.js'

const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'
const MALLORY = 'mallory'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)
const stamp = () => ({ '.sv': 'timestamp' })

describe('arriving signal', () => {
  it('lets a signed-in stranger stamp their own uid with the server time', async () => {
    await put('games/g1', gameNode({ x: ALICE }))
    await assertSucceeds(as(CAROL).ref(`games/g1/arriving/${CAROL}`).set(stamp()))
  })

  it('denies stamping someone else’s uid', async () => {
    await put('games/g1', gameNode({ x: ALICE }))
    await assertFails(as(CAROL).ref(`games/g1/arriving/${MALLORY}`).set(stamp()))
    await assertFails(as(MALLORY).ref(`games/g1/arriving/${CAROL}`).set(stamp()))
  })

  it('denies anything but a server timestamp (no names, no objects, no fake times)', async () => {
    await put('games/g1', gameNode({ x: ALICE }))
    await assertFails(as(CAROL).ref(`games/g1/arriving/${CAROL}`).set({ name: 'Carol', at: 1 }))
    await assertFails(as(CAROL).ref(`games/g1/arriving/${CAROL}`).set('hi'))
    await assertFails(as(CAROL).ref(`games/g1/arriving/${CAROL}`).set(12345))
  })

  it('denies signalling a room that does not exist', async () => {
    await assertFails(as(CAROL).ref(`games/nope/arriving/${CAROL}`).set(stamp()))
  })

  it('denies signed-out visitors', async () => {
    await put('games/g1', gameNode({ x: ALICE }))
    await assertFails(as(null).ref('games/g1/arriving/anon').set(stamp()))
  })

  it('lets the visitor take their own stamp back', async () => {
    await put('games/g1', gameNode({ x: ALICE, extra: { arriving: { [CAROL]: 5 } } }))
    await assertSucceeds(as(CAROL).ref(`games/g1/arriving/${CAROL}`).remove())
  })

  it('lets a room member clear a stamp; a stranger cannot clear someone else’s', async () => {
    await put('games/g1', gameNode({ x: ALICE, extra: { arriving: { [CAROL]: 5 } } }))
    await assertFails(as(MALLORY).ref(`games/g1/arriving/${CAROL}`).remove())
    await assertSucceeds(as(ALICE).ref(`games/g1/arriving/${CAROL}`).remove())
  })

  it('lets a party member clear it too', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB], extra: { arriving: { [CAROL]: 5 } } }))
    await assertSucceeds(as(BOB).ref(`games/g1/arriving/${CAROL}`).remove())
  })

  it('keeps a whole-room write valid while a stamp is present (unchanged children re-validate)', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, extra: { arriving: { [CAROL]: 5 } } }))
    await assertSucceeds(as(ALICE).ref('games/g1').update({ lastActivityAt: 2 }))
    // A rematch's FIELD_NULLS wipe takes the stamps with it.
    await assertSucceeds(as(ALICE).ref('games/g1').update({ arriving: null, startsAt: null }))
  })
})

describe('startsAt', () => {
  it('lets the seat that fills the room stamp it as the room starts', async () => {
    await put('games/g1', gameNode({ x: ALICE }))
    await assertSucceeds(as(BOB).ref('games/g1/players/O').set({ name: 'Bob', joinedAt: 2, playerId: BOB }))
    await assertSucceeds(as(BOB).ref('games/g1').update({ status: 'playing', startsAt: stamp(), lastActivityAt: 3 }))
  })

  it('denies a made-up time', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(as(BOB).ref('games/g1/startsAt').set(Date.now() + 600000))
    await assertFails(as(BOB).ref('games/g1/startsAt').set(Date.now()))
  })

  it('denies re-stamping mid-game (no new countdown for the opponent)', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { startsAt: 5 } }))
    await assertFails(as(BOB).ref('games/g1/startsAt').set(stamp()))
    await assertFails(as(ALICE).ref('games/g1/startsAt').set(stamp()))
  })

  it('lets a rematch clear it, and leaves an unchanged one alone', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { startsAt: 5 } }))
    await assertSucceeds(as(ALICE).ref('games/g1').update({ lastActivityAt: 7 }))
    await assertSucceeds(as(ALICE).ref('games/g1').update({ startsAt: null }))
  })

  it('denies a stranger writing it', async () => {
    await put('games/g1', gameNode({ x: ALICE }))
    await assertFails(as(MALLORY).ref('games/g1/startsAt').set(stamp()))
  })
})
