// End-to-end check of creditMatchResults against the Functions + Realtime
// Database emulators. Run through run-emulator-test.js (npm run
// test:emulator), which starts both and sets FIREBASE_DATABASE_EMULATOR_HOST.
// Rooms are written the way Game.jsx writes them (status/winner/board/scores
// in one update per round), with the admin SDK.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getDatabase } = require('firebase-admin/database')

const PROJECT = 'demo-game-night'
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST
if (!host) throw new Error('Run via `npm run test:emulator` (needs the database emulator).')

const app = initializeApp({ projectId: PROJECT, databaseURL: `http://${host}?ns=${PROJECT}-default-rtdb` }, 'e2e')
const db = getDatabase(app)

const E = ''
const EMPTY = Array(9).fill(E)
const X_ROW = { board: ['X', 'X', 'X', 'O', 'O', E, E, E, E], lastMove: 2 }
const X_ROW_B = { board: ['X', 'X', 'X', E, 'O', 'O', E, E, E], lastMove: 1 }
const X_COL = { board: ['X', 'O', E, 'X', 'O', E, 'X', E, E], lastMove: 6 }
const O_DIAG = { board: ['O', 'X', 'X', E, 'O', 'X', E, E, 'O'], lastMove: 8 }

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const val = async (path) => (await db.ref(path).get()).val()

async function waitFor(what, fn, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(200)
  }
}

const roundsOf = async (gameId) => Object.keys((await val(`results/${gameId}/rounds`)) || {}).length

// Seat two players and start the match (status -> playing at 0–0).
async function openRoom(gameId, x, o) {
  await db.ref(`games/${gameId}`).set({
    gameType: 'tictactoe',
    status: 'waiting',
    createdAt: Date.now(),
    players: { X: { name: x.toUpperCase(), playerId: x, joinedAt: 1 } },
    scores: { X: 0, O: 0 },
    board: EMPTY,
    currentTurn: 'X',
  })
  await db.ref(`games/${gameId}`).update({
    'players/O': { name: o.toUpperCase(), playerId: o, joinedAt: 2 },
    presence: { X: { online: true }, O: { online: true } },
    status: 'playing',
  })
  await waitFor(`${gameId} epoch`, async () => (await val(`results/${gameId}/open`)) === true)
}

// One finished round, then (unless it decided the match) PLAY AGAIN.
async function finishRound(gameId, { board, lastMove }, winner, scores, { rematch = true } = {}) {
  const before = await roundsOf(gameId)
  await db.ref(`games/${gameId}`).update({ board, lastMove, winner, status: 'finished', scores })
  await waitFor(`${gameId} round ${before + 1}`, async () => (await roundsOf(gameId)) > before)
  if (rematch) await db.ref(`games/${gameId}`).update({ board: EMPTY, lastMove: null, winner: null, status: 'playing' })
}

async function newMatch(gameId) {
  const epoch = await val(`results/${gameId}/epoch`)
  await db.ref(`games/${gameId}`).update({ board: EMPTY, lastMove: null, winner: null, status: 'playing', scores: { X: 0, O: 0 } })
  await waitFor(`${gameId} epoch ${epoch + 1}`, async () => (await val(`results/${gameId}/epoch`)) === epoch + 1)
}

const matchOf = (gameId, epoch) => waitFor(`${gameId} match ${epoch} judged`, async () => {
  const m = await val(`results/${gameId}/matches/${epoch}`)
  return m && m.applied === true ? m : null
})

const row = (uid) => val(`leaderboard/${uid}`)

before(async () => {
  await db.ref().set(null)
  await db.ref('users').set({
    alice: { displayName: 'ALICE', avatar: 'cat' },
    bob: { displayName: 'BOB', avatar: 'dog' },
    carol: { displayName: 'CAROL', avatar: 'fox' },
    dave: { displayName: 'DAVE', avatar: 'owl' },
  })
  // A row from the old client-written mirror: nobody checked these numbers.
  await db.ref('leaderboard/dave').set({ name: 'DAVE', wins: 9999, games: 1, bestStreak: 9999 })
})

after(async () => { await deleteApp(app) })

