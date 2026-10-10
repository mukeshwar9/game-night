import { describe, expect, it } from 'vitest'
import { mulberry32 } from './detMath'
import {
  BOT_LEVELS, DEFAULT_TWISTS, MAX_PLAYERS, MIN_PLAYERS, SEAT_ANGLES, TARGETS, TUNING,
  aimedPiece, applyOutcome, claimKey, createRound, derive, dynamics, freshLock, gateHot, normalizeRound,
  planBot, planTap, plateDir, plateLayout, plateSpeed, press, seatAnglesFor, settle, standings, takeBuffered,
  targetFor, viewAt, winnerOf, withClaim, withMiss, wrap,
} from './lazySusanLogic'

const SEATS = ['ann', 'bob', 'cy', 'di']
const START = 1_000_000
const PLAY = START + TUNING.countdown * 1000
const roundOf = (n = 2, seed = 7, twists) => createRound(SEATS.slice(0, n), seed, START, twists)

/** Claims every piece of plate `n` that passes `want`, one every 100 ms from `t0`, by seats in turn. */
function claimPlate(raw, n, t0, want = (p) => p.kind !== 'chili', by = ['ann', 'bob']) {
  const twists = normalizeRound(raw).twists
  const seed = normalizeRound(raw).seed
  let r = raw
  let t = t0
  plateLayout(seed, n, twists).filter(want).forEach((p, k) => {
    r = withClaim(r, claimKey(n, p.i), by[k % by.length], t)
    t += 100
  })
  return r
}

/** A moment at which `seat`'s gate holds a grabbable piece of `kind` (or any), scanning forward. */
function momentAt(raw, seat, kind, from = PLAY, to = PLAY + 60_000) {
  const d = derive(raw)
  const ang = seatAnglesFor(d.round.seats.length)[seat]
  for (let t = from; t < to; t += 5) {
    const p = aimedPiece(viewAt(d, t), ang)
    if (p && (!kind || p.kind === kind)) return t
  }
  throw new Error('no such moment')
}

describe('constants', () => {
  it('targets shrink as the table fills and seats match the player count', () => {
    expect(TARGETS).toEqual({ 2: 15, 3: 12, 4: 10 })
    expect(targetFor(2)).toBe(15)
    expect(targetFor(4)).toBe(10)
    expect(targetFor(9)).toBe(10)
    for (const n of [2, 3, 4]) expect(SEAT_ANGLES[n]).toHaveLength(n)
    expect(MIN_PLAYERS).toBe(2)
    expect(MAX_PLAYERS).toBe(4)
  })

  it('gates sit at least a window and a half apart so two never share a piece', () => {
    for (const n of [2, 3, 4]) {
      const a = seatAnglesFor(n)
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        expect(Math.abs(wrap(a[i] - a[j]))).toBeGreaterThan(TUNING.window * 3)
      }
    }
  })

  it('wrap puts any angle in (-π, π]', () => {
    for (const a of [-20, -3.5, 0, 3.2, 9.9, 100]) {
      const w = wrap(a)
      expect(w).toBeGreaterThanOrEqual(-Math.PI)
      expect(w).toBeLessThanOrEqual(Math.PI)
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9)
    }
  })
})

describe('createRound and normalizeRound', () => {
  it('seats at most four and sets the target by head count', () => {
    const r = createRound(['a', 'b', 'c', 'd', 'e'], 5, START)
    expect(r.lsSeats).toEqual(['a', 'b', 'c', 'd'])
    expect(r.lsTarget).toBe(10)
    expect(r.lsTwists).toEqual(DEFAULT_TWISTS)
  })

  it('reads a Firebase-shaped round: object-keyed seats, missing claims', () => {
    const raw = { lsSeats: { 0: 'ann', 1: 'bob' }, lsSeed: 3, lsStart: START, lsTarget: 15 }
    const r = normalizeRound(raw)
    expect(r.seats).toEqual(['ann', 'bob'])
    expect(r.claims).toEqual({})
    expect(r.misses).toEqual({})
    expect(r.twists).toEqual(DEFAULT_TWISTS)
  })

  it('rejects a round with fewer than two seats, and drops claims from strangers', () => {
    expect(normalizeRound(null)).toBeNull()
    expect(normalizeRound({ lsSeats: ['solo'] })).toBeNull()
    const raw = { ...roundOf(), lsClaims: { p1_0: { by: 'mallory', at: 1 }, p1_1: { by: 'ann', at: 2 } } }
    expect(Object.keys(normalizeRound(raw).claims)).toEqual(['p1_1'])
  })

  it('keeps explicit twist switches', () => {
    const r = normalizeRound(roundOf(2, 1, { turn: false, chili: false, last: true }))
    expect(r.twists).toEqual({ turn: false, chili: false, last: true })
  })
})

