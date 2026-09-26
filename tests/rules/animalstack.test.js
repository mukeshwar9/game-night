// ANIMAL STACK (`games/{id}/stack`): the per-match node every seat writes
// through whole-room transactions — drops, checkpoint, ghost aim, hearts.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'
import { startStackMatch } from '../../src/lib/animalStackCore.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (value) => seed(T.env, 'games/g1', value)
const uids = ['alice', 'bob', 'carol']
const room = (over = {}) => {
  const r = partyNode({ uids, gameType: 'animalstack', status: 'playing' })
  return { ...r, stack: { ...startStackMatch(r.players, 42).stack, ...over } }
}

describe('ANIMAL STACK', () => {
  it('lets the room start a match with a well-formed stack node', async () => {
    await put(partyNode({ uids, gameType: 'animalstack', status: 'waiting' }))
    const r = room()
    await assertSucceeds(as('alice').ref('games/g1').update({ status: 'playing', stack: r.stack }))
  })

  it('a seat appends its own drop; a forged or out-of-range one is refused', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/stack/drops/d000').set({ by: 'alice', x: 42, r: 3 }))
    await assertFails(as('bob').ref('games/g1/stack/drops/d001').set({ by: 'alice', x: 0, r: 0 }))
    await assertFails(as('bob').ref('games/g1/stack/drops/d001').set({ by: 'bob', x: 999, r: 0 }))
    await assertFails(as('bob').ref('games/g1/stack/drops/d001').set({ by: 'bob', x: 0, r: 24 }))
    await assertFails(as('bob').ref('games/g1/stack/drops/x1').set({ by: 'bob', x: 0, r: 0 }))
    await assertFails(as('bob').ref('games/g1/stack/drops/d001').set({ by: 'bob', x: 0, r: 0, note: 'hi' }))
    await assertFails(as('mallory').ref('games/g1/stack/drops/d001').set({ by: 'mallory', x: 0, r: 0 }))
  })

  it('an auto drop may be written for an away seat; drops are immutable', async () => {
    await put(room({ drops: { d000: { by: 'alice', x: 10, r: 0 } } }))
    await assertSucceeds(as('bob').ref('games/g1/stack/drops/d001').set({ by: 'carol', x: 0, r: 0, auto: true }))
    await assertFails(as('alice').ref('games/g1/stack/drops/d000/x').set(-50))
  })

  it('checks the checkpoint, ghost aim, phase and hearts', async () => {
    await put(room())
    await assertSucceeds(as('bob').ref('games/g1/stack/cp').set({ n: 1, hash: '0badc0de', poses: '3,0,0.6,0' }))
    await assertFails(as('bob').ref('games/g1/stack/cp').set({ n: 1, hash: '0badc0de', poses: 'x'.repeat(8001) }))
    await assertSucceeds(as('alice').ref('games/g1/stack/aim').set({ x: -1.25, r: 7 }))
    await assertFails(as('alice').ref('games/g1/stack/aim').set({ x: 9, r: 7 }))
    await assertFails(as('alice').ref('games/g1/stack/phase').set('exploded'))
    await assertFails(as('alice').ref('games/g1/stack/hearts/0').set(9))
    await assertFails(as('alice').ref('games/g1/stack/cheat').set(true))
    await assertFails(as('mallory').ref('games/g1/stack/aim').set({ x: 0, r: 0 }))
  })

  it('lets a whole-room transaction rewrite the room with an unchanged stack', async () => {
    const r = room({ drops: { d000: { by: 'alice', x: 10, r: 0 } }, phase: 'settle', miss: { alice: 0 } })
    await put(r)
    await assertSucceeds(as('carol').ref('games/g1').set({ ...r, lastActivityAt: 9 }))
  })
})
