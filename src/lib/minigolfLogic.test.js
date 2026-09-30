import { describe, expect, it } from 'vitest'
import { HOLES, getCourse } from './minigolfCourses'
import { simulateShot } from './minigolfPhysics'
import {
  PICKUP_SCORE, STROKE_CAP, formatVsPar, holeStars, honoursOrder, matchWinner,
  replayCourse, scoreName, standings, totalOf, vsPar,
} from './minigolfLogic'

const UP = 49152
// A hole-in-one on the straight hole (found by search, so the test does not
// depend on a tuned constant).
const aceP = (() => {
  const h = HOLES[0]
  for (let p = 100; p <= 1000; p += 5) if (simulateShot(h, { x: h.tee[0], y: h.tee[1] }, { a: UP, p, k: 0 }).holed) return p
  throw new Error('no ace on hole 1')
})()
const ace = (by, h = 0) => ({ by, h, a: UP, p: aceP, k: 0 })
const dribble = (by, h = 0) => ({ by, h, a: UP, p: 1, k: 0 })

describe('replayCourse', () => {
  it('starts on hole 1 with the first seat to play from the tee', () => {
    const s = replayCourse({ course: 'quick3', order: ['a', 'b'], shots: null })
    expect(s.done).toBe(false)
    expect(s.pos).toBe(0)
    expect(s.turn).toBe('a')
    expect(s.ball).toEqual({ x: HOLES[0].tee[0], y: HOLES[0].tee[1] })
    expect(s.scores).toEqual({ a: [null, null, null], b: [null, null, null] })
  })

  it('each player finishes the hole before the next tees off', () => {
    const s = replayCourse({ course: 'quick3', order: ['a', 'b'], shots: [dribble('a'), dribble('a')] })
    expect(s.turn).toBe('a')
    expect(s.strokes).toBe(2)
    const t = replayCourse({ course: 'quick3', order: ['a', 'b'], shots: [ace('a')] })
    expect(t.scores.a[0]).toBe(1)
    expect(t.turn).toBe('b')
    expect(t.strokes).toBe(0)
  })

  it('picks the ball up after the stroke cap and scores it 7', () => {
    const shots = Array.from({ length: STROKE_CAP }, () => dribble('a'))
    const s = replayCourse({ course: 'quick3', order: ['a', 'b'], shots })
    expect(s.scores.a[0]).toBe(PICKUP_SCORE)
    expect(s.turn).toBe('b')
    expect(s.log.at(-1).outcome).toBe('pickup')
  })

  it('counts water as two strokes and replays from the shot start', () => {
    const moatPos = 0
    const course = { order: ['a'], shots: [{ by: 'a', h: moatPos, a: UP, p: 700, k: 0 }] }
    // Use a one-off course through the registry: MOAT is HOLES index 6.
    const moat = HOLES[6]
    const r = simulateShot(moat, { x: moat.tee[0], y: moat.tee[1] }, course.shots[0])
    expect(r.water).toBe(true)
    // front9 position 6 is the moat: play holes 0–5 out with aces-or-pickups first.
    const shots = []
    for (let pos = 0; pos < 6; pos++) for (let i = 0; i < STROKE_CAP; i++) shots.push(dribble('a', pos))
    shots.push({ by: 'a', h: 6, a: UP, p: 700, k: 0 })
    const s = replayCourse({ course: 'front9', order: ['a'], shots })
    expect(s.pos).toBe(6)
    expect(s.strokes).toBe(2)
    expect(s.ball).toEqual({ x: moat.tee[0], y: moat.tee[1] })
    expect(s.log.at(-1).outcome).toBe('water')
  })

  it('applies honours: best score on the last hole tees off first', () => {
    const shots = [
      ...Array.from({ length: STROKE_CAP }, () => dribble('a')), // a: 7
      ace('b'), // b: 1
    ]
    const s = replayCourse({ course: 'quick3', order: ['a', 'b'], shots })
    expect(s.pos).toBe(1)
    expect(s.holeOrder).toEqual(['b', 'a'])
    expect(s.turn).toBe('b')
  })

  it('a coordinator skip picks the player up at their turn', () => {
    const s = replayCourse({ course: 'quick3', order: ['a', 'b'], shots: [ace('a')], skips: { 0: { b: 'timeout' } } })
    expect(s.scores.b[0]).toBe(PICKUP_SCORE)
    expect(s.pos).toBe(1)
    expect(s.log.at(-1).outcome).toBe('skip')
  })

  it('ignores a stroke written out of turn', () => {
    const s = replayCourse({ course: 'quick3', order: ['a', 'b'], shots: [dribble('b'), ace('a')] })
    expect(s.scores.a[0]).toBe(1)
    expect(s.turn).toBe('b')
  })

  it('finishes when every player has played every hole', () => {
    const skips = { 0: { a: 'x', b: 'x' }, 1: { a: 'x', b: 'x' }, 2: { a: 'x', b: 'x' } }
    const s = replayCourse({ course: 'quick3', order: ['a', 'b'], shots: null, skips })
    expect(s.done).toBe(true)
    expect(s.turn).toBe(null)
    expect(totalOf(s.scores.a)).toBe(21)
  })

  it('is deterministic for the same inputs', () => {
    const shots = [{ by: 'a', h: 0, a: 50000, p: 600, k: 3 }, { by: 'a', h: 0, a: 48000, p: 300, k: 400 }]
    const a = replayCourse({ course: 'front9', order: ['a', 'b'], shots })
    const b = replayCourse({ course: 'front9', order: ['a', 'b'], shots: shots.map(x => ({ ...x })) })
    expect(b.ball).toEqual(a.ball)
    expect(b.strokes).toBe(a.strokes)
  })
})