describe('plates', () => {
  it('speed rises per plate to a cap, and THE TURN alternates direction', () => {
    expect(plateSpeed(1)).toBeCloseTo(TUNING.speed0)
    expect(plateSpeed(2)).toBeCloseTo(TUNING.speed0 + TUNING.speedStep)
    expect(plateSpeed(500)).toBe(TUNING.speedMax)
    expect([1, 2, 3, 4].map((n) => plateDir(n, { turn: true }))).toEqual([1, -1, 1, -1])
    expect([1, 2, 3, 4].map((n) => plateDir(n, { turn: false }))).toEqual([1, 1, 1, 1])
  })

  it('layout is a pure function of (seed, plate, twists)', () => {
    const t = DEFAULT_TWISTS
    expect(plateLayout(11, 3, t)).toEqual(plateLayout(11, 3, t))
    expect(plateLayout(11, 3, t)).not.toEqual(plateLayout(12, 3, t))
    expect(plateLayout(11, 3, t)).not.toEqual(plateLayout(11, 4, t))
  })

  it('carries a bun, dumplings and chilies; chilies double from plate 4; the chili twist can be off', () => {
    const count = (n, tw, kind) => plateLayout(1, n, tw).filter((p) => p.kind === kind).length
    expect(count(1, DEFAULT_TWISTS, 'bun')).toBe(1)
    expect(count(1, DEFAULT_TWISTS, 'dump')).toBe(3)
    expect(count(2, DEFAULT_TWISTS, 'dump')).toBe(4)
    expect(count(1, DEFAULT_TWISTS, 'chili')).toBe(1)
    expect(count(3, DEFAULT_TWISTS, 'chili')).toBe(1)
    expect(count(4, DEFAULT_TWISTS, 'chili')).toBe(2)
    expect(count(4, { ...DEFAULT_TWISTS, chili: false }, 'chili')).toBe(0)
  })

  it('never puts two pieces on top of each other', () => {
    for (let seed = 0; seed < 40; seed++) {
      const ps = plateLayout(seed, 4, DEFAULT_TWISTS)
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        expect(Math.abs(wrap(ps[i].a - ps[j].a))).toBeGreaterThan(0.55)
      }
    }
  })

  it('dynamics: the closed form matches stepping the same law', () => {
    const plate = { th0: 0.4, cur0: -1.1, target: 1.6 }
    const rushS = 1.2
    let th = plate.th0
    let cur = plate.cur0
    const dt = 1e-4
    for (let t = 0; t < 2.5; t += dt) {
      const target = t < rushS ? plate.target : plate.target * TUNING.rush
      th += cur * dt
      cur += (target - cur) * TUNING.ease * dt
    }
    const got = dynamics(plate, 2.5, rushS)
    expect(got.th).toBeCloseTo(th, 2)
    expect(got.cur).toBeCloseTo(cur, 2)
  })

  it('dynamics is continuous across the LAST BITE boundary', () => {
    const plate = { th0: 0, cur0: 0.3, target: -1.8 }
    const a = dynamics(plate, 1.0 - 1e-6, 1.0)
    const b = dynamics(plate, 1.0 + 1e-6, 1.0)
    expect(b.th).toBeCloseTo(a.th, 4)
    expect(b.cur).toBeCloseTo(a.cur, 4)
  })
})

