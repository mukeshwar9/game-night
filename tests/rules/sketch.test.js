// SKETCH letter hints (`games/{id}/round/hints/{n}`): only the round's artist
// can publish one, only while drawing, once each, and a whole-room transaction
// (a guesser's correct mark, the coordinator's reveal) still passes with the
// hints unchanged.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const players = { alice: { name: 'Alice', playerId: 'alice' }, bob: { name: 'Bob', playerId: 'bob' }, cy: { name: 'Cy', playerId: 'cy' } }
const round = (over = {}) => ({
  phase: 'drawing', cycle: 1, artist: 'alice', order: ['alice', 'bob', 'cy'], matchSeed: 'm1',
  wordPattern: '7', drawStartedAt: 1000, drawMs: 75000, ...over,
})
const room = (r = round()) => {
  const node = gameNode({ x: 'alice', o: 'bob', status: 'playing', extra: { gameType: 'sketch', board: null, currentTurn: null, round: r } })
  node.players = players
  return node
}
const put = (value) => seed(T.env, 'games/g1', value)
const hint = (over = {}) => ({ i: 3, c: 'b', ...over })

describe('SKETCH letter hints', () => {
  it('lets the artist publish a hint while drawing', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/1').set(hint({ i: 5, c: 'o' })))
  })

  it('refuses a hint from a guesser, a spectator or a signed-out visitor', async () => {
    await put(room())
    await assertFails(as('bob').ref('games/g1/round/hints/0').set(hint()))
    await assertFails(as('cy').ref('games/g1/round/hints/0').set(hint()))
    await assertFails(as('mallory').ref('games/g1/round/hints/0').set(hint()))
    await assertFails(dbAs(T.env, null).ref('games/g1/round/hints/0').set(hint()))
  })

  it('refuses a hint outside the drawing phase', async () => {
    await put(room(round({ phase: 'choosing' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await put(room(round({ phase: 'reveal' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint()))
  })

  it('keeps a hint in shape: two slots, one letter, a small position, nothing extra', async () => {
    await put(room())
    await assertFails(as('alice').ref('games/g1/round/hints/2').set(hint()))
    await assertFails(as('alice').ref('games/g1/round/hints/x').set(hint()))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ c: 'bo' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ c: '' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ c: 7 })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ i: -1 })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ i: 64 })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ i: '3' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set({ i: 3 }))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set({ ...hint(), word: 'rainbow' }))
  })

  it('never rewrites a published hint, not even for the artist', async () => {
    await put(room(round({ hints: { 0: hint() } })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ i: 4, c: 'o' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0/c').set('z'))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/0').set(hint())) // same value: a reload republishing
  })

  it('lets a whole-room transaction pass with the hints unchanged', async () => {
    await put(room(round({ hints: { 0: hint() } })))
    // a guesser marks themself correct; the coordinator moves to the reveal
    await assertSucceeds(as('bob').ref('games/g1/round/correct/bob').set({ at: 5000 }))
    await assertSucceeds(as('bob').ref('games/g1/round/phase').set('reveal'))
    await assertSucceeds(as('bob').ref('games/g1/round/endsAt').set(99999))
    const whole = (await as('bob').ref('games/g1').get()).val()
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, scores: { alice: 25, bob: 100 } }))
  })

  it('lets the next round clear the hints', async () => {
    await put(room(round({ phase: 'reveal', hints: { 0: hint() } })))
    const whole = (await as('bob').ref('games/g1').get()).val()
    const next = { ...whole.round, phase: 'choosing', artist: 'bob', hints: null }
    delete next.hints
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, round: next }))
  })

  it('accepts a room with no hints at all (rooms from before hints)', async () => {
    await put(room())
    await assertSucceeds(as('bob').ref('games/g1/round/chat/c1').set({ uid: 'bob', text: 'cat' }))
  })
})
