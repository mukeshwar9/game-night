// voiceSfu, the Cloudflare SFU proxy: who may use voice, audio-only offers,
// pulls resolved by uid (never by a client-supplied session id), blocks in
// either direction and removals stop audio on the server. Runs against an
// in-memory database and a fake Cloudflare API.
const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { _test } = require('../voice')

function fakeDb(initial = {}) {
  const root = JSON.parse(JSON.stringify(initial))
  const parts = (p) => (p ? p.split('/').filter(Boolean) : [])
  const read = (p) => parts(p).reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), root)
  const write = (p, v) => {
    const ks = parts(p)
    let n = root
    for (const k of ks.slice(0, -1)) n = n[k] && typeof n[k] === 'object' ? n[k] : (n[k] = {})
    if (v === null || v === undefined) delete n[ks.at(-1)]
    else n[ks.at(-1)] = JSON.parse(JSON.stringify(v))
    // Like RTDB, an emptied parent disappears.
    for (let i = ks.length - 1; i > 0; i--) {
      const parent = ks.slice(0, i).reduce((x, k) => x?.[k], root)
      if (parent && typeof parent === 'object' && !Object.keys(parent).length) {
        const gp = ks.slice(0, i - 1).reduce((x, k) => x?.[k], root)
        delete gp[ks[i - 1]]
      } else break
    }
  }
  const ref = (p = '') => ({
    get: async () => { const v = read(p); return { val: () => (v === undefined ? null : v), exists: () => v !== undefined && v !== null } },
    update: async (map) => { for (const [k, v] of Object.entries(map)) write(p ? `${p}/${k}` : k, v) },
    remove: async () => write(p, null),
  })
  return { ref, root }
}

function fakeCf() {
  const log = []
  let n = 0
  return {
    log,
    newSession: async () => { log.push(['new']); return { sessionId: `S${++n}` } },
    pushTrack: async (sid, sdp, mid, trackName) => { log.push(['push', sid, mid, trackName]); return { sessionDescription: { type: 'answer', sdp: 'v=0 answer' } } },
    pullTracks: async (sid, remotes) => {
      log.push(['pull', sid, remotes.map(r => `${r.sessionId}:${r.trackName}`)])
      return { requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: 'v=0 offer' }, tracks: remotes.map((r, i) => ({ trackName: r.trackName, sessionId: r.sessionId, mid: String(i + 1) })) }
    },
    renegotiate: async (sid) => { log.push(['reneg', sid]) },
    closeTracks: async (sid, mids) => { log.push(['close', sid, mids]) },
    iceServers: async () => [{ urls: 'stun:stun.cloudflare.com:3478' }],
  }
}

const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0'
const VIDEO = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0'
const NOW = Date.parse('2026-10-02T00:00:00Z')

const room = (over = {}) => ({
  gameType: 'party', status: 'waiting', partyRoom: true, partyCap: 4,
  players: {
    a: { name: 'Ann', playerId: 'a', joinedAt: 1 },
    b: { name: 'Bob', playerId: 'b', joinedAt: 2 },
    c: { name: 'Cy', playerId: 'c', joinedAt: 3 },
  },
  ...over,
})

const seed = (over = {}) => ({
  games: { ROOM01: room(over) },
  ageGate: { a: { year: 2000 }, b: { year: 2000 }, c: { year: 2000 }, kid: { year: 2016 } },
})

const call = (db, cf, uid, data, now = NOW) => _test.handleVoice({ uid, data: { gameId: 'ROOM01', ...data }, db, cf, now })
const code = async (p) => { try { await p; return 'ok' } catch (e) { return e.message } }

beforeEach(() => _test.calls.clear())