describe('derive', () => {
  it('a fresh round is one plate, nobody scored', () => {
    const d = derive(roundOf())
    expect(d.plates).toHaveLength(1)
    expect(d.scores).toEqual({ ann: 0, bob: 0 })
    expect(d.winner).toBeNull()
    expect(d.plates[0].playAt).toBe(PLAY)
  })

  it('is memoised on the round object', () => {
    const r = roundOf()
    expect(derive(r)).toBe(derive(r))
  })

  it('the first claim of a piece wins; a second is refused', () => {
    const r = roundOf()
    const a = withClaim(r, claimKey(1, 1), 'ann', PLAY + 500)
    expect(a).not.toBeNull()
    expect(withClaim(a, claimKey(1, 1), 'bob', PLAY + 600)).toBeNull()
    expect(withClaim(r, claimKey(1, 1), 'mallory', PLAY + 1)).toBeNull()
  })

  it('scores a dumpling 1 and the bun 3', () => {
    let r = roundOf(2, 7, { ...DEFAULT_TWISTS, last: false })
    const layout = plateLayout(7, 1, normalizeRound(r).twists)
    const bun = layout.find((p) => p.kind === 'bun')
    const dump = layout.find((p) => p.kind === 'dump')
    r = withClaim(r, claimKey(1, bun.i), 'ann', PLAY + 100)
    r = withClaim(r, claimKey(1, dump.i), 'bob', PLAY + 200)
    expect(derive(r).scores).toEqual({ ann: 3, bob: 1 })
  })

  it('clearing the edibles starts the next plate after the refill, turning the other way', () => {
    const r = claimPlate(roundOf(), 1, PLAY + 1000)
    const d = derive(r)
    expect(d.plates).toHaveLength(2)
    const [p1, p2] = d.plates
    expect(p1.clearAt).toBe(PLAY + 1000 + 300)
    expect(p2.at).toBe(p1.clearAt + TUNING.refill * 1000)
    expect(Math.sign(p2.target)).toBe(-Math.sign(p1.target))
    // the plate keeps its momentum across the swap
    const end = dynamics(p1, (p2.at - p1.at) / 1000, p1.rushAt != null ? (p1.rushAt - p1.at) / 1000 : null)
    expect(p2.th0).toBeCloseTo(end.th, 9)
    expect(p2.cur0).toBeCloseTo(end.cur, 9)
  })

  it('without THE TURN every plate turns the same way', () => {
    const r = claimPlate(roundOf(2, 7, { turn: false, chili: true, last: true }), 1, PLAY + 1000)
    const [p1, p2] = derive(r).plates
    expect(Math.sign(p2.target)).toBe(Math.sign(p1.target))
  })

  it('LAST BITE: the last edible is gold and worth double, and the plate rushes from the claim before it', () => {
    const r = claimPlate(roundOf(), 1, PLAY + 1000, (p) => p.kind === 'dump' || p.kind === 'bun', ['ann'])
    const d = derive(r)
    const p = d.plates[0]
    const eaten = [...p.claims.values()].sort((a, b) => a.at - b.at)
    expect(p.edibles).toBe(4)
    expect(p.rushAt).toBe(eaten[2].at)
    const last = d.log[d.log.length - 1]
    expect(last.gold).toBe(true)
    expect(last.delta).toBe((last.piece === 'bun' ? 3 : 1) * 2)
    expect(d.log.filter((e) => e.gold)).toHaveLength(1)
  })

  it('with LAST BITE off nothing is gold and nothing rushes', () => {
    const r = claimPlate(roundOf(2, 7, { turn: true, chili: true, last: false }), 1, PLAY + 1000)
    const d = derive(r)
    expect(d.plates[0].rushAt).toBeNull()
    expect(d.log.some((e) => e.gold)).toBe(false)
  })

  it('a chili costs 2 and a miss costs 1, never below zero', () => {
    let r = roundOf()
    const chili = plateLayout(7, 1, DEFAULT_TWISTS).find((p) => p.kind === 'chili')
    const dump = plateLayout(7, 1, DEFAULT_TWISTS).find((p) => p.kind === 'dump')
    r = withMiss(r, 'a', 'ann', PLAY + 10)
    expect(derive(r).scores.ann).toBe(0)
    r = withClaim(r, claimKey(1, dump.i), 'ann', PLAY + 20)
    r = withClaim(r, claimKey(1, chili.i), 'ann', PLAY + 30)
    expect(derive(r).scores.ann).toBe(0)
    r = withMiss(r, 'b', 'bob', PLAY + 40)
    const log = derive(r).log
    expect(log.map((e) => e.delta)).toEqual([0, 1, -1, 0])
    expect(derive(r).scores).toEqual({ ann: 0, bob: 0 })
  })

  it('a chili does not count toward clearing the plate', () => {
    const r = claimPlate(roundOf(), 1, PLAY + 1000, (p) => p.kind === 'chili', ['ann'])
    expect(derive(r).plates).toHaveLength(1)
  })

  it('the first player to reach the target wins and later events are ignored', () => {
    let r = roundOf(2, 7, { turn: true, chili: false, last: false })
    let t = PLAY + 100
    // ann eats plate after plate until she has 15; bob misses in between
    for (let n = 1; n <= 6; n++) {
      r = claimPlate(r, n, t, (p) => p.kind !== 'chili', ['ann'])
      t += 2000
    }
    const d = derive(r)
    expect(d.winner).toBe('ann')
    expect(d.scores.ann).toBeGreaterThanOrEqual(15)
    expect(d.winAt).toBe(d.log[d.log.length - 1].at)
    // a claim after the win changes nothing
    const more = withMiss(r, 'late', 'bob', d.winAt + 10_000)
    expect(derive(more).winner).toBe('ann')
    expect(derive(more).scores).toEqual(d.scores)
    expect(winnerOf(more)).toBe('ann')
  })

  it('orders simultaneous events by key so every client agrees', () => {
    const r = roundOf(2, 7, { turn: true, chili: false, last: false })
    const [a, b] = plateLayout(7, 1, normalizeRound(r).twists).filter((p) => p.kind === 'dump')
    const one = withClaim(withClaim(r, claimKey(1, a.i), 'ann', PLAY + 50), claimKey(1, b.i), 'bob', PLAY + 50)
    const two = withClaim(withClaim(r, claimKey(1, b.i), 'bob', PLAY + 50), claimKey(1, a.i), 'ann', PLAY + 50)
    expect(derive(one).log.map((e) => e.key)).toEqual(derive(two).log.map((e) => e.key))
  })

  it('ignores claims for pieces a plate does not have', () => {
    const r = withClaim(roundOf(), 'p1_7', 'ann', PLAY + 5)
    expect(derive(r).log).toHaveLength(0)
    expect(derive({ ...roundOf(), lsClaims: { weird: { by: 'ann', at: 1 } } }).log).toHaveLength(0)
  })

  it('standings sort by score, ties by seat', () => {
    let r = roundOf(3)
    const dumps = plateLayout(7, 1, DEFAULT_TWISTS).filter((p) => p.kind === 'dump')
    r = withClaim(r, claimKey(1, dumps[0].i), 'cy', PLAY + 10)
    const s = standings(derive(r))
    expect(s.map((x) => x.uid)).toEqual(['cy', 'ann', 'bob'])
    expect(s[0]).toMatchObject({ seat: 2, score: 1 })
  })
})

