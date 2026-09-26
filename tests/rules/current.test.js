// The original characterisation suite for database.rules.json. Every test
// named `closed gap (report 5.6)` used to assert a hole that rules v1 now
// denies; the rest is behaviour that has to keep working. Rules v1's own
// cases (room membership, seats, spectators, rounds, social, telemetry) live
// in the other files in this folder.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, setupRulesEnv } from './helpers.js'

// alice = room creator (X), bob = seated O, mallory = signed-in stranger.
const ALICE = 'alice'
const BOB = 'bob'
const MALLORY = 'mallory'

let testEnv

beforeAll(async () => {
  testEnv = await setupRulesEnv()
})

afterEach(async () => {
  await testEnv.clearDatabase()
})

afterAll(async () => {
  await testEnv?.cleanup()
})

describe('games — reads and creation', () => {
  it('denies signed-out reads', async () => {
    await seed(testEnv, 'games/g1', gameNode())
    await assertFails(dbAs(testEnv, null).ref('games/g1').get())
  })

  it('lets any signed-in user read any room', async () => {
    await seed(testEnv, 'games/g1', gameNode())
    await assertSucceeds(dbAs(testEnv, MALLORY).ref('games/g1').get())
  })

  it('lets the creator create a private room seated as X', async () => {
    await assertSucceeds(dbAs(testEnv, ALICE).ref('games/g1').set(gameNode({ x: ALICE })))
  })

  it('lets the creator create a public room seated as X', async () => {
    await assertSucceeds(dbAs(testEnv, ALICE).ref('games/g1').set(gameNode({ x: ALICE, visibility: 'public' })))
  })

  it('denies creating a room with someone else in the X seat', async () => {
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1').set(gameNode({ x: ALICE })))
  })

  it('denies signed-out creation', async () => {
    await assertFails(dbAs(testEnv, null).ref('games/g1').set(gameNode({ x: ALICE })))
  })

  it('rejects an unknown visibility value', async () => {
    await assertFails(dbAs(testEnv, ALICE).ref('games/g1').set(gameNode({ x: ALICE, visibility: 'friends' })))
  })

  it('rejects a player name over 40 characters', async () => {
    const node = gameNode({ x: ALICE })
    node.players.X.name = 'x'.repeat(41)
    await assertFails(dbAs(testEnv, ALICE).ref('games/g1').set(node))
  })
})

describe('games — private rooms (visibility absent)', () => {
  it('lets a newcomer claim the empty O seat with their own uid', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE }))
    await assertSucceeds(dbAs(testEnv, BOB).ref('games/g1/players/O').set({ name: 'Bob', joinedAt: 2, playerId: BOB }))
  })

  it('denies claiming a seat under someone else’s uid', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/players/O').set({ name: 'Bob', joinedAt: 2, playerId: BOB }))
  })

  it('denies rewriting an existing seat’s playerId', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/players/O/playerId').set(MALLORY))
  })

  it('lets the seated players make moves', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing' }))
    await assertSucceeds(dbAs(testEnv, ALICE).ref('games/g1').update({ 'board/4': 'X', currentTurn: 'O' }))
    await assertSucceeds(dbAs(testEnv, BOB).ref('games/g1').update({ 'board/0': 'O', currentTurn: 'X' }))
  })

  it('closed gap (report 5.6): a stranger cannot overwrite the board of a room they are not seated in', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing' }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1').update({ 'board/4': 'O', currentTurn: 'X' }))
  })

  it('closed gap (report 5.6): a stranger cannot declare a winner or set scores', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing' }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1').update({ status: 'finished', winner: 'O', 'scores/O': 99 }))
  })

  it('closed gap (report 5.6): a stranger cannot delete a seat, nor re-claim a taken one as themselves', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, status: 'playing' }))
    const mallory = dbAs(testEnv, MALLORY)
    await assertFails(mallory.ref('games/g1/players/O').remove())
    await assertFails(mallory.ref('games/g1/players/O').set({ name: 'Mallory', joinedAt: 3, playerId: MALLORY }))
  })

  it('closed gap (report 5.6): a stranger cannot rename a seated player', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/players/X/name').set('pwned'))
  })

  it('closed gap (report 5.6): a stranger cannot delete the whole room', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1').remove())
  })

  it('denies anyone, even the creator, turning a private room public', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE }))
    await assertFails(dbAs(testEnv, ALICE).ref('games/g1/visibility').set('public'))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/visibility').set('public'))
  })
})

