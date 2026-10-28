// DUST KICK (`games/{id}/round/stats/{round}/{rider}`): the same report and kick nodes as
// SIDE KICK, plus the roped flag `ro` and a write-once `victim|L` lasso string under the
// thrower's own `k/{n}`. Reports are small numbers under a fixed set of names.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'
import { encodeRider, createWorld, kickKey } from '../../src/lib/sideKickLogic.js'
import { lassoKey } from '../../src/lib/dustKickLogic.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (value) => seed(T.env, 'games/g1', value)
const uids = ['alice', 'bob', 'carol']
const room = (gameType = 'dustkick') => ({
  ...partyNode({ uids, gameType, status: 'playing' }),
  round: { id: 'r1', gameType, seed: 5, startedAt: 1000, endsAt: 130000, track: 'canyon', racers: { alice: true, bob: true, carol: true } },
})
const report = () => {
  const w = createWorld({ riders: [{ id: 'alice' }, { id: 'bob' }], phase: 'race', dust: true, trackId: 'canyon' })
  return encodeRider(w.riders[0], 5000)
}
const stats = (id) => `games/g1/round/stats/r1/${id}`

describe('DUST KICK reports', () => {
  it('a rider writes its own report, with the roped flag, in the codec\'s own shape', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref(stats('alice')).update({ ...report(), ro: 1, ks: 2 }))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/ro`).set(0))
    await assertSucceeds(as('carol').ref(stats('bot1')).update({ ...report(), ro: 1 }))
  })

  it('nobody writes another rider\'s roped flag, and it must be a number', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('bob')}/ro`).set(1))
    await assertFails(as('alice').ref(`${stats('alice')}/ro`).set(true))
    await assertFails(as('alice').ref(`${stats('alice')}/ro`).set('yes'))
    await assertFails(as('alice').ref(`${stats('alice')}/rope`).set(1))
    await assertFails(as('alice').ref(`${stats('alice')}/ro/deep`).set(1))
  })

  it('takes the same checks as SIDE KICK: unknown fields and absurd numbers fail', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('alice')}/cheat`).set(1))
    await assertFails(as('alice').ref(`${stats('alice')}/z`).set(1e18))
    await assertFails(as('mallory').ref(stats('alice')).update(report()))
  })
})

describe('DUST KICK lasso strings', () => {
  it('a rider appends a lasso on its own node, once, next to its kicks', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref(`${stats('alice')}/k/1`).set(kickKey('bob', 1)))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/k/2`).set(lassoKey('bob')))
    await assertFails(as('alice').ref(`${stats('alice')}/k/2`).set(lassoKey('carol')))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/k/2`).set(lassoKey('bob')))
    await assertSucceeds(as('carol').ref(`${stats('bot2')}/k/1`).set(lassoKey('alice')))
  })

  it('a lasso cannot be forged on someone else\'s node, oversized or malformed', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('bob')}/k/1`).set(lassoKey('carol')))
    await assertFails(as('alice').ref(`${stats('alice')}/k/first`).set(lassoKey('bob')))
    await assertFails(as('alice').ref(`${stats('alice')}/k/3`).set(`${'x'.repeat(40)}|L`))
    await assertFails(as('alice').ref(`${stats('alice')}/k/3`).set(true))
    await assertFails(as('mallory').ref(`${stats('mallory')}/k/1`).set(lassoKey('bob')))
  })

  it('a whole-room transaction rewrites the room with reports and lassos already in it', async () => {
    const r = room()
    r.round.stats = { r1: { alice: { ...report(), ro: 1, k: { 1: lassoKey('bob') } }, bot1: report() } }
    await put(r)
    await assertSucceeds(as('carol').ref('games/g1').set({ ...r, lastActivityAt: 9 }))
  })
})

describe('SIDE KICK keeps working beside it', () => {
  it('the roped flag is accepted in a SIDE KICK room too (one report shape), nothing else changed', async () => {
    await put(room('sidekick'))
    await assertSucceeds(as('alice').ref(stats('alice')).update(report()))
    await assertFails(as('alice').ref(stats('bob')).update(report()))
    await assertFails(as('alice').ref(`${stats('alice')}/cheat`).set(1))
  })
})
