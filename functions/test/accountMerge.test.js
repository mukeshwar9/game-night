const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const m = require('../mergeGuest')
const { _test } = require('../accountMerge')

describe('mergeStats', () => {
  test('sums counts, maxes bestStreak, keeps the target streak and names', () => {
    const t = { games: 5, wins: 3, losses: 2, streak: 2, bestStreak: 4, byGame: { ttt: { w: 2, l: 1 } }, vs: { u9: { w: 1, l: 0, name: 'Ann' } } }
    const g = { games: 3, wins: 1, losses: 2, streak: 0, bestStreak: 6, byGame: { ttt: { w: 1, l: 0 }, c4: { w: 0, l: 2 } }, vs: { u9: { w: 0, l: 1, name: 'Old' }, u8: { w: 1, l: 1, name: 'Bo' } } }
    assert.deepEqual(m.mergeStats(t, g), {
      games: 8, wins: 4, losses: 4, streak: 2, bestStreak: 6,
      byGame: { ttt: { w: 3, l: 1 }, c4: { w: 0, l: 2 } },
      vs: { u9: { w: 1, l: 1, name: 'Ann' }, u8: { w: 1, l: 1, name: 'Bo' } },
    })
  })
  test('missing target stats starts from zero', () => {
    const r = m.mergeStats(null, { games: 1, wins: 1, streak: 3, bestStreak: 3 })
    assert.equal(r.games, 1)
    assert.equal(r.streak, 0)
    assert.equal(r.bestStreak, 3)
  })
})

describe('mergeMatches', () => {
  test('dedupes by ts|opponentUid, newest first, capped at 50, numeric-keyed objects read by key', () => {
    const t = { 0: { ts: 10, opponentUid: 'a' }, 1: { ts: 5, opponentUid: 'a' } }
    const g = [{ ts: 10, opponentUid: 'a' }, { ts: 10, opponentUid: 'b' }, { ts: 7 }]
    assert.deepEqual(m.mergeMatches(t, g).map((x) => `${x.ts}|${x.opponentUid || ''}`), ['10|a', '10|b', '7|', '5|a'])
    const many = Array.from({ length: 80 }, (_, i) => ({ ts: i + 1 }))
    const r = m.mergeMatches(many.slice(0, 40), many.slice(40))
    assert.equal(r.length, 50)
    assert.equal(r[0].ts, 80)
  })
  test('sparse object does not shift entries', () => {
    assert.deepEqual(m.normalizeMatchList({ 2: { ts: 2 }, 0: { ts: 0 } }).map((x) => x.ts), [0, 2])
  })
})

describe('mergeArrows', () => {
  test('best stars, replayed union, max endless', () => {
    const t = { levels: { l1: 2, l2: 1 }, replayed: { l1: true }, endless: { easy: 3, medium: 0, hard: 1 } }
    const g = { levels: { l1: 3, l3: 1, l999: 2 }, replayed: { l3: true, l150: true }, endless: { easy: 1, medium: 4 } }
    assert.deepEqual(m.mergeArrows(t, g), {
      levels: { l1: 3, l2: 1, l3: 1 }, replayed: { l1: true, l3: true }, endless: { easy: 3, medium: 4, hard: 1 },
    })
  })
})

describe('mergeMemoryBests', () => {
  test('keeps the better value per key', () => {
    assert.deepEqual(m.mergeMemoryBests({ simon: 5, chimp: 9 }, { simon: 7, nback: 2.9, bad: -1, x: 'no' }), { simon: 7, chimp: 9, nback: 2 })
  })
})

describe('friendsToAdd', () => {
  test('skips existing, self, guest and blocked', () => {
    const r = m.friendsToAdd(
      { a: { since: 1 }, b: { since: 2 }, me: { since: 3 }, g: { since: 4 }, c: { since: 5 }, d: {} },
      { a: { since: 9 } }, { b: { at: 1 } }, { guestUid: 'g', targetUid: 'me' })
    assert.deepEqual(r, { c: 5, d: null })
  })
})

// Minimal in-memory Realtime Database: get / transaction / update / remove by path.
function fakeDb(initial = {}) {
  const data = { ...initial }
  const ref = (path) => ({
    child: (p) => ref(`${path}/${p}`.replace(/^\//, '')),
    get: async () => ({ val: () => (path in data ? structuredClone(data[path]) : null) }),
    transaction: async (fn) => {
      const next = fn(path in data ? data[path] : null)
      if (next === undefined) return { committed: false }
      data[path] = next
      return { committed: true }
    },
    remove: async () => { delete data[path] },
    update: async (u) => { for (const [k, v] of Object.entries(u)) { if (v === null) delete data[k]; else data[k] = v } },
  })
  return { data, ref: (p = '') => ref(p) }
}

describe('mergeGuest', () => {
  const seed = () => ({
    'users/g/stats': { games: 2, wins: 2, losses: 0, streak: 2, bestStreak: 2, byGame: {}, vs: {} },
    'users/t/stats': { games: 1, wins: 0, losses: 1, streak: 0, bestStreak: 0, byGame: {}, vs: {} },
    'users/g/memoryBests': { simon: 4 },
    'friends/g': { f1: { since: 7 }, f2: { since: 8 } },
    'friends/f1/g': { since: 7 },
    'friends/f2/g': { since: 8 },
    'friends/t': { f2: { since: 1 } },
    'blocks/t': {},
  })

  test('merges, rewires friends, writes the audit row, and is idempotent', async () => {
    const db = fakeDb(seed())
    assert.deepEqual(await _test.mergeGuest(db, 'g', 't'), { merged: true })
    assert.equal(db.data['users/t/stats'].games, 3)
    assert.deepEqual(db.data['users/t/memoryBests'], { simon: 4 })
    assert.deepEqual(db.data['friends/t/f1'], { since: 7 })
    assert.deepEqual(db.data['friends/f1/t'], { since: 7 })
    assert.ok(!('friends/t/f2' in db.data), 'existing friend row not rewritten')
    assert.ok(!('friends/f1/g' in db.data) && !('friends/f2/g' in db.data))
    assert.equal(db.data['accountMerges/g'].into, 't')
    const stats = structuredClone(db.data['users/t/stats'])
    assert.deepEqual(await _test.mergeGuest(db, 'g', 't'), { merged: false, reason: 'already-merged' })
    assert.deepEqual(db.data['users/t/stats'], stats)
  })

  test('a failed write releases the claim so the client can retry', async () => {
    const db = fakeDb(seed())
    const realRef = db.ref
    db.ref = () => ({ ...realRef(''), update: async () => { throw new Error('boom') }, child: realRef('').child })
    await assert.rejects(_test.mergeGuest(db, 'g', 't'), /boom/)
    assert.ok(!('accountMerges/g' in db.data))
  })
})

describe('requireSignedInAccount', () => {
  test('refuses signed-out and anonymous callers', () => {
    assert.throws(() => _test.requireSignedInAccount({}), /Sign in/)
    assert.throws(() => _test.requireSignedInAccount({ auth: { uid: 'x', token: { firebase: { sign_in_provider: 'anonymous' } } } }), /Google/)
    assert.equal(_test.requireSignedInAccount({ auth: { uid: 'x', token: { firebase: { sign_in_provider: 'google.com' } } } }), 'x')
  })
})
