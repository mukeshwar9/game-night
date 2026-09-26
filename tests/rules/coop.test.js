// Co-op 2P games that keep their whole state in `round` (HUNCH, CONVERGE):
// both seats move the shared round and bump the team score together; a
// spectator can't touch either. Hands and locked words are plaintext by
// design (co-op: peeking only spoils your own game).
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'
import { applyPlay, startRun } from '../../src/lib/hunchLogic.js'
import { lockWord, startMatch } from '../../src/lib/convergeLogic.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const room = (gameType, round, scores = { X: 0, O: 0 }) => gameNode({
  o: 'bob', status: 'playing',
  extra: { gameType, board: null, currentTurn: null, round, scores },
})

describe('HUNCH', () => {
  const run = { ...startRun({ seed: 's' }), hands: { X: [10], O: [20] } }

  it('lets either seat play and clear a level with a team point', async () => {
    await seed(T.env, 'games/g1', room('hunch', run))
    const played = applyPlay(run, { player: 'X', card: 10, at: 1 })
    await assertSucceeds(as('alice').ref('games/g1').update({ round: played }))
    const cleared = applyPlay(played, { player: 'O', card: 20, at: 2 })
    await assertSucceeds(as('bob').ref('games/g1').update({ round: cleared, 'scores/X': 1, 'scores/O': 1 }))
  })

  it('finishes the room as a shared result', async () => {
    await seed(T.env, 'games/g1', room('hunch', run))
    await assertSucceeds(as('bob').ref('games/g1').update({ status: 'finished', winner: 'draw' }))
  })

  it('keeps spectators and score jumps out', async () => {
    await seed(T.env, 'games/g1', room('hunch', run))
    await assertFails(as('carol').ref('games/g1/round').set(startRun({ seed: 'x' })))
    await assertFails(as('alice').ref('games/g1/scores/X').set(3))
  })
})

describe('CONVERGE', () => {
  it('lets each seat lock a word and a spectator none', async () => {
    const match = startMatch({ seed: 's' })
    await seed(T.env, 'games/g1', room('converge', match))
    await assertSucceeds(as('alice').ref('games/g1').update({ round: lockWord(match, { player: 'X', word: 'pizza' }) }))
    await assertFails(as('carol').ref('games/g1/round/pending/O').set('MOON'))
  })
})
