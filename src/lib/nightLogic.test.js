import { describe, it, expect } from 'vitest'
import {
  NIGHT_POINTS, DRAW_POINTS,
  normalizeNight, rankStandings, rankByScore, placementPoints, matchWinner2P, matchResult,
  matchSignature, pendingNightResult, addToNight, applyResultToNight, freshNight, nightRecap,
  normalizeQueue, pickTwoSeats, nightSwitchSeating, rotateWinnerStays,
  roomMemberIds, roomHostUid, roomMembers, kickPatch, canTakeSeat,
} from './nightLogic'

const twoP = (over = {}) => ({
  gameType: 'tictactoe',
  status: 'finished',
  winner: 'X',
  scores: { X: 3, O: 1 },
  players: {
    X: { name: 'Ann', playerId: 'a', joinedAt: 1, avatar: 'cat' },
    O: { name: 'Bob', playerId: 'b', joinedAt: 2 },
  },
  ...over,
})

const party = (over = {}) => ({
  gameType: 'trivia',
  status: 'finished',
  scores: { a: 900, b: 400, c: 100 },
  players: {
    a: { name: 'Ann', playerId: 'a', joinedAt: 1, online: true },
    b: { name: 'Bob', playerId: 'b', joinedAt: 2, online: true },
    c: { name: 'Cy', playerId: 'c', joinedAt: 3, online: true },
  },
  ...over,
})

describe('rankByScore / placementPoints', () => {
  it('uses competition ranking and gives last place nothing', () => {
    const ranked = placementPoints(rankByScore([
      { uid: 'a', score: 10 }, { uid: 'b', score: 7 }, { uid: 'c', score: 7 }, { uid: 'd', score: 1 },
    ]))
    expect(ranked.map(e => [e.uid, e.place, e.points, e.win])).toEqual([
      ['a', 1, NIGHT_POINTS[0], true],
      ['b', 2, NIGHT_POINTS[1], false],
      ['c', 2, NIGHT_POINTS[1], false],
      ['d', 4, 0, false],
    ])
  })

  it('scores places past third as zero', () => {
    const ranked = placementPoints(rankByScore([5, 4, 3, 2, 1].map((score, i) => ({ uid: `p${i}`, score }))))
    expect(ranked.map(e => e.points)).toEqual([3, 2, 1, 0, 0])
  })

  it('treats an all-tied result as a draw worth DRAW_POINTS each', () => {
    const ranked = placementPoints(rankByScore([{ uid: 'a', score: 2 }, { uid: 'b', score: 2 }]))
    expect(ranked.every(e => e.points === DRAW_POINTS && !e.win)).toBe(true)
  })

  it('handles an empty list', () => {
    expect(placementPoints([])).toEqual([])
  })
})

describe('matchWinner2P', () => {
  it('takes the round-wins leader, then the last winner, then a draw', () => {
    expect(matchWinner2P({ scores: { X: 1, O: 3 }, winner: 'X' })).toBe('O')
    expect(matchWinner2P({ scores: { X: 2, O: 2 }, winner: 'X' })).toBe('X')
    expect(matchWinner2P({ scores: { X: 2, O: 2 }, winner: 'draw' })).toBe('draw')
    expect(matchWinner2P({})).toBe('draw')
  })
})

