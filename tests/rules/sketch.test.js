// SKETCH letter hints (`games/{id}/round/hints/{n}`): only the round's artist
// can publish one, only while drawing, once each, and a whole-room transaction
// (a guesser's correct mark, the coordinator's reveal) still passes with the
// hints unchanged.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, partyNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const players = { alice: { name: 'Alice', playerId: 'alice' }, bob: { name: 'Bob', playerId: 'bob' }, cy: { name: 'Cy', playerId: 'cy' } }
const round = (over = {}) => ({
  phase: 'drawing', cycle: 1, artist: 'alice', order: ['alice', 'bob', 'cy'], matchSeed: 'm1',
  wordPattern: '7', drawStartedAt: 1000, drawMs: 75000, ...over,
})
const room = (r = round()) => {
  const node = gameNode({ x: 'alice', o: 'bob', status: 'playing', extra: { gameType: 'sketch', board: null, currentTurn: null, round: r } })
  node.players = players
  return node
}
const put = (value) => seed(T.env, 'games/g1', value)
const hint = (over = {}) => ({ i: 3, c: 'b', ...over })

describe('SKETCH letter hints', () => {
  it('lets the artist publish a hint while drawing', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/1').set(hint({ i: 5, c: 'o' })))
  })

  it('refuses a hint from a guesser, a spectator or a signed-out visitor', async () => {
    await put(room())
    await assertFails(as('bob').ref('games/g1/round/hints/0').set(hint()))
    await assertFails(as('cy').ref('games/g1/round/hints/0').set(hint()))
    await assertFails(as('mallory').ref('games/g1/round/hints/0').set(hint()))
    await assertFails(dbAs(T.env, null).ref('games/g1/round/hints/0').set(hint()))
  })

  it('refuses a hint outside the drawing phase', async () => {
    await put(room(round({ phase: 'choosing' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await put(room(round({ phase: 'reveal' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint()))
  })

  it('keeps a hint in shape: two slots, one letter, a small position, nothing extra', async () => {
    await put(room())
    await assertFails(as('alice').ref('games/g1/round/hints/2').set(hint()))
    await assertFails(as('alice').ref('games/g1/round/hints/x').set(hint()))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ c: 'bo' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ c: '' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ c: 7 })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ i: -1 })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ i: 64 })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ i: '3' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set({ i: 3 }))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set({ ...hint(), word: 'rainbow' }))
  })

  it('never rewrites a published hint, not even for the artist', async () => {
    await put(room(round({ hints: { 0: hint() } })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint({ i: 4, c: 'o' })))
    await assertFails(as('alice').ref('games/g1/round/hints/0/c').set('z'))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/0').set(hint())) // same value: a reload republishing
  })

  it('lets a whole-room transaction pass with the hints unchanged', async () => {
    await put(room(round({ hints: { 0: hint() } })))
    // a guesser marks themself correct; the coordinator moves to the reveal
    await assertSucceeds(as('bob').ref('games/g1/round/correct/bob').set({ at: 5000 }))
    await assertSucceeds(as('bob').ref('games/g1/round/phase').set('reveal'))
    await assertSucceeds(as('bob').ref('games/g1/round/endsAt').set(99999))
    const whole = (await as('bob').ref('games/g1').get()).val()
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, scores: { alice: 25, bob: 100 } }))
  })

  it('lets the next round clear the hints', async () => {
    await put(room(round({ phase: 'reveal', hints: { 0: hint() } })))
    const whole = (await as('bob').ref('games/g1').get()).val()
    const next = { ...whole.round, phase: 'choosing', artist: 'bob', hints: null }
    delete next.hints
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, round: next }))
  })

  it('accepts a room with no hints at all (rooms from before hints)', async () => {
    await put(room())
    await assertSucceeds(as('bob').ref('games/g1/round/chat/c1').set({ uid: 'bob', text: 'cat' }))
  })
})

