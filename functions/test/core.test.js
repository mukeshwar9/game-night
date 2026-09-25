// Unit tests for the pure results core, run against the esbuild bundle that
// ships (lib/core.cjs), so they also prove the bundle resolves the app's
// src/lib modules. `npm --prefix functions test` builds first.
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const core = require('../lib/core.cjs')

const E = ''
const players = (x = 'uidA', o = 'uidB') => ({
  X: { name: 'ALICE', playerId: x, avatar: 'cat' },
  O: { name: 'BOB', playerId: o, avatar: 'dog' },
})

// X takes the top row; O has two stones elsewhere. lastMove = the finishing X.
const X_ROW = ['X', 'X', 'X', 'O', 'O', E, E, E, E]
// Same win, different O stones, so consecutive rounds differ.
const X_ROW_B = ['X', 'X', 'X', E, 'O', 'O', E, E, E]
const X_COL = ['X', 'O', E, 'X', 'O', E, 'X', E, E]
const O_DIAG = ['O', 'X', 'X', E, 'O', 'X', E, E, 'O']

function tttRoom(over = {}) {
  return {
    gameType: 'tictactoe',
    status: 'finished',
    players: players(),
    presence: { X: { online: true }, O: { online: true } },
    scores: { X: 1, O: 0 },
    winner: 'X',
    board: X_ROW,
    lastMove: 2,
    ...over,
  }
}

describe('verifyRound', () => {
  test('a board that shows the claimed win is verified', () => {
    assert.equal(core.verifyRound(tttRoom()).verdict, 'verified')
    assert.equal(core.verifyRound(tttRoom({ board: X_COL, lastMove: 6 })).verdict, 'verified')
  })

  test('a winner the board contradicts is rejected', () => {
    const v = core.verifyRound(tttRoom({ board: O_DIAG, lastMove: 8 }))
    assert.equal(v.verdict, 'rejected')
    assert.match(v.reason, /board says O/)
  })

  test('an undecided board is a forfeit only when the loser is offline or left', () => {
    const empty = Array(9).fill(E)
    assert.equal(core.verifyRound(tttRoom({ board: empty, lastMove: null })).verdict, 'unverified')
    assert.equal(core.verifyRound(tttRoom({ board: empty, presence: { O: { online: false } } })).verdict, 'forfeit')
    assert.equal(core.verifyRound(tttRoom({ board: empty, presence: { O: { online: true, leftAt: 5 } } })).verdict, 'forfeit')
    // A live connection outweighs a stale legacy flag (per-connection presence).
    assert.equal(core.verifyRound(tttRoom({ board: empty, presence: { O: { online: false, conns: { c1: true } } } })).verdict, 'unverified')
  })

  test('impossible stone counts and a wrong finishing stone are rejected', () => {
    const lonely = ['X', 'X', 'X', E, E, E, E, E, E]
    assert.match(core.verifyRound(tttRoom({ board: lonely })).reason, /stone count/)
    assert.match(core.verifyRound(tttRoom({ lastMove: 3 })).reason, /last move/)
    assert.match(core.verifyRound(tttRoom({ lastMove: undefined })).reason, /last move/)
    // X's extra stone is on the line, but the "finishing" stone given is an X
    // off the line.
    const extra = ['X', 'X', 'X', 'O', 'O', E, 'O', 'X', E]
    assert.match(core.verifyRound(tttRoom({ board: extra, lastMove: 7 })).reason, /off the winning line/)
  })

  test('draws must be real draws', () => {
    const full = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']
    assert.equal(core.verifyRound(tttRoom({ board: full, winner: 'draw', lastMove: 8 })).verdict, 'verified')
    assert.equal(core.verifyRound(tttRoom({ board: full, winner: 'X', lastMove: 8 })).verdict, 'rejected')
    assert.equal(core.verifyRound(tttRoom({ winner: null })).verdict, 'rejected')
  })

  test('Connect Four: gravity and the finishing disc', () => {
    const b = Array(42).fill(E)
    // X stacks column 0 (rows 5..2), O plays column 1 three times.
    ;[35, 28, 21, 14].forEach(i => { b[i] = 'X' })
    ;[36, 29, 22].forEach(i => { b[i] = 'O' })
    const room = tttRoom({ gameType: 'connectfour', board: b, lastMove: 14 })
    assert.equal(core.verifyRound(room).verdict, 'verified')
    const floating = [...b]
    floating[22] = E
    floating[8] = 'O' // O disc hanging in mid-air
    assert.match(core.verifyRound({ ...room, board: floating }).reason, /floating/)
  })

  test('Sim: the loser completes their own triangle with the last edge', () => {
    // simLogic numbers edges (i<j) in order: 0=(0,1) 1=(0,2) 5=(1,2), so X
    // closes triangle 0-1-2 with edge 5; O's (0,3) (0,4) (1,3) is no triangle.
    const b = Array(15).fill(E)
    ;[0, 1, 5].forEach(i => { b[i] = 'X' })
    ;[2, 3, 6].forEach(i => { b[i] = 'O' })
    const room = tttRoom({ gameType: 'sim', board: b, winner: 'O', lastMove: 5 })
    assert.equal(core.verifyRound(room).verdict, 'verified')
    assert.equal(core.verifyRound({ ...room, winner: 'X' }).verdict, 'rejected')
  })

  test('custom and real-time games are trusted, not recomputed', () => {
    assert.equal(core.verifyRound({ gameType: 'pong', winner: 'O', players: players() }).verdict, 'trusted')
  })
})

