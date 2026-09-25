// Rules v1 for games/{id}: who is a member, how non-members get in (create,
// claim a seat, join a party lobby or the queue, watch, chat, emote), and
// what even members cannot do (steal seats, declare results outside play,
// mark someone else offline).
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, partyNode, seed, rulesEnvFor } from './helpers.js'

const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'
const MALLORY = 'mallory'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const put = (path, value) => seed(T.env, path, value)
const seat = (uid, extra = {}) => ({ name: uid, joinedAt: 5, playerId: uid, ...extra })

describe('creating and deleting rooms', () => {
  it('lets a party room be created with the creator in a uid-keyed seat', async () => {
    await assertSucceeds(as(ALICE).ref('games/g1').set(partyNode({ uids: [ALICE] })))
  })

  it('lets a public race room be created (uid-keyed, visibility public)', async () => {
    await assertSucceeds(as(ALICE).ref('games/g1').set(partyNode({ uids: [ALICE], gameType: 'reaction', extra: { visibility: 'public' } })))
  })

  it('denies creating a room that is not waiting, or with someone else seated', async () => {
    await assertFails(as(ALICE).ref('games/g1').set(gameNode({ x: ALICE, status: 'playing' })))
    await assertFails(as(ALICE).ref('games/g1').set(gameNode({ x: ALICE, o: BOB })))
    await assertFails(as(ALICE).ref('games/g1').set(partyNode({ uids: [ALICE, BOB] })))
    await assertFails(as(MALLORY).ref('games/g1').set(partyNode({ uids: [ALICE] })))
  })

  it('denies creating a room without a game type', async () => {
    const node = gameNode({ x: ALICE })
    delete node.gameType
    await assertFails(as(ALICE).ref('games/g1').set(node))
  })

  it('lets the creator delete a room nobody joined; not once O is seated, never a stranger', async () => {
    await put('games/g1', gameNode({ x: ALICE }))
    await assertFails(as(MALLORY).ref('games/g1').remove())
    await assertSucceeds(as(ALICE).ref('games/g1').remove())
    await put('games/g2', gameNode({ x: ALICE, o: BOB }))
    await assertFails(as(ALICE).ref('games/g2').remove())
  })

  it('never lets a child write conjure a room that does not exist', async () => {
    await assertFails(as(MALLORY).ref(`games/nope/spectators/${MALLORY}/c1`).set({ name: 'M', at: 1 }))
    await assertFails(as(MALLORY).ref('games/nope/players/O').set(seat(MALLORY)))
  })
})

describe('membership', () => {
  it('lets a queued player write the room like a seated one', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, extra: { partyRoom: true, queue: { [CAROL]: { name: 'Carol', playerId: CAROL, at: 1 } } } }))
    await assertSucceeds(as(CAROL).ref('games/g1').update({ timerScale: 2 }))
  })

  it('denies a stranger any room-level write', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB] }))
    await assertFails(as(MALLORY).ref('games/g1').update({ lastActivityAt: 2 }))
    await assertFails(as(MALLORY).ref('games/g1/status').set('playing'))
    await assertFails(as(MALLORY).ref('games/g1/round').set({ phase: 'x' }))
  })

  it('never lets anyone change a room’s visibility', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public' }))
    await assertFails(as(ALICE).ref('games/g1/visibility').set('private'))
    await assertFails(as(ALICE).ref('games/g1/visibility').remove())
  })
})

