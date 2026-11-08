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

// SKETCH mid-match join (registry `midJoin`): a visitor may create their own
// party seat while a Sketch match is playing — never someone else's, never in
// another game, a locked room or after a kick or removal.
describe('SKETCH mid-match join', () => {
  const playing = (extra = {}) => partyNode({ uids: ['alice', 'bob'], gameType: 'sketch', status: 'playing', extra: { round: round({ order: ['alice', 'bob'], startedAt: 1000, matchStartedAt: 1000 }), ...extra } })
  const seatOf = (uid, over = {}) => ({ name: uid, playerId: uid, joinedAt: 2000, online: true, ...over })

  it('lets a visitor take their own seat while the match plays', async () => {
    await put(playing())
    await assertSucceeds(as('dan').ref('games/g1/players/dan').set(seatOf('dan')))
  })

  it('refuses a signed-out visitor', async () => {
    await put(playing())
    await assertFails(dbAs(T.env, null).ref('games/g1/players/dan').set(seatOf('dan')))
  })

  it("refuses a seat under someone else's uid, or naming someone else", async () => {
    await put(playing())
    await assertFails(as('dan').ref('games/g1/players/eve').set(seatOf('eve')))
    await assertFails(as('dan').ref('games/g1/players/dan').set(seatOf('dan', { playerId: 'eve' })))
  })

  it('refuses a 2P seat (X or O) while playing', async () => {
    await put(playing())
    await assertFails(as('dan').ref('games/g1/players/X').set(seatOf('dan')))
  })

  it('refuses to overwrite a seat that exists', async () => {
    await put(playing())
    await assertFails(as('dan').ref('games/g1/players/alice').set(seatOf('alice')))
  })

  it('refuses mid-match in any other game', async () => {
    await put(partyNode({ uids: ['alice', 'bob'], gameType: 'herd', status: 'playing' }))
    await assertFails(as('dan').ref('games/g1/players/dan').set(seatOf('dan')))
  })

  it('refuses once the match is over (the lobby path seats them then)', async () => {
    await put(partyNode({ uids: ['alice', 'bob'], gameType: 'sketch', status: 'finished' }))
    await assertFails(as('dan').ref('games/g1/players/dan').set(seatOf('dan')))
  })

  it('refuses a locked room', async () => {
    await put(playing({ locked: true }))
    await assertFails(as('dan').ref('games/g1/players/dan').set(seatOf('dan')))
  })

  it('refuses a kicked player', async () => {
    await put(playing({ kicked: { dan: true } }))
    await assertFails(as('dan').ref('games/g1/players/dan').set(seatOf('dan')))
  })

  it('refuses a player removed from the party', async () => {
    await put(playing({ removed: { dan: true } }))
    await assertFails(as('dan').ref('games/g1/players/dan').set(seatOf('dan')))
  })

  it('a whole-room transaction with the newcomer seated and appended to the order passes', async () => {
    await put(playing({ players: { ...partyNode({ uids: ['alice', 'bob'] }).players, dan: seatOf('dan') } }))
    const whole = (await as('bob').ref('games/g1').get()).val()
    const next = { ...whole.round, phase: 'choosing', cycle: 2, artist: 'alice', order: ['alice', 'bob', 'dan'], startedAt: 9000 }
    await assertSucceeds(as('bob').ref('games/g1').set({ ...whole, round: next }))
    await assertSucceeds(as('dan').ref('games/g1/round/correct/dan').set({ at: 9500 }))
  })

  it('takes the round and match start as numbers only', async () => {
    await put(playing())
    await assertSucceeds(as('bob').ref('games/g1/round/matchStartedAt').set(5000))
    await assertFails(as('bob').ref('games/g1/round/matchStartedAt').set('5000'))
    await assertFails(as('bob').ref('games/g1/round/matchStartedAt').set(Date.now() + 7200000))
    await assertSucceeds(as('bob').ref('games/g1/round/startedAt').set(6000))
  })
})