describe('viewAt', () => {
  it('counts down, then plays', () => {
    const d = derive(roundOf())
    expect(viewAt(d, START + 100)).toMatchObject({ phase: 'count', plate: 1 })
    expect(viewAt(d, START + 100).count).toBeCloseTo(TUNING.countdown - 0.1, 5)
    expect(viewAt(d, PLAY + 1).phase).toBe('play')
  })

  it('pieces appear one after another and cannot be taken until the born lock passes', () => {
    const d = derive(roundOf())
    const early = viewAt(d, START + 50)
    expect(early.pieces.length).toBeLessThan(5)
    const t0 = viewAt(d, PLAY + 10)
    expect(t0.pieces).toHaveLength(5)
    // plate 1 is playable only after the countdown, so locks matter on later plates
    const r = claimPlate(roundOf(), 1, PLAY + 1000)
    const d2 = derive(r)
    const at = d2.plates[1].at
    expect(viewAt(d2, at + 100).pieces.every((p) => p.grab === false || p.born >= TUNING.bornLock)).toBe(true)
    expect(viewAt(d2, at + 100).pieces.some((p) => !p.grab)).toBe(true)
    expect(viewAt(d2, at + 1500).pieces.every((p) => p.grab)).toBe(true)
  })

  it('a claimed piece leaves the view; the last edible turns gold', () => {
    const r0 = roundOf()
    const edibles = plateLayout(7, 1, DEFAULT_TWISTS).filter((p) => p.kind !== 'chili')
    let r = r0
    edibles.slice(0, 3).forEach((p, k) => { r = withClaim(r, claimKey(1, p.i), 'ann', PLAY + 100 * (k + 1)) })
    const v = viewAt(derive(r), PLAY + 2000)
    expect(v.pieces.some((p) => p.i === edibles[0].i)).toBe(false)
    const gold = v.pieces.filter((p) => p.gold)
    expect(gold).toHaveLength(1)
    expect(gold[0].i).toBe(edibles[3].i)
    expect(v.rush).toBe(true)
  })

  it('refill: pieces fade and cannot be grabbed, then the next plate takes over', () => {
    const r = claimPlate(roundOf(), 1, PLAY + 1000)
    const d = derive(r)
    const clear = d.plates[0].clearAt
    const mid = viewAt(d, clear + 100)
    expect(mid.phase).toBe('refill')
    expect(mid.plate).toBe(1)
    expect(mid.pieces.every((p) => !p.grab && p.kind === 'chili' && p.fade < 1)).toBe(true)
    const next = viewAt(d, d.plates[1].at + 50)
    expect(next.phase).toBe('play')
    expect(next.plate).toBe(2)
  })

  it('over once somebody wins', () => {
    let r = roundOf(2, 7, { turn: true, chili: false, last: false })
    let t = PLAY + 100
    for (let n = 1; n <= 6; n++) { r = claimPlate(r, n, t, undefined, ['ann']); t += 2000 }
    const d = derive(r)
    expect(viewAt(d, d.winAt + 1500)).toMatchObject({ phase: 'over' })
    expect(viewAt(d, d.winAt + 1500).overT).toBeCloseTo(1.5, 5)
  })

  it('the plate keeps turning in the direction of its target', () => {
    const d = derive(roundOf())
    const a = viewAt(d, PLAY + 1000)
    const b = viewAt(d, PLAY + 1100)
    expect(b.th).toBeGreaterThan(a.th)
    expect(a.cur).toBeGreaterThan(0)
  })
})

