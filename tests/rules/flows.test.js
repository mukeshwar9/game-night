// Real room transitions through the rules: each case builds its write with
// the app's own pure logic (switches, winner stays, kicks, race rounds), so a
// rules change that would break one of these flows fails here, not in play.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, partyNode, seed, rulesEnvFor } from './helpers.js'
import { buildSwitchUpdates } from '../../src/hooks/room/roomUpdates.js'
import { freshGameState, firstMoverUpdates, lobbySwitchOverrides } from '../../src/lib/games.js'
import { kickPatch, nightSwitchSeating, roomHostUid, rotateWinnerStays } from '../../src/lib/nightLogic.js'
import { finishRaceRound, startRaceRound, toggleRaceReady } from '../../src/lib/raceLogic.js'
import { applyPartyJoin, partyJoinPlan } from '../../src/lib/roomLogic.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)
const read = async (path) => {
  let v
  await T.env.withSecurityRulesDisabled(async (ctx) => { v = (await ctx.database().ref(path).get()).val() })
  return v
}

// Game.jsx's applySwitchGame patch (night.js nightSwitchUpdates).
function switchPatch(game, newType, { fromParty, toParty }) {
  const updates = nightSwitchSeating(game, buildSwitchUpdates(game, newType), {
    fromParty, toParty, now: 100, hostUid: roomHostUid(game, fromParty),
  })
  return game.status === 'waiting' ? lobbySwitchOverrides(updates) : updates
}

describe('game switches', () => {
  it('lets a party room drop into a 2P game: two seats, the rest queued', async () => {
    const room = partyNode({ uids: ['alice', 'bob', 'carol'], status: 'finished' })
    await put('games/g1', room)
    await assertSucceeds(as('alice').ref('games/g1').update(switchPatch(room, 'tictactoe', { fromParty: true, toParty: false })))
    const after = await read('games/g1')
    if (!after.queue?.carol || after.players.X.playerId !== 'alice') throw new Error('unexpected seating')
  })

  it('lets that room switch back to a party game, reseating everyone', async () => {
    const room = partyNode({ uids: ['alice', 'bob', 'carol'], status: 'finished' })
    await put('games/g1', room)
    await as('alice').ref('games/g1').update(switchPatch(room, 'tictactoe', { fromParty: true, toParty: false }))
    const twoP = await read('games/g1')
    await assertSucceeds(as('carol').ref('games/g1').update(switchPatch(twoP, 'herd', { fromParty: false, toParty: true })))
  })

  it('lets either seat of a plain 2P room switch games', async () => {
    const room = gameNode({ x: 'alice', o: 'bob', status: 'finished', extra: { winner: 'X', scores: { X: 1, O: 0 } } })
    await put('games/g1', room)
    await assertSucceeds(as('bob').ref('games/g1').update(switchPatch(room, 'connectfour', { fromParty: false, toParty: false })))
  })

  it('lets a legacy X/O race room be reseated uid-keyed on read', async () => {
    const room = gameNode({ x: 'alice', o: 'bob', extra: { gameType: 'reaction' } })
    await put('games/g1', room)
    await assertSucceeds(as('bob').ref('games/g1').set({ ...room, ...buildSwitchUpdates(room, 'reaction') }))
  })
})

