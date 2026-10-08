// unlocks/{uid} (cosmetic sign-up rewards) and accountMerges/{guestUid} (merge
// audit rows) are written only by Cloud Functions (functions/accountMerge.js).
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)

describe('unlocks', () => {
  it('is readable by its owner only', async () => {
    await put('unlocks/alice', { savedBadge: { at: 1 } })
    await assertSucceeds(as('alice').ref('unlocks/alice').get())
    await assertSucceeds(as('alice').ref('unlocks/alice/savedBadge').get())
    await assertFails(as('bob').ref('unlocks/alice').get())
    await assertFails(as(null).ref('unlocks/alice').get())
  })

  it('cannot be written by anyone from a client, including the owner', async () => {
    await assertFails(as('alice').ref('unlocks/alice/savedBadge').set({ at: 1 }))
    await assertFails(as('alice').ref('unlocks/alice').set({ savedBadge: { at: 1 } }))
    await assertFails(as('bob').ref('unlocks/alice/savedBadge').set({ at: 1 }))
    await put('unlocks/alice', { savedBadge: { at: 1 } })
    await assertFails(as('alice').ref('unlocks/alice').remove())
  })

  it('cannot be listed', async () => {
    await put('unlocks/alice', { savedBadge: { at: 1 } })
    await assertFails(as('alice').ref('unlocks').get())
  })
})

describe('accountMerges', () => {
  it('has no client read or write', async () => {
    await put('accountMerges/guest1', { into: 'alice', at: 1 })
    await assertFails(as('alice').ref('accountMerges/guest1').get())
    await assertFails(as('guest1').ref('accountMerges/guest1').get())
    await assertFails(as('alice').ref('accountMerges').get())
    await assertFails(as('alice').ref('accountMerges/guest2').set({ into: 'alice', at: 1 }))
    await assertFails(as('guest1').ref('accountMerges/guest1').remove())
  })
})