describe('match rules (shared src/lib/matchRules.js)', () => {
  test('targets and match end', () => {
    assert.equal(core.matchTargetFor({ gameType: 'tictactoe' }), 3)
    assert.equal(core.matchTargetFor({ gameType: 'tron' }), 1)
    assert.equal(core.matchTargetFor({ gameType: 'pong', matchLength: 5 }), 5)
    assert.equal(core.isMatchOver(tttRoom({ scores: { X: 2, O: 1 } })), false)
    assert.equal(core.isMatchOver(tttRoom({ scores: { X: 3, O: 1 } })), true)
    assert.equal(core.isMatchOver(tttRoom({ scores: { X: 3 }, status: 'playing' })), false)
    assert.equal(core.isMatchOver({ gameType: 'password', status: 'finished' }), true)
  })

  test('only two distinct seated uids make a 2P room', () => {
    assert.deepEqual(core.twoPlayerSeats(tttRoom()), { x: 'uidA', o: 'uidB' })
    assert.equal(core.twoPlayerSeats(tttRoom({ players: players('same', 'same') })), null)
    assert.equal(core.twoPlayerSeats({ players: { uidA: { playerId: 'uidA' } } }), null)
    assert.equal(core.twoPlayerSeats(tttRoom({ gameType: 'wordcoop' })), null)
  })
})

// Plays rounds through the reducers the way the trigger does.
function playMatch(rounds, { gameId = 'ROOM1', state: start = null } = {}) {
  let state = core.reduceStart(start, tttRoom({ status: 'playing', scores: { X: 0, O: 0 } }), 1) ?? start
  const notes = []
  const credits = []
  for (const room of rounds) {
    const out = core.reduceFinish(state, room, { now: 2 })
    notes.push(out.note)
    if (out.credit) credits.push(out.credit)
    if (out.state) state = out.state
  }
  return { state, notes, credits, gameId }
}

const threeWins = [
  tttRoom({ scores: { X: 1, O: 0 }, board: X_ROW }),
  tttRoom({ scores: { X: 2, O: 0 }, board: X_ROW_B }),
  tttRoom({ scores: { X: 3, O: 0 }, board: X_COL, lastMove: 6 }),
]

