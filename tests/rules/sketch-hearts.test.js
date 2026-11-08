// SKETCH hearts (`games/{id}/round/likes/{uid}`) and the match's heart tally
// (`round/faves/{cycle:artist}`): a seated player who is not the artist may
// heart a drawing with something on it, at the reveal or once they guessed it,
// only for themself; the tally holds small whole counts; and the coordinator's
// whole-room transactions still pass with both unchanged.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const players = {
  alice: { name: 'Alice', playerId: 'alice', joinedAt: 1 },
  bob: { name: 'Bob', playerId: 'bob', joinedAt: 2 },
  cy: { name: 'Cy', playerId: 'cy', joinedAt: 3 },
}
const strokes = { s1: { c: 0, w: 2, p: [10, 10, 40, 40] } }
const round = (over = {}) => ({
  phase: 'reveal', cycle: 1, artist: 'alice', order: ['alice', 'bob', 'cy'], matchSeed: 'm1',
  wordPattern: '7', revealAt: 1000, endsAt: 9000, strokes, ...over,
})
const room = (r = round(), over = {}) => ({
  gameType: 'sketch', status: 'playing', createdAt: 1, scores: {}, players, round: r, ...over,
})
const put = (value) => seed(T.env, 'games/g1', value)
const like = (uid, who = uid) => as(who).ref(`games/g1/round/likes/${uid}`)

describe('SKETCH hearts', () => {
  it('lets a seated guesser heart the drawing at the reveal, and take it back', async () => {
    await put(room())
    await assertSucceeds(like('bob').set(true))
    await assertSucceeds(like('cy').set(true))
    await assertSucceeds(like('bob').remove())
    await assertSucceeds(like('bob').set(true))
  })

  it('refuses the artist\'s own heart, a spectator\'s and a signed-out visitor\'s', async () => {
    await put(room())
    await assertFails(like('alice').set(true))
    await assertFails(like('mallory').set(true))
    await assertFails(dbAs(T.env, null).ref('games/g1/round/likes/bob').set(true))
  })

  it('refuses a heart written for someone else', async () => {
    await put(room())
    await assertFails(like('cy', 'bob').set(true))
    await assertFails(like('alice', 'bob').set(true))
  })

  it('while drawing: only a guesser who already got the word', async () => {
    await put(room(round({ phase: 'drawing', correct: { bob: { at: 5 } } })))
    await assertSucceeds(like('bob').set(true))
    await assertFails(like('cy').set(true))
  })

  it('refuses a heart while choosing, after the match, or on another game', async () => {
    await put(room(round({ phase: 'choosing' })))
    await assertFails(like('bob').set(true))
    await put(room(round(), { status: 'finished' }))
    await assertFails(like('bob').set(true))
    await put(room(round(), { gameType: 'wavelength' }))
    await assertFails(like('bob').set(true))
  })

  it('refuses a heart on a drawing with nothing on it, and accepts one on fills only', async () => {
    await put(room(round({ strokes: null })))
    await assertFails(like('bob').set(true))
    await put(room(round({ strokes: null, fills: { f1: { c: 2, p: [1, 1, 1, 2] } } })))
    await assertSucceeds(like('bob').set(true))
  })

  it('keeps a heart a plain true', async () => {
    await put(room())
    await assertFails(like('bob').set(false))
    await assertFails(like('bob').set(1))
    await assertFails(like('bob').set('♥'))
    await assertFails(like('bob').set({ at: 1 }))
  })

  it('lets the coordinator\'s whole-room transaction pass with the hearts unchanged', async () => {
    await put(room(round({ phase: 'drawing', correct: { bob: { at: 5 } }, likes: { bob: true } })))
    // a guesser marks themself correct; the coordinator moves to the reveal
    await assertSucceeds(as('cy').ref('games/g1/round/correct/cy').set({ at: 7 }))
    const whole = (await as('cy').ref('games/g1').get()).val()
    await assertSucceeds(as('cy').ref('games/g1').set({
      ...whole, scores: { alice: 50, bob: 100, cy: 90 }, round: { ...whole.round, phase: 'reveal' },
    }))
  })
})

describe('SKETCH heart tally', () => {
  it('lets the advance fold hearts into the tally and clear the round\'s hearts', async () => {
    await put(room(round({ likes: { bob: true, cy: true } })))
    const whole = (await as('bob').ref('games/g1').get()).val()
    const next = { ...whole.round, phase: 'choosing', artist: 'bob', faves: { '1:alice': 2 } }
    delete next.likes
    delete next.strokes
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, round: next }))
  })

  it('carries the tally through later whole-room writes unchanged', async () => {
    await put(room(round({ phase: 'drawing', artist: 'bob', faves: { '1:alice': 2 } })))
    const whole = (await as('cy').ref('games/g1').get()).val()
    await assertSucceeds(as('cy').ref('games/g1').set({ ...whole, scores: { cy: 90 } }))
    await assertSucceeds(as('cy').ref('games/g1/status').set('finished'))
  })

  it('keeps the tally to small whole counts under cycle:artist keys', async () => {
    await put(room())
    const fave = (key) => as('bob').ref(`games/g1/round/faves/${key}`)
    await assertSucceeds(fave('1:alice').set(8))
    await assertSucceeds(fave('2:bob').set(0))
    await assertFails(fave('1:alice').set(9))
    await assertFails(fave('1:alice').set(-1))
    await assertFails(fave('1:alice').set(1.5))
    await assertFails(fave('1:alice').set('2'))
    await assertFails(fave('alice').set(2))
    await assertFails(fave('0:alice').set(2))
    await assertFails(fave('1:').set(2))
  })

  it('accepts a room with no hearts at all (rooms from before hearts)', async () => {
    await put(room(round({ phase: 'drawing' })))
    await assertSucceeds(as('bob').ref('games/g1/round/chat/c1').set({ uid: 'bob', text: 'cat' }))
  })
})