describe('matchResult', () => {
  it('ranks a 2P match: winner 3 points and a win, loser 0', () => {
    const r = matchResult(twoP(), false)
    expect(r.draw).toBe(false)
    expect(r.entries).toEqual([
      { uid: 'a', name: 'Ann', avatar: 'cat', score: 1, place: 1, points: 3, win: true },
      { uid: 'b', name: 'Bob', avatar: null, score: 0, place: 2, points: 0, win: false },
    ])
    expect([r.hi, r.lo, r.hiName, r.loName]).toEqual([3, 1, 'Ann', 'Bob'])
  })

  it('scores a 2P draw as a point each', () => {
    const r = matchResult(twoP({ winner: 'draw', scores: { X: 2, O: 2 } }), false)
    expect(r.draw).toBe(true)
    expect(r.entries.map(e => e.points)).toEqual([1, 1])
  })

  it('returns null without two distinct seated players', () => {
    expect(matchResult(twoP({ players: { X: { name: 'Ann', playerId: 'a' } } }), false)).toBeNull()
    expect(matchResult(twoP({ players: { X: { playerId: 'a' }, O: { playerId: 'a' } } }), false)).toBeNull()
    expect(matchResult(null, false)).toBeNull()
  })

  it('ranks a party match by per-player scores, counting unscored seats as 0', () => {
    const r = matchResult(party({ scores: { a: 5, c: 9 } }), true)
    expect(r.entries.map(e => [e.uid, e.place, e.points])).toEqual([
      ['a', 2, 2], ['b', 3, 0], ['c', 1, 3],
    ])
    expect([r.hi, r.lo, r.hiName, r.loName]).toEqual([9, 5, 'Cy', 'Ann'])
  })

  it('falls back to a uid winner when a party game keeps no scores', () => {
    const r = matchResult(party({ scores: null, winner: 'b' }), true)
    expect(r.entries.find(e => e.uid === 'b')).toMatchObject({ place: 1, points: 3, win: true })
    expect(r.entries.filter(e => e.uid !== 'b').every(e => e.place === 2 && e.points === 0)).toBe(true)
  })

  it('skips party entries without a playerId', () => {
    const g = party()
    g.players.ghost = { online: false }
    expect(matchResult(g, true).entries).toHaveLength(3)
  })
})

describe('pendingNightResult / addToNight', () => {
  // What the Firebase layer does: claim nightMark, then add to night.
  const record = (room, nPlayer, now, id) => {
    const pending = pendingNightResult(room, nPlayer)
    if (!pending) return null
    return { ...room, nightMark: pending.sig, night: addToNight(room.night, pending.result, { gameType: room.gameType, now, id }) }
  }

  it('records once and marks the room', () => {
    const room = twoP()
    const next = record(room, false, 100, 'h1')
    expect(next.nightMark).toBe(matchSignature(room))
    const night = normalizeNight(next.night)
    expect(night.startedAt).toBe(100)
    expect(night.standings.a).toMatchObject({ points: 3, wins: 1, played: 1 })
    expect(night.standings.b).toMatchObject({ points: 0, wins: 0, played: 1 })
    expect(night.history).toHaveLength(1)
    expect(night.history[0]).toMatchObject({ gameType: 'tictactoe', winners: ['a'], draw: false, n: 2 })
    // A second client sees the claimed mark and has nothing to record.
    expect(pendingNightResult(next, false)).toBeNull()
  })

  it('addToNight aborts when that history id is already in (a retried transaction)', () => {
    const { result } = pendingNightResult(twoP(), false)
    const once = addToNight(null, result, { gameType: 'tictactoe', now: 1, id: 'h1' })
    expect(addToNight(once, result, { gameType: 'tictactoe', now: 2, id: 'h1' })).toBeUndefined()
    expect(normalizeNight(addToNight(once, result, { gameType: 'tictactoe', now: 2, id: 'h2' })).history).toHaveLength(2)
  })

  it('only records the match-deciding finish when an isMatchOver gate is given (races)', () => {
    const race = party({ gameType: 'reaction', scores: { a: 2, b: 1, c: 0 } })
    const isMatchOver = (r) => Object.values(r.scores).some(n => n >= 3)
    expect(pendingNightResult(race, true, { isMatchOver })).toBeNull()
    const decided = pendingNightResult({ ...race, scores: { a: 3, b: 1, c: 0 } }, true, { isMatchOver })
    expect(decided.result.entries.find(e => e.uid === 'a')).toMatchObject({ place: 1, points: 3, win: true })
  })

  it('ignores rooms that are not finished or have nothing to record', () => {
    expect(pendingNightResult(twoP({ status: 'playing' }), false)).toBeNull()
    expect(pendingNightResult(null, false)).toBeNull()
    expect(pendingNightResult(twoP({ players: {} }), false)).toBeNull()
  })

  it('adds up across game switches (2P then party)', () => {
    const afterTtt = record(twoP(), false, 10, 'h1')
    const partyRoom = { ...party(), night: afterTtt.night, nightMark: null }
    const afterTrivia = record(partyRoom, true, 20, 'h2')
    const ranked = rankStandings(afterTrivia.night)
    expect(ranked.map(s => [s.uid, s.points, s.wins, s.played])).toEqual([
      ['a', 6, 2, 2], ['b', 2, 0, 2], ['c', 0, 0, 1],
    ])
    expect(normalizeNight(afterTrivia.night).startedAt).toBe(10)
  })

  it('signature differs between results and ignores score key order', () => {
    expect(matchSignature(twoP())).not.toBe(matchSignature(twoP({ scores: { X: 3, O: 2 } })))
    expect(matchSignature({ gameType: 't', scores: { b: 1, a: 2 } })).toBe(matchSignature({ gameType: 't', scores: { a: 2, b: 1 } }))
  })
})

