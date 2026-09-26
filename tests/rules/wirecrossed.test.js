// WIRE CROSSED (`games/{id}/wire`): the per-bomb node both seats write
// through whole-room transactions, plus the quick-phrase ping.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const bomb = (over = {}) => ({ seed: '12345', level: 1, bombNo: 1, tech: 'X', phase: 'armed', strikes: 0, ...over })
const room = (wire = bomb()) => gameNode({
  x: 'alice', o: 'bob', status: 'playing',
  extra: { gameType: 'wirecrossed', board: null, currentTurn: null, wire },
})
const put = (value) => seed(T.env, 'games/g1', value)

describe('WIRE CROSSED', () => {
  it('lets either seat write the bomb node; never a stranger', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/wire').set(bomb({ strikes: 1, mods: { 0: { cut: { 2: true } } } })))
    await assertSucceeds(as('bob').ref('games/g1/wire/solved/1').set(true))
    await assertFails(as('mallory').ref('games/g1/wire/strikes').set(2))
  })

  it('keeps tech, phase and strikes in range', async () => {
    await put(room())
    await assertFails(as('alice').ref('games/g1/wire/tech').set('Z'))
    await assertFails(as('alice').ref('games/g1/wire/phase').set('exploded'))
    await assertFails(as('alice').ref('games/g1/wire/strikes').set(4))
    await assertSucceeds(as('alice').ref('games/g1/wire/strikes').set(3))
    await assertSucceeds(as('alice').ref('games/g1/wire/phase').set('over'))
  })

  it('accepts a quick-phrase ping and rejects free text', async () => {
    await put(room())
    await assertSucceeds(as('bob').ref('games/g1/wire/ping').set({ by: 'O', p: 3, at: 10 }))
    await assertFails(as('bob').ref('games/g1/wire/ping').set({ by: 'O', p: 3, at: 10, text: 'hi' }))
    await assertFails(as('bob').ref('games/g1/wire/ping').set({ by: 'O', p: 42, at: 10 }))
  })

  it('lets a whole-room transaction rewrite the room with an unchanged bomb', async () => {
    const r = room(bomb({ ping: { by: 'X', p: 1, at: 5 } }))
    await put(r)
    await assertSucceeds(as('bob').ref('games/g1').set({ ...r, chatLog: null, lastActivityAt: 9, scores: { X: 1, O: 1 } }))
  })
})