describe('voiceSfu access', () => {
  test('refuses signed-out, bad requests, non-members, removed, public rooms and non-parties', async () => {
    const cf = fakeCf()
    assert.equal(await code(_test.handleVoice({ uid: null, data: {}, db: fakeDb(seed()), cf })), 'sign-in-required')
    assert.equal(await code(call(fakeDb(seed()), cf, 'a', { op: 'nope' })), 'bad-request')
    assert.equal(await code(call(fakeDb(seed()), cf, 'z', { op: 'ice' })), 'not-member')
    assert.equal(await code(call(fakeDb(seed({ removed: { b: true } })), cf, 'b', { op: 'ice' })), 'removed')
    assert.equal(await code(call(fakeDb(seed({ visibility: 'public' })), cf, 'a', { op: 'ice' })), 'public-room')
    assert.equal(await code(call(fakeDb(seed({ partyRoom: false })), cf, 'a', { op: 'ice' })), 'not-party')
  })

  test('requires the 13+ birth-year gate', async () => {
    const db = fakeDb(seed({ players: { ...room().players, kid: { name: 'Kid', playerId: 'kid', joinedAt: 0.5 }, d: { name: 'D', playerId: 'd', joinedAt: 0.6 } } }))
    assert.equal(await code(call(db, fakeCf(), 'kid', { op: 'ice' })), 'under-age')
    assert.equal(await code(call(db, fakeCf(), 'd', { op: 'ice' })), 'age-required')
  })

  test('rate-limits a uid', async () => {
    const db = fakeDb(seed())
    let last
    for (let i = 0; i < 21; i++) last = await code(call(db, fakeCf(), 'a', { op: 'ice' }))
    assert.equal(last, 'rate-limited')
  })
})

describe('join, pull, renegotiate, close', () => {
  test('join publishes one audio track and the server owns the session id', async () => {
    const db = fakeDb(seed())
    const cf = fakeCf()
    const res = await call(db, cf, 'a', { op: 'join', sdp: SDP, mid: '0', attempt: 'att1' })
    assert.equal(res.sdp, 'v=0 answer')
    assert.deepEqual(db.root.voiceSessions.ROOM01.a, { sessionId: 'S1', trackName: 'mic-att1', mid: '0', attempt: 'att1', at: NOW })
    assert.deepEqual(db.root.voiceUsers.a, { gameId: 'ROOM01' })
    assert.equal(await code(call(db, cf, 'b', { op: 'join', sdp: VIDEO, mid: '0', attempt: 'att2' })), 'bad-offer')
  })

  test('listen-only join gets a session nobody can pull from', async () => {
    const db = fakeDb(seed())
    const cf = fakeCf()
    assert.deepEqual(await call(db, cf, 'c', { op: 'join', listen: true, attempt: 'att3' }), { sdp: null })
    assert.equal(cf.log.filter(l => l[0] === 'push').length, 0)
    await call(db, cf, 'a', { op: 'join', sdp: SDP, mid: '0', attempt: 'att1' })
    assert.deepEqual(await call(db, cf, 'a', { op: 'pull', uids: ['c'], attempt: 'att1' }), { sdp: null, tracks: [] })
    assert.deepEqual((await call(db, cf, 'c', { op: 'pull', uids: ['a'], attempt: 'att3' })).tracks, [{ uid: 'a', mid: '1' }])
  })

  test('pull resolves tracks by uid and refuses non-members and junk', async () => {
    const db = fakeDb(seed())
    const cf = fakeCf()
    await call(db, cf, 'a', { op: 'join', sdp: SDP, mid: '0', attempt: 'att1' })
    await call(db, cf, 'b', { op: 'join', sdp: SDP, mid: '0', attempt: 'att2' })
    const res = await call(db, cf, 'a', { op: 'pull', uids: ['b', 'z', 'a'], attempt: 'att1' })
    assert.equal(res.sdp, 'v=0 offer')
    assert.deepEqual(res.tracks, [{ uid: 'b', mid: '1' }])
    assert.deepEqual(cf.log.find(l => l[0] === 'pull'), ['pull', 'S1', ['S2:mic-att2']])
    assert.deepEqual(db.root.voiceSessions.ROOM01.a.pulls, { b: { mid: '1' } })
    // A pull from an older attempt is refused.
    assert.equal(await code(call(db, cf, 'a', { op: 'pull', uids: ['b'], attempt: 'old1' })), 'stale-attempt')
    // A repeat pull of someone already pulled is a no-op.
    assert.deepEqual(await call(db, cf, 'a', { op: 'pull', uids: ['b'], attempt: 'att1' }), { sdp: null, tracks: [] })
  })

  test('a block in either direction stops the pull on the server', async () => {
    const db = fakeDb({ ...seed(), blocks: { b: { a: { at: 1 } } } })
    const cf = fakeCf()
    await call(db, cf, 'a', { op: 'join', sdp: SDP, mid: '0', attempt: 'att1' })
    await call(db, cf, 'b', { op: 'join', sdp: SDP, mid: '0', attempt: 'att2' })
    await call(db, cf, 'c', { op: 'join', sdp: SDP, mid: '0', attempt: 'att3' })
    assert.deepEqual((await call(db, cf, 'a', { op: 'pull', uids: ['b', 'c'], attempt: 'att1' })).tracks.map(t => t.uid), ['c'])
    assert.deepEqual((await call(db, cf, 'b', { op: 'pull', uids: ['a', 'c'], attempt: 'att2' })).tracks.map(t => t.uid), ['c'])
  })

  test('renegotiate and close act on the caller’s own session only', async () => {
    const db = fakeDb(seed())
    const cf = fakeCf()
    await call(db, cf, 'a', { op: 'join', sdp: SDP, mid: '0', attempt: 'att1' })
    await call(db, cf, 'b', { op: 'join', sdp: SDP, mid: '0', attempt: 'att2' })
    await call(db, cf, 'a', { op: 'pull', uids: ['b'], attempt: 'att1' })
    await call(db, cf, 'a', { op: 'renegotiate', sdp: 'v=0 answer', attempt: 'att1' })
    await call(db, cf, 'a', { op: 'close', uids: ['b'], attempt: 'att1' })
    assert.deepEqual(cf.log.filter(l => l[0] === 'reneg' || l[0] === 'close'), [['reneg', 'S1'], ['close', 'S1', ['1']]])
    assert.equal(db.root.voiceSessions.ROOM01.a.pulls, undefined)
    await call(db, cf, 'a', { op: 'leave' })
    assert.equal(db.root.voiceSessions.ROOM01.a, undefined)
    assert.equal(db.root.voiceUsers?.a, undefined)
  })
})