describe('games — public rooms', () => {
  it('lets a newcomer claim the empty O seat', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, visibility: 'public' }))
    await assertSucceeds(dbAs(testEnv, BOB).ref('games/g1/players/O').set({ name: 'Bob', joinedAt: 2, playerId: BOB }))
  })

  it('denies a stranger claiming O once it is taken', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public' }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/players/O').set({ name: 'Mallory', joinedAt: 3, playerId: MALLORY }))
  })

  it('denies a stranger writing the board', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public', status: 'playing' }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1').update({ 'board/4': 'O' }))
  })

  it('denies a stranger deleting the room or flipping it private', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public' }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1').remove())
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/visibility').set('private'))
  })

  it('lets seated players make moves', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public', status: 'playing' }))
    await assertSucceeds(dbAs(testEnv, BOB).ref('games/g1').update({ 'board/0': 'O', currentTurn: 'X' }))
  })

  it('closed gap (report 5.6): a seated player cannot declare a winner outside play or jump the score', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public', status: 'waiting' }))
    await assertFails(dbAs(testEnv, BOB).ref('games/g1').update({ status: 'finished', winner: 'O', 'scores/O': 1000 }))
  })

  it('closed gap (report 5.6): a seated player cannot delete the opponent’s seat', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public', status: 'playing' }))
    await assertFails(dbAs(testEnv, ALICE).ref('games/g1/players/O').remove())
  })
})

describe('games — chatLog', () => {
  const msg = (by, text = 'gg') => ({ by, name: 'Bob', text, ts: 1 })

  it('accepts a message authored by the writer', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertSucceeds(dbAs(testEnv, BOB).ref('games/g1/chatLog/m1').set(msg(BOB)))
  })

  it('rejects a message attributed to someone else', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(dbAs(testEnv, BOB).ref('games/g1/chatLog/m1').set(msg(ALICE)))
  })

  it('rejects empty and over-80-character messages', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB }))
    await assertFails(dbAs(testEnv, BOB).ref('games/g1/chatLog/m1').set(msg(BOB, '')))
    await assertFails(dbAs(testEnv, BOB).ref('games/g1/chatLog/m1').set(msg(BOB, 'x'.repeat(81))))
  })

  it('closed gap (report 5.6): a stranger outside the room cannot post into a private room or delete others’ messages', async () => {
    await seed(testEnv, 'games/g1', { ...gameNode({ x: ALICE, o: BOB }), chatLog: { m1: msg(BOB) } })
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/chatLog/m2').set(msg(MALLORY, 'spam')))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/chatLog/m1').remove())
  })

  it('denies a stranger posting into a public room', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public' }))
    await assertFails(dbAs(testEnv, MALLORY).ref('games/g1/chatLog/m1').set(msg(MALLORY)))
  })

  it('lets a whole-room write carry other players’ messages unchanged', async () => {
    // Whole-room transactions (party phase advances) rewrite chatLog as-is;
    // re-validating Bob's message as if Alice authored it used to reject them.
    const room = { ...gameNode({ x: ALICE, o: BOB }), chatLog: { m1: msg(BOB) } }
    await seed(testEnv, 'games/g1', room)
    await assertSucceeds(dbAs(testEnv, ALICE).ref('games/g1').set({ ...room, status: 'finished' }))
    await assertFails(dbAs(testEnv, ALICE).ref('games/g1').set({ ...room, chatLog: { m1: msg(BOB, 'edited') } }))
  })
})

