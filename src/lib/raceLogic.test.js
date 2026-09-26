import { describe, it, expect } from 'vitest'
import {
  RACE_COUNTDOWN_MS, OFFLINE_GRACE_MS, RACE_MATCH_WINS,
  isSeatOnline, seatedIds, flaggedIds, normalizeRaceRound, newRoundId, buildRaceRound,
  racePhase, raceGoAt, rankRace, placementPoints, raceWinners, buildRaceResult,
  applyRaceFinish, matchChampions, canEndRace, allReady, rosterForStart, ordinal,
  normalizeRaceResult, seededFraction, newRaceSeed, isMatchOver,
  startRaceRound, toggleRaceReady, finishRaceRound, tiedIds,
} from './raceLogic'

const seat = (id, joinedAt, online = true) => ({ name: id.toUpperCase(), playerId: id, joinedAt, online })

const room = (overrides = {}) => ({
  gameType: 'reaction',
  status: 'waiting',
  scores: {},
  players: { a: seat('a', 1), b: seat('b', 2), c: seat('c', 3) },
  ...overrides,
})

// Toy race: stats { v } = higher is better, { done } marks finished.
const entryOf = (s) => (s?.done ? { sortKey: [-s.v], score: s.v } : { sortKey: null, score: null })
const isDone = (s) => !!s?.done

describe('seats and presence', () => {
  it('treats missing presence as online', () => {
    expect(isSeatOnline({ a: {} }, 'a')).toBe(true)
    expect(isSeatOnline({ a: { online: false } }, 'a')).toBe(false)
  })

  it('lists seats in join order with uid tiebreak, skipping junk', () => {
    expect(seatedIds({ c: seat('c', 5), b: seat('b', 1), a: seat('a', 1), x: null, y: 'junk' })).toEqual(['a', 'b', 'c'])
  })

  it('flaggedIds keeps only truthy flags', () => {
    expect(flaggedIds({ a: true, b: false, c: null })).toEqual(['a'])
    expect(flaggedIds(null)).toEqual([])
    expect(flaggedIds(['a'])).toEqual([])
  })

  it('rosterForStart drops offline seats but keeps the starter', () => {
    const players = { a: seat('a', 1), b: seat('b', 2, false), c: seat('c', 3) }
    expect(rosterForStart(players)).toEqual(['a', 'c'])
    expect(rosterForStart(players, 'b')).toEqual(['a', 'b', 'c'])
  })
})

describe('round shape', () => {
  it('builds a round with a deadline after the countdown', () => {
    const r = buildRaceRound({ id: 'r1', gameType: 'aim', racers: ['a', 'b'], now: 1000, seed: 7, durationMs: 30_000, extras: { passage: 'x' } })
    expect(r).toEqual({ passage: 'x', id: 'r1', gameType: 'aim', seed: 7, startedAt: 1000, endsAt: 1000 + RACE_COUNTDOWN_MS + 30_000, racers: { a: true, b: true } })
  })

  it('has no deadline with timers off', () => {
    expect(buildRaceRound({ id: 'r', gameType: 'aim', racers: [], now: 0, seed: 1, durationMs: null }).endsAt).toBeNull()
  })

  it('normalizes a Firebase round, reading only the live stats branch', () => {
    const r = normalizeRaceRound({
      id: 'r2', gameType: 'typing', seed: '42', startedAt: 10, endsAt: null,
      racers: { b: true, a: true, z: false },
      stats: { r1: { a: { stale: true } }, r2: { a: { v: 1 }, b: 'junk' } },
      ready: { a: true },
    })
    expect(r.id).toBe('r2')
    expect(r.seed).toBe(42)
    expect(r.endsAt).toBeNull()
    expect(r.racers).toEqual(['a', 'b'])
    expect(r.stats).toEqual({ a: { v: 1 } })
    expect(r.ready).toEqual(['a'])
  })

  it('normalizes a lobby-only round and absent data', () => {
    expect(normalizeRaceRound(null)).toBeNull()
    const lobby = normalizeRaceRound({ ready: { a: true } })
    expect(lobby.id).toBeNull()
    expect(lobby.stats).toEqual({})
    expect(lobby.ready).toEqual(['a'])
  })

  it('phases: countdown until the go signal, then racing', () => {
    const r = { startedAt: 1000 }
    expect(racePhase(null, 0)).toBe('idle')
    expect(racePhase(r, 1000 + RACE_COUNTDOWN_MS - 1)).toBe('countdown')
    expect(racePhase(r, 1000 + RACE_COUNTDOWN_MS)).toBe('racing')
    expect(raceGoAt(r)).toBe(1000 + RACE_COUNTDOWN_MS)
    expect(raceGoAt(null)).toBeNull()
  })

  it('round ids and seeds are well-formed', () => {
    expect(newRoundId(1000, () => 0.5)).toMatch(/^r[0-9a-z]+$/)
    expect(newRoundId(1000, () => 0.1)).not.toBe(newRoundId(1000, () => 0.9))
    const s = newRaceSeed(() => 0.25)
    expect(Number.isInteger(s)).toBe(true)
  })
})