describe('reduceStart / reduceFinish', () => {
  test('a clean match queues exactly one credit', () => {
    const { state, credits, notes } = playMatch(threeWins)
    assert.equal(credits.length, 1)
    assert.equal(credits[0].winner, 'X')
    assert.equal(notes.at(-1), 'match credited')
    assert.equal(state.open, false)
    assert.equal(core.pendingCredits(state).length, 1)
    assert.equal(core.pendingCredits(state)[0].epoch, 1)
  })

  test('replays change nothing', () => {
    const { state } = playMatch(threeWins)
    const again = core.reduceFinish(state, threeWins[2], { now: 3 })
    assert.equal(again.state, null)
    assert.equal(again.note, 'replay of the deciding round')
    // A mid-match replay (same board and scores) is recorded once.
    const mid = playMatch([threeWins[0], threeWins[0], threeWins[1]])
    assert.deepEqual(mid.notes, ['round verified', 'replayed round', 'round verified'])
  })

  test('a forged winner taints the match', () => {
    const forged = tttRoom({ scores: { X: 2, O: 0 }, board: O_DIAG, lastMove: 8 })
    const { credits, notes, state } = playMatch([threeWins[0], forged, threeWins[2]])
    assert.equal(credits.length, 0)
    assert.match(notes.at(-1), /match rejected: tainted: board says O/)
    assert.equal(core.pendingCredits(state).length, 0)
  })

  test('scores that jump to the target are not backed by rounds', () => {
    const { credits, notes } = playMatch([tttRoom({ scores: { X: 3, O: 0 } })])
    assert.equal(credits.length, 0)
    assert.match(notes[0], /score not backed/)
  })

  test('rounds the server could not read in time count for either side', () => {
    let state = core.reduceStart(null, tttRoom({ status: 'playing', scores: { X: 0, O: 0 } }), 1)
    state = core.reduceFinish(state, threeWins[0], { now: 2 }).state
    state = core.reduceFinish(state, tttRoom({ status: 'playing' }), { now: 3, staleKey: 'sabc' }).state
    // The same stale event delivered twice is recorded once.
    assert.equal(core.reduceFinish(state, tttRoom({ status: 'playing' }), { now: 3, staleKey: 'sabc' }).state, null)
    const out = core.reduceFinish(state, threeWins[2], { now: 4 })
    assert.equal(out.note, 'match credited')
  })

  test('a new match (0–0 start) opens the next epoch; a draw restart does not', () => {
    const { state } = playMatch(threeWins)
    const start = tttRoom({ status: 'playing', scores: { X: 0, O: 0 } })
    const next = core.reduceStart(state, start, 5)
    assert.equal(next.epoch, 2)
    assert.equal(next.open, true)
    assert.equal(core.reduceStart(next, start, 6), null)
    // Mid-match rematch (scores not 0–0) never opens an epoch.
    assert.equal(core.reduceStart(next, tttRoom({ status: 'playing', scores: { X: 1, O: 0 } }), 6), null)
    // The first match's credit is still queued in the new epoch's state.
    assert.equal(core.pendingCredits(next).length, 1)
  })

  test('a finish for other seats or another game opens its own epoch', () => {
    const { state } = playMatch([threeWins[0]])
    const swapped = tttRoom({ players: players('uidA', 'uidC'), scores: { X: 3, O: 0 } })
    const out = core.reduceFinish(state, swapped, { now: 3 })
    assert.equal(out.state.epoch, 2)
    assert.match(out.note, /score not backed/)
  })

  test('trusted games are credited on the normal finish path', () => {
    const pong = { gameType: 'pong', status: 'finished', players: players(), scores: { X: 1, O: 3 }, winner: 'O' }
    const out = core.reduceFinish(null, pong, { now: 1 })
    assert.equal(out.note, 'match credited')
    assert.equal(out.credit.winner, 'O')
    assert.equal(out.credit.verdict, 'trusted')
  })
})

describe('leaderboard rows', () => {
  const credit = (key, outcome) => ({ key, outcome, name: 'ALICE', avatar: 'cat', now: 10 })

  test('credits once per match key and tracks streaks', () => {
    let row = core.applyCredit(null, credit('k1', 'win'))
    assert.deepEqual(
      { wins: row.wins, verifiedWins: row.verifiedWins, games: row.games, streak: row.streak, bestStreak: row.bestStreak, verified: row.verified },
      { wins: 1, verifiedWins: 1, games: 1, streak: 1, bestStreak: 1, verified: true },
    )
    assert.equal(core.applyCredit(row, credit('k1', 'win')), undefined)
    row = core.applyCredit(row, credit('k2', 'win'))
    row = core.applyCredit(row, credit('k3', 'loss'))
    assert.deepEqual([row.wins, row.verifiedWins, row.games, row.streak, row.bestStreak], [2, 2, 3, 0, 2])
  })

  test('client-written legacy rows start from zero', () => {
    const row = core.applyCredit({ name: 'CHEAT', wins: 9999, games: 1, bestStreak: 9999 }, credit('k1', 'loss'))
    assert.deepEqual([row.wins, row.games, row.bestStreak, row.name], [0, 1, 0, 'ALICE'])
  })

  test('recent keys are capped and read back from object form', () => {
    let row = null
    for (let i = 0; i < 20; i++) row = core.applyCredit(row, credit(`k${i}`, 'win'))
    assert.equal(row.recent.length, core.RECENT_KEYS)
    // Firebase may hand an array back as an object keyed by index.
    const asObject = { ...row, recent: Object.fromEntries(row.recent.map((k, i) => [String(i), k])) }
    assert.equal(core.applyCredit(asObject, credit('k19', 'win')), undefined)
  })

  test('match keys are stable per epoch and do not expose the room id', () => {
    assert.equal(core.matchKey('ROOM1', 1), core.matchKey('ROOM1', 1))
    assert.notEqual(core.matchKey('ROOM1', 1), core.matchKey('ROOM1', 2))
    assert.ok(!core.matchKey('ROOM1', 1).includes('ROOM1'))
    assert.equal(core.outcomeFor('draw', 'X'), 'draw')
    assert.equal(core.outcomeFor('O', 'X'), 'loss')
  })
})