describe('matchmaking', () => {
  const listing = (host, over = {}) => ({
    gameId: 'g1', gameType: 'tictactoe', visibility: 'public', hostUid: host, hostName: 'Alice',
    createdAt: 1, updatedAt: 1, expiresAt: 2, ...over,
  })

  it('lets any signed-in user read the lobby, not signed-out visitors', async () => {
    await assertSucceeds(dbAs(testEnv, MALLORY).ref('matchmaking').get())
    await assertFails(dbAs(testEnv, null).ref('matchmaking').get())
  })

  it('lets the host list their own public waiting room', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, visibility: 'public' }))
    await assertSucceeds(dbAs(testEnv, ALICE).ref('matchmaking/g1').set(listing(ALICE)))
  })

  it('denies listing a private room', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE }))
    await assertFails(dbAs(testEnv, ALICE).ref('matchmaking/g1').set(listing(ALICE)))
  })

  it('denies a stranger listing someone else’s room', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, visibility: 'public' }))
    await assertFails(dbAs(testEnv, MALLORY).ref('matchmaking/g1').set(listing(MALLORY)))
    await assertFails(dbAs(testEnv, MALLORY).ref('matchmaking/g1').set(listing(ALICE)))
  })

  it('lets the player who took O remove the listing; denies a stranger', async () => {
    await seed(testEnv, 'games/g1', gameNode({ x: ALICE, o: BOB, visibility: 'public' }))
    await seed(testEnv, 'matchmaking/g1', listing(ALICE))
    await assertFails(dbAs(testEnv, MALLORY).ref('matchmaking/g1').remove())
    await assertSucceeds(dbAs(testEnv, BOB).ref('matchmaking/g1').remove())
  })
})

describe('users', () => {
  const profile = { displayName: 'Alice', avatar: 'a', code: 'ABC234', online: true, lastSeen: 1 }

  it('lets a user write their own profile, not someone else’s', async () => {
    await assertSucceeds(dbAs(testEnv, ALICE).ref(`users/${ALICE}`).set(profile))
    await assertFails(dbAs(testEnv, MALLORY).ref(`users/${ALICE}`).set(profile))
  })

  it('denies self-promotion to admin', async () => {
    await assertFails(dbAs(testEnv, ALICE).ref(`users/${ALICE}`).set({ ...profile, admin: true }))
    await seed(testEnv, `users/${ALICE}`, profile)
    await assertFails(dbAs(testEnv, ALICE).ref(`users/${ALICE}/admin`).set(true))
  })

  it('rejects a display name over 40 characters', async () => {
    await assertFails(dbAs(testEnv, ALICE).ref(`users/${ALICE}`).set({ ...profile, displayName: 'x'.repeat(41) }))
  })

  it('denies signed-out reads', async () => {
    await seed(testEnv, `users/${ALICE}`, profile)
    await assertFails(dbAs(testEnv, null).ref(`users/${ALICE}`).get())
  })

  it('closed gap (report 5.6): other users cannot read someone’s friend code, online or lastSeen', async () => {
    await seed(testEnv, `users/${ALICE}`, profile)
    await assertFails(dbAs(testEnv, MALLORY).ref(`users/${ALICE}/code`).get())
    await assertFails(dbAs(testEnv, MALLORY).ref(`users/${ALICE}/lastSeen`).get())
  })
})

describe('codes', () => {
  it('lets a user claim an unclaimed code for themselves only', async () => {
    await assertSucceeds(dbAs(testEnv, ALICE).ref('codes/ABC234').set(ALICE))
    await assertFails(dbAs(testEnv, MALLORY).ref('codes/XYZ789').set(ALICE))
  })

  it('denies overwriting or deleting a claimed code, even by its owner', async () => {
    await seed(testEnv, 'codes/ABC234', ALICE)
    await assertFails(dbAs(testEnv, MALLORY).ref('codes/ABC234').set(MALLORY))
    await assertFails(dbAs(testEnv, ALICE).ref('codes/ABC234').remove())
  })

  it('lets signed-in users resolve a code', async () => {
    await seed(testEnv, 'codes/ABC234', ALICE)
    await assertSucceeds(dbAs(testEnv, MALLORY).ref('codes/ABC234').get())
  })
})

