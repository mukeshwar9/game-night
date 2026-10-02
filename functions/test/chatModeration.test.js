// Chat log upkeep, Jev moderation and report triage (chatModeration.js),
// against a small in-memory stand-in for the Admin SDK database and a fake
// fetch. `npm --prefix functions test` builds the core bundle first.
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const { _test } = require('../chatModeration')

// Minimal Admin-SDK-shaped database over a plain object: ref(path).get(),
// .set(), .transaction(), .push().key, and multi-path ref().update().
function fakeDb(initial = {}) {
  const root = JSON.parse(JSON.stringify(initial))
  let pushes = 0
  const parts = (p) => p.split('/').filter(Boolean)
  const read = (p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), root)
  const write = (p, v) => {
    const ks = parts(p)
    let o = root
    for (const k of ks.slice(0, -1)) o = o[k] ??= {}
    if (v === null) delete o[ks[ks.length - 1]]
    else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v))
  }
  const ref = (p = '') => ({
    get: async () => ({ val: () => read(p) ?? null, exists: () => read(p) != null }),
    set: async (v) => write(p, v),
    update: async (u) => { for (const [k, v] of Object.entries(u)) write(p ? `${p}/${k}` : k, v) },
    transaction: async (fn) => write(p, fn(read(p) ?? null)),
    push: () => ({ key: `push${++pushes}` }),
  })
  return { ref, root }
}

const jevReply = (answers) => async () => ({ ok: true, json: async () => ({ answers }) })
const choice = (label, p) => ({ type: 'choice', choice: label, probabilities: { [label]: p }, confidence: p })
const msg = (by, text, ts) => ({ by, name: by === 'u1' ? 'Ana' : 'Ben', text, ts })

function room(n = 3) {
  const chatLog = {}
  for (let i = 0; i < n; i++) chatLog[`m${String(i).padStart(2, '0')}`] = msg(i % 2 ? 'u2' : 'u1', `line ${i}`, i + 1)
  return { games: { G1: { gameType: 'connectfour', players: { X: { playerId: 'u1' }, O: { playerId: 'u2' } }, chatLog } } }
}

describe('jevKey', () => {
  test('is off with no key, reads the env key otherwise', () => {
    assert.equal(_test.jevKey({}, null), '')
    assert.equal(_test.jevKey({ TYPESAFE_API_KEY: ' k1 ' }, null), 'k1')
  })
  test('prefers a bound secret', () => {
    assert.equal(_test.jevKey({ TYPESAFE_API_KEY: 'env' }, { value: () => 'secret' }), 'secret')
  })
  test('secret binding needs TYPESAFE_SECRETS=1', () => {
    assert.equal(_test.typesafeSecretsEnabled(''), false)
    assert.equal(_test.typesafeSecretsEnabled('1'), true)
  })
})

describe('callJev', () => {
  test('posts the request with the bearer key and returns the answers', async () => {
    let seen
    const answers = await _test.callJev({ model: 'jev-latest', questions: {} }, 'k', async (url, init) => {
      seen = { url, init }
      return { ok: true, json: async () => ({ answers: { a: 1 } }) }
    })
    assert.deepEqual(answers, { a: 1 })
    assert.equal(seen.url, 'https://api.typesafe.ai/v1/systemone')
    assert.equal(seen.init.headers.Authorization, 'Bearer k')
    assert.equal(JSON.parse(seen.init.body).model, 'jev-latest')
  })
  test('throws on an HTTP error or a reply with no answers', async () => {
    await assert.rejects(_test.callJev({}, 'k', async () => ({ ok: false, status: 429 })), /429/)
    await assert.rejects(_test.callJev({}, 'k', async () => ({ ok: true, json: async () => ({}) })), /no answers/)
  })
})

