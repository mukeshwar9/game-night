import { describe, expect, it } from 'vitest'
import { HOLES } from './minigolfCourses'
import { botSearch, botShot, distanceField, scoreRest } from './minigolfBot'
import { STROKE_CAP } from './minigolfLogic'
import { simulateShot } from './minigolfPhysics'
import { mulberry32 } from './detMath'

// Plays one hole with the bot; returns strokes, or null when it hits the cap.
function playHole(hole, level, seed) {
  const rng = mulberry32(seed)
  let ball = { x: hole.tee[0], y: hole.tee[1] }, strokes = 0, k = seed * 31
  while (strokes < STROKE_CAP) {
    const shot = botShot(hole, ball, k, level, rng)
    const r = simulateShot(hole, ball, shot)
    strokes += r.water ? 2 : 1
    if (r.holed) return strokes
    ball = { x: r.x, y: r.y }
    k += r.steps + 120
  }
  return null
}

describe('minigolf bot', () => {
  it('the distance field is 0 at the cup and finite at the tee on every hole', () => {
    for (const h of HOLES) {
      const { dist, cellOf } = distanceField(h)
      expect(dist[cellOf(h.cup[0], h.cup[1])]).toBe(0)
      expect(dist[cellOf(h.tee[0], h.tee[1])], h.id).toBeLessThan(1e9)
    }
  })

  it('scores a holed ball best and a splash worse than a dry rest', () => {
    const h = HOLES.find(x => x.id === 'moat')
    expect(scoreRest(h, { holed: true })).toBeLessThan(0)
    const dry = scoreRest(h, { x: h.tee[0], y: h.tee[1], holed: false, water: false, oob: false })
    const wet = scoreRest(h, { x: h.tee[0], y: h.tee[1], holed: false, water: true, oob: false })
    expect(wet).toBeGreaterThan(dry)
  })

  it('returns quantized integer strokes and is repeatable for a seed', () => {
    const h = HOLES[0]
    const a = botShot(h, { x: h.tee[0], y: h.tee[1] }, 5, 'easy', mulberry32(3))
    const b = botShot(h, { x: h.tee[0], y: h.tee[1] }, 5, 'easy', mulberry32(3))
    expect(a).toEqual(b)
    expect(Number.isInteger(a.a) && Number.isInteger(a.p) && a.k === 5).toBe(true)
  })

  it('botSearch yields so a page can time-slice it', () => {
    const it = botSearch(HOLES[0], { x: 180, y: 510 }, 0, 'easy', mulberry32(1))
    let yields = 0, r
    while (!(r = it.next()).done) yields++
    expect(yields).toBeGreaterThan(10)
    expect(r.value).toHaveProperty('a')
  })

  // Course solvability: a HARD bot sinks every front-nine hole within the cap,
  // and within par + 2. Guards against a hole edit that makes one unplayable.
  it('every hole is solvable by the HARD bot within par + 2', () => {
    for (const h of HOLES) {
      const strokes = playHole(h, 'hard', 7)
      expect(strokes, h.id).not.toBeNull()
      expect(strokes, h.id).toBeLessThanOrEqual(h.par + 2)
    }
  }, 120000)
})
