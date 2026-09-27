// Host-picked race configuration lives on the room (`typingConfig`,
// `mathConfig`). The rules only validate the shape so a malformed or
// future-version config can never reach a client; host authority is enforced
// in the UI by the coordinator check. Older rooms without a config stay valid.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)

const typingConfig = { version: 1, length: 'medium', punctuation: false, numbers: false }
const mathConfig = {
  version: 1,
  operations: { add: true, subtract: true, multiply: true, divide: false },
  durationSeconds: 120,
  difficulty: 'progressive',
  range: 99,
}

const room = (gameType, extra = {}) => partyNode({ uids: ['alice', 'bob'], gameType, extra })

describe('Typing Race configuration', () => {
  it('accepts a valid versioned quote setup from a seated member', async () => {
    await seed(T.env, 'games/g1', room('typing'))
    await assertSucceeds(as('alice').ref('games/g1/typingConfig').set(typingConfig))
    await assertSucceeds(as('bob').ref('games/g1/typingConfig').set({ ...typingConfig, length: 'long', punctuation: true, numbers: true }))
  })

  it('rejects an unsupported length, non-boolean toggles, a wrong version, or extra keys', async () => {
    await seed(T.env, 'games/g1', room('typing'))
    await assertFails(as('alice').ref('games/g1/typingConfig').set({ ...typingConfig, length: 'thicc' }))
    await assertFails(as('alice').ref('games/g1/typingConfig').set({ ...typingConfig, punctuation: 1 }))
    await assertFails(as('alice').ref('games/g1/typingConfig').set({ ...typingConfig, version: 2 }))
    await assertFails(as('alice').ref('games/g1/typingConfig').set({ ...typingConfig, extra: true }))
    await assertFails(as('alice').ref('games/g1/typingConfig').set({ version: 1, length: 'medium' }))
  })

  it('leaves a room without a config writable (older clients and rooms)', async () => {
    await seed(T.env, 'games/g1', room('typing'))
    await assertSucceeds(as('alice').ref('games/g1/status').set('playing'))
  })

  it('refuses configuration writes from a non-member', async () => {
    await seed(T.env, 'games/g1', room('typing'))
    await assertFails(as('mallory').ref('games/g1/typingConfig').set(typingConfig))
  })
})

describe('Mental Math configuration', () => {
  it('accepts a valid operation/duration/difficulty setup', async () => {
    await seed(T.env, 'games/g1', room('math'))
    await assertSucceeds(as('alice').ref('games/g1/mathConfig').set(mathConfig))
    await assertSucceeds(as('bob').ref('games/g1/mathConfig').set({
      ...mathConfig, operations: { add: false, subtract: false, multiply: false, divide: true },
      durationSeconds: 180, difficulty: 'hard', range: 999,
    }))
  })

  it('rejects invalid durations, difficulties, ranges, operations, and an empty operation set', async () => {
    await seed(T.env, 'games/g1', room('math'))
    await assertFails(as('alice').ref('games/g1/mathConfig').set({ ...mathConfig, durationSeconds: 45 }))
    await assertFails(as('alice').ref('games/g1/mathConfig').set({ ...mathConfig, difficulty: 'wild' }))
    await assertFails(as('alice').ref('games/g1/mathConfig').set({ ...mathConfig, range: 100 }))
    await assertFails(as('alice').ref('games/g1/mathConfig').set({ ...mathConfig, operations: { add: true, subtract: true, multiply: true, divide: true, roots: true } }))
    await assertFails(as('alice').ref('games/g1/mathConfig').set({ ...mathConfig, operations: { add: false, subtract: false, multiply: false, divide: false } }))
    await assertFails(as('alice').ref('games/g1/mathConfig').set({ ...mathConfig, extra: true }))
  })
})
