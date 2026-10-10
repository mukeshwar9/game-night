// REEF RUN race stats live at games/{id}/round/stats/{roundId}/{uid}. A racer
// writes only their own numbers/flags; another racer's stats stay off limits.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const room = () => ({
  ...partyNode({ uids: ['alice', 'bob'], gameType: 'reef', status: 'playing' }),
  round: { id: 'r1', startedAt: 1000, racers: { alice: true, bob: true } },
})

describe('Reef Run race stats', () => {
  it('lets a racer write their own score, pearls, hp, at, done and dead', async () => {
    await seed(T.env, 'games/g1', room())
    await assertSucceeds(as('alice').ref('games/g1/round/stats/r1/alice').update({ score: 1230, pearls: 37, hp: 2, at: 90210 }))
    await assertSucceeds(as('alice').ref('games/g1/round/stats/r1/alice').update({ done: true }))
    await assertSucceeds(as('bob').ref('games/g1/round/stats/r1/bob').update({ score: 400, pearls: 12, hp: 0, at: 40000, dead: true }))
  })

  it("refuses writing another racer's reef stats", async () => {
    await seed(T.env, 'games/g1', room())
    await assertFails(as('alice').ref('games/g1/round/stats/r1/bob').update({ score: 9999, pearls: 99, hp: 3, at: 1 }))
    await assertFails(as('alice').ref('games/g1/round/stats/r1/bob/score').set(9999))
    await assertFails(as('alice').ref('games/g1/round/stats/r1/bob/done').set(true))
  })

  it('refuses a non-member writing stats', async () => {
    await seed(T.env, 'games/g1', room())
    await assertFails(as('mallory').ref('games/g1/round/stats/r1/mallory').update({ score: 5, pearls: 0, hp: 3, at: 1 }))
  })
})
