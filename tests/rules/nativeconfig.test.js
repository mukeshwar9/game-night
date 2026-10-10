// `config/minNativeVersion` is the minimum-version gate for the store builds
// (src/lib/native/versionGate.js): { ios: '1.2.0', android: '1.2.0' }. Every
// signed-in client (anonymous included) reads it once at launch; it is edited
// from the Firebase console, which bypasses rules, so nobody can write it from
// a client - not even an admin profile. Nothing else under `config` is exposed.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)

const GATE = { ios: '1.2.0', android: '1.3.0' }

describe('config/minNativeVersion', () => {
  it('is readable by a signed-in player, before and after an admin sets it', async () => {
    await assertSucceeds(as('alice').ref('config/minNativeVersion').get())
    await seed(T.env, 'config/minNativeVersion', GATE)
    const snap = await assertSucceeds(as('alice').ref('config/minNativeVersion').get())
    if (snap.val()?.ios !== '1.2.0' || snap.val()?.android !== '1.3.0') throw new Error('gate value not readable')
  })

  it('lets a client read a single platform entry', async () => {
    await seed(T.env, 'config/minNativeVersion', GATE)
    await assertSucceeds(as('alice').ref('config/minNativeVersion/ios').get())
    await assertSucceeds(as('alice').ref('config/minNativeVersion/android').get())
  })

  it('is not readable signed out', async () => {
    await seed(T.env, 'config/minNativeVersion', GATE)
    await assertFails(as(null).ref('config/minNativeVersion').get())
  })

  it('cannot be written by a player, including one who is an admin', async () => {
    await seed(T.env, 'users/boss', { admin: true })
    for (const uid of ['alice', 'boss']) {
      await assertFails(as(uid).ref('config/minNativeVersion').set(GATE))
      await assertFails(as(uid).ref('config/minNativeVersion/ios').set('9.9.9'))
      await assertFails(as(uid).ref('config/minNativeVersion/android').set('9.9.9'))
    }
    await assertFails(as(null).ref('config/minNativeVersion').set(GATE))
  })

  it('cannot be raised, changed or removed once set', async () => {
    await seed(T.env, 'config/minNativeVersion', GATE)
    await assertFails(as('alice').ref('config/minNativeVersion/ios').set('0.0.1'))
    await assertFails(as('alice').ref('config/minNativeVersion').remove())
    await assertFails(as('alice').ref('config/minNativeVersion').update({ ios: '5.0.0' }))
  })
})

describe('the rest of config', () => {
  it('is neither readable nor writable, so future settings start private', async () => {
    await seed(T.env, 'config', { minNativeVersion: GATE, secret: 'x', other: { a: 1 } })
    await assertFails(as('alice').ref('config').get())
    await assertFails(as('alice').ref('config/secret').get())
    await assertFails(as('alice').ref('config/other/a').get())
    await assertFails(as('alice').ref('config/secret').set('y'))
    await assertFails(as('alice').ref('config/newKey').set(true))
    await assertFails(as('alice').ref('config').set({ minNativeVersion: GATE }))
    await assertFails(as(null).ref('config/secret').get())
  })
})
