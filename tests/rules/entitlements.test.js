// entitlements/{uid} is the server-only record of what an account has bought.
// A client may read its own and never write any of it, so a Pass cannot be
// granted from a browser console. entitlementsPublic/{uid} is the badge copy
// other players may read.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)

const ent = { pass: { status: 'active', plan: 'monthly', currentPeriodEnd: 4_102_444_800_000 }, updatedAt: 1 }

describe('entitlements', () => {
  it('is readable by its owner only', async () => {
    await put('entitlements/alice', ent)
    await assertSucceeds(as('alice').ref('entitlements/alice').get())
    await assertFails(as('bob').ref('entitlements/alice').get())
    await assertFails(as(null).ref('entitlements/alice').get())
    await assertFails(as('bob').ref('entitlements/alice/pass').get())
  })

  it('cannot be written by anyone from a client, including the owner', async () => {
    await assertFails(as('alice').ref('entitlements/alice').set(ent))
    await assertFails(as('alice').ref('entitlements/alice/pass').set(ent.pass))
    await assertFails(as('alice').ref('entitlements/alice/admin').set(true))
    await assertFails(as('alice').ref('entitlements/alice/packs/themes-seasonal').set(true))
    await assertFails(as('bob').ref('entitlements/alice').set(ent))
  })

  it('cannot be edited or deleted once it exists', async () => {
    await put('entitlements/alice', ent)
    await assertFails(as('alice').ref('entitlements/alice/supporter').set(true))
    await assertFails(as('alice').ref('entitlements/alice').remove())
    await assertFails(as('alice').ref('entitlements/alice').update({ admin: true }))
  })

  it('cannot be granted through the user-owned record', async () => {
    // Nothing in the app reads these, but the rules must not give them meaning.
    await put('users/alice', { displayName: 'Alice' })
    await assertFails(as('alice').ref('entitlements/alice/pass').update({ status: 'active' }))
  })
})

describe('entitlementsPublic (badge copy)', () => {
  it('is readable by any signed-in user', async () => {
    await put('entitlementsPublic/alice', { pass: true, supporter: false })
    await assertSucceeds(as('bob').ref('entitlementsPublic/alice').get())
    await assertSucceeds(as('alice').ref('entitlementsPublic/alice').get())
    await assertFails(as(null).ref('entitlementsPublic/alice').get())
  })

  it('is never client-writable', async () => {
    await assertFails(as('alice').ref('entitlementsPublic/alice').set({ pass: true }))
    await assertFails(as('alice').ref('entitlementsPublic/alice/pass').set(true))
    await assertFails(as('bob').ref('entitlementsPublic/alice').set({ pass: true }))
  })
})
