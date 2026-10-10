// LAZY SUSAN (`games/{id}/round/lsClaims`, `lsMiss`): a taken piece is written
// once by its taker; a tap on nothing is an append-only note by the tapper.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'
import { createRound } from '../../src/lib/lazySusanLogic.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (value) => seed(T.env, 'games/g1', value)
const uids = ['alice', 'bob', 'carol']
const room = (round = {}) => ({
  ...partyNode({ uids, gameType: 'lazysusan', status: 'playing' }),
  round: { ...createRound(uids, 42, 1000), ...round },
})

describe('LAZY SUSAN', () => {
  it('lets the room start a match with a well-formed round', async () => {
    await put(partyNode({ uids, gameType: 'lazysusan', status: 'waiting' }))
    await assertSucceeds(as('alice').ref('games/g1').update({ status: 'playing', round: createRound(uids, 42, 1000) }))
  })

  it('a seat claims a piece as itself; a forged or malformed claim is refused', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/round/lsClaims/p1_2').set({ by: 'alice', at: 5000 }))
    await assertFails(as('bob').ref('games/g1/round/lsClaims/p1_3').set({ by: 'alice', at: 5000 }))
    await assertFails(as('bob').ref('games/g1/round/lsClaims/p1_9').set({ by: 'bob', at: 5000 }))
    await assertFails(as('bob').ref('games/g1/round/lsClaims/piece').set({ by: 'bob', at: 5000 }))
    await assertFails(as('bob').ref('games/g1/round/lsClaims/p1_3').set({ by: 'bob', at: 'soon' }))
    await assertFails(as('bob').ref('games/g1/round/lsClaims/p1_3').set({ by: 'bob', at: 5000, note: 'hi' }))
    await assertFails(as('mallory').ref('games/g1/round/lsClaims/p1_4').set({ by: 'mallory', at: 5000 }))
  })

  it('the first claim wins: a taken piece cannot be re-claimed or changed', async () => {
    await put(room({ lsClaims: { p1_2: { by: 'alice', at: 5000 } } }))
    await assertFails(as('bob').ref('games/g1/round/lsClaims/p1_2').set({ by: 'bob', at: 5001 }))
    await assertFails(as('alice').ref('games/g1/round/lsClaims/p1_2/at').set(6000))
    await assertFails(as('bob').ref('games/g1/round/lsClaims/p1_2/by').set('bob'))
    await assertSucceeds(as('bob').ref('games/g1/round/lsClaims/p1_3').set({ by: 'bob', at: 5002 }))
  })

  it('a miss is appended by its own seat', async () => {
    await put(room())
    await assertSucceeds(as('carol').ref('games/g1/round/lsMiss/-Nabc').set({ by: 'carol', at: 7000 }))
    await assertFails(as('carol').ref('games/g1/round/lsMiss/-Nabd').set({ by: 'alice', at: 7000 }))
    await assertFails(as('carol').ref('games/g1/round/lsMiss/-Nabe').set({ by: 'carol', at: 7000, extra: 1 }))
  })

  it('lets a whole-room transaction rewrite the room with an unchanged round', async () => {
    const r = room({
      lsClaims: { p1_2: { by: 'alice', at: 5000 }, p1_0: { by: 'bob', at: 5100 } },
      lsMiss: { '-Nabc': { by: 'carol', at: 7000 } },
    })
    await put(r)
    await assertSucceeds(as('carol').ref('games/g1').set({ ...r, lastActivityAt: 9 }))
    await assertSucceeds(as('alice').ref('games/g1').update({ status: 'finished', winner: 'alice' }))
  })
})
