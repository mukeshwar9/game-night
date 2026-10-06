// The invite push message: data-only for web (no duplicate notification),
// a system-drawn notification for iOS and Android, the /game/ route, and a
// moderated sender name. Runs against the esbuild bundle that ships, like
// core.test.js. `npm --prefix functions test` builds first.
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// push.js is safe to require without an emulator: firebase-admin is only
// touched inside the handlers.
const { _test } = require('../push')

const web = { hash: 'a', token: 't'.repeat(30), platform: 'web' }
const ios = { hash: 'b', token: 'u'.repeat(30), platform: 'ios' }
const android = { hash: 'c', token: 'v'.repeat(30), platform: 'android' }
const build = (invite, token = web) => _test.buildInviteMessage(invite, token)

describe('buildInviteMessage (web)', () => {
  test('is data-only, so the browser and the service worker never both notify', () => {
    const msg = build({ fromName: 'Alice', gameId: 'ABC123' })
    assert.deepEqual(msg, {
      token: web.token,
      data: { title: 'Game Night', body: 'Alice invited you to play!', url: '/game/ABC123', kind: 'invite' },
    })
  })

  test('a token with no platform (saved before the field existed) is handled as web', () => {
    const msg = build({ gameId: 'ABC123' }, { hash: 'x', token: 'w'.repeat(30) })
    assert.equal(msg.notification, undefined)
    assert.equal(msg.apns, undefined)
    assert.equal(msg.android, undefined)
    assert.equal(msg.data.title, 'Game Night')
  })

  test('links to the /game/:gameId route, never /g/', () => {
    assert.equal(build({ gameId: 'ABC123' }).data.url, '/game/ABC123')
    assert.equal(build({}).data.url, '/')
  })

  test('masks a denied sender name and falls back when it is missing', () => {
    assert.match(build({ fromName: 'big fuck', gameId: 'X' }).data.body, /^big •+ invited you to play!$/)
    assert.equal(build({ gameId: 'X' }).data.body, 'A friend invited you to play!')
  })
})

describe('buildInviteMessage (native)', () => {
  test('iOS gets a notification and aps block, since a data-only push is silent there', () => {
    const msg = build({ fromName: 'Alice', gameId: 'ABC123' }, ios)
    assert.equal(msg.token, ios.token)
    assert.deepEqual(msg.notification, { title: 'Game Night', body: 'Alice invited you to play!' })
    assert.deepEqual(msg.data, { url: '/game/ABC123', kind: 'invite', gameId: 'ABC123' })
    assert.equal(msg.apns.payload.aps.sound, 'default')
    assert.equal(msg.apns.payload.aps['thread-id'], 'ABC123')
    assert.equal(msg.apns.headers['apns-collapse-id'], 'ABC123')
    assert.equal(msg.android, undefined)
  })

  test('Android gets a high-priority notification on the invites channel, tagged by room', () => {
    const msg = build({ fromName: 'Alice', gameId: 'ABC123' }, android)
    assert.equal(msg.token, android.token)
    assert.deepEqual(msg.notification, { title: 'Game Night', body: 'Alice invited you to play!' })
    assert.deepEqual(msg.data, { url: '/game/ABC123', kind: 'invite', gameId: 'ABC123' })
    assert.deepEqual(msg.android, { priority: 'high', notification: { channelId: 'invites', tag: 'ABC123' } })
    assert.equal(msg.apns, undefined)
  })

  test('native messages carry the same moderated name and the gameId for tap routing', () => {
    for (const t of [ios, android]) {
      assert.match(build({ fromName: 'big fuck', gameId: 'X' }, t).notification.body, /^big •+ invited you to play!$/)
      assert.equal(build({ gameId: 'X' }, t).data.gameId, 'X')
    }
  })

  test('without a room there is no gameId, tag or collapse id (and no undefined values)', () => {
    const i = build({}, ios)
    assert.deepEqual(i.data, { url: '/', kind: 'invite' })
    assert.equal(i.apns.headers, undefined)
    assert.equal(i.apns.payload.aps['thread-id'], 'invites')
    const a = build({}, android)
    assert.deepEqual(a.data, { url: '/', kind: 'invite' })
    assert.deepEqual(a.android.notification, { channelId: 'invites' })
    for (const m of [i, a]) assert.doesNotMatch(JSON.stringify(m), /undefined/)
  })

  test('a room id is capped at 40 characters like the route', () => {
    assert.equal(build({ gameId: 'x'.repeat(60) }, ios).data.gameId.length, 40)
  })
})

