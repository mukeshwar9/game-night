// Room chat and reactions: server-enforced rate limits (chatLast/emoteLast
// server-time stamps), the append-only reaction list (emotes/{pushId}) that
// replaced the single `emote` slot, and the moderation `hidden` flag.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, partyNode, seed, rulesEnvFor } from './helpers.js'

const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'
const MALLORY = 'mallory'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)
const NOW = { '.sv': 'timestamp' }
const msg = (by, text = 'gg') => ({ by, name: by, text, ts: Date.now() })
const watching = (uid) => ({ [uid]: { c1: { name: 'Watcher', at: 1 } } })
const room = (extra = {}) => ({ ...gameNode({ x: ALICE, o: BOB, status: 'playing' }), ...extra })

describe('chat rate limit (chatLast stamp)', () => {
  it('accepts a message sent with the sender’s server-time stamp', async () => {
    await put('games/g1', room())
    await assertSucceeds(as(BOB).ref('games/g1').update({ 'chatLog/m1': msg(BOB), 'chatLast/bob': NOW }))
  })

  it('rejects a message without the stamp (a client skipping the limit)', async () => {
    await put('games/g1', room())
    await assertFails(as(BOB).ref('games/g1/chatLog/m1').set(msg(BOB)))
  })

  it('rejects a second message inside 1.5 s', async () => {
    await put('games/g1', room({ chatLast: { bob: Date.now() } }))
    await assertFails(as(BOB).ref('games/g1').update({ 'chatLog/m2': msg(BOB), 'chatLast/bob': NOW }))
  })

  it('accepts the next message once the gap has passed', async () => {
    await put('games/g1', room({ chatLast: { bob: Date.now() - 5000 } }))
    await assertSucceeds(as(BOB).ref('games/g1').update({ 'chatLog/m2': msg(BOB), 'chatLast/bob': NOW }))
  })

  it('rejects a stamp that is not the server time', async () => {
    await put('games/g1', room())
    await assertFails(as(BOB).ref('games/g1').update({ 'chatLog/m1': msg(BOB), 'chatLast/bob': 1 }))
    await assertFails(as(BOB).ref('games/g1').update({ 'chatLog/m1': msg(BOB), 'chatLast/bob': Date.now() + 60000 }))
  })

  it('does not let one player stamp another (which would mute them)', async () => {
    await put('games/g1', room({ chatLast: { alice: 1 } }))
    await assertFails(as(BOB).ref('games/g1').update({ 'chatLast/alice': NOW }))
  })

  it('lets a spectator stamp only their own uid', async () => {
    await put('games/g1', room({ spectators: watching(CAROL) }))
    await assertSucceeds(as(CAROL).ref('games/g1').update({ 'chatLog/m1': msg(CAROL), 'chatLast/carol': NOW }))
    await assertFails(as(CAROL).ref('games/g1').update({ 'chatLast/bob': NOW }))
  })

  it('denies a stranger the stamp and the message', async () => {
    await put('games/g1', room())
    await assertFails(as(MALLORY).ref('games/g1').update({ 'chatLog/m1': msg(MALLORY), 'chatLast/mallory': NOW }))
  })

  it('still lets a whole-room transaction carry the log and stamps unchanged', async () => {
    const r = room({ chatLog: { m1: msg(BOB) }, chatLast: { bob: 5 }, emoteLast: { alice: 6 } })
    await put('games/g1', r)
    await assertSucceeds(as(ALICE).ref('games/g1').set({ ...r, status: 'finished', winner: 'X' }))
  })

  it('accepts a boolean moderation flag on a message, nothing else', async () => {
    await put('games/g1', room({ chatLog: { m1: msg(BOB) } }))
    await assertSucceeds(as(ALICE).ref('games/g1/chatLog/m1/hidden').set(true))
    await assertFails(as(ALICE).ref('games/g1/chatLog/m1/hidden').set('yes'))
  })
})

describe('reaction list (emotes/{pushId})', () => {
  const emote = (by, extra = {}) => ({ by, glyph: '🔥', ts: Date.now(), ...extra })

  it('lets a seat react as its symbol with its emoteLast stamp', async () => {
    await put('games/g1', room())
    await assertSucceeds(as(ALICE).ref('games/g1').update({ 'emotes/e1': emote('X'), 'emoteLast/alice': NOW }))
    await assertFails(as(ALICE).ref('games/g1').update({ 'emotes/e2': emote('O'), 'emoteLast/alice': NOW }))
  })

  it('keeps two simultaneous reactions as two entries', async () => {
    await put('games/g1', room())
    await assertSucceeds(as(ALICE).ref('games/g1').update({ 'emotes/e1': emote('X'), 'emoteLast/alice': NOW }))
    await assertSucceeds(as(BOB).ref('games/g1').update({ 'emotes/e2': emote('O'), 'emoteLast/bob': NOW }))
  })

  it('rejects a reaction without the stamp, or inside 400 ms of the last', async () => {
    await put('games/g1', room({ emoteLast: { alice: Date.now() } }))
    await assertFails(as(ALICE).ref('games/g1/emotes/e1').set(emote('X')))
    await assertFails(as(ALICE).ref('games/g1').update({ 'emotes/e1': emote('X'), 'emoteLast/alice': NOW }))
  })

  it('lets a spectator react under their uid with a name; denies spoofing and strangers', async () => {
    await put('games/g1', room({ spectators: watching(CAROL) }))
    await assertSucceeds(as(CAROL).ref('games/g1').update({ 'emotes/e1': emote(CAROL, { spectator: true, name: 'Carol' }), 'emoteLast/carol': NOW }))
    await assertFails(as(CAROL).ref('games/g1').update({ 'emotes/e2': emote('X'), 'emoteLast/carol': NOW }))
    await assertFails(as(MALLORY).ref('games/g1').update({ 'emotes/e1': emote(MALLORY), 'emoteLast/mallory': NOW }))
  })

  it('rejects junk: empty or long glyphs, unknown fields, edits of an existing reaction', async () => {
    await put('games/g1', room({ emotes: { e1: emote('O') } }))
    await assertFails(as(ALICE).ref('games/g1').update({ 'emotes/e2': emote('X', { glyph: '' }), 'emoteLast/alice': NOW }))
    await assertFails(as(ALICE).ref('games/g1').update({ 'emotes/e2': emote('X', { glyph: 'x'.repeat(33) }), 'emoteLast/alice': NOW }))
    await assertFails(as(ALICE).ref('games/g1').update({ 'emotes/e2': emote('X', { img: 'data:' }), 'emoteLast/alice': NOW }))
    await assertFails(as(ALICE).ref('games/g1/emotes/e1/glyph').set('💀'))
  })

  it('lets a member prune old reactions', async () => {
    await put('games/g1', room({ emotes: { e1: emote('O') } }))
    await assertSucceeds(as(ALICE).ref('games/g1').update({ 'emotes/e1': null, 'emotes/e2': emote('X'), 'emoteLast/alice': NOW }))
  })

  it('works in a party room keyed by uid', async () => {
    await put('games/p1', partyNode({ uids: [ALICE, BOB], status: 'playing' }))
    await assertSucceeds(as(BOB).ref('games/p1').update({ 'emotes/e1': emote(BOB), 'emoteLast/bob': NOW, 'chatLog/m1': msg(BOB), 'chatLast/bob': NOW }))
  })
})