describe('2P seats', () => {
  it('lets a spectator take the free X seat in the lobby', async () => {
    await put('games/g1', { ...gameNode({ x: ALICE, o: BOB }), players: { O: seat(BOB) } })
    await assertSucceeds(as(CAROL).ref('games/g1/players/X').set(seat(CAROL)))
  })

  it('denies a free-seat claim outside the lobby, in a locked room, or by a kicked player', async () => {
    await put('games/g1', gameNode({ x: ALICE, status: 'playing' }))
    await assertFails(as(CAROL).ref('games/g1/players/O').set(seat(CAROL)))
    await put('games/g2', gameNode({ x: ALICE, extra: { locked: true } }))
    await assertFails(as(CAROL).ref('games/g2/players/O').set(seat(CAROL)))
    await put('games/g3', gameNode({ x: ALICE, extra: { kicked: { [CAROL]: true } } }))
    await assertFails(as(CAROL).ref('games/g3/players/O').set(seat(CAROL)))
  })

  it('leaves a free seat to the queue: strangers cannot jump it, the queued player can take it', async () => {
    await put('games/g1', gameNode({ x: ALICE, extra: { partyRoom: true, queue: { [CAROL]: { name: 'Carol', playerId: CAROL, at: 1 } } } }))
    await assertFails(as(MALLORY).ref('games/g1/players/O').set(seat(MALLORY)))
    await assertSucceeds(as(CAROL).ref('games/g1/players/O').set(seat(CAROL)))
  })

  it('denies a seated player handing the other seat to an outsider', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(as(ALICE).ref('games/g1/players/O').set(seat(MALLORY)))
    await assertFails(as(ALICE).ref('games/g1/players/O/playerId').set(MALLORY))
  })

  it('lets the host kick a seat (marked in kicked); denies the opponent kicking the host', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing' }))
    await assertFails(as(BOB).ref('games/g1').update({ 'kicked/alice': true, 'players/X': null }))
    await assertSucceeds(as(ALICE).ref('games/g1').update({ 'kicked/bob': true, 'players/O': null, status: 'waiting' }))
  })

  it('lets the TRANSFER HOST host kick X even from the queue', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { partyRoom: true, hostUid: CAROL, queue: { [CAROL]: { name: 'Carol', playerId: CAROL, at: 1 } } } }))
    await assertSucceeds(as(CAROL).ref('games/g1').update({
      'kicked/alice': true, 'players/X': seat(CAROL, { seatedAt: 9 }), 'queue/carol': null, status: 'waiting',
    }))
  })

  it('lets only the seat’s player rename it', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(as(ALICE).ref('games/g1/players/O/name').set('pwned'))
    await assertSucceeds(as(BOB).ref('games/g1/players/O/name').set('Bobby'))
  })
})

describe('party seats', () => {
  const players = (uids, extra = {}) => partyNode({ uids }).players && { ...partyNode({ uids }).players, ...extra }

  it('lets a latecomer join the lobby with a whole-players write that adds their seat', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB] }))
    await assertSucceeds(as(CAROL).ref('games/g1/players').set(players([ALICE, BOB], { [CAROL]: seat(CAROL, { online: true }) })))
  })

  it('lets a joiner drop a ghost seat in the same write (the cap is not expressible in rules)', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB] }))
    const next = players([ALICE], { [CAROL]: seat(CAROL, { online: true }) })
    await assertSucceeds(as(CAROL).ref('games/g1/players').set(next))
  })

  it('denies joining mid-round, a locked room, when kicked, or as someone else', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB], status: 'playing' }))
    await assertFails(as(CAROL).ref('games/g1/players').set(players([ALICE, BOB], { [CAROL]: seat(CAROL) })))
    await put('games/g2', partyNode({ uids: [ALICE, BOB], extra: { locked: true } }))
    await assertFails(as(CAROL).ref('games/g2/players').set(players([ALICE, BOB], { [CAROL]: seat(CAROL) })))
    await put('games/g3', partyNode({ uids: [ALICE, BOB], extra: { kicked: { [CAROL]: true } } }))
    await assertFails(as(CAROL).ref('games/g3/players').set(players([ALICE, BOB], { [CAROL]: seat(CAROL) })))
    await put('games/g4', partyNode({ uids: [ALICE, BOB] }))
    await assertFails(as(MALLORY).ref('games/g4/players').set(players([ALICE, BOB], { [CAROL]: seat(CAROL) })))
  })

  it('denies a stranger slipping a uid seat into a 2P room', async () => {
    await put('games/g1', gameNode({ x: ALICE }))
    await assertFails(as(CAROL).ref('games/g1/players').set({ X: seat(ALICE), [CAROL]: seat(CAROL) }))
  })

  it('denies a seat keyed by one uid holding another', async () => {
    await put('games/g1', partyNode({ uids: [ALICE] }))
    await assertFails(as(ALICE).ref(`games/g1/players/${BOB}`).set(seat(ALICE)))
  })

  it('lets only the seat’s player mark it offline; anyone may heal it back online', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB] }))
    await assertFails(as(ALICE).ref('games/g1/players/bob').update({ online: false, offlineAt: 5 }))
    await assertFails(as(ALICE).ref('games/g1/players/bob/conns/c1').set(5))
    await assertSucceeds(as(BOB).ref('games/g1/players/bob').update({ online: false, offlineAt: 5, 'conns/c1': 5 }))
    await assertSucceeds(as(ALICE).ref('games/g1/players/bob/online').set(true))
  })
})

