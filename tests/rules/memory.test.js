// Memory duels (Chimp Test, Visual Memory): the race-the-same-level keys the
// pages write. A slip is recorded per player (the wrong cell, or -1 when the
// recall window closed) and a clear time breaks a double slip.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const room = (gameType, extra = {}) => gameNode({
  x: 'alice', o: 'bob', status: 'playing',
  extra: { gameType, board: null, currentTurn: null, ...extra },
})
const put = (value) => seed(T.env, 'games/m1', value)

describe('memory duels', () => {
  it('lets seated players record a Chimp slip and clear time', async () => {
    await put(room('chimp', { chimpLevel: 4, chimpLayout: [1, 2, 3, 4] }))
    await assertSucceeds(as('alice').ref('games/m1').update({ chimpFailX: 7 }))
    await assertSucceeds(as('bob').ref('games/m1').update({ chimpDoneO: true, chimpProgressO: 4, chimpTimeO: 4200 }))
    await assertSucceeds(as('bob').ref('games/m1/chimpFailX').set(-1))
    await assertFails(as('mallory').ref('games/m1').update({ chimpFailO: 3 }))
  })

  it('lets seated players write the simultaneous Visual Memory keys', async () => {
    await put(room('visualmemory', { vmLevel: 3, vmPattern: [1, 5, 9] }))
    await assertSucceeds(as('alice').ref('games/m1').update({ vmClickedX: [1, 5], vmRoundStartedAt: Date.now() }))
    await assertSucceeds(as('bob').ref('games/m1').update({ vmFailO: 2 }))
    await assertSucceeds(as('alice').ref('games/m1').update({ vmDoneX: true, vmTimeX: 3100 }))
    await assertFails(as('mallory').ref('games/m1').update({ vmDoneO: true }))
  })

  it('still refuses keys no game uses', async () => {
    await put(room('chimp'))
    await assertFails(as('alice').ref('games/m1').update({ chimpCheatX: 1 }))
  })
})