describe('normalizeNight / rankStandings', () => {
  it('reads an absent night as empty', () => {
    expect(normalizeNight(undefined)).toEqual({ startedAt: null, standings: {}, history: [] })
    expect(rankStandings(null)).toEqual([])
  })

  it('sorts history by time and drops malformed entries', () => {
    const n = normalizeNight({
      history: { z: { gameType: 'sos', at: 5 }, y: { gameType: 'hex', at: 2 }, bad: 'nope', nogame: { at: 1 } },
    })
    expect(n.history.map(h => h.id)).toEqual(['y', 'z'])
  })

  it('breaks points ties on wins, then fewer games played', () => {
    const ranked = rankStandings({ standings: {
      a: { name: 'A', points: 3, wins: 1, played: 3 },
      b: { name: 'B', points: 3, wins: 1, played: 1 },
      c: { name: 'C', points: 3, wins: 0, played: 1 },
      d: { name: 'D', points: 0, wins: 0, played: 0 },
    } })
    expect(ranked.map(s => s.uid)).toEqual(['b', 'a', 'c'])
  })

  it('freshNight clears standings and history', () => {
    expect(freshNight(7)).toEqual({ startedAt: 7, standings: null, history: null })
  })
})

describe('nightRecap', () => {
  it('picks MVP, most wins, the closest game and the most-played game', () => {
    let night = null
    const add = (result, gameType, now) => { night = applyResultToNight(night, result, { gameType, now, id: `h${now}` }) }
    add(matchResult(twoP({ scores: { X: 3, O: 0 } }), false), 'tictactoe', 1)
    add(matchResult(twoP({ scores: { X: 3, O: 2 } }), false), 'tictactoe', 2)
    add(matchResult(party(), true), 'trivia', 3)
    const recap = nightRecap(night)
    expect(recap.gamesPlayed).toBe(3)
    expect(recap.mvp).toMatchObject({ uid: 'a', points: 9 })
    expect(recap.mostWins).toMatchObject({ uid: 'a', wins: 3 })
    expect(recap.closest).toMatchObject({ gameType: 'tictactoe', hi: 3, lo: 2 })
    expect(recap.favoriteGame).toEqual({ gameType: 'tictactoe', count: 2 })
  })

  it('counts a draw as the closest game', () => {
    let night = applyResultToNight(null, matchResult(twoP({ scores: { X: 3, O: 2 } }), false), { gameType: 'sos', now: 1, id: 'a' })
    night = applyResultToNight(night, matchResult(twoP({ scores: { X: 1, O: 1 }, winner: 'draw' }), false), { gameType: 'hex', now: 2, id: 'b' })
    expect(nightRecap(night).closest).toMatchObject({ gameType: 'hex', draw: true })
  })

  it('is empty for an empty night', () => {
    expect(nightRecap(undefined)).toEqual({ gamesPlayed: 0, mvp: null, mostWins: null, closest: null, favoriteGame: null })
  })
})