test('a finished Tic Tac Toe match is credited once', async () => {
  await openRoom('ROOM1', 'alice', 'bob')
  await finishRound('ROOM1', X_ROW, 'X', { X: 1, O: 0 })
  await finishRound('ROOM1', X_ROW_B, 'X', { X: 2, O: 0 })
  await finishRound('ROOM1', X_COL, 'X', { X: 3, O: 0 }, { rematch: false })
  const m = await matchOf('ROOM1', 1)
  assert.equal(m.verdict, 'verified')

  const a = await row('alice')
  const b = await row('bob')
  assert.deepEqual([a.wins, a.games, a.streak, a.bestStreak, a.verified, a.name, a.avatar], [1, 1, 1, 1, true, 'ALICE', 'cat'])
  assert.deepEqual([b.wins, b.games, b.streak, b.verified], [0, 1, 0, true])
})

test('replaying the finish does not count it again', async () => {
  for (let i = 0; i < 2; i++) {
    await db.ref('games/ROOM1/status').set('playing')
    await db.ref('games/ROOM1/status').set('finished')
  }
  // Nothing observable should change; give the triggers time to run.
  await sleep(3000)
  assert.deepEqual([(await row('alice')).wins, (await row('alice')).games, (await row('bob')).games], [1, 1, 1])
  assert.equal(await val('results/ROOM1/epoch'), 1)
})

test('the next match in the same room is credited too', async () => {
  await newMatch('ROOM1')
  await finishRound('ROOM1', X_ROW, 'X', { X: 1, O: 0 })
  await finishRound('ROOM1', O_DIAG, 'O', { X: 1, O: 1 })
  await finishRound('ROOM1', X_ROW_B, 'X', { X: 2, O: 1 })
  await finishRound('ROOM1', X_COL, 'X', { X: 3, O: 1 }, { rematch: false })
  assert.equal((await matchOf('ROOM1', 2)).verdict, 'verified')
  const a = await row('alice')
  assert.deepEqual([a.wins, a.games, a.streak, a.bestStreak], [2, 2, 2, 2])
  assert.equal((await row('bob')).games, 2)
})

test('a winner the board contradicts is not credited', async () => {
  await openRoom('ROOM2', 'alice', 'carol')
  // X claims a round that O actually won on the board.
  await finishRound('ROOM2', O_DIAG, 'X', { X: 1, O: 0 })
  await finishRound('ROOM2', X_ROW, 'X', { X: 2, O: 0 })
  await finishRound('ROOM2', X_COL, 'X', { X: 3, O: 0 }, { rematch: false })
  const m = await matchOf('ROOM2', 1)
  assert.equal(m.verdict, 'rejected')
  assert.match(m.reason, /board says O/)
  assert.equal(await row('carol'), null)
  assert.equal((await row('alice')).wins, 2)
})

test('a score jumped straight to the target is not credited', async () => {
  await openRoom('ROOM3', 'carol', 'bob')
  await finishRound('ROOM3', X_ROW, 'X', { X: 3, O: 0 }, { rematch: false })
  const m = await matchOf('ROOM3', 1)
  assert.equal(m.verdict, 'rejected')
  assert.match(m.reason, /score not backed/)
  assert.equal(await row('carol'), null)
})

test('a seat without a profile gets no row, and legacy rows restart from zero', async () => {
  await openRoom('ROOM4', 'dave', 'ghost')
  await finishRound('ROOM4', X_ROW, 'X', { X: 1, O: 0 })
  await finishRound('ROOM4', X_ROW_B, 'X', { X: 2, O: 0 })
  await finishRound('ROOM4', X_COL, 'X', { X: 3, O: 0 }, { rematch: false })
  const m = await matchOf('ROOM4', 1)
  assert.match(m.reason, /without a profile/)
  assert.equal(await row('ghost'), null)
  assert.equal((await row('dave')).wins, 9999) // untouched legacy row

  await openRoom('ROOM5', 'dave', 'bob')
  await finishRound('ROOM5', X_ROW, 'X', { X: 1, O: 0 })
  await finishRound('ROOM5', X_ROW_B, 'X', { X: 2, O: 0 })
  await finishRound('ROOM5', X_COL, 'X', { X: 3, O: 0 }, { rematch: false })
  await matchOf('ROOM5', 1)
  const d = await row('dave')
  assert.deepEqual([d.wins, d.games, d.bestStreak, d.verified], [1, 1, 1, true])
})