describe('rankRace', () => {
  it('orders by sort key, smaller first', () => {
    const { order, ranks, dnf } = rankRace([
      { id: 'a', sortKey: [300] }, { id: 'b', sortKey: [250] }, { id: 'c', sortKey: [400] },
    ])
    expect(order).toEqual(['b', 'a', 'c'])
    expect(ranks).toEqual({ b: 1, a: 2, c: 3 })
    expect(dnf).toEqual({})
  })

  it('ties share a rank and skip the next (1, 1, 3)', () => {
    const { ranks } = rankRace([
      { id: 'a', sortKey: [-10] }, { id: 'b', sortKey: [-10] }, { id: 'c', sortKey: [-5] },
    ])
    expect(ranks).toEqual({ a: 1, b: 1, c: 3 })
  })

  it('compares keys lexicographically (tier, then value)', () => {
    const { order } = rankRace([
      { id: 'dead', sortKey: [2, -100] },
      { id: 'alive', sortKey: [1, -10] },
      { id: 'clear2', sortKey: [0, 900] },
      { id: 'clear1', sortKey: [0, 500] },
    ])
    expect(order).toEqual(['clear1', 'clear2', 'alive', 'dead'])
  })

  it('puts DNFs last, tied with each other', () => {
    const { order, ranks, dnf } = rankRace([
      { id: 'x', sortKey: null }, { id: 'a', sortKey: [1] }, { id: 'y' },
    ])
    expect(order).toEqual(['a', 'x', 'y'])
    expect(ranks).toEqual({ a: 1, x: 2, y: 2 })
    expect(dnf).toEqual({ x: true, y: true })
  })

  it('handles an empty field and everyone DNF', () => {
    expect(rankRace([]).order).toEqual([])
    const all = rankRace([{ id: 'a', sortKey: null }, { id: 'b', sortKey: null }])
    expect(all.ranks).toEqual({ a: 1, b: 1 })
    expect(raceWinners(all.ranks, all.dnf)).toEqual([])
  })

  it('tiedIds marks shared ranks', () => {
    expect([...tiedIds({ a: 1, b: 1, c: 3 })].sort()).toEqual(['a', 'b'])
    expect(tiedIds({ a: 1, b: 2 }).size).toBe(0)
  })
})

describe('points and winners', () => {
  it('placement points = racers - rank, DNF and last score 0', () => {
    const ranks = { a: 1, b: 2, c: 3, d: 4 }
    expect(placementPoints(ranks, { d: true }, 4)).toEqual({ a: 3, b: 2, c: 1, d: 0 })
  })

  it('tied racers score the same', () => {
    expect(placementPoints({ a: 1, b: 1, c: 3 }, {}, 3)).toEqual({ a: 2, b: 2, c: 0 })
  })

  it('a 2-player race is winner 1, loser 0', () => {
    expect(placementPoints({ a: 1, b: 2 }, {}, 2)).toEqual({ a: 1, b: 0 })
  })

  it('winners are rank-1 finishers only', () => {
    expect(raceWinners({ a: 1, b: 1, c: 3 }, {})).toEqual(['a', 'b'])
    expect(raceWinners({ a: 1 }, { a: true })).toEqual([])
  })
})