describe('planTap', () => {
  it('does nothing during the countdown', () => {
    expect(planTap(derive(roundOf()), 0, START + 500)).toEqual({ kind: 'none' })
  })

  it('a tap with nothing in the gate is a miss', () => {
    const raw = roundOf()
    const d = derive(raw)
    const ang = seatAnglesFor(2)[0]
    let t = PLAY + 20
    while (aimedPiece(viewAt(d, t), ang)) t += 5
    expect(planTap(d, 0, t)).toEqual({ kind: 'miss' })
  })

  it('a tap with a dumpling in the gate eats it; a chili reads as hot', () => {
    const raw = roundOf()
    const d = derive(raw)
    const tDump = momentAt(raw, 0, 'dump')
    const eat = planTap(d, 0, tDump)
    expect(eat).toMatchObject({ kind: 'eat', plate: 1, piece: 'dump', key: claimKey(1, eat.i) })
    const tChili = momentAt(raw, 1, 'chili')
    expect(planTap(d, 1, tChili)).toMatchObject({ kind: 'hot', piece: 'chili' })
  })

  it('two pieces in one gate: the one nearest its centre', () => {
    const view = {
      phase: 'play', cur: 1, rush: false, plate: 1,
      pieces: [
        { key: 'p1_0', plate: 1, i: 0, kind: 'dump', a: 0.15, grab: true, fade: 1 },
        { key: 'p1_1', plate: 1, i: 1, kind: 'bun', a: -0.05, grab: true, fade: 1 },
      ],
    }
    expect(aimedPiece(view, 0).i).toBe(1)
    expect(gateHot(view, 0)).toBe(true)
    expect(gateHot(view, 1.5)).toBe(false)
  })

  it('applyOutcome writes the tap into a local round', () => {
    const raw = roundOf()
    const t = momentAt(raw, 0, 'dump')
    const out = planTap(derive(raw), 0, t)
    const next = applyOutcome(raw, 'ann', out, t, 'x1')
    expect(derive(next).scores.ann).toBe(1)
    expect(applyOutcome(next, 'bob', out, t + 5, 'x2')).toBeNull() // already taken
    const missed = applyOutcome(raw, 'bob', { kind: 'miss' }, t, 'x3')
    expect(Object.keys(missed.lsMiss)).toEqual(['x3'])
    expect(applyOutcome(raw, 'bob', { kind: 'none' }, t, 'x4')).toBeNull()
  })
})

describe('tap locks', () => {
  it('a miss locks 0.45 s; a hit 0.22 s; a chili freezes 0.9 s and ignores everything', () => {
    const lock = freshLock()
    expect(press(lock, 1000)).toBe('tap')
    settle(lock, { kind: 'miss' }, 1000)
    expect(press(lock, 1200)).toBe('ignore')
    expect(press(lock, 1000 + TUNING.missLock * 1000)).toBe('tap')
    settle(lock, { kind: 'eat' }, 2000)
    expect(lock.until).toBe(2000 + TUNING.hitLock * 1000)
    settle(lock, { kind: 'hot' }, 3000)
    expect(lock.until).toBe(3000 + TUNING.stun * 1000)
    expect(press(lock, 3500)).toBe('ignore')
    expect(lock.buffered).toBe(false) // a stun never buffers
  })

  it('a press in the last 0.12 s of a lock is kept and fires when it ends', () => {
    const lock = freshLock()
    settle(lock, { kind: 'miss' }, 0)
    expect(press(lock, 100)).toBe('ignore')
    expect(lock.buffered).toBe(false)
    expect(press(lock, 400)).toBe('ignore')
    expect(lock.buffered).toBe(true)
    expect(takeBuffered(lock, 420)).toBe(false)
    expect(takeBuffered(lock, 451)).toBe(true)
    expect(takeBuffered(lock, 460)).toBe(false)
  })
})

