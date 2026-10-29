import { describe, it, expect } from 'vitest'
import {
  RACE_COUNTDOWN_MS, OFFLINE_GRACE_MS, RACE_MATCH_WINS,
  isSeatOnline, seatedIds, flaggedIds, normalizeRaceRound, newRoundId, buildRaceRound,
  racePhase, raceGoAt, rankRace, placementPoints, raceWinners, buildRaceResult,
  applyRaceFinish, matchChampions, canEndRace, allReady, rosterForStart, ordinal,
  normalizeRaceResult, seededFraction, newRaceSeed, isMatchOver,
  startRaceRound, toggleRaceReady, finishRaceRound, tiedIds, raceChampions, cupRacesFor, CUP_RACES_BY_GAME, isBotRacer,
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

  it('finishRaceRound hands the racer id and the round to entryOf, and the time to decidedBy', () => {
    const live = startRaceRound(room(), { ...params, force: true })
    live.round.stats = { r1: { a: { v: 3 }, b: { v: 7 } } }
    const seenEntry = []
    const seenDecided = []
    const res = finishRaceRound(live, {
      gameType: 'reaction', roundId: 'r1', now: 2000,
      entryOf: (stats, round, id) => { seenEntry.push([id, round.id, stats?.v ?? null]); return { sortKey: [-(stats?.v ?? 0)], score: stats?.v ?? null } },
      isDone,
      decidedBy: (stats, racers, ctx) => { seenDecided.push([racers.length, ctx.now, ctx.round.id]); return true },
    })
    expect(res.status).toBe('finished')
    expect(seenDecided).toEqual([[3, 2000, 'r1']])
    expect(seenEntry).toEqual([['a', 'r1', 3], ['b', 'r1', 7], ['c', 'r1', null]])
  })

  it('finishRaceRound ignores a stale round id or a finished room', () => {
    const live = startRaceRound(room(), { ...params, force: true })
    expect(finishRaceRound(live, { gameType: 'reaction', roundId: 'other', now: 1e12, entryOf, isDone })).toBeUndefined()
    expect(finishRaceRound({ ...live, status: 'finished' }, { gameType: 'reaction', roundId: 'r1', now: 1e12, entryOf, isDone })).toBeUndefined()
  })
})