describe('winner stays and kicks', () => {
  const queued = (uid, at) => ({ name: uid, playerId: uid, joinedAt: at, at })

  it('lets NEW MATCH rotate the loser into the queue', async () => {
    const room = gameNode({
      x: 'alice', o: 'bob', status: 'finished',
      extra: { winner: 'X', scores: { X: 3, O: 1 }, partyRoom: true, queue: { carol: queued('carol', 5) } },
    })
    await put('games/g1', room)
    await assertSucceeds(as('bob').ref('games/g1').update({
      ...freshGameState('tictactoe'),
      status: 'playing', winner: null, winningLine: null, 'scores/X': 0, 'scores/O': 0, proposal: null,
      starter: 'O', ...firstMoverUpdates('tictactoe', 'O'),
      ...rotateWinnerStays(room, 200), lastActivityAt: 200,
    }))
    const after = await read('games/g1')
    if (after.players.O.playerId !== 'carol' || !after.queue?.bob) throw new Error('loser did not rotate')
  })

  // night.js kickPlayer, 2P: refill from the queue and restart the match.
  const kick2P = (game, uid, now = 300) => {
    const { updates, seated } = kickPatch(game, uid, false, now)
    const fresh = freshGameState(game.gameType)
    delete fresh.kicked
    return {
      ...fresh, ...updates, scores: { X: 0, O: 0 }, winner: null, winningLine: null, proposal: null,
      starter: 'X', status: seated ? 'playing' : 'waiting', ...(seated ? firstMoverUpdates(game.gameType, 'X') : {}),
      lastActivityAt: now,
    }
  }

  it('lets the host kick the O seat, refilled from the queue', async () => {
    const room = gameNode({ x: 'alice', o: 'bob', status: 'playing', extra: { partyRoom: true, queue: { carol: queued('carol', 5) } } })
    await put('games/g1', room)
    await assertFails(as('bob').ref('games/g1').update(kick2P(room, 'alice')))
    await assertSucceeds(as('alice').ref('games/g1').update(kick2P(room, 'bob')))
  })

  it('lets the host kick X with nobody queued (O moves up)', async () => {
    const room = gameNode({ x: 'alice', o: 'bob', status: 'playing', extra: { hostUid: 'bob' } })
    await put('games/g1', room)
    await assertSucceeds(as('bob').ref('games/g1').update(kick2P(room, 'alice')))
  })

  it('lets a party room kick a seat', async () => {
    const room = partyNode({ uids: ['alice', 'bob', 'carol'] })
    await put('games/g1', room)
    await assertSucceeds(as('alice').ref('games/g1').update(kickPatch(room, 'carol', true, 1).updates))
  })
})

describe('party lobby joins', () => {
  it('accepts the exact players transaction joinPartySeat writes', async () => {
    const room = partyNode({ uids: ['alice', 'bob'] })
    await put('games/g1', room)
    const seat = { name: 'Carol', joinedAt: 9, playerId: 'carol', online: true, avatar: 'kid.p1' }
    const plan = partyJoinPlan({ players: room.players, myId: 'carol', status: 'waiting', maxPlayers: 8 })
    await assertSucceeds(as('carol').ref('games/g1/players').set(applyPartyJoin(room.players, plan, seat)))
  })
})

describe('race rounds', () => {
  const params = (over = {}) => ({ gameType: 'reaction', now: 1000, id: 'r1', seed: 7, durationMs: 60000, ...over })
  const entryOf = (stats) => (stats?.done ? { sortKey: [stats.avg], score: stats.avg } : { sortKey: null, score: null })

  it('toggles only your own READY, and starts on the last one', async () => {
    const room = partyNode({ uids: ['alice', 'bob'], gameType: 'reaction', extra: { round: { ready: { alice: true } } } })
    await put('games/g1', room)
    await assertFails(as('alice').ref('games/g1/round/ready/bob').set(true))
    const toggled = toggleRaceReady(room, 'bob', 'reaction')
    await assertSucceeds(as('bob').ref('games/g1').set(startRaceRound(toggled, params()) ?? toggled))
  })

  it('lets each racer write only their own stats, and anyone end the round', async () => {
    const lobby = partyNode({ uids: ['alice', 'bob'], gameType: 'reaction' })
    const live = startRaceRound(lobby, params({ force: true }))
    await put('games/g1', live)
    await assertSucceeds(as('alice').ref('games/g1/round/stats/r1/alice').update({ times: [250, 260, 240, 255], done: true, doneAt: 5000, avg: 251 }))
    await assertFails(as('alice').ref('games/g1/round/stats/r1/bob').update({ done: true, avg: 999 }))
    await assertFails(as('alice').ref('games/g1/round/stats/r1/bob/times').set([1, 1, 1, 1]))
    await assertSucceeds(as('bob').ref('games/g1/round/stats/r1/bob').update({ times: [300, 310, 305, 290], done: true, doneAt: 6000, avg: 301 }))
    const cur = await read('games/g1')
    const done = finishRaceRound(cur, { gameType: 'reaction', roundId: 'r1', now: 7000, entryOf, isDone: (s) => !!s?.done })
    if (!done) throw new Error('round did not finish')
    await assertSucceeds(as('bob').ref('games/g1').set(done))
    const after = await read('games/g1')
    if (after.winner !== 'alice' || after.scores.alice !== 1) throw new Error('wrong result')
  })
})
