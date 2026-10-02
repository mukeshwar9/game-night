// Arrows: the room's host-picked difficulty (`games/{id}/arrowsDifficulty`)
// and the solo campaign mirror (`users/{uid}/arrowsSolo`).
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const room = (extra = {}) => gameNode({
  x: 'alice', o: 'bob', status: 'playing',
  extra: { gameType: 'arrows', board: null, currentTurn: null, arrowsRound: 0, arrowsSeed: 99, ...extra },
})
const progress = {
  levels: { l1: 3, l2: 2, l20: 1 },
  endless: { easy: 4, medium: 0, hard: 1 },
  updatedAt: 1000,
}

describe('Arrows room difficulty', () => {
  it('accepts the four difficulties from a seated player', async () => {
    await seed(T.env, 'games/g1', room())
    for (const d of ['easy', 'medium', 'hard', 'mixed']) {
      await assertSucceeds(as('alice').ref('games/g1/arrowsDifficulty').set(d))
    }
    await assertSucceeds(as('bob').ref('games/g1/arrowsDifficulty').set('hard'))
  })

  it('rejects an unknown difficulty and non-members', async () => {
    await seed(T.env, 'games/g1', room())
    await assertFails(as('alice').ref('games/g1/arrowsDifficulty').set('insane'))
    await assertFails(as('alice').ref('games/g1/arrowsDifficulty').set(3))
    await assertFails(as('mallory').ref('games/g1/arrowsDifficulty').set('easy'))
  })

  it('lets the round-start transaction rewrite the whole room with the difficulty unchanged', async () => {
    await seed(T.env, 'games/g1', room({ arrowsDifficulty: 'medium' }))
    await assertSucceeds(as('bob').ref('games/g1').set(room({ arrowsDifficulty: 'medium', arrowsStartedAt: 5000 })))
  })
})

describe('Arrows solo progress', () => {
  it('lets the owner save and read their own progress only', async () => {
    await assertSucceeds(as('alice').ref('users/alice/arrowsSolo').set(progress))
    await assertSucceeds(as('alice').ref('users/alice/arrowsSolo').get())
    await assertFails(as('bob').ref('users/alice/arrowsSolo').get())
    await assertFails(as('bob').ref('users/alice/arrowsSolo').set(progress))
  })

  it('keeps level keys, stars and endless counts in shape', async () => {
    const at = as('alice').ref('users/alice/arrowsSolo')
    await assertFails(at.set({ ...progress, levels: { l21: 3 } }))
    await assertFails(at.set({ ...progress, levels: { l0: 3 } }))
    await assertFails(at.set({ ...progress, levels: { 1: 3 } }))
    await assertFails(at.set({ ...progress, levels: { l1: 4 } }))
    await assertFails(at.set({ ...progress, levels: { l1: 0 } }))
    await assertFails(at.set({ ...progress, endless: { easy: -1 } }))
    await assertFails(at.set({ ...progress, endless: { insane: 2 } }))
    await assertFails(at.set({ ...progress, cheat: true }))
  })
})
