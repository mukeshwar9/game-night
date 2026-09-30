import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { HOLES } from './minigolfCourses'
import { ANGLE_STEPS, MAX_SPEED, aimRayLength, pointInPoly, quantizeShot, shotVelocity, simulateShot } from './minigolfPhysics'
import { mulberry32 } from './detMath'

const byId = (id) => HOLES.find(h => h.id === id)
const tee = (h) => ({ x: h.tee[0], y: h.tee[1] })
const UP = 49152 // a = 3/4 turn: straight up the screen
const DOWN = 16384

describe('quantizeShot / shotVelocity', () => {
  it('maps angles to 1/65536 turns (wrapping negatives) and power to per-mille', () => {
    expect(quantizeShot(-Math.PI / 2, 0.5)).toEqual({ a: UP, p: 500 })
    expect(quantizeShot(0, 2)).toEqual({ a: 0, p: 1000 })
    expect(quantizeShot(Math.PI * 2, 0)).toEqual({ a: 0, p: 1 })
    expect(quantizeShot(Math.PI * 4 + 0.0001, 1).a).toBeLessThan(ANGLE_STEPS)
  })

  it('launches at the quantized angle and speed', () => {
    const v = shotVelocity({ a: UP, p: 1000 })
    expect(v.vx).toBeCloseTo(0, 9)
    expect(v.vy).toBeCloseTo(-MAX_SPEED, 9)
  })
})

describe('simulateShot', () => {
  it('sinks a well-weighted straight putt on hole 1', () => {
    const h = byId('straight')
    const holed = []
    for (let p = 100; p <= 1000; p += 20) if (simulateShot(h, tee(h), { a: UP, p, k: 0 }).holed) holed.push(p)
    expect(holed.length).toBeGreaterThan(0)
    // Too soft stops short; a slow ball rests on the fairway.
    const soft = simulateShot(h, tee(h), { a: UP, p: 60, k: 0 })
    expect(soft.holed).toBe(false)
    expect(soft.y).toBeLessThan(h.tee[1])
    expect(soft.y).toBeGreaterThan(h.cup[1])
  })

  it('a fast ball lips out instead of dropping', () => {
    const h = byId('straight')
    const r = simulateShot(h, { x: 180, y: 200 }, { a: UP, p: 1000, k: 0 })
    expect(r.events.some(e => e[1] === 'lip')).toBe(true)
    expect(r.events.findIndex(e => e[1] === 'lip')).toBe(0)
  })

  it('water resets the ball to where the shot started', () => {
    const h = byId('moat')
    const r = simulateShot(h, tee(h), { a: UP, p: 700, k: 0 })
    expect(r.water).toBe(true)
    expect({ x: r.x, y: r.y }).toEqual(tee(h))
  })

  it('a soft putt up the ramp rolls back below the slope', () => {
    const h = byId('ramp')
    const r = simulateShot(h, tee(h), { a: UP, p: 420, k: 0 })
    expect(r.holed).toBe(false)
    expect(r.y).toBeGreaterThan(370)
  })

  it('sand slows the ball: the same putt stops shorter through the trap', () => {
    const h = byId('sand')
    // Straight up the left side runs through sand; start low in the lane.
    const onSand = simulateShot(h, { x: 100, y: 500 }, { a: UP, p: 600, k: 0 })
    expect(onSand.events.some(e => e[1] === 'sand')).toBe(true)
    const clear = simulateShot(HOLES[0], { x: 180, y: 540 }, { a: UP, p: 600, k: 0 })
    expect(500 - onSand.y).toBeLessThan(540 - clear.y)
  })

  it('portal a warps the ball into the upper chamber', () => {
    const h = byId('portals')
    const from = { x: 240, y: 470 }
    const r = simulateShot(h, from, { a: UP, p: 300, k: 0 })
    expect(r.events.some(e => e[1] === 'portal')).toBe(true)
    expect(r.y).toBeLessThan(270)
  })

  it('moving obstacles make the release tick matter', () => {
    const h = byId('windmill')
    const results = new Set()
    for (let k = 0; k < 600; k += 37) {
      const r = simulateShot(h, tee(h), { a: UP, p: 800, k })
      results.add(`${r.x.toFixed(3)},${r.y.toFixed(3)},${r.holed}`)
    }
    expect(results.size).toBeGreaterThan(1)
  })

  it('is deterministic: same inputs, bit-identical rest', () => {
    for (const h of HOLES) {
      const shot = { a: 51000, p: 730, k: 211 }
      const a = simulateShot(h, tee(h), shot, { path: true })
      const b = simulateShot(h, tee(h), shot, { path: true })
      expect(b.x).toBe(a.x)
      expect(b.y).toBe(a.y)
      expect(b.path).toEqual(a.path)
    }
  })

  it('never lets the ball escape a wall or rest inside a block', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 400; i++) {
      const h = HOLES[i % HOLES.length]
      const shot = { a: Math.floor(rng() * 65536), p: 1 + Math.floor(rng() * 1000), k: Math.floor(rng() * 5000) }
      const r = simulateShot(h, tee(h), shot)
      expect(h.bounds.some(p => pointInPoly(r.x, r.y, p)), `${h.id} ${JSON.stringify(shot)}`).toBe(true)
      expect((h.blocks || []).some(p => pointInPoly(r.x, r.y, p))).toBe(false)
      expect(r.oob).toBe(false)
    }
  })

  it('ends every stroke within the 12 s cap', () => {
    const h = byId('bumpers')
    const r = simulateShot(h, tee(h), { a: UP, p: 1000, k: 0 })
    expect(r.steps).toBeLessThanOrEqual(1440)
  })

  it('source uses no engine-rounded transcendentals', () => {
    const src = readFileSync(new URL('./minigolfPhysics.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/Math\.(sin|cos|tan|atan2?|hypot|pow|exp|log)\(/)
  })

  it('down-shots bounce off the bottom wall and stay on the tee side', () => {
    const h = byId('straight')
    const r = simulateShot(h, tee(h), { a: DOWN, p: 300, k: 0 })
    expect(r.events.some(e => e[1] === 'wall')).toBe(true)
    expect(r.y).toBeGreaterThan(300)
  })

  it('aimRayLength stops the assist line at the first wall', () => {
    const h = byId('straight')
    // From the tee straight up: the top wall is at y=40, so 510-40-6 = 464.
    expect(aimRayLength(h, 180, 510, 0, -1, 1000)).toBeCloseTo(464, 6)
    expect(aimRayLength(h, 180, 510, 0, -1, 100)).toBe(100)
  })
})
