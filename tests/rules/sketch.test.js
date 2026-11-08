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

// SKETCH hearts (S5): `round/likes/{uid}` is a player's own heart on the
// drawing, written only by them, never by the artist, at the reveal (or while
// drawing once they have guessed it). `round/faves` is the match's tally.
describe('SKETCH hearts', () => {
  it('lets a seated guesser heart the drawing at the reveal, and take it back', async () => {
    await put(room(round({ phase: 'reveal' })))
    await assertSucceeds(as('bob').ref('games/g1/round/likes/bob').set(true))
    await assertSucceeds(as('bob').ref('games/g1/round/likes/bob').set(false))
    await assertSucceeds(as('cy').ref('games/g1/round/likes/cy').set(true))
  })

  it('opens the heart early only for a guesser who already got it', async () => {
    await put(room(round({ correct: { bob: { at: 5000 } } })))
    await assertSucceeds(as('bob').ref('games/g1/round/likes/bob').set(true))
    await assertFails(as('cy').ref('games/g1/round/likes/cy').set(true))
  })

  it('refuses the artist, someone else\'s heart, spectators and other phases', async () => {
    await put(room(round({ phase: 'reveal' })))
    await assertFails(as('alice').ref('games/g1/round/likes/alice').set(true))
    await assertFails(as('bob').ref('games/g1/round/likes/cy').set(true))
    await assertFails(as('mallory').ref('games/g1/round/likes/mallory').set(true))
    await put(room(round({ phase: 'choosing' })))
    await assertFails(as('bob').ref('games/g1/round/likes/bob').set(true))
  })

  it('keeps a heart a boolean', async () => {
    await put(room(round({ phase: 'reveal' })))
    await assertFails(as('bob').ref('games/g1/round/likes/bob').set(1))
    await assertFails(as('bob').ref('games/g1/round/likes/bob').set('love'))
  })

  it('lets a whole-room transaction pass with the hearts unchanged, and the next round clear them', async () => {
    await put(room(round({ phase: 'reveal', likes: { bob: true, cy: true } })))
    const whole = (await as('alice').ref('games/g1').get()).val()
    // the coordinator (any seat) advances; the tally carries the folded count
    const next = { ...whole.round, phase: 'choosing', artist: 'bob', faves: { '1:alice': 2 } }
    delete next.likes
    await assertSucceeds(as('alice').ref('games/g1').set({ ...whole, round: next }))
    await put(room(round({ phase: 'reveal', likes: { bob: true, cy: true } })))
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, status: 'finished' }))
  })

  it('keeps the tally to small whole counts', async () => {
    await put(room(round({ phase: 'reveal' })))
    await assertSucceeds(as('bob').ref('games/g1/round/faves/1:alice').set(3))
    await assertFails(as('bob').ref('games/g1/round/faves/1:alice').set(0))
    await assertFails(as('bob').ref('games/g1/round/faves/1:alice').set(9))
    await assertFails(as('bob').ref('games/g1/round/faves/1:alice').set(2.5))
    await assertFails(as('bob').ref('games/g1/round/faves/1:alice').set('2'))
  })
})

// SKETCH match setup (S2): the room's `sketchConfig` holds only the offered
// choices; START copies them into the round, and a round with fewer letter
// hints refuses the hints it doesn't have.
describe('SKETCH match setup', () => {
  const lobby = () => {
    const node = gameNode({ x: 'alice', o: 'bob', status: 'waiting', extra: { gameType: 'sketch', board: null, currentTurn: null } })
    node.players = players
    return node
  }

  it('accepts every offered setup', async () => {
    await put(lobby())
    for (const draws of [1, 2, 3]) await assertSucceeds(as('alice').ref('games/g1/sketchConfig').set({ v: 1, draws, drawS: 75, hints: 2 }))
    for (const drawS of [45, 60, 75, 90, 120]) await assertSucceeds(as('alice').ref('games/g1/sketchConfig').set({ v: 1, drawS, hints: 2 }))
    for (const hints of [0, 1, 2]) await assertSucceeds(as('alice').ref('games/g1/sketchConfig').set({ v: 1, drawS: 75, hints }))
  })

  it('refuses values outside the choices, missing fields and extra keys', async () => {
    await put(lobby())
    const ok = { v: 1, draws: 2, drawS: 75, hints: 2 }
    await assertFails(as('alice').ref('games/g1/sketchConfig').set({ ...ok, draws: 4 }))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set({ ...ok, drawS: 50 }))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set({ ...ok, hints: 3 }))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set({ ...ok, v: 2 }))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set({ v: 1, draws: 2 }))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set({ ...ok, rounds: 9 }))
    await assertFails(as('mallory').ref('games/g1/sketchConfig').set(ok))
  })

  it('lets a whole-room write pass with the setup unchanged, and keeps the round copy in range', async () => {
    await put({ ...room(round({ cycles: 1, drawBase: 45000, hintCount: 1 })), sketchConfig: { v: 1, draws: 1, drawS: 45, hints: 1 } })
    const whole = (await as('bob').ref('games/g1').get()).val()
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, scores: { alice: 25, bob: 100 } }))
    await assertFails(as('bob').ref('games/g1/round/cycles').set(4))
    await assertFails(as('bob').ref('games/g1/round/drawBase').set(1000))
    await assertFails(as('bob').ref('games/g1/round/hintCount').set(3))
  })

  it('refuses a hint the match does not have', async () => {
    await put(room(round({ hintCount: 1 })))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await assertFails(as('alice').ref('games/g1/round/hints/1').set(hint({ i: 5, c: 'o' })))
    await put(room(round({ hintCount: 0 })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await put(room(round({ hintCount: 2 })))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/1').set(hint({ i: 5, c: 'o' })))
  })
})