describe('queue + seating', () => {
  const seats = [
    { uid: 'a', name: 'Ann', joinedAt: 1 },
    { uid: 'b', name: 'Bob', joinedAt: 2 },
    { uid: 'c', name: 'Cy', joinedAt: 3 },
  ]

  it('normalizeQueue orders by arrival', () => {
    expect(normalizeQueue({ c: { name: 'Cy', at: 5 }, b: { name: 'Bob', at: 3 } }).map(q => q.uid)).toEqual(['b', 'c'])
    expect(normalizeQueue(null)).toEqual([])
  })

  it('pickTwoSeats: host + next without standings, top two with them', () => {
    expect(pickTwoSeats(seats, null, 'b').seated.map(s => s.uid)).toEqual(['b', 'a'])
    expect(pickTwoSeats(seats, null, null).seated.map(s => s.uid)).toEqual(['a', 'b'])
    const night = { standings: { c: { points: 5 }, b: { points: 3 }, a: { points: 0 } } }
    const picked = pickTwoSeats(seats, night, 'a')
    expect(picked.seated.map(s => s.uid)).toEqual(['c', 'b'])
    expect(picked.queued.map(s => s.uid)).toEqual(['a'])
  })

  it('party -> 2P seats two, queues the rest, and marks the room', () => {
    const game = party({ status: 'waiting', kicked: { c: true } })
    game.players.d = { name: 'Di', playerId: 'd', joinedAt: 4 }
    const out = nightSwitchSeating(game, { gameType: 'tictactoe', status: 'playing', players: {} }, { fromParty: true, toParty: false, now: 50, hostUid: 'a' })
    expect(out.players.X).toMatchObject({ playerId: 'a', seatedAt: 50 })
    expect(out.players.O).toMatchObject({ playerId: 'b' })
    expect(Object.keys(out.queue)).toEqual(['d'])
    expect(out.partyRoom).toBe(true)
    expect(out.hostUid).toBe('a')
    expect(out.lobby).toBe(true)
    expect(out.status).toBe('playing')
  })

  it('party -> 2P with no one else leaves the queue empty', () => {
    const game = party()
    delete game.players.c
    const out = nightSwitchSeating(game, {}, { fromParty: true, toParty: false, now: 1 })
    expect(out.queue).toBeNull()
  })

  it('leaves plain 2P rooms untouched', () => {
    const base = { gameType: 'connectfour', players: { X: {}, O: {} } }
    expect(nightSwitchSeating(twoP(), base, { fromParty: false, toParty: false, now: 1 })).toBe(base)
    expect(nightSwitchSeating(twoP(), base, { fromParty: false, toParty: true, now: 1 })).toBe(base)
  })

  it('2P -> 2P in a party room keeps seats (winner stays)', () => {
    const game = twoP({ partyRoom: true, players: {
      X: { name: 'Cy', playerId: 'c', joinedAt: 3, seatedAt: 9 },
      O: { name: 'Ann', playerId: 'a', joinedAt: 1, seatedAt: 4 },
    } })
    const out = nightSwitchSeating(game, { status: 'playing', players: { X: { playerId: 'a' }, O: { playerId: 'c' } } }, { fromParty: false, toParty: false, now: 1 })
    expect(out.players.X.playerId).toBe('c')
    expect(out.players.O.playerId).toBe('a')
    expect(out.status).toBe('playing')
  })

  it('2P -> party in a party room restores seats and queue as party seats', () => {
    const game = twoP({ partyRoom: true, queue: { c: { name: 'Cy', playerId: 'c', joinedAt: 3, at: 9 } } })
    const out = nightSwitchSeating(game, { status: 'waiting', players: { a: {}, b: {} } }, { fromParty: false, toParty: true, now: 1 })
    expect(Object.keys(out.players).sort()).toEqual(['a', 'b', 'c'])
    expect(out.players.c).toEqual({ name: 'Cy', playerId: 'c', joinedAt: 3, online: true, avatar: null })
    expect(out.queue).toBeNull()
  })

  it('rotateWinnerStays swaps the loser for the queue head', () => {
    const game = twoP({ queue: { c: { name: 'Cy', playerId: 'c', joinedAt: 3, at: 5 }, d: { name: 'Di', playerId: 'd', at: 6 } } })
    const patch = rotateWinnerStays(game, 77)
    expect(patch['players/O']).toMatchObject({ playerId: 'c', name: 'Cy', seatedAt: 77 })
    expect(patch['queue/c']).toBeNull()
    expect(patch['queue/b']).toMatchObject({ playerId: 'b', at: 77 })
    expect(patch['players/X']).toBeUndefined()
  })

  it('rotateWinnerStays rotates the longer-seated player out on a draw', () => {
    const game = twoP({
      winner: 'draw', scores: { X: 1, O: 1 },
      players: { X: { name: 'Ann', playerId: 'a', seatedAt: 10 }, O: { name: 'Bob', playerId: 'b', seatedAt: 5 } },
      queue: { c: { name: 'Cy', playerId: 'c', at: 1 } },
    })
    expect(rotateWinnerStays(game, 20)['players/O']).toMatchObject({ playerId: 'c' })
  })

  it('rotateWinnerStays is a no-op without a queue', () => {
    expect(rotateWinnerStays(twoP(), 1)).toEqual({})
  })
})

