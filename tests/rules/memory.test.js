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

describe('DAILY MEMORY and memory bests', () => {
  const entry = (over = {}) => ({ game: 'chimp', score: 9, at: Date.now(), name: 'Alice', ...over })

  it('lets a player post today\'s result once, as themselves', async () => {
    await assertSucceeds(as('alice').ref('dailyMemory/2026-10-02/alice').set(entry()))
    await assertFails(as('alice').ref('dailyMemory/2026-10-02/alice').set(entry({ score: 30 })))
    await assertFails(as('alice').ref('dailyMemory/2026-10-02/alice/score').set(30))
    await assertFails(as('alice').ref('dailyMemory/2026-10-02/bob').set(entry({ name: 'Bob' })))
  })

  it('keeps a result in shape', async () => {
    await assertFails(as('alice').ref('dailyMemory/2026-10-03/alice').set(entry({ game: 'pong' })))
    await assertFails(as('alice').ref('dailyMemory/2026-10-03/alice').set(entry({ score: 5000 })))
    await assertFails(as('alice').ref('dailyMemory/2026-10-03/alice').set({ ...entry(), extra: 1 }))
    await assertFails(as('alice').ref('dailyMemory/2026-10-03/alice').set({ game: 'chimp', score: 3 }))
  })

  it('lets signed-in players read a day, not the whole history', async () => {
    await seed(T.env, 'dailyMemory/2026-10-02/bob', entry({ name: 'Bob' }))
    await assertSucceeds(as('alice').ref('dailyMemory/2026-10-02/bob').get())
    await assertSucceeds(as('alice').ref('dailyMemory/2026-10-02').get())
    await assertFails(as('alice').ref('dailyMemory').get())
  })

  it('stores memory bests on the owner\'s account only', async () => {
    await assertSucceeds(as('alice').ref('users/alice/memoryBests').set({ simon: 12, chimp: 9 }))
    await assertFails(as('alice').ref('users/alice/memoryBests/pong').set(3))
    await assertFails(as('alice').ref('users/alice/memoryBests/simon').set('lots'))
    await assertFails(as('bob').ref('users/alice/memoryBests/simon').set(99))
  })
})
