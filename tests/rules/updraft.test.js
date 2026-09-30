// UPDRAFT (`games/{id}/updraft`): each seat streams its own climber, hazards
// are sent only at the rival, co-op keys only by their holder, and the
// whole-room round transactions still pass with unchanged children.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const climber = (over = {}) => ({ x: 120, y: 300, best: 420, dead: false, top: false, ...over })
const round = (over = {}) => ({ seed: 12345, mode: 'chaos', startedAt: 1000, ...over })
const room = (updraft = round(), gameType = 'updraft') => gameNode({
  x: 'alice', o: 'bob', status: 'playing',
  extra: { gameType, board: null, currentTurn: null, updraft },
})
const put = (value) => seed(T.env, 'games/g1', value)

describe('UPDRAFT', () => {
  it('lets each seat write only its own climber', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/updraft/X').set(climber()))
    await assertSucceeds(as('bob').ref('games/g1/updraft/O').set(climber({ dead: true })))
    await assertFails(as('alice').ref('games/g1/updraft/O').set(climber({ best: 9999 })))
    await assertFails(as('mallory').ref('games/g1/updraft/X').set(climber()))
  })

  it('keeps climber fields in shape and range', async () => {
    await put(room())
    await assertFails(as('alice').ref('games/g1/updraft/X').set(climber({ best: 20000 })))
    await assertFails(as('alice').ref('games/g1/updraft/X').set(climber({ dead: 'yes' })))
    await assertFails(as('alice').ref('games/g1/updraft/X').set({ ...climber(), speed: 9 }))
    await assertFails(as('alice').ref('games/g1/updraft/Z').set(climber()))
    await assertFails(as('alice').ref('games/g1/updraft/mode').set('insane'))
    await assertSucceeds(as('alice').ref('games/g1/updraft/mode').set('pure'))
  })

  it('sends a hazard only at the rival, and never rewrites one', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/updraft/haz/O/h1').set({ k: 'gust', at: 5 }))
    await assertFails(as('alice').ref('games/g1/updraft/haz/X/h2').set({ k: 'gust', at: 5 }))
    await assertFails(as('bob').ref('games/g1/updraft/haz/O/h3').set({ k: 'fog', at: 5 }))
    await assertFails(as('bob').ref('games/g1/updraft/haz/X/h4').set({ k: 'meteor', at: 5 }))
    await assertFails(as('alice').ref('games/g1/updraft/haz/O/h1/k').set('fog'))
  })

  it('lets a co-op seat publish only its own keys', async () => {
    await put(room({ seed: 7, startedAt: 1000, lives: 3 }, 'updraftduo'))
    await assertSucceeds(as('bob').ref('games/g1/updraft/keys/O/2').set(true))
    await assertFails(as('alice').ref('games/g1/updraft/keys/O/3').set(true))
    await assertFails(as('alice').ref('games/g1/updraft/keys/X/0').set(true))
    await assertFails(as('alice').ref('games/g1/updraft/lives').set(4))
    await assertSucceeds(as('alice').ref('games/g1/updraft/lives').set(2))
  })

  it('refuses the node on another game type', async () => {
    await put(room(round(), 'pong'))
    await assertFails(as('alice').ref('games/g1/updraft/X').set(climber()))
  })

  it('lets a whole-room transaction settle the round with unchanged children', async () => {
    const r = room(round({ X: climber(), O: climber({ dead: true, best: 100 }), haz: { O: { h1: { k: 'fog', at: 5 } } } }))
    await put(r)
    await assertSucceeds(as('bob').ref('games/g1').set({ ...r, status: 'finished', winner: 'X', scores: { X: 1, O: 0 } }))
  })

  it('lets PLAY AGAIN replace the round with a fresh one', async () => {
    const r = room({ seed: 7, startedAt: 1000, lives: 1, X: climber(), keys: { X: { 1: true } }, result: 'failed' }, 'updraftduo')
    await put({ ...r, status: 'finished', winner: 'draw' })
    await assertSucceeds(as('bob').ref('games/g1').update({ updraft: { seed: 99, lives: 3 }, status: 'playing', winner: null }))
  })
})