// SKETCH match setup: the host's `sketchConfig` (room-level, kept across
// matches) and the round's snapshot of it (`round/cycles`, `drawBase`,
// `hintCount`), copied at START.
describe('SKETCH match setup (sketchConfig)', () => {
  const party = (status = 'waiting', extra = {}) => partyNode({ uids: ['alice', 'bob', 'cy'], gameType: 'sketch', status, extra })
  const config = (over = {}) => ({ v: 1, draws: 2, drawS: 75, hints: 2, ...over })

  it('lets a seated player save a setup in the lobby, field by field or whole', async () => {
    await put(party())
    await assertSucceeds(as('alice').ref('games/g1/sketchConfig').set(config()))
    await assertSucceeds(as('alice').ref('games/g1/sketchConfig').set({ v: 1, drawS: 45 })) // unpicked fields absent
    await assertSucceeds(as('alice').ref('games/g1/sketchConfig/hints').set(0))
    await assertSucceeds(as('alice').ref('games/g1/sketchConfig/draws').set(3))
    await assertSucceeds(as('alice').ref('games/g1/sketchConfig/drawS').set(120))
  })

  it('refuses a visitor who is not in the room', async () => {
    await put(party())
    await assertFails(as('mallory').ref('games/g1/sketchConfig').set(config()))
    await assertFails(dbAs(T.env, null).ref('games/g1/sketchConfig').set(config()))
  })

  it('accepts only values on the menu, with a version and nothing extra', async () => {
    await put(party())
    for (const draws of [0, 4, '2', 1.5]) await assertFails(as('alice').ref('games/g1/sketchConfig').set(config({ draws })))
    for (const drawS of [30, 50, 150, '75']) await assertFails(as('alice').ref('games/g1/sketchConfig').set(config({ drawS })))
    for (const hints of [-1, 3, true]) await assertFails(as('alice').ref('games/g1/sketchConfig').set(config({ hints })))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set(config({ v: 2 })))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set({ draws: 2 }))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set(config({ words: 12 })))
    for (const drawS of [45, 60, 75, 90, 120]) await assertSucceeds(as('alice').ref('games/g1/sketchConfig').set(config({ drawS })))
  })

  it('locks while a Sketch match is playing, but whole-room writes with it unchanged still pass', async () => {
    await put(party('playing', { sketchConfig: config(), round: round({ cycles: 2, drawBase: 75000, hintCount: 2 }) }))
    await assertFails(as('alice').ref('games/g1/sketchConfig/draws').set(3))
    await assertFails(as('alice').ref('games/g1/sketchConfig').set(config({ hints: 0 })))
    const whole = (await as('bob').ref('games/g1').get()).val()
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, scores: { alice: 25, bob: 100 } }))
  })

  it('can be changed again once the match is over', async () => {
    await put(party('finished', { sketchConfig: config() }))
    await assertSucceeds(as('bob').ref('games/g1/sketchConfig/draws').set(1))
  })

  it('START: one write seeds a playing room with the round snapshot', async () => {
    await put(party('waiting', { sketchConfig: config({ draws: 1, drawS: 45, hints: 1 }) }))
    const whole = (await as('alice').ref('games/g1').get()).val()
    const first = { phase: 'choosing', cycle: 1, artist: 'alice', order: ['alice', 'bob', 'cy'], matchSeed: 'm1', cycles: 1, drawBase: 45000, hintCount: 1 }
    await assertSucceeds(as('alice').ref('games/g1').set({ ...whole, status: 'playing', round: first }))
  })
})

