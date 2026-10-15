// ARROWS PARTY (`games/{id}/round/stats/{round}/{uid}`, `arrowsPartyConfig`,
// `round/tier`, `cupRaces`): each racer's phone writes its own cleared arrows
// (`g/{index}`, write-once), blocked taps (`m`, only up), the finish time (`fin`,
// write-once) and a knock-out flag (`x`). Nobody writes another racer's node.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'
import { applyRaceFinish, buildRaceResult } from '../../src/lib/raceLogic.js'
import { normalizePartyConfig } from '../../src/lib/arrowsPartyLogic.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (value) => seed(T.env, 'games/g1', value)
const uids = ['alice', 'bob', 'carol']
const config = { version: 1, tier: 'medium', rounds: 3, sabotage: false }
const room = (extra = {}) => ({
  ...partyNode({ uids, gameType: 'arrowsparty', status: 'playing' }),
  arrowsPartyConfig: config,
  round: { id: 'r1', gameType: 'arrowsparty', seed: 5, startedAt: 1000, endsAt: 121000, tier: 'medium', racers: { alice: true, bob: true, carol: true } },
  ...extra,
})
const stats = (id) => `games/g1/round/stats/r1/${id}`

describe('ARROWS PARTY clears', () => {
  it('a racer writes its own cleared arrows, one at a time or together with the finish', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref(`${stats('alice')}/g/0`).set(true))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/g/17`).set(true))
    await assertSucceeds(as('bob').ref(stats('bob')).update({ 'g/3': true, fin: 24300 }))
  })

  it('nobody clears an arrow on someone else\'s node', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('bob')}/g/0`).set(true))
    await assertFails(as('alice').ref(stats('bob')).update({ 'g/1': true }))
    await assertFails(as('mallory').ref(`${stats('alice')}/g/0`).set(true))
  })

  it('a clear is write-once, a real index, and exactly true', async () => {
    await put(room({ round: { id: 'r1', gameType: 'arrowsparty', seed: 5, startedAt: 1000, endsAt: 121000, tier: 'medium', racers: { alice: true, bob: true }, stats: { r1: { alice: { g: { 2: true } } } } } }))
    await assertFails(as('alice').ref(`${stats('alice')}/g/2`).set(false))
    await assertFails(as('alice').ref(`${stats('alice')}/g/2`).set(1))
    await assertFails(as('alice').ref(`${stats('alice')}/g/100`).set(true))
    await assertFails(as('alice').ref(`${stats('alice')}/g/first`).set(true))
    await assertFails(as('alice').ref(`${stats('alice')}/g/-1`).set(true))
    await assertFails(as('alice').ref(`${stats('alice')}/g/4/deep`).set(true))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/g/2`).set(true))
  })

  it('refuses unknown fields on a racer\'s node', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('alice')}/cheat`).set(1))
    await assertFails(as('alice').ref(`${stats('alice')}/z`).set(1))
  })
})

describe('ARROWS PARTY blocked taps and the finish', () => {
  it('the blocked-tap count only goes up and stays a small number', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref(`${stats('alice')}/m`).set(1))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/m`).set(2))
    await assertFails(as('alice').ref(`${stats('alice')}/m`).set(1))
    await assertFails(as('alice').ref(`${stats('alice')}/m`).set(-1))
    await assertFails(as('alice').ref(`${stats('alice')}/m`).set(1000))
    await assertFails(as('alice').ref(`${stats('alice')}/m`).set('2'))
    await assertFails(as('alice').ref(`${stats('bob')}/m`).set(1))
  })

  it('the finish time is a positive number, set once, on your own node', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('alice')}/fin`).set(0))
    await assertFails(as('alice').ref(`${stats('alice')}/fin`).set(-5))
    await assertFails(as('alice').ref(`${stats('alice')}/fin`).set(1e12))
    await assertFails(as('alice').ref(`${stats('alice')}/fin`).set('fast'))
    await assertFails(as('alice').ref(`${stats('bob')}/fin`).set(9000))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/fin`).set(31200))
    await assertFails(as('alice').ref(`${stats('alice')}/fin`).set(1200))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/fin`).set(31200))
  })

  it('the knock-out flag is a one, set once, on your own node', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('alice')}/x`).set(true))
    await assertFails(as('alice').ref(`${stats('alice')}/x`).set(2))
    await assertFails(as('alice').ref(`${stats('bob')}/x`).set(1))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/x`).set(1))
  })

  it('a whole-room transaction rewrites the room with every racer\'s stats already in it', async () => {
    const r = room({
      round: {
        id: 'r1', gameType: 'arrowsparty', seed: 5, startedAt: 1000, endsAt: 121000, tier: 'medium', racers: { alice: true, bob: true, carol: true },
        stats: { r1: { alice: { g: { 0: true, 1: true }, m: 1, fin: 20100 }, bob: { g: { 0: true }, x: 1 } } },
      },
    })
    await put(r)
    await assertSucceeds(as('carol').ref('games/g1').set({ ...r, lastActivityAt: 9 }))
  })
})