describe('2P presence', () => {
  it('lets only the seat’s player mark it offline or left, or add a connection', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { presence: { X: { online: true, conns: { c1: 1 } } } } }))
    await assertFails(as(BOB).ref('games/g1/presence/X/online').set(false))
    await assertFails(as(BOB).ref('games/g1/presence/X/leftAt').set(5))
    await assertFails(as(BOB).ref('games/g1/presence/X/conns/c2').set(5))
    await assertSucceeds(as(BOB).ref('games/g1/presence/O').update({ online: true, 'conns/c9': 5 }))
    await assertSucceeds(as(ALICE).ref('games/g1/presence/X').update({ online: false, leftAt: 5, conns: null }))
  })

  it('lets a player rotated out of a seat remove their own connection, not flip the flag', async () => {
    // Winner stays moved Bob to the queue and Carol into O; Bob's old
    // connection is still listed under presence/O.
    await put('games/g1', gameNode({ x: ALICE, o: CAROL, status: 'playing', extra: {
      partyRoom: true, queue: { bob: { name: 'Bob', playerId: BOB, at: 1 } },
      presence: { O: { online: true, conns: { bobConn: 1, carolConn: 2 } } },
    } }))
    await assertSucceeds(as(BOB).ref('games/g1/presence/O/conns/bobConn').remove())
    await assertFails(as(BOB).ref('games/g1/presence/O/online').set(false))
  })

  it('rejects a presence entry for a seat that does not exist', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(as(ALICE).ref('games/g1/presence/Z/online').set(true))
  })

  it('lets CLAIM WIN run as a whole-room transaction once the opponent really left', async () => {
    const room = gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { presence: { X: { online: true, conns: { c1: 1 } }, O: { online: false, leftAt: 3 } } } })
    await put('games/g1', room)
    await assertSucceeds(as(ALICE).ref('games/g1').set({ ...room, status: 'finished', winner: 'X', scores: { X: 1, O: 0 } }))
  })
})

describe('results: winner, scores, status', () => {
  it('lets a member declare the winner only while playing, and carry it unchanged afterwards', async () => {
    const room = gameNode({ x: ALICE, o: BOB, status: 'playing' })
    await put('games/g1', room)
    await assertSucceeds(as(BOB).ref('games/g1').update({ status: 'finished', winner: 'O', 'scores/O': 1 }))
    const done = { ...room, status: 'finished', winner: 'O', scores: { X: 0, O: 1 } }
    await put('games/g2', done)
    await assertSucceeds(as(ALICE).ref('games/g2').set({ ...done, lastActivityAt: 9 }))
    await assertFails(as(ALICE).ref('games/g2/winner').set('X'))
  })

  it('moves a 2P score by one at a time or resets it', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { scores: { X: 2, O: 1 } } }))
    await assertFails(as(ALICE).ref('games/g1/scores/X').set(4))
    await assertFails(as(ALICE).ref('games/g1/scores/X').set(-1))
    await assertSucceeds(as(ALICE).ref('games/g1/scores/X').set(3))
    await assertSucceeds(as(ALICE).ref('games/g1/scores').set({ X: 0, O: 0 }))
  })

  it('lets only a seated player add a point; anyone in the room may reset to 0', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { partyRoom: true, scores: { X: 1, O: 1 }, queue: { carol: { name: 'Carol', playerId: CAROL, at: 1 } } } }))
    await assertFails(as(CAROL).ref('games/g1/scores/O').set(2))
    await assertSucceeds(as(CAROL).ref('games/g1/scores').set({ X: 0, O: 0 }))
  })

  it('lets party scores (points) move freely within bounds', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB], status: 'playing' }))
    await assertSucceeds(as(ALICE).ref('games/g1/scores').set({ alice: 2400, bob: 1300 }))
    await assertFails(as(ALICE).ref('games/g1/scores/alice').set('lots'))
    await assertFails(as(ALICE).ref('games/g1/scores/alice').set(1e9))
  })

  it('rejects an unknown status', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(as(ALICE).ref('games/g1/status').set('paused'))
  })
})

