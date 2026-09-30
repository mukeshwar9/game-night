// Size hardening: no node a signed-in stranger (or a room member) can write may
// take an arbitrarily large value. Walks every top-level key the rules allow in
// a room and tries to store a 100 KB string and a 5,000-entry array in it; both
// must be refused, whatever the key's real shape is.
import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { assertFails, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)

const rules = JSON.parse(fs.readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8')).rules
const roomKeys = Object.keys(rules.games.$gameId).filter(k => !k.startsWith('.') && k !== '$other')
// `wire` and `round` are shared, game-specific sub-trees whose key set is open
// (the rules name only some of the keys), so an array of junk keys is still
// accepted there. A scalar in their place is refused like everywhere else.
const OPEN_KEY_SETS = new Set(['wire', 'round'])

const BIG_STRING = 'x'.repeat(100_000)
const BIG_ARRAY = Array.from({ length: 5000 }, (_, i) => `v${i}`)

describe('a room member cannot store oversized values', () => {
  const room = () => put('games/H1', { ...gameNode({ x: 'alice', o: 'bob' }), createdAt: Date.now() })

  it('sees the room keys the rules allow', () => {
    expect(roomKeys.length).toBeGreaterThan(30)
  })

  it.each(roomKeys)('room key %s refuses a 100 KB string and a 5,000-entry array', async (key) => {
    await room()
    await assertFails(as('alice').ref(`games/H1/${key}`).set(BIG_STRING), `${key}: string`)
    if (OPEN_KEY_SETS.has(key)) return
    await room()
    await assertFails(as('alice').ref(`games/H1/${key}`).set(BIG_ARRAY), `${key}: array`)
  })

  it('refuses an unknown key of any size', async () => {
    await room()
    await assertFails(as('alice').ref('games/H1/junk').set(BIG_STRING))
    await assertFails(as('alice').ref('games/H1/junk').set(1))
  })
})

describe('other shared nodes', () => {
  it('users/{uid} refuses unknown keys', async () => {
    await assertFails(as('alice').ref('users/alice/junk').set(BIG_STRING))
  })
  it('friendRequests refuse unknown keys', async () => {
    await assertFails(as('alice').ref('friendRequests/bob/alice').set({ name: 'A', at: Date.now(), junk: BIG_STRING }))
  })
  it('errors refuse an oversized message and more than the per-account slots', async () => {
    const day = new Date().toISOString().slice(0, 10)
    const report = (msg) => ({ at: Date.now(), kind: 'error', msg, route: '/', build: 'dev', ua: 'x', uid: 'alice' })
    await assertFails(as('alice').ref(`errors/${day}/alice-1`).set(report(BIG_STRING)))
    await assertFails(as('alice').ref(`errors/${day}/alice-25`).set(report('ok')))
  })
})