describe('ARROWS PARTY room setup', () => {
  it('a seated member saves a valid config', async () => {
    await put(room({ arrowsPartyConfig: null, status: 'waiting', round: null }))
    await assertSucceeds(as('alice').ref('games/g1/arrowsPartyConfig').set(normalizePartyConfig({ tier: 'hard', rounds: 7, sabotage: true })))
    await assertSucceeds(as('bob').ref('games/g1/arrowsPartyConfig').set(normalizePartyConfig({ tier: 'easy', rounds: 5 })))
  })

  it('rejects an unknown tier, a round count outside 3 / 5 / 7, a non-boolean toggle or extra keys', async () => {
    await put(room())
    await assertFails(as('alice').ref('games/g1/arrowsPartyConfig').set({ ...config, tier: 'mixed' }))
    await assertFails(as('alice').ref('games/g1/arrowsPartyConfig').set({ ...config, rounds: 4 }))
    await assertFails(as('alice').ref('games/g1/arrowsPartyConfig').set({ ...config, rounds: 9 }))
    await assertFails(as('alice').ref('games/g1/arrowsPartyConfig').set({ ...config, sabotage: 'on' }))
    await assertFails(as('alice').ref('games/g1/arrowsPartyConfig').set({ ...config, version: 2 }))
    await assertFails(as('alice').ref('games/g1/arrowsPartyConfig').set({ ...config, extra: true }))
    await assertFails(as('alice').ref('games/g1/arrowsPartyConfig').set({ version: 1, tier: 'easy' }))
  })

  it('refuses config writes from a non-member', async () => {
    await put(room())
    await assertFails(as('mallory').ref('games/g1/arrowsPartyConfig').set(config))
  })

  it('the round\'s locked difficulty is one of the three tiers', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/round/tier').set('hard'))
    await assertFails(as('alice').ref('games/g1/round/tier').set('mixed'))
  })
})

describe('ARROWS PARTY crate drops', () => {
  const drop = (victim, n) => `games/g1/round/drops/${victim}/${n}`
  const value = (from, at = 3, id = 'r1') => `${at}|${id}|${from}`

  it('a racer drops a crate on a rival, once per slot, signed with their own uid', async () => {
    await put(room())
    await assertSucceeds(as('bob').ref(drop('alice', 0)).set(value('bob')))
    await assertSucceeds(as('carol').ref(drop('alice', 1)).set(value('carol', 5)))
    // Write-once: the slot is taken, whoever asks.
    await assertFails(as('carol').ref(drop('alice', 0)).set(value('carol')))
    await assertFails(as('bob').ref(drop('alice', 0)).set(value('bob', 9)))
    await assertSucceeds(as('bob').ref(drop('alice', 0)).set(value('bob')))
  })

  it('nobody drops in someone else\'s name, on themself, or on a non-racer', async () => {
    await put(room())
    await assertFails(as('bob').ref(drop('alice', 0)).set(value('carol')))
    await assertFails(as('alice').ref(drop('alice', 0)).set(value('alice')))
    await assertFails(as('bob').ref(drop('zed', 0)).set(value('bob')))
    await assertFails(as('mallory').ref(drop('alice', 0)).set(value('mallory')))
  })

  it('refuses a fourth slot, a malformed record, and a record that is not a string', async () => {
    await put(room())
    await assertFails(as('bob').ref(drop('alice', 3)).set(value('bob')))
    await assertFails(as('bob').ref(drop('alice', 'x')).set(value('bob')))
    await assertFails(as('bob').ref(drop('alice', 0)).set('crate'))
    await assertFails(as('bob').ref(drop('alice', 0)).set(`x|r1|bob`))
    await assertFails(as('bob').ref(drop('alice', 0)).set(`3|r1|`))
    await assertFails(as('bob').ref(drop('alice', 0)).set(7))
    await assertFails(as('bob').ref(drop('alice', 0)).set({ at: 3 }))
  })

  it('a racer is only a racer if this round says so', async () => {
    await put(room({ round: { id: 'r1', gameType: 'arrowsparty', seed: 5, startedAt: 1000, endsAt: 121000, tier: 'medium', racers: { alice: true, bob: true } } }))
    await assertFails(as('carol').ref(drop('alice', 0)).set(value('carol')))
    await assertFails(as('bob').ref(drop('carol', 0)).set(value('bob')))
    await assertSucceeds(as('bob').ref(drop('alice', 0)).set(value('bob')))
  })

  it('the host\'s sabotage switch is a boolean on the round', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/round/sab').set(true))
    await assertFails(as('alice').ref('games/g1/round/sab').set('yes'))
  })

  it('a whole-room transaction rewrites the room with drops already in it', async () => {
    const r = room({
      round: {
        id: 'r1', gameType: 'arrowsparty', seed: 5, startedAt: 1000, endsAt: 121000, tier: 'medium', sab: true,
        racers: { alice: true, bob: true, carol: true },
        drops: { alice: { 0: value('bob'), 1: value('carol', 6) } },
      },
    })
    await put(r)
    await assertSucceeds(as('carol').ref('games/g1').set({ ...r, lastActivityAt: 9 }))
  })
})

describe('ARROWS PARTY cup', () => {
  it('lets a seat finish a round: points by finish order added to the scores, the round counted', async () => {
    const live = room()
    const round = { stats: { alice: { fin: 20000, m: 0 }, bob: { fin: 24000, m: 1 }, carol: { fin: 30000 } } }
    const result = buildRaceResult({
      roundId: 'r1', gameType: 'arrowsparty', now: 90000,
      entries: ['alice', 'bob', 'carol'].map((id) => ({ id, sortKey: [round.stats[id].fin, round.stats[id].m ?? 0], score: round.stats[id].fin })),
    })
    const next = applyRaceFinish(live, result)
    await put(live)
    await assertSucceeds(as('bob').ref('games/g1').update({
      status: next.status, winner: next.winner, scores: next.scores, raceResult: next.raceResult, cupRaces: next.cupRaces, lastActivityAt: next.lastActivityAt,
    }))
  })

  it('an outsider cannot touch the room', async () => {
    await put(room())
    await assertFails(as('mallory').ref('games/g1/cupRaces').set(1))
    await assertFails(as('mallory').ref(stats('mallory')).update({ 'g/0': true }))
  })
})
