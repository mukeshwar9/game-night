const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { _test } = require('../deleteAccount')

describe('accountPaths', () => {
  test('covers every node keyed by the uid, including the server-only leaderboard row', () => {
    const paths = _test.accountPaths('u1')
    for (const node of ['leaderboard', 'users', 'profiles', 'presence', 'friends', 'friendRequests', 'invites', 'blocks']) {
      assert.ok(paths.includes(`${node}/u1`), node)
    }
  })

  test('clears the server-only entitlements, so a deleted account leaves no purchase record', () => {
    const paths = _test.accountPaths('u1')
    assert.ok(paths.includes('entitlements/u1'))
    assert.ok(paths.includes('entitlementsPublic/u1'))
  })

  test('clears the server-only chat moderation strikes', () => {
    assert.ok(_test.accountPaths('u1').includes('moderation/u1'))
  })

  test('adds the friend code and the reverse friend rows when known', () => {
    const paths = _test.accountPaths('u1', { friendUids: ['a', 'b'], code: 'ABC234' })
    assert.ok(paths.includes('codes/ABC234'))
    assert.ok(paths.includes('friends/a/u1'))
    assert.ok(paths.includes('friends/b/u1'))
  })
})