describe('buildInviteMessages', () => {
  test('builds one message per token, in order, each with its own platform payload', () => {
    const msgs = _test.buildInviteMessages({ fromName: 'Alice', gameId: 'ABC123' }, [web, ios, android])
    assert.deepEqual(msgs.map(m => m.token), [web.token, ios.token, android.token])
    assert.equal(msgs[0].notification, undefined)
    assert.ok(msgs[1].apns && msgs[1].notification)
    assert.ok(msgs[2].android && msgs[2].notification)
  })
})

describe('isBlocked', () => {
  const dbWith = (blocks) => ({ ref: (path) => ({ get: async () => ({ exists: () => blocks.includes(path) }) }) })

  test('is true only when the recipient blocked the sender', async () => {
    const db = dbWith(['blocks/bob/alice'])
    assert.equal(await _test.isBlocked('bob', 'alice', db), true)
    assert.equal(await _test.isBlocked('alice', 'bob', db), false)
    assert.equal(await _test.isBlocked('bob', 'carol', db), false)
  })

  test('is false without both uids', async () => {
    assert.equal(await _test.isBlocked('', 'alice', dbWith([])), false)
    assert.equal(await _test.isBlocked('bob', undefined, dbWith([])), false)
  })
})

describe('party invites', () => {
  test('say "their party" with the head-count on every platform', () => {
    const invite = { fromName: 'Alice', gameId: 'ABC123', kind: 'party', size: 2, cap: 4 }
    assert.equal(build(invite).data.body, 'Alice invited you to their party (2/4)')
    assert.equal(build(invite, ios).notification.body, 'Alice invited you to their party (2/4)')
    assert.equal(build(invite, android).notification.body, 'Alice invited you to their party (2/4)')
  })

  test('drop a missing or junk head-count, default the cap to 4', () => {
    assert.equal(_test.inviteBody({ kind: 'party' }, 'Alice'), 'Alice invited you to their party')
    assert.equal(_test.inviteBody({ kind: 'party', size: 3 }, 'Alice'), 'Alice invited you to their party (3/4)')
    assert.equal(_test.inviteBody({ kind: 'party', size: 99, cap: 4 }, 'Alice'), 'Alice invited you to their party')
    assert.equal(_test.inviteBody({ kind: 'other' }, 'Alice'), 'Alice invited you to play!')
  })
})

describe('friend request and joined pushes', () => {
  test('a friend request opens /friends and collapses per sender', () => {
    const webMsg = _test.buildFriendRequestMessage({ name: 'Alice' }, 'aliceUid', web)
    assert.deepEqual(webMsg.data, { title: 'Game Night', body: 'Alice wants to be friends on Game Night', url: '/friends', kind: 'friend' })
    const iosMsg = _test.buildFriendRequestMessage({ name: 'Alice' }, 'aliceUid', ios)
    assert.deepEqual(iosMsg.data, { url: '/friends', kind: 'friend' })
    assert.equal(iosMsg.apns.headers['apns-collapse-id'], 'friend-aliceUid')
    assert.equal(iosMsg.apns.payload.aps['thread-id'], 'friends')
    const androidMsg = _test.buildFriendRequestMessage({}, 'aliceUid', android)
    assert.equal(androidMsg.notification.body, 'Someone wants to be friends on Game Night')
    assert.equal(androidMsg.android.notification.tag, 'friend-aliceUid')
  })

  test('a joined push links to the room with a moderated name', () => {
    const msg = _test.buildJoinedMessage({ name: 'Bob' }, 'ABC123', ios)
    assert.deepEqual(msg.notification, { title: 'Game Night', body: 'Bob joined your room. Jump back in!' })
    assert.deepEqual(msg.data, { url: '/game/ABC123', kind: 'joined', gameId: 'ABC123' })
    assert.match(_test.buildJoinedMessage({ name: 'big fuck' }, 'X', web).data.body, /^big •+ joined your room/)
  })

  test('the host counts as away only with no live connection', () => {
    assert.equal(_test.hostAway({ presence: { X: { conns: { c1: 1 } } } }), false)
    assert.equal(_test.hostAway({ presence: { X: { online: false, awayAt: 5 } } }), true)
    assert.equal(_test.hostAway({}), true)
  })

  test('no joined push when the host is in the room, joined their own room, or the room is over', async () => {
    const db = (game) => ({ ref: () => ({ get: async () => ({ val: () => game, exists: () => false }) }) })
    const room = { status: 'playing', players: { X: { playerId: 'host' } }, presence: { X: { conns: { c1: 1 } } } }
    assert.equal((await _test.sendJoinedPush('ABC123', { playerId: 'bob' }, db(room))).reason, 'host-here')
    assert.equal((await _test.sendJoinedPush('ABC123', { playerId: 'host' }, db({ ...room, presence: {} }))).reason, 'no-host')
    assert.equal((await _test.sendJoinedPush('ABC123', { playerId: 'bob' }, db({ ...room, presence: {}, status: 'finished' }))).reason, 'host-here')
  })
})