describe('bot', () => {
  const view = (over = {}) => ({
    phase: 'play', cur: 1.5, rush: false, plate: 1,
    pieces: [{ key: 'p1_0', plate: 1, i: 0, kind: 'dump', a: -0.45, grab: true, fade: 1, born: 2 }],
    ...over,
  })

  it('plans a tap for a piece about to reach its gate, once', () => {
    const seen = new Map()
    const rnd = () => 0.99
    const plan = planBot(view(), 0, 'hard', rnd, seen, 1000)
    expect(plan).not.toBeNull()
    expect(plan.key).toBe('p1_0')
    expect(plan.at).toBeGreaterThan(1000)
    expect(plan.at).toBeLessThan(1000 + 500)
    expect(planBot(view(), 0, 'hard', rnd, seen, 1010)).toBeNull() // already planned
  })

  it('never aims at a chili and waits out the countdown', () => {
    const chili = view({ pieces: [{ key: 'p1_0', plate: 1, i: 0, kind: 'chili', a: -0.45, grab: true, fade: 1 }] })
    expect(planBot(chili, 0, 'hard', () => 0.9, new Map(), 0)).toBeNull()
    expect(planBot(view({ phase: 'count' }), 0, 'hard', () => 0.9, new Map(), 0)).toBeNull()
  })

  it('does not plan for pieces already past its gate or too far away', () => {
    const far = view({ pieces: [{ key: 'p1_0', plate: 1, i: 0, kind: 'dump', a: -2, grab: true, fade: 1 }] })
    const past = view({ pieces: [{ key: 'p1_0', plate: 1, i: 0, kind: 'dump', a: 0.4, grab: true, fade: 1 }] })
    expect(planBot(far, 0, 'hard', () => 0.9, new Map(), 0)).toBeNull()
    expect(planBot(past, 0, 'hard', () => 0.9, new Map(), 0)).toBeNull()
  })

  it('harder bots skip fewer pieces and aim tighter', () => {
    const stats = (level) => {
      const rnd = mulberry32(99)
      let planned = 0
      const times = []
      for (let i = 0; i < 2000; i++) {
        const plan = planBot(view(), 0, level, rnd, new Map(), 0)
        if (plan) { planned++; times.push(plan.at) }
      }
      const mean = times.reduce((a, b) => a + b, 0) / times.length
      const sd = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length)
      return { planned, sd }
    }
    const [easy, normal, hard] = BOT_LEVELS.map(stats)
    expect(hard.planned).toBeGreaterThan(normal.planned)
    expect(normal.planned).toBeGreaterThan(easy.planned)
    expect(hard.sd).toBeLessThan(normal.sd)
    expect(normal.sd).toBeLessThan(easy.sd)
  })

  it('a bot-versus-bot match always reaches the target', () => {
    // Two bots play one local match to the end through the same locks and the same planTap a person uses.
    const rnd = mulberry32(5)
    let raw = createRound(['b1', 'b2'], 21, 0)
    const lock = { b1: freshLock(), b2: freshLock() }
    const seen = { b1: new Map(), b2: new Map() }
    const plan = { b1: null, b2: null }
    const angles = seatAnglesFor(2)
    let miss = 0
    for (let now = 0; now < 240_000 && winnerOf(raw) == null; now += 10) {
      const d = derive(raw)
      const view = viewAt(d, now)
      ;['b1', 'b2'].forEach((u, s) => {
        if (!plan[u]) {
          const level = u === 'b1' ? 'hard' : 'easy'
          plan[u] = planBot(view, angles[s], level, rnd, seen[u], now)
        }
        if (plan[u] && now >= plan[u].at && press(lock[u], now) === 'tap') {
          plan[u] = null
          const out = planTap(d, s, now)
          const next = applyOutcome(raw, u, out, now, `m${miss++}`)
          if (next) raw = next
          settle(lock[u], out, now)
        }
      })
    }
    const d = derive(raw)
    expect(d.winner).not.toBeNull()
    expect(Math.max(...Object.values(d.scores))).toBeGreaterThanOrEqual(15)
  })
})