describe('host', () => {
  it('roomHostUid: 2P defaults to X; party to the first online seat', () => {
    expect(roomHostUid(twoP(), false)).toBe('a')
    const g = party()
    g.players.a.online = false
    expect(roomHostUid(g, true)).toBe('b')
  })

  it('roomHostUid honours hostUid while that player is in the room (and online, for party rooms)', () => {
    expect(roomHostUid(twoP({ hostUid: 'b' }), false)).toBe('b')
    expect(roomHostUid(twoP({ hostUid: 'gone' }), false)).toBe('a')
    expect(roomHostUid(twoP({ hostUid: 'c', queue: { c: { name: 'Cy', at: 1 } } }), false)).toBe('c')
    expect(roomHostUid(party({ hostUid: 'c' }), true)).toBe('c')
    const g = party({ hostUid: 'c' })
    g.players.c.online = false
    expect(roomHostUid(g, true)).toBe('a')
  })

  it('roomMembers / roomMemberIds list seats then queue', () => {
    const g = twoP({ queue: { c: { name: 'Cy', at: 1 } } })
    expect(roomMembers(g, false).map(m => [m.uid, m.where])).toEqual([['a', 'X'], ['b', 'O'], ['c', 'queue']])
    expect(roomMemberIds(party(), true)).toEqual(['a', 'b', 'c'])
    expect(roomMembers(party(), true).every(m => m.where === 'seat')).toBe(true)
  })

  it('kickPatch removes a party seat or queue entry', () => {
    expect(kickPatch(party(), 'b', true, 1)).toEqual({ updates: { 'kicked/b': true, 'players/b': null }, reset: false, seated: false })
    const g = twoP({ queue: { c: { name: 'Cy', at: 1 } } })
    expect(kickPatch(g, 'c', false, 1)).toEqual({ updates: { 'kicked/c': true, 'queue/c': null }, reset: false, seated: false })
  })

  it('kickPatch refills a 2P seat from the queue', () => {
    const g = twoP({ queue: { c: { name: 'Cy', playerId: 'c', at: 1 } } })
    const { updates, reset, seated } = kickPatch(g, 'b', false, 9)
    expect(reset && seated).toBe(true)
    expect(updates['players/O']).toMatchObject({ playerId: 'c', seatedAt: 9 })
    expect(updates['queue/c']).toBeNull()
  })

  it('kickPatch empties O, or moves O up when X is kicked with nobody queued', () => {
    expect(kickPatch(twoP(), 'b', false, 1).updates).toEqual({ 'kicked/b': true, 'players/O': null })
    const { updates } = kickPatch(twoP(), 'a', false, 1)
    expect(updates['players/X']).toMatchObject({ playerId: 'b', name: 'Bob' })
    expect(updates['players/O']).toBeNull()
  })

  it('canTakeSeat respects lock and kick', () => {
    expect(canTakeSeat({}, 'a')).toBe(true)
    expect(canTakeSeat({ locked: true }, 'a')).toBe(false)
    expect(canTakeSeat({ kicked: { a: true } }, 'a')).toBe(false)
  })
})
