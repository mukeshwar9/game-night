const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { _test } = require('../errorDigest')
const { buildDigest, formatDigest, runDigest } = _test

const report = (over = {}) => ({ at: 1, kind: 'error', msg: 'boom', route: '/game/:id', build: 'AbC12_-9', ua: 'Chrome 128 · macOS', uid: 'u1', ...over })

describe('buildDigest', () => {
  test('groups by message, game and build and counts distinct accounts', () => {
    const d = buildDigest('2026-09-29', {
      a: report(),
      b: report({ uid: 'u2' }),
      c: report({ msg: 'other', gameType: 'pong', build: 'Zz', uid: 'u2' }),
    }, ['boom', 'other'])
    assert.equal(d.total, 3)
    assert.equal(d.users, 2)
    assert.deepEqual(d.top.map(m => [m.msg, m.count]), [['boom', 2], ['other', 1]])
    assert.deepEqual(d.byGame, [{ gameType: 'none', count: 2 }, { gameType: 'pong', count: 1 }])
    assert.deepEqual(d.byBuild.map(b => b.build), ['AbC12_-9', 'Zz'])
    assert.equal(d.alert, false)
  })

  test('an empty or junk day is a quiet digest', () => {
    for (const reports of [null, {}, { x: 5, y: { nomsg: 1 } }]) {
      const d = buildDigest('2026-09-29', reports)
      assert.equal(d.total, 0)
      assert.equal(d.alert, false)
      assert.deepEqual(d.top, [])
    }
  })

  test('alerts on a new message reported often enough, not on a rare or known one', () => {
    const three = { a: report({ msg: 'fresh' }), b: report({ msg: 'fresh' }), c: report({ msg: 'fresh' }) }
    assert.equal(buildDigest('d', three, []).alert, true)
    assert.equal(buildDigest('d', three, ['fresh']).alert, false)
    assert.equal(buildDigest('d', { a: report({ msg: 'fresh' }) }, []).alert, false)
  })

  test('alerts on volume alone', () => {
    const many = {}
    for (let i = 0; i < _test.ALERT_TOTAL; i++) many[`k${i}`] = report({ uid: `u${i}` })
    assert.equal(buildDigest('d', many, ['boom']).alert, true)
  })

  test('bounds the stored messages and truncates long ones', () => {
    const reports = {}
    for (let i = 0; i < 80; i++) reports[`k${i}`] = report({ msg: `m${i}` })
    reports.long = report({ msg: 'x'.repeat(500) })
    const d = buildDigest('d', reports)
    assert.equal(d.messages.length, 50)
    assert.ok(d.top.every(m => m.msg.length <= 300))
  })
})

describe('formatDigest', () => {
  test('is a short readable summary', () => {
    const text = formatDigest(buildDigest('2026-09-29', { a: report() }, []))
    assert.match(text, /Game Night errors 2026-09-29: 1 reports from 1 accounts/)
    assert.match(text, /1x NEW boom/)
  })
})

// A tiny in-memory stand-in for the admin database.
function fakeDb(data) {
  const set = {}
  const node = (path) => ({
    get: async () => ({ val: () => data[path] ?? null }),
    set: async (v) => { set[path] = v },
  })
  return { ref: node, written: set }
}

describe('runDigest', () => {
  const NOW = Date.UTC(2026, 8, 30, 7, 0, 0)

  test('digests yesterday, compares with the day before, writes errorDigests/{day}', async () => {
    const db = fakeDb({
      'errors/2026-09-29': { a: report(), b: report() },
      'errorDigests/2026-09-28/messages': ['boom'],
    })
    const d = await runDigest(db, NOW, '')
    assert.equal(d.day, '2026-09-29')
    assert.equal(db.written['errorDigests/2026-09-29'].total, 2)
    assert.equal(d.alert, false)
  })

  test('posts to the webhook only on an alert, and survives a failing webhook', async () => {
    const calls = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { ok: false, status: 500 } }
    try {
      const quiet = fakeDb({ 'errors/2026-09-29': { a: report() }, 'errorDigests/2026-09-28/messages': ['boom'] })
      await runDigest(quiet, NOW, 'https://hooks.example/x')
      assert.equal(calls.length, 0)
      const loud = fakeDb({ 'errors/2026-09-29': { a: report({ msg: 'new' }), b: report({ msg: 'new' }), c: report({ msg: 'new' }) } })
      const d = await runDigest(loud, NOW, 'https://hooks.example/x')
      assert.equal(d.alert, true)
      assert.equal(calls.length, 1)
      assert.match(calls[0][1].text, /ALERT/)
      assert.equal(calls[0][1].text, calls[0][1].content)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