describe('moderateMessage', () => {
  test('without a key it only prunes the log to the cap, and never calls Jev', async () => {
    const db = fakeDb(room(33))
    let called = false
    const out = await _test.moderateMessage({ gameId: 'G1', msgId: 'm32', msg: msg('u1', 'line 32', 33) }, { database: db, key: '', fetchImpl: async () => { called = true } })
    assert.deepEqual(out, { pruned: 3, action: 'off' })
    assert.equal(called, false)
    assert.equal(Object.keys(db.root.games.G1.chatLog).length, 30)
    assert.ok(db.root.games.G1.chatLog.m32)
    assert.equal(db.root.games.G1.chatLog.m00, undefined)
  })

  test('fine chat is left alone', async () => {
    const db = fakeDb(room(3))
    const out = await _test.moderateMessage({ gameId: 'G1', msgId: 'm02', msg: msg('u1', 'line 2', 3) }, {
      database: db, key: 'k', fetchImpl: jevReply({ category: choice('friendly_banter', 0.9), severity: { score: 0.2 } }),
    })
    assert.equal(out.action, 'none')
    assert.equal(db.root.feedback, undefined)
    assert.equal(db.root.games.G1.chatLog.m02.hidden, undefined)
  })

  test('a confident serious call hides the line, logs it for review and counts a strike', async () => {
    const db = fakeDb(room(3))
    const out = await _test.moderateMessage({ gameId: 'G1', msgId: 'm02', msg: msg('u1', 'whats ur snap', 3) }, {
      database: db, key: 'k', now: 99, fetchImpl: jevReply({ category: choice('contact_or_personal_info', 0.92), severity: { score: 2 } }),
    })
    assert.equal(out.action, 'hide')
    assert.equal(db.root.games.G1.chatLog.m02.hidden, true)
    assert.equal(db.root.games.G1.chatLog.m02.modReason, 'contact_or_personal_info')
    const [item] = Object.values(db.root.feedback)
    assert.equal(item.by, _test.AUTO_MOD_BY)
    assert.equal(item.targetUid, 'u1')
    assert.match(item.message, /hidden/)
    assert.match(item.chatContext, /Ana: whats ur snap$/)
    assert.deepEqual(db.root.moderation.u1, { strikes: 1, lastAt: 99, lastCategory: 'contact_or_personal_info' })
  })

  test('an uncertain call leaves the line visible and queues it for an admin', async () => {
    const db = fakeDb(room(3))
    const out = await _test.moderateMessage({ gameId: 'G1', msgId: 'm02', msg: msg('u1', 'ur so bad lol', 3) }, {
      database: db, key: 'k', fetchImpl: jevReply({ category: choice('targeted_insult', 0.55), severity: { score: 0.9 } }),
    })
    assert.equal(out.action, 'review')
    assert.equal(db.root.games.G1.chatLog.m02.hidden, undefined)
    assert.match(Object.values(db.root.feedback)[0].message, /needs review/)
    assert.equal(db.root.moderation, undefined)
  })

  test('sends Jev the lines before the new one, not after', async () => {
    const db = fakeDb(room(10))
    let body
    await _test.moderateMessage({ gameId: 'G1', msgId: 'm05', msg: msg('u2', 'line 5', 6) }, {
      database: db, key: 'k', fetchImpl: async (_u, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ answers: {} }) } },
    })
    assert.deepEqual(body.state.recent.map(m => m.text), ['line 0', 'line 1', 'line 2', 'line 3', 'line 4'])
    assert.equal(body.state.room.authorIsSpectator, false)
  })
})

describe('triage', () => {
  const report = { type: 'report', by: 'u2', message: 'Chat report — Ana: "x"', targetName: 'Ana', text: 'x', chatContext: 'Ana: x' }

  test('stores a triage record on a new player report', async () => {
    const db = fakeDb({ feedback: { r1: report } })
    const out = await _test.triage({ reportId: 'r1', report }, {
      database: db, key: 'k', now: 7,
      fetchImpl: jevReply({ category: choice('hate_or_slur', 0.9), severity: { score: 3 }, supported: { noul: 0.9 } }),
    })
    assert.equal(out.category, 'hate_or_slur')
    assert.deepEqual(db.root.feedback.r1.triage, out)
  })

  test('skips with no key, for bugs, for auto-moderation items and already-triaged reports', async () => {
    const db = fakeDb()
    const never = async () => { throw new Error('should not call') }
    assert.equal(await _test.triage({ reportId: 'r', report }, { database: db, key: '', fetchImpl: never }), null)
    assert.equal(await _test.triage({ reportId: 'r', report: { ...report, type: 'bug' } }, { database: db, key: 'k', fetchImpl: never }), null)
    assert.equal(await _test.triage({ reportId: 'r', report: { ...report, by: _test.AUTO_MOD_BY } }, { database: db, key: 'k', fetchImpl: never }), null)
    assert.equal(await _test.triage({ reportId: 'r', report: { ...report, triage: {} } }, { database: db, key: 'k', fetchImpl: never }), null)
  })
})
