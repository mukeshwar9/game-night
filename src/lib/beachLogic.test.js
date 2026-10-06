import { describe, expect, it } from 'vitest'
import {
  GULL_GAP, SHORE_TILE, WASH_PEAK, WASH_SECONDS, foamBubbles, gullDelay, nextWaveAt,
  shoreEdge, shorePath, surfEnvelope, washPhase,
} from './beachLogic'

const SHAPE = { base: 48, amp: 9, phase: 1.3 }

describe('shoreEdge', () => {
  it('repeats every tile, so the sliding strip loops without a seam', () => {
    for (const x of [0, 17, 133.5, 250, 389]) {
      expect(shoreEdge(x + SHORE_TILE, SHAPE)).toBeCloseTo(shoreEdge(x, SHAPE), 9)
      expect(shoreEdge(x + 2 * SHORE_TILE, SHAPE)).toBeCloseTo(shoreEdge(x, SHAPE), 9)
    }
  })

  it('stays within the amplitude around the base line', () => {
    for (let x = 0; x < SHORE_TILE; x += 3) {
      const y = shoreEdge(x, SHAPE)
      expect(y).toBeGreaterThanOrEqual(SHAPE.base - SHAPE.amp)
      expect(y).toBeLessThanOrEqual(SHAPE.base + SHAPE.amp)
    }
  })
})

describe('shorePath', () => {
  const width = 390 + SHORE_TILE
  const { fill, line } = shorePath({ width, ...SHAPE })

  it('fills from the top edge down to the shoreline and closes', () => {
    expect(fill.startsWith(`M0 0 L${width} 0 `)).toBe(true)
    expect(fill.endsWith(' Z')).toBe(true)
  })

  it('traces the shoreline across the whole strip', () => {
    const xs = [...line.matchAll(/(?:M|L)([\d.]+) /g)].map(m => Number(m[1]))
    expect(xs[0]).toBe(0)
    expect(xs[xs.length - 1]).toBe(width)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
  })

  it('has no NaN or unbounded coordinates', () => {
    expect(fill).not.toMatch(/NaN|Infinity/)
    const ys = [...line.matchAll(/ ([\d.-]+)(?= L|$)/g)].map(m => Number(m[1]))
    for (const y of ys) expect(Math.abs(y - SHAPE.base)).toBeLessThanOrEqual(SHAPE.amp + 0.1)
  })
})

describe('foamBubbles', () => {
  it('repeats the same bubbles in every tile', () => {
    const bubbles = foamBubbles({ width: 3 * SHORE_TILE, ...SHAPE })
    const first = bubbles.filter(b => b.x < SHORE_TILE)
    const second = bubbles.filter(b => b.x >= SHORE_TILE && b.x < 2 * SHORE_TILE)
    expect(second).toHaveLength(first.length)
    second.forEach((b, i) => {
      expect(b.x).toBeCloseTo(first[i].x + SHORE_TILE, 1)
      expect(b.y).toBe(first[i].y)
      expect(b.r).toBe(first[i].r)
    })
  })

  it('sits in the water, just above the shoreline', () => {
    for (const b of foamBubbles({ width: SHORE_TILE, ...SHAPE })) {
      expect(b.y).toBeLessThan(shoreEdge(b.x, SHAPE))
      expect(b.x).toBeLessThanOrEqual(SHORE_TILE)
    }
  })
})

describe('the shared wave clock', () => {
  it('washPhase is the time into the current wave', () => {
    expect(washPhase(0)).toBe(0)
    expect(washPhase(3500)).toBeCloseTo(3.5)
    expect(washPhase(WASH_SECONDS * 1000 * 5 + 1200)).toBeCloseTo(1.2)
    expect(washPhase(-1000)).toBeCloseTo(WASH_SECONDS - 1)
  })

  it('nextWaveAt lands the surf on the next visual wave', () => {
    // 2 s into a wave on the page clock: the next one starts 5 s later.
    expect(nextWaveAt(10, WASH_SECONDS * 1000 * 3 + 2000)).toBeCloseTo(10 + WASH_SECONDS - 2)
    // Exactly on a wave boundary: start now.
    expect(nextWaveAt(4, WASH_SECONDS * 1000 * 2)).toBe(4)
  })
})

describe('surfEnvelope', () => {
  const env = surfEnvelope()

  it('swells while the water runs up and settles by the end of the wave', () => {
    const peak = env.body.reduce((a, b) => (b.gain > a.gain ? b : a))
    expect(peak.at).toBeLessThanOrEqual(WASH_PEAK * WASH_SECONDS)
    expect(env.body[0].gain).toBe(env.body[env.body.length - 1].gain)
    expect(env.body[env.body.length - 1].at).toBe(WASH_SECONDS)
  })

  it('hisses as the wave turns, after the rumble peaks', () => {
    const body = env.body.reduce((a, b) => (b.gain > a.gain ? b : a))
    const fizz = env.fizz.reduce((a, b) => (b.gain > a.gain ? b : a))
    expect(fizz.at).toBeGreaterThan(body.at)
    expect(env.fizz[env.fizz.length - 1].gain).toBe(0)
  })

  it('keeps every point inside the wave, in order', () => {
    for (const pts of [env.body, env.fizz]) {
      for (let i = 1; i < pts.length; i++) expect(pts[i].at).toBeGreaterThan(pts[i - 1].at)
      expect(pts[pts.length - 1].at).toBeLessThanOrEqual(WASH_SECONDS)
    }
  })
})

describe('gullDelay', () => {
  it('spreads calls across the gap and clamps bad input', () => {
    expect(gullDelay(0)).toBe(GULL_GAP[0])
    expect(gullDelay(1)).toBe(GULL_GAP[1])
    expect(gullDelay(0.5)).toBeCloseTo((GULL_GAP[0] + GULL_GAP[1]) / 2)
    expect(gullDelay(-3)).toBe(GULL_GAP[0])
    expect(gullDelay(7)).toBe(GULL_GAP[1])
  })
})