describe('friends', () => {
  it('lets a user read only their own friend list', async () => {
    await seed(testEnv, `friends/${ALICE}/${BOB}`, { since: 1 })
    await assertSucceeds(dbAs(testEnv, ALICE).ref(`friends/${ALICE}`).get())
    await assertFails(dbAs(testEnv, MALLORY).ref(`friends/${ALICE}`).get())
  })

  it('lets either side of a pair write the edge once a request is pending; denies a third party', async () => {
    await seed(testEnv, `friendRequests/${ALICE}/${BOB}`, { name: 'Bob', at: 1 })
    await assertSucceeds(dbAs(testEnv, ALICE).ref(`friends/${ALICE}/${BOB}`).set({ since: 1 }))
    await assertSucceeds(dbAs(testEnv, ALICE).ref(`friends/${BOB}/${ALICE}`).set({ since: 1 }))
    await assertFails(dbAs(testEnv, MALLORY).ref(`friends/${ALICE}/${BOB}`).set({ since: 1 }))
  })

  it('requires `since`', async () => {
    await seed(testEnv, `friendRequests/${ALICE}/${BOB}`, { name: 'Bob', at: 1 })
    await assertFails(dbAs(testEnv, ALICE).ref(`friends/${ALICE}/${BOB}`).set({ at: 1 }))
  })

  it('closed gap (report 5.6): nobody can add themselves to a user’s friend list without a request', async () => {
    await assertFails(dbAs(testEnv, MALLORY).ref(`friends/${ALICE}/${MALLORY}`).set({ since: 1 }))
  })
})

describe('friendRequests', () => {
  it('lets the sender create a request under their own uid only', async () => {
    await assertSucceeds(dbAs(testEnv, ALICE).ref(`friendRequests/${BOB}/${ALICE}`).set({ name: 'Alice', at: 1 }))
    await assertFails(dbAs(testEnv, MALLORY).ref(`friendRequests/${BOB}/${ALICE}`).set({ name: 'Alice', at: 1 }))
  })

  it('lets the recipient read and clear their requests; hides them from others', async () => {
    await seed(testEnv, `friendRequests/${BOB}/${ALICE}`, { name: 'Alice', at: 1 })
    await assertSucceeds(dbAs(testEnv, BOB).ref(`friendRequests/${BOB}`).get())
    await assertFails(dbAs(testEnv, MALLORY).ref(`friendRequests/${BOB}`).get())
    await assertSucceeds(dbAs(testEnv, BOB).ref(`friendRequests/${BOB}/${ALICE}`).remove())
  })

  it('rejects a name over 40 characters', async () => {
    await assertFails(dbAs(testEnv, ALICE).ref(`friendRequests/${BOB}/${ALICE}`).set({ name: 'x'.repeat(41), at: 1 }))
  })
})

describe('invites', () => {
  const invite = (from) => ({ gameId: 'g1', gameType: 'tictactoe', fromUid: from, fromName: 'Alice', at: 1 })

  it('lets a friend invite, not a stranger', async () => {
    await seed(testEnv, `friends/${BOB}/${ALICE}`, { since: 1 })
    await assertSucceeds(dbAs(testEnv, ALICE).ref(`invites/${BOB}/i1`).set(invite(ALICE)))
    await assertFails(dbAs(testEnv, MALLORY).ref(`invites/${BOB}/i2`).set(invite(MALLORY)))
  })

  it('rejects a spoofed fromUid', async () => {
    await seed(testEnv, `friends/${BOB}/${ALICE}`, { since: 1 })
    await assertFails(dbAs(testEnv, ALICE).ref(`invites/${BOB}/i1`).set(invite(MALLORY)))
  })

  it('lets the recipient read and dismiss; hides invites from others', async () => {
    await seed(testEnv, `invites/${BOB}/i1`, invite(ALICE))
    await assertSucceeds(dbAs(testEnv, BOB).ref(`invites/${BOB}`).get())
    await assertFails(dbAs(testEnv, ALICE).ref(`invites/${BOB}`).get())
    await assertSucceeds(dbAs(testEnv, BOB).ref(`invites/${BOB}/i1`).remove())
  })
})