describe('buildRaceResult / applyRaceFinish', () => {
  const entries = [
    { id: 'a', sortKey: [-5], score: 5 },
    { id: 'b', sortKey: [-9], score: 9 },
    { id: 'c', sortKey: null, score: null },
  ]

  it('builds the night-recordable result shape', () => {
    const r = buildRaceResult({ roundId: 'r1', gameType: 'aim', entries, now: 1234.7 })
    expect(r).toEqual({
      roundId: 'r1', gameType: 'aim', order: ['b', 'a', 'c'],
      ranks: { b: 1, a: 2, c: 3 }, scores: { a: 5, b: 9, c: null }, dnf: { c: true },
      points: { b: 2, a: 1, c: 0 }, at: 1234,
    })
  })

  it('finishes the room: +1 score for the winner, winner uid', () => {
    const result = buildRaceResult({ roundId: 'r1', gameType: 'aim', entries, now: 5 })
    const next = applyRaceFinish(room({ status: 'playing', scores: { b: 1 } }), result)
    expect(next.status).toBe('finished')
    expect(next.winner).toBe('b')
    expect(next.scores).toEqual({ b: 2 })
    expect(next.raceResult).toBe(result)
    expect(next.lastActivityAt).toBe(5)
  })

  it('a shared first gives every co-winner a point and winner draw', () => {
    const result = buildRaceResult({ roundId: 'r', gameType: 'aim', now: 1, entries: [
      { id: 'a', sortKey: [1], score: 1 }, { id: 'b', sortKey: [1], score: 1 },
    ] })
    const next = applyRaceFinish(room({ status: 'playing' }), result)
    expect(next.winner).toBe('draw')
    expect(next.scores).toEqual({ a: 1, b: 1 })
  })

  it('all DNF: nobody scores', () => {
    const result = buildRaceResult({ roundId: 'r', gameType: 'aim', now: 1, entries: [{ id: 'a', sortKey: null }] })
    const next = applyRaceFinish(room({ status: 'playing', scores: null }), result)
    expect(next.winner).toBe('draw')
    expect(next.scores).toEqual({})
  })

  it('normalizes a stored result (sparse/absent maps)', () => {
    expect(normalizeRaceResult(null)).toBeNull()
    const r = normalizeRaceResult({ roundId: 'r', order: { 0: 'a', 1: 'b' }, ranks: { a: 1, b: 2 } })
    expect(r.order).toEqual(['a', 'b'])
    expect(r.dnf).toEqual({})
    expect(r.points).toEqual({})
  })
})

describe('matchChampions', () => {
  it('returns racers at or over the target', () => {
    expect(matchChampions({ a: RACE_MATCH_WINS, b: 1 })).toEqual(['a'])
    expect(matchChampions({ a: 2 })).toEqual([])
    expect(matchChampions(null)).toEqual([])
    expect(isMatchOver({ scores: { a: 3 } })).toBe(true)
  })
})

describe('canEndRace', () => {
  const base = { racers: ['a', 'b', 'c'], endsAt: 10_000, now: 5_000 }

  it('keeps going while someone online is still racing', () => {
    expect(canEndRace({ ...base, isDone: (id) => id === 'a' })).toBe(false)
  })

  it('ends when everyone is done', () => {
    expect(canEndRace({ ...base, isDone: () => true })).toBe(true)
  })

  it('ends at the deadline no matter what (DNF never blocks)', () => {
    expect(canEndRace({ ...base, now: 10_000, isDone: () => false })).toBe(true)
  })

  it('ends when the game says the ranking is decided', () => {
    expect(canEndRace({ ...base, isDone: () => false, decided: true })).toBe(true)
  })

  it('an offline racer holds the round only for the grace period', () => {
    const isDoneAB = (id) => id !== 'c'
    expect(canEndRace({ ...base, isDone: isDoneAB, offlineSince: (id) => (id === 'c' ? 4_000 : null) })).toBe(false)
    expect(canEndRace({ ...base, isDone: isDoneAB, offlineSince: (id) => (id === 'c' ? 5_000 - OFFLINE_GRACE_MS : null) })).toBe(true)
  })

  it('an online straggler still blocks even if others are offline', () => {
    const offline = (id) => (id === 'c' ? 0 : null)
    expect(canEndRace({ ...base, isDone: (id) => id === 'a', offlineSince: offline })).toBe(false)
  })

  it('with timers off (no deadline) only completion/decision/offline end it', () => {
    expect(canEndRace({ ...base, endsAt: null, now: 1e12, isDone: () => false })).toBe(false)
  })

  it('an empty roster ends immediately', () => {
    expect(canEndRace({ racers: [], isDone: () => false, endsAt: null, now: 0 })).toBe(true)
  })
})

describe('allReady', () => {
  it('needs every online seat ready and at least two online', () => {
    const players = { a: seat('a', 1), b: seat('b', 2), c: seat('c', 3, false) }
    expect(allReady(players, ['a'])).toBe(false)
    expect(allReady(players, ['a', 'b'])).toBe(true) // offline c never blocks
    expect(allReady({ a: seat('a', 1) }, ['a'])).toBe(false)
  })
})