describe('spectators, chat and emotes', () => {
  const msg = (by, text = 'gg') => ({ by, name: 'Watcher', text, ts: 1 })
  const watching = (uid) => ({ [uid]: { c1: { name: 'Watcher', at: 1 } } })

  it('lets anyone signed in watch under their own uid only', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertSucceeds(as(CAROL).ref('games/g1/spectators/carol/c1').set({ name: 'Carol', at: 1 }))
    await assertSucceeds(as(CAROL).ref('games/g1/spectators/carol/c1').remove())
    await assertFails(as(CAROL).ref('games/g1/spectators/bob/c1').set({ name: 'Carol', at: 1 }))
    await assertFails(as(CAROL).ref('games/g1/spectators/carol/c1').set({ name: 'x'.repeat(41), at: 1 }))
  })

  it('lets a spectator chat as themselves and prune the log', async () => {
    await put('games/g1', { ...gameNode({ x: ALICE, o: BOB }), spectators: watching(CAROL), chatLog: { m1: msg(BOB) } })
    await assertSucceeds(as(CAROL).ref('games/g1/chatLog').update({ m2: msg(CAROL), m1: null }))
    await assertFails(as(CAROL).ref('games/g1/chatLog/m3').set(msg(ALICE)))
  })

  it('lets a spectator emote as themselves; denies a stranger and a spoofed sender', async () => {
    await put('games/g1', { ...gameNode({ x: ALICE, o: BOB }), spectators: watching(CAROL) })
    const emote = (by) => ({ by, glyph: '🎉', ts: 1, spectator: true, name: 'Carol' })
    await assertSucceeds(as(CAROL).ref('games/g1').update({ emote: emote(CAROL) }))
    await assertFails(as(MALLORY).ref('games/g1').update({ emote: emote(MALLORY) }))
    await assertFails(as(CAROL).ref('games/g1').update({ emote: emote('X') }))
    await assertFails(as(CAROL).ref('games/g1').update({ emote: { ...emote(CAROL), glyph: 'x'.repeat(33) } }))
  })

  it('lets a seat emote by its symbol, not by the other seat’s', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertSucceeds(as(ALICE).ref('games/g1').update({ emote: { by: 'X', glyph: '👍', ts: 2 } }))
    await assertFails(as(ALICE).ref('games/g1').update({ emote: { by: 'O', glyph: '👎', ts: 3 } }))
  })

  it('lets a whole-room write carry someone else’s emote, spectators and chat unchanged', async () => {
    const room = { ...gameNode({ x: ALICE, o: BOB }), spectators: watching(CAROL), emote: { by: CAROL, glyph: '🎉', ts: 1, spectator: true, name: 'Carol' }, chatLog: { m1: msg(CAROL) } }
    await put('games/g1', room)
    await assertSucceeds(as(ALICE).ref('games/g1').set({ ...room, status: 'playing' }))
  })
})

describe('the queue (game night)', () => {
  const entry = (uid) => ({ name: uid, playerId: uid, joinedAt: 1, at: 2 })

  it('lets a spectator line up in a party-origin room, and leave again', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { partyRoom: true } }))
    await assertSucceeds(as(CAROL).ref('games/g1/queue/carol').set(entry(CAROL)))
    await assertSucceeds(as(CAROL).ref('games/g1').update({ 'queue/carol': null }))
  })

  it('denies queueing in a plain 2P room, a locked room, when kicked, or as someone else', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(as(CAROL).ref('games/g1/queue/carol').set(entry(CAROL)))
    await put('games/g2', gameNode({ x: ALICE, o: BOB, extra: { partyRoom: true, locked: true } }))
    await assertFails(as(CAROL).ref('games/g2/queue/carol').set(entry(CAROL)))
    await put('games/g3', gameNode({ x: ALICE, o: BOB, extra: { partyRoom: true, kicked: { carol: true } } }))
    await assertFails(as(CAROL).ref('games/g3/queue/carol').set(entry(CAROL)))
    await put('games/g4', gameNode({ x: ALICE, o: BOB, extra: { partyRoom: true } }))
    await assertFails(as(CAROL).ref('games/g4/queue/mallory').set(entry(MALLORY)))
  })

  it('denies a member queueing an outsider', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, extra: { partyRoom: true } }))
    await assertFails(as(ALICE).ref('games/g1/queue/mallory').set(entry(MALLORY)))
  })
})

describe('game-night room keys', () => {
  const standing = (points, wins, played) => ({ name: 'Alice', points, wins, played })

  it('adds one match at a time to the standings', async () => {
    await put('games/g1', { ...partyNode({ uids: [ALICE, BOB] }), night: { startedAt: 1, standings: { alice: standing(3, 1, 1) } } })
    await assertSucceeds(as(BOB).ref('games/g1/night/standings/alice').set(standing(6, 2, 2)))
    await assertFails(as(BOB).ref('games/g1/night/standings/alice').set(standing(99, 1, 1)))
    await assertFails(as(BOB).ref('games/g1/night/standings/alice').set(standing(3, 5, 1)))
    await assertSucceeds(as(BOB).ref('games/g1/night').set({ startedAt: 2, standings: null, history: null }))
  })

  it('checks the history entry, timer scale and unknown night keys', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB] }))
    await assertSucceeds(as(ALICE).ref('games/g1/night/history/h1').set({ gameType: 'herd', at: 1, draw: false, n: 2, hi: 3, lo: 0, hiName: 'A', loName: 'B', winners: { alice: true } }))
    await assertFails(as(ALICE).ref('games/g1/night/history/h2').set({ gameType: 'herd' }))
    await assertFails(as(ALICE).ref('games/g1/night/bonus').set(5))
    await assertFails(as(ALICE).ref('games/g1/timerScale').set(3))
    await assertSucceeds(as(ALICE).ref('games/g1').update({ timerScale: 0, locked: true, hostUid: BOB, nightMark: 'sig' }))
  })
})

