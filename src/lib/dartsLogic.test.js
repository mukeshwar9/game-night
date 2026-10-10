import { describe, it, expect } from 'vitest'
import {
  SECTORS, RADII, UNIT, COORD_LIMIT, MAX_THROWS, TURF_ROUNDS, DART_CLOCK_MS, AIM_START_MM, AIM_LIMIT_MM, SHAKE_MM, SHAKE_TIGHT,
  segmentAt, finishSegments, segmentLabel, segmentCentre, normalizeCfg, cleanThrow, normalizeThrows, normalizeRound,
  createRound, replay, throwDart, missVisit, nervesFactor, nervesLabel, threeDartAverage, standings,
  shakeRadius, shakeOffset, aimStart, clampAim, sweepAt, gauss, toThrow, botTarget, botThrow, botRng, BOT_LEVELS,
} from './dartsLogic'

const SEATS = ['a', 'b']
const fresh = (cfg = {}, seats = SEATS) => createRound(seats, { mode: 'x01', start: 101, nerves: false, ...cfg })

// A dart at the middle of a segment, stored form.
const dart = (ring, n) => {
  const idx = n == null ? -1 : SECTORS.indexOf(n)
  const c = segmentCentre({ ring, n, idx })
  return toThrow(c.x, c.y)
}
const MISS = { s: 1 }

// Throw each spec for whoever's turn it is, requiring every one to be accepted.
function play(round, specs) {
  let r = round
  for (const spec of specs) {
    const s = replay(r)
    const shot = Array.isArray(spec) ? dart(...spec) : spec
    const res = throwDart(r, s.turnUid, shot)
    if (!res) throw new Error(`throw refused for ${s.turnUid} at ${s.count}`)
    r = res.round
  }
  return r
}

