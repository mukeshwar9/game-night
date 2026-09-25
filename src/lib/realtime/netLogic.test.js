import { describe, it, expect } from 'vitest'
import {
  createRttEstimator, hostInputDelayMs, delaySteps, createDelayLine,
  latestInput, mergeTapInput, isInputStale, HOST_DELAY_CAP_MS, STALE_INPUT_MS,
} from './netLogic'

describe('createRttEstimator', () => {
  it('is null until the first sample, which it adopts directly', () => {
    const r = createRttEstimator()
    expect(r.value()).toBeNull()
    expect(r.add(80)).toBe(80)
    expect(r.value()).toBe(80)
  })

  it('smooths rising samples with alpha 1/8', () => {
    const r = createRttEstimator()
    r.add(80)
    expect(r.add(160)).toBe(90)       // 80 + (160-80)/8
    expect(r.add(90)).toBe(90)
  })

  it('falls faster than it rises (alpha 1/4), shedding a one-off spike', () => {
    const r = createRttEstimator()
    r.add(200)                         // slow first echo
    expect(r.add(0)).toBe(150)         // 200 - 200/4
    for (let i = 0; i < 12; i++) r.add(4)
    expect(r.value()).toBeLessThan(10)
  })

  it('converges toward a new steady RTT', () => {
    const r = createRttEstimator()
    r.add(20)
    for (let i = 0; i < 60; i++) r.add(100)
    expect(r.value()).toBeGreaterThan(99)
  })

  it('ignores invalid and absurd samples', () => {
    const r = createRttEstimator()
    r.add(50)
    r.add(-5); r.add(NaN); r.add(Infinity); r.add(60_000)
    expect(r.value()).toBe(50)
  })

  it('reset forgets the estimate (new attempt = new path)', () => {
    const r = createRttEstimator()
    r.add(50)
    r.reset()
    expect(r.value()).toBeNull()
  })

  it('accepts custom alphas', () => {
    const r = createRttEstimator({ alpha: 0.5, alphaDown: 1 })
    r.add(0)
    expect(r.add(100)).toBe(50)
    expect(r.add(10)).toBe(10)
  })
})

describe('hostInputDelayMs', () => {
  it('is zero with no measurement', () => {
    expect(hostInputDelayMs(null)).toBe(0)
    expect(hostInputDelayMs(undefined)).toBe(0)
    expect(hostInputDelayMs(0)).toBe(0)
    expect(hostInputDelayMs(NaN)).toBe(0)
  })

  it('is half the RTT', () => {
    expect(hostInputDelayMs(40)).toBe(20)
    expect(hostInputDelayMs(100)).toBe(50)
  })

  it('is capped', () => {
    expect(hostInputDelayMs(400)).toBe(HOST_DELAY_CAP_MS)
    expect(hostInputDelayMs(400, 30)).toBe(30)
  })
})

describe('delaySteps', () => {
  it('rounds to whole fixed steps', () => {
    expect(delaySteps(0, 1 / 120)).toBe(0)
    expect(delaySteps(25, 1 / 120)).toBe(3)       // 25 / 8.33
    expect(delaySteps(60, 1 / 120)).toBe(7)
  })

  it('guards bad inputs', () => {
    expect(delaySteps(-10, 1 / 120)).toBe(0)
    expect(delaySteps(30, 0)).toBe(0)
    expect(delaySteps(NaN, 1 / 120)).toBe(0)
  })
})

describe('merge helpers', () => {
  it('latestInput prefers the newer non-null sample', () => {
    expect(latestInput(1, -1)).toBe(-1)
    expect(latestInput(1, null)).toBe(1)
    expect(latestInput(1, undefined)).toBe(1)
  })

  it('mergeTapInput sums presses and never loses a tap', () => {
    expect(mergeTapInput({ press: 1 }, { press: 2 })).toEqual({ press: 3 })
    expect(mergeTapInput({ press: 1 }, null)).toEqual({ press: 1 })
    expect(mergeTapInput(null, { press: 1 })).toEqual({ press: 1 })
    expect(mergeTapInput('up', 'left')).toBe('left')
  })
})

