// UPDRAFT (`games/{id}/updraft`): each seat streams its own climber, hazards
// are sent only at the rival, co-op keys only by their holder, and the
// whole-room round transactions still pass with unchanged children.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const climber = (over = {}) => ({ x: 120, y: 300, best: 420, dead: false, top: false, ...over })
const round = (over = {}) => ({ seed: 12345, mode: 'chaos', startedAt: 1000, ...over })
const room = (updraft = round(), gameType = 'updraft', status = 'playing') => gameNode({
  x: 'alice', o: 'bob', status,
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
    await assertSucceeds(as('alice').ref('games/g1/updraft/X').set(climber()))
    await assertFails(as('alice').ref('games/g1/updraft/X').set(climber({ best: 20000 })))
    await assertFails(as('alice').ref('games/g1/updraft/X').set(climber({ best: 100 })))
    await assertSucceeds(as('alice').ref('games/g1/updraft/X').set(climber({ best: 500 })))
    await assertFails(as('alice').ref('games/g1/updraft/X').set(climber({ dead: 'yes' })))
    await assertFails(as('alice').ref('games/g1/updraft/X').set({ ...climber(), speed: 9 }))
    await assertFails(as('alice').ref('games/g1/updraft/Z').set(climber()))
    await assertFails(as('alice').ref('games/g1/updraft/mode').set('insane'))
    await assertFails(as('alice').ref('games/g1/updraft/mode').set('pure'))
    await assertSucceeds(as('alice').ref('games/g1/updraft/mode').set('chaos'))
    await assertFails(as('alice').ref('games/g1/updraft/unknown').set(1))
  })

  it('sends a hazard only at the rival, and never rewrites one', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/updraft/haz/O/1').set({ k: 'gust', at: 1 }))
    await assertSucceeds(as('alice').ref('games/g1/updraft/haz/O/2').set({ k: 'fog', at: 2 }))
    await assertFails(as('alice').ref('games/g1/updraft/haz/X/3').set({ k: 'gust', at: 3 }))
    await assertFails(as('bob').ref('games/g1/updraft/haz/O/4').set({ k: 'fog', at: 4 }))
    await assertFails(as('bob').ref('games/g1/updraft/haz/X/5').set({ k: 'meteor', at: 5 }))
    await assertFails(as('alice').ref('games/g1/updraft/haz/O/6').set({ k: 'fog', at: 6 }))
    await assertFails(as('alice').ref('games/g1/updraft/haz/O/1/k').set('fog'))
    await assertFails(as('bob').ref('games/g1/updraft/haz/O/1').remove())
  })

  it('lets a co-op seat publish only its own keys', async () => {
    await put(room({ seed: 7, startedAt: 1000, lives: 3 }, 'updraftduo'))
    await assertSucceeds(as('bob').ref('games/g1/updraft/keys/O/2').set(true))
    await assertSucceeds(as('bob').ref('games/g1/updraft/keys/O/1').set(true))
    await assertFails(as('alice').ref('games/g1/updraft/keys/O/2').remove())
    await assertFails(as('alice').ref('games/g1/updraft/keys/O/3').set(true))
    await assertFails(as('alice').ref('games/g1/updraft/keys/X/0').set(true))
    await assertFails(as('alice').ref('games/g1/updraft/lives').set(4))
    await assertSucceeds(as('alice').ref('games/g1/updraft/lives').set(2))
    await assertFails(as('alice').ref('games/g1/updraft/lives').set(3))
    await assertFails(as('alice').ref('games/g1/updraft/lives').remove())
    await assertFails(as('alice').ref('games/g1/updraft/keys/O/2').remove())
    await assertFails(as('alice').ref('games/g1/updraft/keys/O/6').set(true))
  })

  it('locks the tower and mode during play and prevents result injection', async () => {
    await put(room())
    await assertFails(as('alice').ref('games/g1/updraft/seed').set(54321))
    await assertFails(as('alice').ref('games/g1/updraft/mode').set('pure'))
    await assertFails(as('bob').ref('games/g1/updraft/mode').set('pure'))
    await assertFails(as('alice').ref('games/g1/updraft/startedAt').set(2000))
    await assertFails(as('alice').ref('games/g1/updraft/startedAt').remove())
    await assertFails(as('alice').ref('games/g1/updraft/result').set('failed'))
    await assertFails(as('alice').ref('games/g1/updraft').remove())
  })

  it('lets only the host choose lobby mode and stamps the start once', async () => {
    await put(room({ seed: 12345, mode: 'chaos' }, 'updraft', 'waiting'))
    await assertSucceeds(as('alice').ref('games/g1/updraft/mode').set('pure'))
    await assertFails(as('bob').ref('games/g1/updraft/mode').set('chaos'))
    await assertSucceeds(as('alice').ref('games/g1/status').set('playing'))
    await assertSucceeds(as('bob').ref('games/g1/updraft/startedAt').set(2000))
    await assertFails(as('alice').ref('games/g1/updraft/startedAt').set(3000))
  })

  it('refuses the node on another game type', async () => {
    await put(room(round(), 'pong'))
    await assertFails(as('alice').ref('games/g1/updraft/X').set(climber()))
  })

  it('lets a whole-room transaction settle the round with unchanged children', async () => {
    const r = room(round({ X: climber(), O: climber({ dead: true, best: 100 }), haz: { O: { 0: { k: 'fog', at: 0 } } } }))
    await put(r)
    await assertSucceeds(as('bob').ref('games/g1').set({ ...r, status: 'finished', winner: 'X', scores: { X: 1, O: 0 } }))
  })

  it('allows co-op result only with round settlement', async () => {
    const r = room({ seed: 77, startedAt: 1000, lives: 0 }, 'updraftduo')
    await put(r)
    await assertFails(as('alice').ref('games/g1/updraft/result').set('failed'))
    await assertSucceeds(as('bob').ref('games/g1').set({
      ...r, status: 'finished', winner: 'draw', updraft: { ...r.updraft, result: 'failed' },
    }))
  })

  it('lets PLAY AGAIN replace the round with a fresh one', async () => {
    const r = room({ seed: 7, startedAt: 1000, lives: 1, X: climber(), keys: { X: { 1: true } }, result: 'failed' }, 'updraftduo')
    await put({ ...r, status: 'finished', winner: 'draw' })
    await assertSucceeds(as('bob').ref('games/g1').update({ updraft: { seed: 99, lives: 3 }, status: 'playing', winner: null }))
  })
})