describe('sealKeys and seen', () => {
  const key = (pub = 'P'.repeat(88)) => ({ pub, at: 1 })

  it('lets each player publish only their own sealing key', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB] }))
    await assertSucceeds(as(ALICE).ref('games/g1/sealKeys/alice').set(key()))
    await assertFails(as(ALICE).ref('games/g1/sealKeys/bob').set(key()))
    await assertFails(as(ALICE).ref('games/g1/sealKeys/alice').set(key('P'.repeat(121))))
  })

  it('lets a whole-room write carry the other players’ keys unchanged', async () => {
    const room = { ...partyNode({ uids: [ALICE, BOB] }), sealKeys: { bob: key() } }
    await put('games/g1', room)
    await assertSucceeds(as(ALICE).ref('games/g1').set({ ...room, status: 'playing' }))
    await assertFails(as(ALICE).ref('games/g1').set({ ...room, sealKeys: { bob: key('Q'.repeat(88)) } }))
  })

  it('keeps seen history numeric', async () => {
    await put('games/g1', partyNode({ uids: [ALICE, BOB] }))
    await assertSucceeds(as(ALICE).ref('games/g1').update({ 'seen/trivia/12': 3 }))
    await assertFails(as(ALICE).ref('games/g1').update({ 'seen/trivia/12': 'x' }))
    await assertFails(as(MALLORY).ref('games/g1').update({ 'seen/trivia/13': 4 }))
  })
})

describe('verified board games: moves on your own turn', () => {
  const ttt = (over = {}) => gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { currentTurn: 'O', board: ['X', '', '', '', '', '', '', '', ''], scores: { X: 1, O: 0 }, ...over } })

  it('lets only the player to move change a cell', async () => {
    await put('games/g1', ttt())
    await assertFails(as(ALICE).ref('games/g1').update({ 'board/4': 'X', currentTurn: 'O' }))
    await assertFails(as(ALICE).ref('games/g1').update({ board: ['X', 'X', 'X', '', '', '', '', '', ''], winner: 'X', status: 'finished', 'scores/X': 2 }))
    await assertSucceeds(as(BOB).ref('games/g1').update({ board: ['X', '', '', '', 'O', '', '', '', ''], currentTurn: 'X', lastMove: 4 }))
  })

  it('still lets either player reset the board: new match, switch, or between rounds', async () => {
    await put('games/g1', ttt())
    await assertSucceeds(as(ALICE).ref('games/g1').update({ board: Array(9).fill(''), 'scores/X': 0, 'scores/O': 0, currentTurn: 'X' }))
    await put('games/g2', ttt({ status: 'finished', winner: 'X' }))
    await assertSucceeds(as(ALICE).ref('games/g2').update({ board: Array(9).fill(''), status: 'playing', winner: null, currentTurn: 'O' }))
    await put('games/g3', ttt())
    await assertSucceeds(as(ALICE).ref('games/g3').update({ gameType: 'connectfour', board: Array(42).fill(''), currentTurn: 'X' }))
  })

  it('leaves unverified games’ boards to their own logic', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { gameType: 'checkers', currentTurn: 'O', board: ['x', ''] } }))
    await assertSucceeds(as(ALICE).ref('games/g1/board/1').set('x'))
  })
})

describe('Pig seed recovery and server-only nodes', () => {
  it('counts seed resets up by one', async () => {
    await put('games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing', extra: { gameType: 'dice', diceSeedResets: 1 } }))
    await assertSucceeds(as(BOB).ref('games/g1').update({ diceSeedResets: 2, diceSeedCommitter: 'O' }))
    await assertFails(as(BOB).ref('games/g1/diceSeedResets').set(9))
    await assertFails(as(BOB).ref('games/g1/diceSeedCommitter').set('Z'))
  })

  it('keeps results/ (creditMatchResults’ audit trail) closed to clients', async () => {
    await put('results/g1', { epoch: 1 })
    await assertFails(as(ALICE).ref('results/g1').get())
    await assertFails(as(ALICE).ref('results/g1').set({ epoch: 2 }))
  })
})
