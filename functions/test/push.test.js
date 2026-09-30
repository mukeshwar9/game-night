// The invite push message: data-only (no duplicate notification), the /game/
// route, and a moderated sender name. Runs against the esbuild bundle that
// ships, like core.test.js. `npm --prefix functions test` builds first.
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// push.js is safe to require without an emulator: firebase-admin is only
// touched inside the handlers.
const { _test } = require('../push')

const tokens = [{ hash: 'a', token: 't'.repeat(30) }, { hash: 'b', token: 'u'.repeat(30) }]

describe('buildInviteMessage', () => {
  test('is data-only, so the browser and the service worker never both notify', () => {
    const msg = _test.buildInviteMessage({ fromName: 'Alice', gameId: 'ABC123' }, tokens)
    assert.equal(msg.notification, undefined)
    assert.equal(msg.data.title, 'Game Night')
    assert.equal(msg.data.body, 'Alice invited you to play!')
    assert.deepEqual(msg.tokens, tokens.map(t => t.token))
  })

  test('links to the /game/:gameId route, never /g/', () => {
    assert.equal(_test.buildInviteMessage({ gameId: 'ABC123' }, tokens).data.url, '/game/ABC123')
    assert.equal(_test.buildInviteMessage({}, tokens).data.url, '/')
  })

  test('masks a denied sender name and falls back when it is missing', () => {
    assert.match(_test.buildInviteMessage({ fromName: 'big fuck', gameId: 'X' }, tokens).data.body, /^big •+ invited you to play!$/)
    assert.equal(_test.buildInviteMessage({ gameId: 'X' }, tokens).data.body, 'A friend invited you to play!')
  })
})
