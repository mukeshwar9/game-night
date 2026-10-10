// SIDE KICK (`games/{id}/round/stats/{round}/{rider}`, `cupRaces`, `raceResult.grid`):
// each rider's phone reports its own bike and its kicks; the room coordinator's
// phone reports the bots. Reports are small numbers under a fixed set of names and
// a kick is a write-once `victim|side` string on the kicker's own node.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'
import { encodeRider, createWorld, kickKey, decorateRound } from '../../src/lib/sideKickLogic.js'
import { applyRaceFinish, buildRaceResult } from '../../src/lib/raceLogic.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (value) => seed(T.env, 'games/g1', value)
const uids = ['alice', 'bob', 'carol']
const room = (extra = {}) => ({
  ...partyNode({ uids, gameType: 'sidekick', status: 'playing' }),
  round: { id: 'r1', gameType: 'sidekick', seed: 5, startedAt: 1000, endsAt: 130000, track: 'meadow', racers: { alice: true, bob: true, carol: true } },
  ...extra,
})
const report = () => {
  const w = createWorld({ riders: [{ id: 'alice' }, { id: 'bob' }], phase: 'race' })
  return encodeRider(w.riders[0], 5000)
}
const stats = (id) => `games/g1/round/stats/r1/${id}`

describe('SIDE KICK reports', () => {
  it('a rider writes its own report in the codec\'s own shape', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref(stats('alice')).update(report()))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/z`).set(12345))
    await assertSucceeds(as('bob').ref(stats('bob')).update({ ...report(), fin: 52123 }))
  })

  it('nobody writes another rider\'s report, but any seat may drive a bot', async () => {
    await put(room())
    await assertFails(as('alice').ref(stats('bob')).update(report()))
    await assertFails(as('alice').ref(`${stats('bob')}/z`).set(999999))
    await assertSucceeds(as('carol').ref(stats('bot1')).update(report()))
    await assertSucceeds(as('bob').ref(stats('bot3')).update(report()))
    await assertFails(as('bob').ref(stats('bot12')).update(report()))
    await assertFails(as('bob').ref(stats('robot')).update(report()))
    await assertFails(as('mallory').ref(stats('alice')).update(report()))
  })

  it('refuses unknown fields, non-numbers and absurd numbers', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('alice')}/cheat`).set(1))
    await assertFails(as('alice').ref(`${stats('alice')}/z`).set('far'))
    await assertFails(as('alice').ref(`${stats('alice')}/z`).set(1e18))
    await assertFails(as('alice').ref(`${stats('alice')}/x`).set(-5000))
    await assertFails(as('alice').ref(`${stats('alice')}/bo`).set(true))
    await assertFails(as('alice').ref(`${stats('alice')}/k`).set('1|1'))
    await assertFails(as('alice').ref(`${stats('alice')}/z/deep`).set(1))
  })
})

describe('SIDE KICK kicks', () => {
  it('a rider appends a kick on its own node, once', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref(`${stats('alice')}/k/1`).set(kickKey('bob', 1)))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/k/2`).set(kickKey('bot1', -1)))
    await assertFails(as('alice').ref(`${stats('alice')}/k/1`).set(kickKey('carol', 1)))
    await assertSucceeds(as('alice').ref(`${stats('alice')}/k/1`).set(kickKey('bob', 1)))
  })

  it('a kick cannot be forged on someone else\'s node, malformed, or oversized', async () => {
    await put(room())
    await assertFails(as('alice').ref(`${stats('bob')}/k/1`).set(kickKey('carol', 1)))
    await assertFails(as('alice').ref(`${stats('alice')}/k/first`).set(kickKey('bob', 1)))
    await assertFails(as('alice').ref(`${stats('alice')}/k/123456`).set(kickKey('bob', 1)))
    await assertFails(as('alice').ref(`${stats('alice')}/k/3`).set(7))
    await assertFails(as('alice').ref(`${stats('alice')}/k/3`).set('x'.repeat(41)))
    await assertFails(as('alice').ref(`${stats('alice')}/k/3`).set({ to: 'bob' }))
    await assertSucceeds(as('carol').ref(`${stats('bot2')}/k/1`).set(kickKey('alice', 1)))
  })

  it('a whole-room transaction rewrites the room with reports and kicks already in it', async () => {
    const r = room({
      round: {
        id: 'r1', gameType: 'sidekick', seed: 5, startedAt: 1000, endsAt: 130000, track: 'meadow', racers: { alice: true, bob: true, carol: true },
        stats: { r1: { alice: { ...report(), k: { 1: kickKey('bob', 1) } }, bot1: report() } },
      },
    })
    await put(r)
    await assertSucceeds(as('carol').ref('games/g1').set({ ...r, lastActivityAt: 9 }))
  })
})

describe('SIDE KICK cup', () => {
  const finished = () => {
    const live = room()
    const round = { stats: {}, racers: ['alice', 'bob', 'carol'], startedAt: 1000 }
    for (const [i, id] of ['alice', 'bob', 'carol', 'bot1'].entries()) round.stats[id] = { z: 100, fin: 50000 + i * 1000 }
    const dec = decorateRound(round)
    const result = buildRaceResult({
      roundId: 'r1', gameType: 'sidekick', now: 90000,
      entries: ['alice', 'bob', 'carol'].map((id) => ({ id, sortKey: [round.stats[id].fin], score: round.stats[id].fin })),
    })
    Object.assign(result, dec)
    return { live, next: applyRaceFinish(live, result) }
  }

  it('lets a seat finish a race: points added to the scores, the race counted, the grid kept', async () => {
    const { live, next } = finished()
    await put(live)
    await assertSucceeds(as('bob').ref('games/g1').update({
      status: next.status, winner: next.winner, scores: next.scores, raceResult: next.raceResult, cupRaces: next.cupRaces, lastActivityAt: next.lastActivityAt,
    }))
  })

  it('refuses a malformed counter or grid', async () => {
    await put(room())
    await assertFails(as('alice').ref('games/g1/cupRaces').set(100))
    await assertFails(as('alice').ref('games/g1/cupRaces').set('two'))
    await assertSucceeds(as('alice').ref('games/g1/cupRaces').set(2))
    const base = { roundId: 'r1', gameType: 'sidekick', at: 5000 }
    await assertFails(as('alice').ref('games/g1/raceResult').set({ ...base, grid: [1, 2] }))
    await assertSucceeds(as('alice').ref('games/g1/raceResult').set({ ...base, grid: ['bot1', 'alice'] }))
  })

  it('an outsider cannot touch the room', async () => {
    await put(room())
    await assertFails(as('mallory').ref('games/g1/cupRaces').set(1))
    await assertFails(as('mallory').ref(stats('mallory')).update(report()))
  })
})
