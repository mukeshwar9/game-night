// Counters, error reports, feedback (with the 30 s server-side cooldown and
// chat reports), the server-owned leaderboard, and race-room lobby listings.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, partyNode, seed, rulesEnvFor } from './helpers.js'
import { playsDailyPath } from '../../src/lib/analytics.js'
import { buildErrorReport, buildIdFromUrl, dayKey, routeKey, shortUserAgent, MSG_MAX, STACK_MAX } from '../../src/lib/telemetry.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)
const increment = { '.sv': { increment: 1 } }
const TODAY = new Date().toISOString().slice(0, 10)

describe('plays and playsDaily', () => {
  it('only ever count up by one', async () => {
    await assertSucceeds(as('alice').ref('plays/hex/multi').set(increment))
    await assertSucceeds(as('alice').ref('plays/hex/multi').set(increment))
    await assertFails(as('alice').ref('plays/hex/multi').set(10))
    await assertSucceeds(as('alice').ref(`playsDaily/${TODAY}/hex/multi/started`).set(increment))
    await assertFails(as('alice').ref(`playsDaily/${TODAY}/hex/multi/started`).set(0))
    await assertFails(as('alice').ref(`playsDaily/${TODAY}/hex/online/started`).set(increment))
    await assertFails(as('alice').ref(`playsDaily/today/hex/multi/started`).set(increment))
  })

  it('keeps daily counters admin-read', async () => {
    await put('users/boss', { displayName: 'Boss', admin: true })
    await assertFails(as('alice').ref('playsDaily').get())
    await assertSucceeds(as('boss').ref('playsDaily').get())
  })
})

// The exact writes the app makes: analytics.js bump() is set(ref, increment(1))
// on plays/{type}/{mode} and playsDailyPath(...); telemetry.js sendToFirebase
// is set(push(errors/{dayKey(at)}), buildErrorReport({...})).
describe('the app’s own counter and error-report writes', () => {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36'

  it('accepts recordPlay / recordRoundEnd for every mode and counter', async () => {
    for (const mode of ['multi', 'solo', 'local']) {
      await assertSucceeds(as('alice').ref(`plays/chainreaction4/${mode}`).set(increment))
      for (const counter of ['started', 'finished', 'abandoned']) {
        const path = playsDailyPath(dayKey(), 'chainreaction4', mode, counter)
        await assertSucceeds(as('alice').ref(path).set(increment))
        await assertSucceeds(as('bob').ref(path).set(increment))
      }
    }
  })

  it('accepts a full-size report built by buildErrorReport', async () => {
    const at = Date.now()
    const report = buildErrorReport({
      msg: 'x'.repeat(MSG_MAX + 50), stack: 'y'.repeat(STACK_MAX + 50), kind: 'rejection', at, uid: 'alice',
      route: routeKey('/game/ABC123'), gameType: 'chainreaction4',
      build: buildIdFromUrl('https://game-night.web.app/assets/index-BCgFD2Nx.js'), ua: shortUserAgent(UA),
    })
    const ref = as('alice').ref(`errors/${dayKey(at)}`).push()
    await assertSucceeds(ref.set(report))
    const bare = buildErrorReport({ msg: 'boom', kind: 'error', at, uid: 'alice', route: routeKey('/'), build: buildIdFromUrl('http://127.0.0.1:5190/src/lib/telemetry.js'), ua: shortUserAgent('') })
    await assertSucceeds(as('alice').ref(`errors/${dayKey(at)}`).push().set(bare))
  })
})