describe('server-side block and removal', () => {
  test('a new block closes both pulls between the two', async () => {
    const db = fakeDb(seed())
    const cf = fakeCf()
    await call(db, cf, 'a', { op: 'join', sdp: SDP, mid: '0', attempt: 'att1' })
    await call(db, cf, 'b', { op: 'join', sdp: SDP, mid: '0', attempt: 'att2' })
    await call(db, cf, 'a', { op: 'pull', uids: ['b'], attempt: 'att1' })
    await call(db, cf, 'b', { op: 'pull', uids: ['a'], attempt: 'att2' })
    const closed = await _test.closePullsBetween({ a: 'a', b: 'b', db, cf })
    assert.equal(closed, 2)
    assert.equal(db.root.voiceSessions.ROOM01.a.pulls, undefined)
    assert.equal(db.root.voiceSessions.ROOM01.b.pulls, undefined)
  })

  test('a removed member is dropped from everyone’s audio and loses their session', async () => {
    const db = fakeDb(seed())
    const cf = fakeCf()
    for (const [u, att] of [['a', 'att1'], ['b', 'att2'], ['c', 'att3']]) await call(db, cf, u, { op: 'join', sdp: SDP, mid: '0', attempt: att })
    await call(db, cf, 'a', { op: 'pull', uids: ['b', 'c'], attempt: 'att1' })
    await call(db, cf, 'c', { op: 'pull', uids: ['b'], attempt: 'att3' })
    await _test.dropFromVoice({ gameId: 'ROOM01', uid: 'b', db, cf })
    assert.equal(db.root.voiceSessions.ROOM01.b, undefined)
    assert.deepEqual(db.root.voiceSessions.ROOM01.a.pulls, { c: { mid: '2' } })
    assert.equal(db.root.voiceSessions.ROOM01.c.pulls, undefined)
    assert.equal(db.root.voiceUsers.b, undefined)
    assert.equal(cf.log.filter(l => l[0] === 'close').length, 2)
  })
})

describe('switches', () => {
  test('voice is off unless VOICE_ENABLED=1 and the Cloudflare secrets are bound', () => {
    assert.equal(_test.voiceConfig({}), null)
    assert.equal(_test.voiceConfig({ VOICE_ENABLED: '1' }), null)
  })

  test('makeCf talks to the Cloudflare API with the secret on the server only', async () => {
    const seen = []
    const fetchImpl = async (url, init) => { seen.push([url, init.method, init.headers.Authorization]); return { ok: true, status: 200, json: async () => ({ sessionId: 'S9' }) } }
    const cf = _test.makeCf({ appId: 'app', secret: 'sek' }, fetchImpl)
    assert.deepEqual(await cf.newSession(), { sessionId: 'S9' })
    assert.deepEqual(seen[0], ['https://rtc.live.cloudflare.com/v1/apps/app/sessions/new', 'POST', 'Bearer sek'])
    assert.deepEqual(await cf.iceServers(), [{ urls: 'stun:stun.cloudflare.com:3478' }])
  })
})
