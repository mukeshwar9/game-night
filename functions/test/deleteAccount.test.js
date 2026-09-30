const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { _test } = require('../deleteAccount')

describe('accountPaths', () => {
  test('covers every node keyed by the uid, including the server-only leaderboard row', () => {
    const paths = _test.accountPaths('u1')
    for (const node of ['leaderboard', 'users', 'profiles', 'presence', 'friends', 'friendRequests', 'invites']) {
      assert.ok(paths.includes(`${node}/u1`), node)
    }
  })

  test('adds the friend code and the reverse friend rows when known', () => {
    const paths = _test.accountPaths('u1', { friendUids: ['a', 'b'], code: 'ABC234' })
    assert.ok(paths.includes('codes/ABC234'))
    assert.ok(paths.includes('friends/a/u1'))
    assert.ok(paths.includes('friends/b/u1'))
  })
})