describe('createDelayLine', () => {
  const feed = (line, inputs, target) => inputs.map(i => line.push(i, target))

  it('is a pass-through at zero delay', () => {
    const line = createDelayLine()
    expect(feed(line, [1, 2, 3], 0)).toEqual([1, 2, 3])
    expect(line.size()).toBe(0)
  })

  it('delays by exactly targetSteps once filled (latched holds the last value)', () => {
    const line = createDelayLine({ latched: true })
    expect(feed(line, ['a', 'b', 'c', 'd', 'e'], 2)).toEqual([null, null, 'a', 'b', 'c'])
    expect(line.size()).toBe(2)
  })

  it('while growing, latched lines repeat the last released value', () => {
    const line = createDelayLine({ latched: true })
    feed(line, [1, 2], 0)                           // released 1, 2
    expect(feed(line, [3, 4, 5], 2)).toEqual([2, 2, 3])
  })

  it('while growing, tap lines release nothing (never apply a tap twice)', () => {
    const line = createDelayLine({ latched: false, merge: mergeTapInput })
    feed(line, [{ press: 1 }], 0)
    expect(feed(line, [{ press: 0 }, { press: 0 }, { press: 0 }], 2)).toEqual([null, null, { press: 0 }])
  })

  it('shrinks one step per push, merging instead of dropping', () => {
    const line = createDelayLine({ latched: false, merge: mergeTapInput })
    feed(line, [{ press: 1 }, { press: 1 }, { press: 1 }], 3)   // all held
    expect(line.size()).toBe(3)
    const out = feed(line, [{ press: 0 }, { press: 0 }, { press: 0 }], 0)
    expect(line.size()).toBe(0)
    const total = out.reduce((n, i) => n + (i?.press || 0), 0)
    expect(total).toBe(3)                          // every tap survives the shrink
  })

  it('conserves every tap across arbitrary target changes', () => {
    const line = createDelayLine({ latched: false, merge: mergeTapInput })
    const targets = [0, 3, 3, 7, 7, 7, 2, 0, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    let pushed = 0, released = 0
    targets.forEach((t, i) => {
      const p = i % 3 === 0 ? 1 : 0
      pushed += p
      released += line.push({ press: p }, t)?.press || 0
    })
    expect(released).toBe(pushed)
  })

  it('custom merge + hold keep an edge-triggered flag exactly once', () => {
    // Space Duel: { turn, fire } where fire is a one-frame edge.
    const line = createDelayLine({
      merge: (a, b) => ({ ...b, fire: a?.fire || b?.fire ? 1 : 0 }),
      hold: (last) => (last ? { ...last, fire: 0 } : null),
    })
    const out = []
    out.push(line.push({ turn: 1, fire: 1 }, 0))      // released at once
    out.push(line.push({ turn: 1, fire: 0 }, 2))      // growing: hold, fire cleared
    out.push(line.push({ turn: 1, fire: 1 }, 2))      // growing: hold
    out.push(line.push({ turn: 0, fire: 0 }, 0))      // shrinking: merges the pending fire
    out.push(line.push({ turn: 0, fire: 0 }, 0))
    const fired = out.reduce((n, i) => n + (i?.fire || 0), 0)
    expect(fired).toBe(2)
    expect(out[1]).toEqual({ turn: 1, fire: 0 })
    expect(line.size()).toBe(0)
  })

  it('reset empties the line', () => {
    const line = createDelayLine()
    feed(line, [1, 2, 3], 5)
    line.reset()
    expect(line.size()).toBe(0)
    expect(line.push(9, 0)).toBe(9)
  })

  it('clamps negative / fractional targets', () => {
    const line = createDelayLine()
    expect(line.push(1, -3)).toBe(1)
    expect(line.push(2, 0.7)).toBe(2)
  })
})

describe('isInputStale', () => {
  it('treats never-received input as stale', () => {
    expect(isInputStale(0, 1000)).toBe(true)
  })

  it('expires after STALE_INPUT_MS', () => {
    expect(isInputStale(1000, 1000 + STALE_INPUT_MS)).toBe(false)
    expect(isInputStale(1000, 1000 + STALE_INPUT_MS + 1)).toBe(true)
  })

  it('accepts a custom window', () => {
    expect(isInputStale(1000, 1100, 50)).toBe(true)
  })
})