describe('plays', () => {
  it('lets signed-in users read and bump a counter; requires a number', async () => {
    await seed(testEnv, 'plays/tictactoe/online', 4)
    await assertSucceeds(dbAs(testEnv, ALICE).ref('plays').get())
    await assertSucceeds(dbAs(testEnv, ALICE).ref('plays/tictactoe/online').set(5))
    await assertFails(dbAs(testEnv, ALICE).ref('plays/tictactoe/online').set('lots'))
    await assertFails(dbAs(testEnv, null).ref('plays/tictactoe/online').set(6))
  })

  it('closed gap (report 5.6): a counter only ever goes up by one', async () => {
    await seed(testEnv, 'plays/tictactoe/online', 4)
    await assertFails(dbAs(testEnv, MALLORY).ref('plays/tictactoe/online').set(-1000))
  })
})

describe('leaderboard', () => {
  const entry = { name: 'Alice', wins: 3, games: 5, updatedAt: 1 }

  // The creditMatchResults Cloud Function (admin SDK) is the only writer.
  it('is server-written only: no client writes any entry, even their own', async () => {
    await assertFails(dbAs(testEnv, ALICE).ref(`leaderboard/${ALICE}`).set(entry))
    await assertFails(dbAs(testEnv, MALLORY).ref(`leaderboard/${ALICE}`).set(entry))
  })

  it('is readable by signed-in users', async () => {
    await seed(testEnv, `leaderboard/${ALICE}`, entry)
    await assertSucceeds(dbAs(testEnv, MALLORY).ref('leaderboard').get())
  })

  it('closed gap (report 5.6): a user cannot post any win count', async () => {
    await seed(testEnv, `leaderboard/${ALICE}`, entry)
    await assertFails(dbAs(testEnv, ALICE).ref(`leaderboard/${ALICE}`).set({ ...entry, wins: 1e9, games: 1e9 }))
  })
})

describe('feedback', () => {
  const report = (by) => ({
    type: 'bug', message: 'The board froze after my move.', by, name: 'Alice',
    status: 'open', createdAt: 1, updatedAt: 1,
  })

  // writeFeedback's one multi-path update: the item plus the cooldown stamp.
  const file = (uid, id, item) => dbAs(testEnv, uid).ref().update({
    [`feedback/${id}`]: item,
    [`users/${uid}/lastFeedbackAt`]: { '.sv': 'timestamp' },
  })

  it('lets a user file feedback as themselves only', async () => {
    await assertSucceeds(file(ALICE, 'f1', report(ALICE)))
    await assertFails(file(MALLORY, 'f2', report(ALICE)))
  })

  it('rejects messages under 10 characters and unknown types', async () => {
    await assertFails(file(ALICE, 'f1', { ...report(ALICE), message: 'short' }))
    await assertFails(file(ALICE, 'f1', { ...report(ALICE), type: 'rant' }))
  })

  it('denies non-admins reading or editing feedback, even their own', async () => {
    await seed(testEnv, 'feedback/f1', report(ALICE))
    await assertFails(dbAs(testEnv, ALICE).ref('feedback').get())
    await assertFails(dbAs(testEnv, ALICE).ref('feedback/f1/status').set('done'))
  })

  it('lets admins read and triage', async () => {
    await seed(testEnv, `users/${BOB}`, { displayName: 'Bob', admin: true })
    await seed(testEnv, 'feedback/f1', report(ALICE))
    await assertSucceeds(dbAs(testEnv, BOB).ref('feedback').get())
    await assertSucceeds(dbAs(testEnv, BOB).ref('feedback/f1').update({ status: 'planned', updatedAt: 2 }))
  })
})

describe('unlisted top-level paths', () => {
  it('denies reads and writes everywhere else', async () => {
    await assertFails(dbAs(testEnv, ALICE).ref('nope/e1').set({ message: 'x' }))
    await assertFails(dbAs(testEnv, ALICE).ref('results').get())
    await assertFails(dbAs(testEnv, ALICE).ref('/').get())
  })
})
