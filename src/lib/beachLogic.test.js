import { describe, expect, it } from 'vitest'
import {
  GULL_GAP, SHORE_TILE, WASH_PEAK, WASH_SECONDS, WAVE_STRENGTH, foamBubbles, gullDelay, nextWaveAt,
  seamlessLoop, shoreEdge, shorePath, surfEnvelope, washPhase, waveStrength,
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

  it('sprays just past the foam line, on the sand', () => {
    for (const b of foamBubbles({ width: SHORE_TILE, ...SHAPE })) {
      expect(b.y).toBeGreaterThan(shoreEdge(b.x, SHAPE))
      expect(b.y - shoreEdge(b.x, SHAPE)).toBeLessThanOrEqual(11)
      expect(b.x).toBeLessThanOrEqual(SHORE_TILE)
    }
  })

  it('with inWater, sits just inside the water instead', () => {
    for (const b of foamBubbles({ width: SHORE_TILE, ...SHAPE, inWater: true })) {
      expect(b.y).toBeLessThan(shoreEdge(b.x, SHAPE))
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

  it('rushes up the sand after the rumble, and hisses as the wave turns', () => {
    const top = (pts) => pts.reduce((a, b) => (b.gain > a.gain ? b : a))
    expect(top(env.wash).at).toBeGreaterThan(top(env.body).at)
    expect(top(env.fizz).at).toBeGreaterThan(top(env.body).at)
    expect(env.fizz[env.fizz.length - 1].gain).toBe(0)
  })

  it('ends every layer where it began, so waves join without a step', () => {
    for (const pts of [env.body, env.wash, env.fizz]) {
      expect(pts[pts.length - 1].gain).toBe(pts[0].gain)
    }
  })

  it('a stronger wave breaks louder and brighter, but rests at the same level', () => {
    const big = surfEnvelope(WASH_SECONDS, 1.15), small = surfEnvelope(WASH_SECONDS, 0.7)
    const peak = (e) => Math.max(...e.body.map(p => p.gain))
    expect(peak(big)).toBeGreaterThan(peak(small))
    expect(Math.max(...big.body.map(p => p.cutoff))).toBeGreaterThan(Math.max(...small.body.map(p => p.cutoff)))
    expect(big.body[0]).toEqual(small.body[0])
  })

  it('keeps every point inside the wave, in order', () => {
    for (const pts of [env.body, env.wash, env.fizz]) {
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

describe('waveStrength', () => {
  it('stays in range, bunches toward the middle and clamps bad input', () => {
    const [lo, hi] = WAVE_STRENGTH
    expect(waveStrength(0)).toBe(lo)
    expect(waveStrength(1)).toBe(hi)
    expect(waveStrength(0.5)).toBeCloseTo((lo + hi) / 2)
    expect(waveStrength(0.25) - lo).toBeLessThan((hi - lo) * 0.25)
    expect(waveStrength(-1)).toBe(lo)
    expect(waveStrength(9)).toBe(hi)
  })
})

describe('seamlessLoop', () => {
  it('drops the faded tail and joins the end smoothly to the start', () => {
    // A ramp has a big jump where it wraps; the loop must not.
    const ramp = Float32Array.from({ length: 1000 }, (_, i) => i / 1000)
    const out = seamlessLoop(ramp, 200)
    expect(out).toHaveLength(800)
    const wrapJump = Math.abs(out[0] - out[out.length - 1])
    expect(wrapJump).toBeLessThan(0.01)
    // Past the crossfade the samples are untouched.
    expect(out[500]).toBe(ramp[500])
  })

  it('caps the fade at half the buffer', () => {
    expect(seamlessLoop(new Float32Array(10), 50)).toHaveLength(5)
  })
})
