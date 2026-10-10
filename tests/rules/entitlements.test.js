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

describe('ageGate (neutral birth-year question)', () => {
  it('lets the owner record a birth year once and read it back', async () => {
    await assertSucceeds(as('alice').ref('ageGate/alice').set({ year: 1999, at: Date.now() }))
    await assertSucceeds(as('alice').ref('ageGate/alice').get())
  })

  it('cannot be changed or deleted once recorded, so an under-13 answer sticks', async () => {
    await put('ageGate/kid', { year: 2018, at: 1 })
    await assertFails(as('kid').ref('ageGate/kid').set({ year: 1990, at: 2 }))
    await assertFails(as('kid').ref('ageGate/kid/year').set(1990))
    await assertFails(as('kid').ref('ageGate/kid').remove())
  })

  it('is private to its owner and rejects nonsense years', async () => {
    await put('ageGate/alice', { year: 1999, at: 1 })
    await assertFails(as('bob').ref('ageGate/alice').get())
    await assertFails(as('bob').ref('ageGate/bob2').set({ year: 1999 }))
    await assertFails(as('bob').ref('ageGate/bob').set({ year: 1850 }))
    await assertFails(as('bob').ref('ageGate/bob').set({ year: 1999.5 }))
    await assertFails(as('bob').ref('ageGate/bob').set({ year: 'old' }))
    await assertFails(as('bob').ref('ageGate/bob').set({ year: 1999, extra: 1 }))
  })
})

describe('razorpayOrders', () => {
  it('is server-only: no client can read an order or plant one to claim a payment', async () => {
    await put('razorpayOrders/order_1', { uid: 'alice', product: 'supporter', amount: 29900, currency: 'INR', at: 1 })
    await assertFails(as('alice').ref('razorpayOrders/order_1').get())
    await assertFails(as('bob').ref('razorpayOrders/order_1').get())
    await assertFails(as('bob').ref('razorpayOrders/order_2').set({ uid: 'bob', product: 'pass-yearly', amount: 100, currency: 'INR', at: 1 }))
    await assertFails(as('alice').ref('razorpayOrders/order_1/uid').set('bob'))
  })
})