describe('segmentAt', () => {
  it('reads the rings', () => {
    expect(segmentAt(0, 0)).toMatchObject({ v: 50, ring: 'B' })
    expect(segmentAt(0, -15)).toMatchObject({ v: 25, ring: 'O' })
    expect(segmentAt(0, -101)).toMatchObject({ v: 60, ring: 'T', n: 20 })
    expect(segmentAt(0, -162)).toMatchObject({ v: 40, ring: 'D', n: 20 })
    expect(segmentAt(0, -130)).toMatchObject({ v: 20, ring: 'S', n: 20 })
    expect(segmentAt(0, -60)).toMatchObject({ v: 20, ring: 'S', n: 20 })
    expect(segmentAt(0, -215)).toMatchObject({ v: 0, ring: 'M' })
  })

  it('numbers the sectors clockwise from 20 at the top', () => {
    const at = (deg, r = 130) => segmentAt(Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r).n
    expect(at(0)).toBe(20)
    expect(at(18)).toBe(1)
    expect(at(90)).toBe(6)
    expect(at(180)).toBe(3)
    expect(at(270)).toBe(11)
    expect(at(342)).toBe(5)
    SECTORS.forEach((n, i) => expect(at(i * 18)).toBe(n))
  })

  it('has twenty distinct sectors using 1 to 20', () => {
    expect([...SECTORS].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('keeps the ring radii in order', () => {
    const r = RADII
    expect(r.bull).toBeLessThan(r.outerBull)
    expect(r.outerBull).toBeLessThan(r.trebleIn)
    expect(r.trebleOut).toBeLessThan(r.doubleIn)
    expect(r.doubleOut).toBeLessThan(r.edge)
  })
})

describe('finishSegments and labels', () => {
  const labels = (rem) => finishSegments(rem).map(segmentLabel).sort()
  it('finds every segment that takes exactly the score', () => {
    expect(labels(40)).toEqual(['D20'])
    expect(labels(60)).toEqual(['T20'])
    expect(labels(50)).toEqual(['BULL'])
    expect(labels(25)).toEqual(['25'])
    expect(labels(20)).toEqual(['20', 'D10'])
    expect(labels(6)).toEqual(['6', 'D3', 'T2'])
    expect(labels(61)).toEqual([])
    expect(labels(37)).toEqual([])
  })

  it('names a segment', () => {
    expect(segmentLabel({ ring: 'S', n: 7 })).toBe('7')
    expect(segmentLabel({ ring: 'T', n: 19 })).toBe('T19')
    expect(segmentLabel({ ring: 'D', n: 1 })).toBe('D1')
  })

  it('segmentCentre lands inside its own segment', () => {
    for (const idx of [0, 5, 13]) {
      for (const ring of ['S', 'D', 'T']) {
        const c = segmentCentre({ ring, n: SECTORS[idx], idx })
        expect(segmentAt(c.x, c.y)).toMatchObject({ ring, n: SECTORS[idx] })
      }
    }
    expect(segmentAt(...Object.values(segmentCentre({ ring: 'O' })))).toMatchObject({ ring: 'O' })
    expect(segmentAt(...Object.values(segmentCentre({ ring: 'B' })))).toMatchObject({ ring: 'B' })
  })
})

describe('normalizing what Firebase returns', () => {
  it('fills a partial config with defaults and drops junk', () => {
    expect(normalizeCfg(null)).toEqual({ mode: 'x01', start: 301, ctrl: 'aim', nerves: true, legs: 1 })
    expect(normalizeCfg({ mode: 'turf', start: 999, ctrl: 'one', nerves: false, legs: 3 })).toEqual({ mode: 'turf', start: 301, ctrl: 'one', nerves: false, legs: 1 })
    expect(normalizeCfg({ mode: 'x01', start: 501, legs: 3 })).toMatchObject({ start: 501, legs: 3 })
    expect(normalizeCfg({ mode: 'nope', legs: 7 })).toMatchObject({ mode: 'x01', legs: 1 })
  })

  it('cleans a throw to bounded integers', () => {
    expect(cleanThrow({ x: 12.6, y: -3.2 })).toEqual({ x: 13, y: -3 })
    expect(cleanThrow({ x: 99999, y: -99999 })).toEqual({ x: COORD_LIMIT, y: -COORD_LIMIT })
    expect(cleanThrow({ s: 1 })).toEqual({ s: 1 })
    expect(cleanThrow({ x: 'a', y: 2 })).toEqual({ s: 1 })
    expect(cleanThrow(null)).toEqual({ s: 1 })
  })

  it('maps a sparse throw object by key, never compacting', () => {
    const out = normalizeThrows({ 0: { x: 1, y: 2 }, 3: { x: 5, y: 6 } })
    expect(out).toEqual([{ x: 1, y: 2 }, { s: 1 }, { s: 1 }, { x: 5, y: 6 }])
    expect(normalizeThrows(undefined)).toEqual([])
    expect(normalizeThrows([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }])
  })

  it('reads a round only once it has seats', () => {
    expect(normalizeRound(null)).toBeNull()
    expect(normalizeRound({ dCfg: { mode: 'turf' } })).toBeNull()
    expect(normalizeRound({ dSeats: ['a'] })).toBeNull()
    const r = normalizeRound({ dSeats: { 0: 'a', 1: 'b' }, dCfg: { mode: 'turf' } })
    expect(r.seats).toEqual(['a', 'b'])
    expect(r.cfg.mode).toBe('turf')
    expect(r.throws).toEqual([])
  })

  it('creates a round for at most four seats', () => {
    const r = createRound(['a', 'b', 'c', 'd', 'e'], { mode: 'x01' })
    expect(r.dSeats).toEqual(['a', 'b', 'c', 'd'])
    expect(replay(r).seats).toHaveLength(4)
  })
})

describe('Countdown replay', () => {
  it('starts every seat on the start score with seat one to throw', () => {
    const s = replay(fresh())
    expect(s.scores).toEqual({ a: 101, b: 101 })
    expect(s.turnUid).toBe('a')
    expect(s.dartsLeft).toBe(3)
    expect(s.phase).toBe('main')
    expect(s.over).toBe(false)
  })

  it('takes a segment off the score and keeps the visit going for three darts', () => {
    let r = play(fresh(), [['T', 20]])
    let s = replay(r)
    expect(s.scores.a).toBe(41)
    expect(s.turnUid).toBe('a')
    expect(s.dartsLeft).toBe(2)
    r = play(r, [['S', 1], ['S', 1]])
    s = replay(r)
    expect(s.scores.a).toBe(39)
    expect(s.turnUid).toBe('b')
    expect(s.dartsLeft).toBe(3)
    expect(s.log.at(-1).visitTotal).toBe(62)
  })

  it('busts: a dart past zero restores the score from the start of the visit and ends it', () => {
    // 101: T20 → 41, T20 → bust (back to 101), and the visit is over with a dart unthrown.
    const r = play(fresh(), [['T', 20], ['T', 20]])
    const s = replay(r)
    expect(s.scores.a).toBe(101)
    expect(s.turnUid).toBe('b')
    expect(s.thrown.a).toBe(2)
    expect(s.log[1]).toMatchObject({ bust: true, left: 101, visitTotal: 0 })
  })

  it('a bust after earlier darts in the same visit restores the visit start, not the last dart', () => {
    let r = play(fresh({ start: 101 }), [['T', 20], ['S', 20]]) // 101 → 41 → 21
    r = play(r, [['T', 20]]) // 60 > 21: bust
    expect(replay(r).scores.a).toBe(101)
  })

  it('finishing needs exactly zero and ends the visit at once', () => {
    let r = play(fresh({ start: 101 }), [['T', 20], ['S', 20], ['S', 20]]) // 101 → 41 → 21 → 1
    expect(replay(r).scores.a).toBe(1)
    r = play(r, [MISS, MISS, MISS, ['S', 1]]) // b: three misses; a: S1 finishes on 0
    const s = replay(r)
    expect(s.scores.a).toBe(0)
  })

  it('refuses a dart from the wrong player, a stale count, or after the match', () => {
    const r = fresh()
    expect(throwDart(r, 'b', dart('S', 20))).toBeNull()
    expect(throwDart(r, 'a', dart('S', 20), 5)).toBeNull()
    const ok = throwDart(r, 'a', dart('S', 20), 0)
    expect(ok.state.scores.a).toBe(81)
    expect(throwDart(r, 'zzz', dart('S', 20))).toBeNull()
  })

  it('refuses a dart once the match is decided', () => {
    const won = play(fresh(), [['T', 20], ['D', 20], ['S', 1], MISS, MISS, MISS])
    expect(replay(won).over).toBe(true)
    expect(throwDart(won, 'a', dart('S', 20))).toBeNull()
    expect(throwDart(won, 'b', dart('S', 20))).toBeNull()
    expect(missVisit(won, 'a')).toBeNull()
  })

  it('refuses darts past the cap', () => {
    const base = fresh()
    const full = { ...base, dThrows: Array.from({ length: MAX_THROWS }, () => ({ s: 1 })) }
    expect(throwDart(full, replay(full).turnUid, dart('S', 20))).toBeNull()
    expect(missVisit(full, replay(full).turnUid)).toBeNull()
  })
})

describe('a fair finish', () => {
  // 101 in three darts: T20 (60) + D20 (40) + S1.
  const aOut = [['T', 20], ['D', 20], ['S', 1]]

  it('lets the seats after the finisher throw their visit before the leg is decided', () => {
    let r = play(fresh(), aOut)
    expect(replay(r).scores.a).toBe(0)
    let s = replay(r)
    expect(s.over).toBe(false)
    expect(s.turnUid).toBe('b')
    r = play(r, [MISS, MISS, MISS])
    s = replay(r)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('a')
  })

  it('the player who finished with fewer darts wins when both check out', () => {
    // Both check out in three darts: level on darts, so they shoot off.
    let r = play(fresh(), aOut)
    r = play(r, aOut)
    const s = replay(r)
    expect(s.over).toBe(false)
    expect(s.phase).toBe('shoot')
    expect(s.shoot.seats).toEqual(['a', 'b'])
  })

  it('fewer darts wins over a later finisher', () => {
    // 101 = T17 (51) + the bull (50): a two-dart checkout.
    const twoDart = [['T', 17], ['B']]
    const a3 = play(fresh(), [['T', 20], ['D', 20], ['S', 1]])
    expect(replay(a3).scores.a).toBe(0)
    // b answers with a two-dart checkout: fewer darts, so b wins the leg despite finishing after a.
    const r = play(a3, twoDart)
    const s = replay(r)
    expect(s.scores.b).toBe(0)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('b')
  })

  it('a finisher beats seats that did not finish', () => {
    const r = play(fresh(), [MISS, MISS, MISS, ['T', 20], ['D', 20], ['S', 1]])
    const s = replay(r)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('b')
  })
})

describe('shoot-off', () => {
  const tied = () => play(play(fresh(), [['T', 20], ['D', 20], ['S', 1]]), [['T', 20], ['D', 20], ['S', 1]])

  it('one dart each, nearest the bull wins', () => {
    const r = play(tied(), [toThrow(0, -30), toThrow(0, -10)])
    const s = replay(r)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('b')
  })

  it('a dart that never landed is the furthest', () => {
    const r = play(tied(), [MISS, toThrow(0, -150)])
    expect(replay(r).winner).toBe('b')
  })

  it('an exact tie throws again, among the tied seats only', () => {
    let r = play(tied(), [toThrow(0, -20), toThrow(0, -20)])
    let s = replay(r)
    expect(s.over).toBe(false)
    expect(s.shoot.attempt).toBe(2)
    expect(s.turnUid).toBe('a')
    r = play(r, [toThrow(0, -50), toThrow(0, -49)])
    s = replay(r)
    expect(s.winner).toBe('b')
  })

  it('settles by seat order after three tied sets so a leg always ends', () => {
    let r = tied()
    for (let i = 0; i < 3; i++) r = play(r, [toThrow(0, -20), toThrow(0, -20)])
    const s = replay(r)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('a')
  })

  it('three seats: only the tied seats shoot', () => {
    const seats = ['a', 'b', 'c']
    const full = [['T', 20], ['D', 20], ['S', 1]]
    // a and b check out in three, c misses all nine darts of the leg's one round.
    let r = play(fresh({}, seats), [...full, ...full, MISS, MISS, MISS])
    const s = replay(r)
    expect(s.phase).toBe('shoot')
    expect(s.shoot.seats).toEqual(['a', 'b'])
    r = play(r, [toThrow(0, -9), toThrow(0, -40)])
    expect(replay(r).winner).toBe('a')
  })
})

describe('legs', () => {
  it('best of three: the first to two legs wins and the first thrower rotates', () => {
    const win = [['T', 20], ['D', 20], ['S', 1]]
    let r = fresh({ legs: 3 })
    r = play(r, [...win, MISS, MISS, MISS]) // leg 1: a checks out, b throws its visit
    let s = replay(r)
    expect(s.over).toBe(false)
    expect(s.leg).toBe(1)
    expect(s.legWins).toEqual({ a: 1, b: 0 })
    expect(s.scores).toEqual({ a: 101, b: 101 })
    expect(s.firstUid).toBe('b')
    expect(s.turnUid).toBe('b')
    r = play(r, [...win, MISS, MISS, MISS]) // leg 2: b throws first and checks out; a throws its visit
    s = replay(r)
    expect(s.legWins).toEqual({ a: 1, b: 1 })
    expect(s.leg).toBe(2)
    expect(s.firstUid).toBe('a')
    r = play(r, [...win, MISS, MISS, MISS])
    s = replay(r)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('a')
    expect(s.legs.map((l) => l.winner)).toEqual(['a', 'b', 'a'])
  })

  it('flags the dart that ended a leg and the one that ended the match', () => {
    const win = [['T', 20], ['D', 20], ['S', 1]]
    const s = replay(play(fresh({ legs: 3 }), [...win, MISS, MISS, MISS]))
    const ended = s.log.filter((e) => e.legEnd)
    expect(ended).toHaveLength(1)
    expect(ended[0]).toMatchObject({ legEnd: 'a', matchEnd: false })
    const one = replay(play(fresh({ legs: 1 }), [...win, MISS, MISS, MISS]))
    expect(one.log.at(-1)).toMatchObject({ legEnd: 'a', matchEnd: true })
  })
})

describe('Turf', () => {
  const turf = (cfg = {}, seats = SEATS) => fresh({ mode: 'turf', ...cfg }, seats)
  const idxOf = (n) => SECTORS.indexOf(n)

  it('a single claims a wedge for the thrower', () => {
    const s = replay(play(turf(), [['S', 20]]))
    expect(s.turf[idxOf(20)]).toEqual({ owner: 'a', lock: false })
    expect(s.points.a).toBe(1)
    expect(s.points.b).toBe(0)
  })

  it('a rival can steal an unlocked wedge', () => {
    const r = play(turf(), [['S', 20], MISS, MISS, ['S', 20]])
    const s = replay(r)
    expect(s.turf[idxOf(20)].owner).toBe('b')
  })

  it('a double claims and locks; a rival cannot take it', () => {
    let r = play(turf(), [['D', 20], MISS, MISS, ['S', 20]])
    let s = replay(r)
    expect(s.turf[idxOf(20)]).toEqual({ owner: 'a', lock: true })
    const log = s.log.at(-1)
    expect(log.blocked).toBe(true)
    r = play(r, [['T', 20]]) // b's treble on a locked 20 still takes the neighbours (1 and 5), but not the 20
    s = replay(r)
    expect(s.turf[idxOf(20)].owner).toBe('a')
    expect(s.turf[idxOf(1)].owner).toBe('b')
    expect(s.turf[idxOf(5)].owner).toBe('b')
    expect(s.log.at(-1).claimed).toBe(2)
  })

  it('a treble takes the wedge and both neighbours', () => {
    const s = replay(play(turf(), [['T', 20]]))
    expect([20, 1, 5].map((n) => s.turf[idxOf(n)]?.owner)).toEqual(['a', 'a', 'a'])
    expect(s.points.a).toBe(3)
  })

  it('the bull is two bonus points and the outer bull one, and neither claims a wedge', () => {
    const s = replay(play(turf(), [['B'], ['O']]))
    expect(s.points.a).toBe(3)
    expect(s.turf.every((t) => t === null)).toBe(true)
  })

  it('a rival steal on a wedge that is yours and locked is refused; your own re-hit keeps the lock', () => {
    const r = play(turf(), [['D', 20], ['S', 20], MISS])
    expect(replay(r).turf[idxOf(20)]).toEqual({ owner: 'a', lock: true })
  })

  it('runs five rounds then crowns the most points', () => {
    let r = turf()
    // a claims one wedge per round with a single; b always misses.
    for (let round = 0; round < TURF_ROUNDS; round++) {
      r = play(r, [['S', SECTORS[round]], MISS, MISS, MISS, MISS, MISS])
    }
    const s = replay(r)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('a')
    expect(s.points.a).toBe(5)
  })

  it('a tie on points after five rounds goes to a shoot-off', () => {
    let r = turf()
    for (let round = 0; round < TURF_ROUNDS; round++) {
      r = play(r, [MISS, MISS, MISS, MISS, MISS, MISS])
    }
    const s = replay(r)
    expect(s.over).toBe(false)
    expect(s.phase).toBe('shoot')
    expect(s.shoot.seats).toEqual(['a', 'b'])
    expect(replay(play(r, [toThrow(0, -8), toThrow(0, -30)])).winner).toBe('a')
  })

  it('has no legs', () => {
    expect(normalizeCfg({ mode: 'turf', legs: 3 }).legs).toBe(1)
  })
})

describe('missVisit', () => {
  it('misses every dart left in the visit and passes the turn', () => {
    const r = play(fresh(), [['S', 20]])
    const out = missVisit(r, 'a')
    expect(out.state.turnUid).toBe('b')
    expect(out.state.thrown.a).toBe(3)
    expect(out.state.scores.a).toBe(81)
    expect(out.round.dThrows.slice(-2)).toEqual([{ s: 1 }, { s: 1 }])
  })

  it('refuses when it is not that player or the count is stale', () => {
    const r = fresh()
    expect(missVisit(r, 'b')).toBeNull()
    expect(missVisit(r, 'a', 4)).toBeNull()
    expect(missVisit(r, 'a', 0)).not.toBeNull()
  })

  it('misses a single shoot-off dart', () => {
    const win = [['T', 20], ['D', 20], ['S', 1]]
    const r = play(play(fresh(), win), win)
    const out = missVisit(r, 'a')
    expect(out.round.dThrows).toHaveLength(r.dThrows.length + 1)
    expect(out.state.turnUid).toBe('b')
  })

  it('the clock is a number of milliseconds a page can use', () => {
    expect(DART_CLOCK_MS).toBeGreaterThan(5000)
  })
})

describe('Nerves', () => {
  it('is 1 when everyone is level or it is off', () => {
    expect(nervesFactor(replay(fresh({ nerves: true })), 'a')).toBe(1)
    const off = replay(play(fresh({ nerves: false }), [['T', 20]]))
    expect(nervesFactor(off, 'a')).toBe(1)
  })

  it('shakes the leader up to 25% more and the trailer 15% less', () => {
    const t = replay(play(fresh({ nerves: true }), [['T', 20], ['S', 1], MISS]))
    expect(t.scores.a).toBe(40)
    expect(nervesFactor(t, 'a')).toBeCloseTo(1.25, 5)
    expect(nervesFactor(t, 'b')).toBeCloseTo(0.85, 5)
    expect(nervesLabel(1.25)).toBe('SHAKY')
    expect(nervesLabel(0.85)).toBe('CALM')
    expect(nervesLabel(1)).toBe('EVEN')
  })

  it('the middle seat of three sits between', () => {
    const seats = ['a', 'b', 'c']
    const r = play(fresh({ nerves: true }, seats), [['T', 20], ['S', 1], MISS, ['S', 20], ['S', 20], MISS, MISS, MISS, MISS])
    const s = replay(r)
    const f = seats.map((u) => nervesFactor(s, u))
    expect(f[0]).toBeGreaterThan(f[1])
    expect(f[1]).toBeGreaterThan(f[2])
  })
})

describe('stats and standings', () => {
  it('the three-dart average is points taken per dart times three', () => {
    const s = replay(play(fresh({ start: 301 }), [['T', 20], ['T', 20], ['T', 20]]))
    expect(threeDartAverage(s, 'a')).toBe(180)
    expect(threeDartAverage(s, 'b')).toBe(0)
  })

  it('orders seats by who is ahead', () => {
    // a leaves 41, b leaves 21: b is ahead.
    const s = replay(play(fresh(), [['S', 20], ['S', 20], ['S', 20], ['T', 20], ['S', 20], MISS]))
    expect(s.scores).toEqual({ a: 41, b: 21 })
    expect(standings(s)).toEqual(['b', 'a'])
  })
})

describe('the throw', () => {
  it('breathes between a wide and a tight shake', () => {
    expect(shakeRadius(0)).toBeCloseTo(SHAKE_MM, 5)
    const tight = shakeRadius(0.75)
    expect(tight).toBeCloseTo(SHAKE_MM * SHAKE_TIGHT, 5)
    expect(shakeRadius(0.75, 1, true)).toBeCloseTo(tight * 0.3, 5)
    expect(shakeRadius(0.75, 1.25)).toBeCloseTo(tight * 1.25, 5)
  })

  it('tires a hand held too long', () => {
    expect(shakeRadius(7.5)).toBeGreaterThan(shakeRadius(1.5) * 1.5)
  })

  it('keeps the shake offset inside its radius', () => {
    for (const t of [0, 0.4, 1.1, 3.3]) {
      const o = shakeOffset(t, 20)
      expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(20 * 0.86 * Math.SQRT2 + 1e-9)
    }
  })

  it('starts the aim away from the touch, inside the board', () => {
    const rng = botRng(7)
    for (let i = 0; i < 200; i++) {
      const touch = { x: 20, y: -10 }
      const p = aimStart(touch, rng)
      const d = Math.hypot(p.x - touch.x, p.y - touch.y)
      expect(d).toBeGreaterThanOrEqual(AIM_START_MM * 0.45 - 1e-9)
      expect(d).toBeLessThanOrEqual(AIM_START_MM + 1e-9)
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(AIM_LIMIT_MM + 1e-9)
    }
  })

  it('clamps an aim outside the board back onto its edge', () => {
    const p = clampAim({ x: 400, y: 0 })
    expect(p).toEqual({ x: AIM_LIMIT_MM, y: 0 })
    expect(clampAim({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
  })

  it('sweeps the board and swings faster for a shakier hand', () => {
    expect(Math.abs(sweepAt(0.3, 'x'))).toBeLessThanOrEqual(176)
    expect(sweepAt(0, 'x')).toBeCloseTo(0, 5)
    expect(sweepAt(0, 'y')).not.toBeCloseTo(0, 1)
    expect(Math.abs(sweepAt(0.2, 'x', 1.25))).toBeGreaterThan(Math.abs(sweepAt(0.2, 'x', 1)))
  })

  it('gauss is centred', () => {
    const rng = botRng(3)
    let sum = 0
    for (let i = 0; i < 4000; i++) sum += gauss(rng)
    expect(Math.abs(sum / 4000)).toBeLessThan(0.08)
  })

  it('stores millimetres as integer tenths', () => {
    expect(toThrow(1.26, -3.04)).toEqual({ x: 13, y: -30 })
    expect(UNIT).toBe(10)
  })
})

describe('bot', () => {
  it('finishes when it can and takes the big treble otherwise', () => {
    const lo = replay(fresh({ start: 101 }))
    const hi = { ...lo, scores: { a: 40, b: 101 } }
    expect(botTarget(hi, 'a', 'normal', botRng(1))).toEqual(segmentCentre({ ring: 'D', n: 20, idx: 0 }))
    const t20 = botTarget(lo, 'a', 'normal', botRng(1))
    expect(segmentAt(t20.x, t20.y)).toMatchObject({ ring: 'T', n: 20 })
    const mid = botTarget({ ...lo, scores: { a: 41, b: 101 } }, 'a', 'normal', botRng(1))
    const seg = segmentAt(mid.x, mid.y)
    expect(seg.ring).toBe('S')
    expect(41 - seg.v).toBe(40) // leaves double top
  })

  it('never aims past zero', () => {
    for (let rem = 2; rem <= 60; rem++) {
      const s = { ...replay(fresh({ start: 101 })), scores: { a: rem, b: 101 } }
      const t = botTarget(s, 'a', 'normal', botRng(rem))
      expect(segmentAt(t.x, t.y).v, `rem ${rem}`).toBeLessThanOrEqual(rem)
    }
  })

  it('aims for the nearest the bull in a shoot-off', () => {
    const win = [['T', 20], ['D', 20], ['S', 1]]
    const s = replay(play(play(fresh(), win), win))
    expect(botTarget(s, 'a')).toEqual({ x: 0, y: 0 })
  })

  it('in Turf, goes for a wedge it does not hold and doubles up on its own at HARD', () => {
    const s0 = replay(fresh({ mode: 'turf' }))
    const t = botTarget(s0, 'a', 'normal', botRng(4))
    expect(segmentAt(t.x, t.y).ring).toBe('S')
    const mineLocked = { ...s0, turf: s0.turf.map((_, i) => ({ owner: 'a', lock: i !== 3 })) }
    const only = botTarget(mineLocked, 'a', 'hard', botRng(1))
    expect(segmentAt(only.x, only.y)).toMatchObject({ n: SECTORS[3], ring: 'D' })
    const none = { ...s0, turf: s0.turf.map(() => ({ owner: 'a', lock: true })) }
    expect(botTarget(none, 'a', 'normal', botRng(1))).toEqual({ x: 0, y: 0 })
  })

  it('a harder bot lands closer to its target on average', () => {
    const s = replay(fresh())
    const target = botTarget(s, 'a', 'normal', botRng(1))
    const miss = (level) => {
      const rng = botRng(11)
      let total = 0
      for (let i = 0; i < 400; i++) {
        const t = botThrow(s, 'a', level, rng)
        total += Math.hypot(t.x / UNIT - target.x, t.y / UNIT - target.y)
      }
      return total / 400
    }
    const [easy, normal, hard] = BOT_LEVELS.map(miss)
    expect(hard).toBeLessThan(normal)
    expect(normal).toBeLessThan(easy)
  })

  it('plays a whole leg on its own against itself', () => {
    let r = fresh({ start: 101 })
    const rng = botRng(2024)
    for (let i = 0; i < 400; i++) {
      const s = replay(r)
      if (s.over) break
      r = throwDart(r, s.turnUid, botThrow(s, s.turnUid, 'normal', rng)).round
    }
    const s = replay(r)
    expect(s.over).toBe(true)
    expect(SEATS).toContain(s.winner)
  })
})