describe('errors', () => {
  const report = (uid, over = {}) => ({ at: Date.now(), kind: 'error', msg: 'boom', route: '/game/X', build: 'abc', ua: 'Chrome', uid, ...over })

  it('are create-only, capped, and stamped with the reporter', async () => {
    await assertSucceeds(as('alice').ref(`errors/${TODAY}/e1`).set(report('alice')))
    await assertFails(as('alice').ref(`errors/${TODAY}/e1`).set(report('alice')))
    await assertFails(as('alice').ref(`errors/${TODAY}/e2`).set(report('bob')))
    await assertFails(as('alice').ref(`errors/${TODAY}/e3`).set(report('alice', { msg: 'x'.repeat(301) })))
    await assertFails(as('alice').ref(`errors/${TODAY}/e4`).set(report('alice', { extra: 1 })))
    await assertFails(as('alice').ref(`errors/${TODAY}/e5`).set(report('alice', { at: 1 })))
  })

  it('are readable by admins only', async () => {
    await put('users/boss', { displayName: 'Boss', admin: true })
    await assertFails(as('alice').ref(`errors/${TODAY}`).get())
    await assertSucceeds(as('boss').ref(`errors/${TODAY}`).get())
  })
})

describe('feedback cooldown and chat reports', () => {
  const item = (by, over = {}) => ({ type: 'bug', message: 'The board froze after my move.', by, name: 'Alice', status: 'open', createdAt: 1, updatedAt: 1, ...over })
  const file = (uid, id, value) => as(uid).ref().update({ [`feedback/${id}`]: value, [`users/${uid}/lastFeedbackAt`]: { '.sv': 'timestamp' } })

  it('allows one item per 30 s', async () => {
    await assertSucceeds(file('alice', 'f1', item('alice')))
    await assertFails(file('alice', 'f2', item('alice')))
    await put('users/alice/lastFeedbackAt', Date.now() - 31_000)
    await assertSucceeds(file('alice', 'f3', item('alice')))
  })

  it('requires the cooldown stamp in the same write', async () => {
    await assertFails(as('alice').ref('feedback/f1').set(item('alice')))
  })

  it('accepts a chat report with its capped fields', async () => {
    const r = item('alice', { type: 'report', message: 'Chat report — BOB: "rude"', gameId: 'ABC123', targetUid: 'bob', targetName: 'Bob', text: 'rude' })
    await assertSucceeds(file('alice', 'f1', r))
    await put('users/alice/lastFeedbackAt', 1)
    await assertFails(file('alice', 'f2', { ...r, text: 'x'.repeat(201) }))
  })
})

describe('leaderboard', () => {
  it('is readable by signed-in users and indexed for the verified sort', async () => {
    await put('leaderboard/alice', { name: 'Alice', wins: 3, games: 5, verifiedWins: 3, verified: true })
    await assertSucceeds(as('bob').ref('leaderboard').orderByChild('verifiedWins').limitToLast(50).get())
    await assertFails(as(null).ref('leaderboard').get())
  })
})

describe('matchmaking listings for race rooms', () => {
  const listing = (host) => ({ gameId: 'g1', gameType: 'reaction', visibility: 'public', hostUid: host, hostName: 'Alice', hostOnline: true, createdAt: 1, updatedAt: 1, expiresAt: 2 })

  it('lets the only seated player list a public race room', async () => {
    await put('games/g1', partyNode({ uids: ['alice'], gameType: 'reaction', extra: { visibility: 'public' } }))
    await assertSucceeds(as('alice').ref('matchmaking/g1').set(listing('alice')))
    await assertFails(as('mallory').ref('matchmaking/g1').set(listing('mallory')))
  })

  it('lets the player who joined take the listing down; not a stranger', async () => {
    await put('games/g1', partyNode({ uids: ['alice', 'bob'], gameType: 'reaction', extra: { visibility: 'public' } }))
    await put('matchmaking/g1', listing('alice'))
    await assertFails(as('mallory').ref('matchmaking/g1').remove())
    await assertSucceeds(as('bob').ref('matchmaking/g1').remove())
  })

  it('lets anyone clear the listing of a room that no longer exists', async () => {
    await put('matchmaking/g1', listing('alice'))
    await assertSucceeds(as('mallory').ref('matchmaking/g1').remove())
  })
})