describe('SKETCH round snapshot of the setup', () => {
  it('accepts every menu value in the round', async () => {
    await put(room())
    for (const cycles of [1, 2, 3]) await assertSucceeds(as('bob').ref('games/g1/round/cycles').set(cycles))
    for (const ms of [45000, 60000, 75000, 90000, 120000]) await assertSucceeds(as('bob').ref('games/g1/round/drawBase').set(ms))
    for (const n of [0, 1, 2]) await assertSucceeds(as('bob').ref('games/g1/round/hintCount').set(n))
  })

  it('refuses values off the menu', async () => {
    await put(room())
    for (const cycles of [0, 4, '2', 2.5]) await assertFails(as('bob').ref('games/g1/round/cycles').set(cycles))
    for (const ms of [0, 50000, 75001, 600000, '75000']) await assertFails(as('bob').ref('games/g1/round/drawBase').set(ms))
    for (const n of [-1, 3, '1']) await assertFails(as('bob').ref('games/g1/round/hintCount').set(n))
  })

  it('a round set to one hint takes only the half-time hint; none takes no hint', async () => {
    await put(room(round({ hintCount: 1 })))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await assertFails(as('alice').ref('games/g1/round/hints/1').set(hint({ i: 5, c: 'o' })))
    await put(room(round({ hintCount: 0 })))
    await assertFails(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await put(room(round({ hintCount: 2 })))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/0').set(hint()))
    await assertSucceeds(as('alice').ref('games/g1/round/hints/1').set(hint({ i: 5, c: 'o' })))
  })
})

// SKETCH custom words: the host's `sketchWords` (room-level, kept across
// matches, signed by its last writer) and the round's snapshot of it
// (`round/custom`), copied at START.
describe('SKETCH custom words (sketchWords)', () => {
  const party = (status = 'waiting', extra = {}) => partyNode({ uids: ['alice', 'bob', 'cy'], gameType: 'sketch', status, extra })
  const words = (over = {}) => ({ v: 1, by: 'alice', mode: 'mix', list: ['grandma', 'tuk tuk', "rock 'n' roll"], ...over })

  it('lets a seated player save a list signed with their own uid', async () => {
    await put(party())
    await assertSucceeds(as('alice').ref('games/g1/sketchWords').set(words()))
    await assertSucceeds(as('alice').ref('games/g1/sketchWords').set(words({ mode: 'only' })))
    await assertSucceeds(as('alice').ref('games/g1/sketchWords').set({ v: 1, by: 'alice', mode: 'only' })) // empty list, ONLY picked
    await assertSucceeds(as('alice').ref('games/g1/sketchWords').set(null))
  })

  it('refuses a list signed with someone else\'s uid, and a visitor', async () => {
    await put(party())
    await assertFails(as('bob').ref('games/g1/sketchWords').set(words()))
    await assertFails(as('mallory').ref('games/g1/sketchWords').set(words({ by: 'mallory' })))
    await assertFails(dbAs(T.env, null).ref('games/g1/sketchWords').set(words()))
  })

  it('a second editor must sign the list as theirs', async () => {
    await put(party('waiting', { sketchWords: words() }))
    await assertFails(as('bob').ref('games/g1/sketchWords/list/3').set('karaoke'))
    await assertFails(as('bob').ref('games/g1/sketchWords/mode').set('only'))
    await assertFails(as('bob').ref('games/g1/sketchWords').set(words({ list: ['karaoke'] })))
    await assertSucceeds(as('bob').ref('games/g1/sketchWords').set(words({ by: 'bob', list: ['karaoke'] })))
  })

  it('takes 2–24 characters of letters (any script), digits, spaces, apostrophes and hyphens', async () => {
    await put(party())
    for (const w of ['ox', 'r2d2', 'tuk-tuk', 'crème brûlée', 'नमस्ते', 'grandma’s sofa', 'a'.repeat(24)]) {
      await assertSucceeds(as('alice').ref('games/g1/sketchWords').set(words({ list: [w] })))
    }
    for (const w of ['a', '', 'a'.repeat(25), ' cat', 'cat ', 'hot  dog', 'cat!', 'a.b', 'a/b', '#tag', 'x<y', 'a\nb', 'a\tb', 7, true]) {
      await assertFails(as('alice').ref('games/g1/sketchWords').set(words({ list: [w] })))
    }
  })

  it('caps the list at 100 slots and keeps its shape', async () => {
    await put(party())
    await assertSucceeds(as('alice').ref('games/g1/sketchWords/list').set(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i, `word${i}`]))))
    await assertFails(as('alice').ref('games/g1/sketchWords/list/100').set('extra'))
    await assertFails(as('alice').ref('games/g1/sketchWords/list/x').set('extra'))
    await assertFails(as('alice').ref('games/g1/sketchWords').set(words({ v: 2 })))
    await assertFails(as('alice').ref('games/g1/sketchWords').set(words({ mode: 'all' })))
    await assertFails(as('alice').ref('games/g1/sketchWords').set(words({ list: 'grandma' })))
    await assertFails(as('alice').ref('games/g1/sketchWords').set(words({ extra: 1 })))
    await assertFails(as('alice').ref('games/g1/sketchWords').set({ v: 1, mode: 'mix', list: ['grandma'] }))
  })

  it('whole-room writes by another player pass with the words unchanged', async () => {
    await put(party('playing', { sketchWords: words(), round: round({ custom: { by: 'alice', mode: 'mix', list: ['grandma'] } }) }))
    const whole = (await as('bob').ref('games/g1').get()).val()
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, scores: { alice: 25, bob: 100 } }))
  })

  it('START: one write seeds a playing room with the round\'s custom words', async () => {
    await put(party('waiting', { sketchWords: words() }))
    const whole = (await as('bob').ref('games/g1').get()).val()
    const first = { phase: 'choosing', cycle: 1, artist: 'alice', order: ['alice', 'bob', 'cy'], matchSeed: 'm1', custom: { by: 'alice', mode: 'mix', list: ['grandma', 'tuk tuk'] } }
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, status: 'playing', round: first }))
  })
})

describe('SKETCH round snapshot of the custom words', () => {
  const custom = (over = {}) => ({ by: 'alice', mode: 'only', list: ['grandma', 'tuk tuk'], ...over })

  it('accepts a well-formed snapshot', async () => {
    await put(room())
    await assertSucceeds(as('bob').ref('games/g1/round/custom').set(custom()))
    await assertSucceeds(as('bob').ref('games/g1/round/custom').set(custom({ mode: 'mix' })))
  })

  it('refuses a malformed one', async () => {
    await put(room())
    await assertFails(as('bob').ref('games/g1/round/custom').set(custom({ mode: 'all' })))
    await assertFails(as('bob').ref('games/g1/round/custom').set(custom({ list: ['a'] })))
    await assertFails(as('bob').ref('games/g1/round/custom').set(custom({ list: ['cat!'] })))
    await assertFails(as('bob').ref('games/g1/round/custom').set(custom({ list: 'grandma' })))
    await assertFails(as('bob').ref('games/g1/round/custom').set(custom({ extra: true })))
    await assertFails(as('bob').ref('games/g1/round/custom').set({ mode: 'mix', list: ['grandma'] }))
    await assertFails(as('bob').ref('games/g1/round/custom').set({ by: 'alice', mode: 'mix' }))
  })

  it('lets the next round carry it on through a whole-room transaction', async () => {
    await put(room(round({ phase: 'reveal', custom: custom() })))
    const whole = (await as('bob').ref('games/g1').get()).val()
    const next = { ...whole.round, phase: 'choosing', artist: 'bob', used: [1, 280, 3] }
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, round: next }))
  })
})