describe('cup races (SIDE KICK)', () => {
  const cupRoom = (o = {}) => room({ gameType: 'sidekick', ...o })
  const params = { gameType: 'sidekick', starterId: 'a', now: 1000, id: 'r1', seed: 9, durationMs: 60_000, force: true }
  // Points per racer come from the game's decorate hook, from the whole round.
  const decorate = (r) => ({ points: { a: 3, b: 2, c: 1 }, grid: ['a', 'b', 'c', 'bot1'], seen: Object.keys(r.stats).length })

  it('knows which games run a cup', () => {
    expect(CUP_RACES_BY_GAME).toEqual({ sidekick: 3, dustkick: 3 })
    expect(cupRacesFor('dustkick')).toBe(3)
    expect(cupRacesFor('sidekick')).toBe(3)
    expect(cupRacesFor('chopchop')).toBe(0)
  })

  it('is over only after the last cup race, and the champions are the top scorers (ties share)', () => {
    expect(raceChampions(cupRoom({ cupRaces: 2, scores: { a: 8, b: 3 } }))).toEqual([])
    expect(isMatchOver(cupRoom({ cupRaces: 2, scores: { a: 8, b: 3 } }))).toBe(false)
    expect(raceChampions(cupRoom({ cupRaces: 3, scores: { a: 5, b: 7, c: 7 } }))).toEqual(['b', 'c'])
    expect(isMatchOver(cupRoom({ cupRaces: 3, scores: { a: 5, b: 7 } }))).toBe(true)
    expect(raceChampions(cupRoom({ cupRaces: 3, scores: {} }))).toEqual([])
  })

  it('a first-to-N game ignores the cup counter', () => {
    expect(raceChampions(room({ cupRaces: 3, scores: { a: 1 } }))).toEqual([])
    expect(raceChampions(room({ scores: { a: RACE_MATCH_WINS } }))).toEqual(['a'])
  })

  it('startRaceRound caps the roster at maxRacers', () => {
    const r = cupRoom({ players: { a: seat('a', 1), b: seat('b', 2), c: seat('c', 3), d: seat('d', 4), e: seat('e', 5) } })
    expect(Object.keys(startRaceRound(r, { ...params, maxRacers: 4 }).round.racers)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('finishing a cup race adds the decorated points, counts the race and keeps extra result fields', () => {
    const live = startRaceRound(cupRoom({ scores: { a: 1 } }), params)
    live.round.stats = { r1: { a: { v: 9, done: true }, b: { v: 5, done: true }, c: { v: 1, done: true } } }
    const fin = finishRaceRound(live, { gameType: 'sidekick', roundId: 'r1', now: 2000, entryOf, isDone, decorate })
    expect(fin.scores).toEqual({ a: 4, b: 2, c: 1 })
    expect(fin.cupRaces).toBe(1)
    expect(fin.raceResult.points).toEqual({ a: 3, b: 2, c: 1 })
    expect(fin.raceResult.grid).toEqual(['a', 'b', 'c', 'bot1'])
    expect(fin.winner).toBe('a')
    expect(fin.status).toBe('finished')
    expect(isMatchOver(fin)).toBe(false)
  })

  it('a cup race with the decided hook receives the clock and the round', () => {
    const live = startRaceRound(cupRoom(), params)
    live.round.stats = { r1: { a: { v: 9, done: true } } }
    let seen = null
    const decidedBy = (stats, racers, { now, round }) => { seen = { now, racers, id: round.id }; return true }
    const fin = finishRaceRound(live, { gameType: 'sidekick', roundId: 'r1', now: 2500, entryOf, isDone, decidedBy })
    expect(fin.status).toBe('finished')
    expect(seen).toEqual({ now: 2500, racers: ['a', 'b', 'c'], id: 'r1' })
  })

  it('the third race ends the match and refuses another start', () => {
    const over = cupRoom({ status: 'finished', cupRaces: 3, scores: { a: 6, b: 4, c: 2 } })
    expect(startRaceRound(over, params)).toBeUndefined()
    expect(toggleRaceReady(over, 'a', 'sidekick')).toBeUndefined()
    const between = cupRoom({ status: 'finished', cupRaces: 1, scores: { a: 3, b: 2, c: 1 } })
    expect(startRaceRound(between, params).status).toBe('playing')
  })
})

describe('a cup whose length the host picks (ARROWS PARTY)', () => {
  const party = (o = {}) => room({ gameType: 'arrowsparty', ...o })
  const withRounds = (rounds, o = {}) => party({ arrowsPartyConfig: { version: 1, tier: 'medium', rounds, sabotage: false }, ...o })

  it('reads the length from the room config: 3, 5 or 7, else 3', () => {
    expect(cupRacesFor('arrowsparty', withRounds(5))).toBe(5)
    expect(cupRacesFor('arrowsparty', withRounds(7))).toBe(7)
    expect(cupRacesFor('arrowsparty', withRounds(3))).toBe(3)
    expect(cupRacesFor('arrowsparty', withRounds(4))).toBe(3)
    expect(cupRacesFor('arrowsparty', party())).toBe(3)
    expect(cupRacesFor('arrowsparty')).toBe(3)
    // Other games ignore a stray config.
    expect(cupRacesFor('sidekick', withRounds(7))).toBe(3)
    expect(cupRacesFor('typing', withRounds(7))).toBe(0)
  })

  it('a 5-round cup is not over after 3 races, and is after 5', () => {
    const scores = { a: 7, b: 5, c: 3 }
    expect(raceChampions(withRounds(5, { cupRaces: 3, scores }))).toEqual([])
    expect(isMatchOver(withRounds(5, { cupRaces: 4, scores }))).toBe(false)
    expect(raceChampions(withRounds(5, { cupRaces: 5, scores }))).toEqual(['a'])
    expect(raceChampions(withRounds(3, { cupRaces: 3, scores }))).toEqual(['a'])
  })

  it('finishing a round adds the finish-order points and counts the race', () => {
    const params = { gameType: 'arrowsparty', starterId: 'a', now: 1000, id: 'r1', seed: 9, durationMs: 60_000, force: true }
    const live = startRaceRound(withRounds(5, { scores: { a: 2 } }), params)
    const stats = { a: { fin: 3000 }, b: { fin: 2000 }, c: { fin: 4000 } }
    const next = finishRaceRound({ ...live, round: { ...live.round, stats: { r1: stats } } }, {
      gameType: 'arrowsparty', roundId: 'r1', now: 5000, force: true,
      entryOf: (s) => ({ sortKey: s?.fin ? [s.fin] : null, score: s?.fin ?? null }),
    })
    expect(next.cupRaces).toBe(1)
    // 3 racers: 2 / 1 / 0 by finish order.
    expect(next.scores).toEqual({ a: 3, b: 2, c: 0 })
    expect(isMatchOver(next)).toBe(false)
  })
})

describe('AI racers fill seats', () => {
  const solo = (o = {}) => room({ gameType: 'arrowsparty', players: { a: seat('a', 1) }, ...o })
  const params = { gameType: 'arrowsparty', starterId: 'a', now: 1000, id: 'r1', seed: 9, durationMs: 60_000, force: true }

  it('knows bot ids', () => {
    expect(['bot1', 'bot2', 'bot3'].every(isBotRacer)).toBe(true)
    expect(['bot0', 'bot4', 'bob', 'a'].some(isBotRacer)).toBe(false)
  })

  it('one human is enough to be ready when bots make up the field', () => {
    expect(allReady({ a: seat('a', 1) }, ['a'])).toBe(false)
    expect(allReady({ a: seat('a', 1) }, ['a'], 1)).toBe(true)
    expect(allReady({ a: seat('a', 1) }, [], 1)).toBe(false)
    expect(allReady({}, [], 2)).toBe(false)
  })

  it('a solo player starts a round against bots; the bots are racers of the round', () => {
    const live = startRaceRound(solo(), { ...params, bots: ['bot1', 'bot2'] })
    expect(live.status).toBe('playing')
    expect(Object.keys(live.round.racers).sort()).toEqual(['a', 'bot1', 'bot2'])
    expect(normalizeRaceRound(live.round).racers).toEqual(['a', 'bot1', 'bot2'])
  })

  it('refuses a lone human with no bots, and a start with bots but no human', () => {
    expect(startRaceRound(solo(), params)).toBeUndefined()
    expect(startRaceRound(solo({ players: {} }), { ...params, starterId: null, bots: ['bot1', 'bot2'] })).toBeUndefined()
  })

  it('ready flow without force needs the bots to count', () => {
    const lobby = solo({ round: { ready: { a: true } } })
    expect(startRaceRound(lobby, { ...params, force: false })).toBeUndefined()
    expect(startRaceRound(lobby, { ...params, force: false, bots: ['bot1'] }).status).toBe('playing')
  })

  it('never seats more racers than maxRacers, humans first; ignores ids that are not bots', () => {
    const four = solo({ players: { a: seat('a', 1), b: seat('b', 2), c: seat('c', 3) } })
    const live = startRaceRound(four, { ...params, maxRacers: 4, bots: ['bot1', 'bot2', 'bot3', 'mallory'] })
    expect(Object.keys(live.round.racers).sort()).toEqual(['a', 'b', 'bot1', 'c'])
  })

  it('a finished round ranks bots with the humans and scores the cup on every seat', () => {
    const live = startRaceRound(solo({ arrowsPartyConfig: { rounds: 3 } }), { ...params, bots: ['bot1', 'bot2'] })
    const stats = { a: { done: true, v: 5 }, bot1: { done: true, v: 9 }, bot2: { done: true, v: 1 } }
    const next = finishRaceRound({ ...live, round: { ...live.round, stats: { r1: stats } } }, { gameType: 'arrowsparty', roundId: 'r1', now: 5000, entryOf, isDone })
    expect(next.raceResult.order).toEqual(['bot1', 'a', 'bot2'])
    expect(next.scores).toEqual({ bot1: 2, a: 1, bot2: 0 })
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