describe('room transitions', () => {
  const params = { gameType: 'reaction', starterId: 'a', now: 1000, id: 'r1', seed: 9, durationMs: 60_000 }

  it('toggleRaceReady flips my flag and refuses non-seated/live/match-over', () => {
    const once = toggleRaceReady(room(), 'a', 'reaction')
    expect(once.round.ready).toEqual({ a: true })
    const twice = toggleRaceReady(once, 'a', 'reaction')
    expect(twice.round.ready).toEqual({})
    expect(toggleRaceReady(room(), 'zz', 'reaction')).toBeUndefined()
    expect(toggleRaceReady(room({ status: 'playing' }), 'a', 'reaction')).toBeUndefined()
    expect(toggleRaceReady(room({ status: 'finished', scores: { a: 3 } }), 'a', 'reaction')).toBeUndefined()
    expect(toggleRaceReady(room(), 'a', 'aim')).toBeUndefined()
  })

  it('startRaceRound waits for everyone ready unless forced', () => {
    expect(startRaceRound(room(), params)).toBeUndefined()
    const forced = startRaceRound(room({ raceResult: { roundId: 'old' }, nightMark: 'sig' }), { ...params, force: true })
    expect(forced.status).toBe('playing')
    expect(forced.raceResult).toBeNull()
    expect(forced.nightMark).toBeNull()
    expect(forced.winner).toBeNull()
    expect(forced.round.racers).toEqual({ a: true, b: true, c: true })
    expect(forced.round.endsAt).toBe(1000 + RACE_COUNTDOWN_MS + 60_000)
    const ready = room({ round: { ready: { a: true, b: true, c: true } } })
    expect(startRaceRound(ready, params).status).toBe('playing')
  })

  it('startRaceRound refuses a live round, a decided match, or a lone player', () => {
    expect(startRaceRound(room({ status: 'playing' }), { ...params, force: true })).toBeUndefined()
    expect(startRaceRound(room({ status: 'finished', scores: { b: 3 } }), { ...params, force: true })).toBeUndefined()
    expect(startRaceRound(room({ players: { a: seat('a', 1) } }), { ...params, force: true })).toBeUndefined()
  })

  it('startRaceRound leaves offline seats out of the roster and records seen cards', () => {
    const r = room({ players: { a: seat('a', 1), b: seat('b', 2), c: seat('c', 3, false) }, seen: { typing: { 0: 1 } } })
    const next = startRaceRound(r, { ...params, force: true, extras: { passage: 'hi' }, seen: { deck: 'typing', index: 4 } })
    expect(next.round.racers).toEqual({ a: true, b: true })
    expect(next.round.passage).toBe('hi')
    expect(next.seen.typing).toEqual({ 0: 1, 4: 2 })
  })

  it('finishRaceRound ranks the live round once it can end', () => {
    const live = startRaceRound(room(), { ...params, force: true })
    live.round.stats = { r1: { a: { v: 3, done: true }, b: { v: 7, done: true } } }
    const t = 2000
    // c still racing and online → not yet
    expect(finishRaceRound(live, { gameType: 'reaction', roundId: 'r1', now: t, entryOf, isDone })).toBeUndefined()
    // forced (coordinator END ROUND) → c is a DNF
    const forced = finishRaceRound(live, { gameType: 'reaction', roundId: 'r1', now: t, entryOf, isDone, force: true })
    expect(forced.raceResult.order).toEqual(['b', 'a', 'c'])
    expect(forced.raceResult.dnf).toEqual({ c: true })
    expect(forced.scores).toEqual({ b: 1 })
    // deadline passed → ends on its own
    const late = finishRaceRound(live, { gameType: 'reaction', roundId: 'r1', now: live.round.endsAt, entryOf, isDone })
    expect(late.status).toBe('finished')
    // c offline past the grace period → ends
    const off = finishRaceRound(live, { gameType: 'reaction', roundId: 'r1', now: t, entryOf, isDone, offlineSince: (id) => (id === 'c' ? t - OFFLINE_GRACE_MS : null) })
    expect(off.status).toBe('finished')
  })

  it('finishRaceRound ignores a stale round id or a finished room', () => {
    const live = startRaceRound(room(), { ...params, force: true })
    expect(finishRaceRound(live, { gameType: 'reaction', roundId: 'other', now: 1e12, entryOf, isDone })).toBeUndefined()
    expect(finishRaceRound({ ...live, status: 'finished' }, { gameType: 'reaction', roundId: 'r1', now: 1e12, entryOf, isDone })).toBeUndefined()
  })
})

describe('helpers', () => {
  it('ordinal labels', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1ST', '2ND', '3RD', '4TH', '11TH', '12TH', '13TH', '21ST', '22ND', '101ST'])
    expect(ordinal(0)).toBe('—')
  })

  it('seededFraction is deterministic and in [0, 1)', () => {
    expect(seededFraction(42, 3, 1)).toBe(seededFraction(42, 3, 1))
    expect(seededFraction(42, 3, 1)).not.toBe(seededFraction(42, 4, 1))
    for (let i = 0; i < 200; i++) {
      const f = seededFraction(i * 7919, i, i % 5)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
  })
})