describe('scoring helpers', () => {
  it('honoursOrder keeps seat order on hole 1 and is stable on ties', () => {
    expect(honoursOrder(['a', 'b', 'c'], {}, 0)).toEqual(['a', 'b', 'c'])
    expect(honoursOrder(['a', 'b', 'c'], { a: [3], b: [2], c: [3] }, 1)).toEqual(['b', 'a', 'c'])
  })

  it('standings share ranks on ties; matchWinner reports a shared lead as a draw', () => {
    const scores = { a: [3, 3], b: [2, 3], c: [3, 2] }
    expect(standings(scores, ['a', 'b', 'c']).map(r => [r.uid, r.rank])).toEqual([['b', 1], ['c', 1], ['a', 3]])
    expect(matchWinner(scores, ['a', 'b', 'c'])).toBe('draw')
    expect(matchWinner({ a: [2], b: [3] }, ['a', 'b'])).toBe('a')
  })

  it('vsPar and formatVsPar', () => {
    expect(getCourse('front9').holes).toHaveLength(9)
    expect(vsPar([1, 3, null], 'front9')).toBe(-1)
    expect(formatVsPar(0)).toBe('E')
    expect(formatVsPar(2)).toBe('+2')
    expect(formatVsPar(-1)).toBe('-1')
  })

  it('scoreName and holeStars', () => {
    expect(scoreName(1, 3)).toBe('HOLE IN ONE!')
    expect(scoreName(1, 2)).toBe('HOLE IN ONE!')
    expect(scoreName(2, 4)).toBe('EAGLE!')
    expect(scoreName(2, 3)).toBe('BIRDIE!')
    expect(scoreName(3, 3)).toBe('PAR')
    expect(scoreName(4, 3)).toBe('BOGEY')
    expect(scoreName(6, 3)).toBe('+3')
    expect(scoreName(7, 3, true)).toBe('PICKED UP')
    expect([holeStars(1, 3), holeStars(2, 3), holeStars(3, 3), holeStars(4, 3), holeStars(7, 3)]).toEqual([3, 2, 1, 0, 0])
  })
})
