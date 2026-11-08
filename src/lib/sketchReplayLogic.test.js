import { describe, expect, it } from 'vitest'
import {
  BASE_SHARE,
  REPLAY_END_MS,
  REPLAY_LEAD_MS,
  REPLAY_MS,
  fillCount,
  frameAt,
  replayOver,
  replayPlan,
  replayTime,
  strokeDash,
  strokeLength,
} from './sketchReplayLogic'
import { REVEAL_MS } from './sketchLogic'

const line = (x0, y0, x1, y1, extra = {}) => ({ c: 0, w: 2, p: [x0, y0, x1, y1], ...extra })

describe('strokeLength', () => {
  it('sums the segments of a polyline', () => {
    expect(strokeLength([0, 0, 3, 4])).toBe(5)
    expect(strokeLength([0, 0, 3, 4, 3, 10])).toBe(11)
  })
  it('is 0 for a dot or a bad value', () => {
    expect(strokeLength([5, 5])).toBe(0)
    expect(strokeLength(undefined)).toBe(0)
  })
})

describe('replayPlan', () => {
  it('is empty when nothing was drawn', () => {
    expect(replayPlan({}, {}).items).toEqual([])
    expect(replayPlan(null, undefined).items).toEqual([])
    expect(replayPlan({ a: { p: [] } }, { b: { p: [1] } }).items).toEqual([])
  })

  it('interleaves strokes and fills in push order', () => {
    const plan = replayPlan(
      { k1: line(0, 0, 10, 0), k3: line(0, 5, 10, 5) },
      { k2: { c: 3, p: [1, 1, 2, 1] } },
    )
    expect(plan.items.map(i => `${i.kind}:${i.key}`)).toEqual(['stroke:k1', 'fill:k2', 'stroke:k3'])
  })

  it('covers the whole replay back to back, starting at 0', () => {
    const plan = replayPlan({ a: line(0, 0, 100, 0), b: line(0, 0, 5, 0), c: { p: [9, 9] } }, { d: { p: [0, 0] } })
    expect(plan.items[0].start).toBe(0)
    for (let i = 1; i < plan.items.length; i++) expect(plan.items[i].start).toBeCloseTo(plan.items[i - 1].end)
    expect(plan.items[plan.items.length - 1].end).toBe(REPLAY_MS)
    expect(plan.ms).toBe(REPLAY_MS)
  })

  it('gives each unit an equal base slice plus a share by length', () => {
    const plan = replayPlan({ a: line(0, 0, 200, 0), b: line(0, 0, 0, 0.0001) }, {})
    const base = (REPLAY_MS * BASE_SHARE) / 2
    const [long, dot] = plan.items
    // the long outline does not eat the whole replay, the dot still gets its slice
    expect(dot.end - dot.start).toBeGreaterThanOrEqual(base - 1)
    expect(long.end - long.start).toBeLessThan(REPLAY_MS - base + 1)
    expect(long.end - long.start).toBeGreaterThan(dot.end - dot.start)
  })

  it('paces the segments of one gesture as one stroke, at one speed', () => {
    // one gesture flushed as three segments, then a separate short stroke
    const plan = replayPlan({
      a1: line(0, 0, 10, 0, { g: 'G' }),
      a2: line(10, 0, 30, 0, { g: 'G' }),
      a3: line(30, 0, 40, 0, { g: 'G' }),
      b: line(0, 9, 40, 9),
    }, {})
    const [s1, s2, s3, b] = plan.items
    const gesture = s3.end - s1.start
    // two units of equal length: equal time
    expect(gesture).toBeCloseTo(b.end - b.start)
    // one speed through the gesture: time per unit length is the same
    expect((s2.end - s2.start) / 20).toBeCloseTo((s1.end - s1.start) / 10)
    expect((s3.end - s3.start) / 10).toBeCloseTo((s1.end - s1.start) / 10)
  })

  it('splits evenly when nothing has length (dots and fills only)', () => {
    const plan = replayPlan({ a: { p: [1, 1] } }, { b: { p: [0, 0, 1, 0] } })
    expect(plan.items[0].end).toBeCloseTo(REPLAY_MS / 2)
    expect(plan.items[1].kind).toBe('fill')
    expect(plan.items[1].cells).toBe(2)
  })

  it('replays stored arrays as strokes, then fills', () => {
    const plan = replayPlan([line(0, 0, 9, 0), line(0, 1, 9, 1)], [{ c: 2, p: [3, 3] }])
    expect(plan.items.map(i => i.kind)).toEqual(['stroke', 'stroke', 'fill'])
  })

  it('takes the same total time for a huge drawing', () => {
    const strokes = {}
    for (let i = 0; i < 2000; i++) strokes[`k${String(i).padStart(5, '0')}`] = line(i % 256, 0, i % 256, 255)
    const plan = replayPlan(strokes, {})
    expect(plan.items).toHaveLength(2000)
    expect(plan.items[1999].end).toBe(REPLAY_MS)
  })

  it('accepts its own length', () => {
    expect(replayPlan({ a: line(0, 0, 1, 1) }, {}, 1000).items[0].end).toBe(1000)
  })
})

describe('frameAt', () => {
  const plan = replayPlan({ a: line(0, 0, 100, 0), b: line(0, 0, 100, 0) }, {})
  const mid = plan.items[0].end

  it('shows nothing before the replay starts', () => {
    expect(frameAt(plan, -50)).toEqual({ index: 0, progress: 0, done: false })
    expect(frameAt(plan, 0)).toEqual({ index: 0, progress: 0, done: false })
  })

  it('is part way through the item at t', () => {
    const f = frameAt(plan, mid / 2)
    expect(f.index).toBe(0)
    expect(f.progress).toBeCloseTo(0.5)
    expect(frameAt(plan, mid).index).toBe(1)
    expect(frameAt(plan, mid).progress).toBeCloseTo(0)
  })

  it('is done at the end and after it', () => {
    expect(frameAt(plan, REPLAY_MS)).toEqual({ index: 2, progress: 0, done: true })
    expect(frameAt(plan, REPLAY_MS * 3).done).toBe(true)
  })

  it('is done at once for an empty plan', () => {
    expect(frameAt(replayPlan({}, {}), 0)).toEqual({ index: 0, progress: 0, done: true })
  })

  it('is the same frame for the same time on every phone', () => {
    const t = 1234
    expect(frameAt(plan, t)).toEqual(frameAt(replayPlan({ b: line(0, 0, 100, 0), a: line(0, 0, 100, 0) }, {}), t))
  })
})

describe('strokeDash and fillCount', () => {
  it('hides the whole line at 0 and shows it all at 1', () => {
    expect(strokeDash(10, 0)).toEqual({ dasharray: '12 12', dashoffset: 12 })
    expect(strokeDash(10, 1)).toEqual({ dasharray: '12 12', dashoffset: 0 })
    expect(strokeDash(10, 0.5).dashoffset).toBe(6)
    expect(strokeDash(10, 7).dashoffset).toBe(0)
  })

  it('pours a fill in cell by cell', () => {
    expect(fillCount(100, 0)).toBe(0)
    expect(fillCount(100, 0.01)).toBe(1)
    expect(fillCount(100, 0.5)).toBe(50)
    expect(fillCount(100, 1)).toBe(100)
    expect(fillCount(3, 2)).toBe(3)
  })
})

describe('reveal timeline', () => {
  it('leads in with the word, then replays, then the points fly', () => {
    expect(REPLAY_LEAD_MS).toBe(300)
    expect(REPLAY_END_MS).toBe(3800)
    expect(replayTime(0)).toBe(-REPLAY_LEAD_MS)
    expect(replayTime(REPLAY_END_MS)).toBe(REPLAY_MS)
  })

  it('fits inside the reveal with time to read the points', () => {
    expect(REVEAL_MS).toBe(8000)
    expect(REVEAL_MS - REPLAY_END_MS).toBeGreaterThanOrEqual(4000)
  })

  it('is over at the end of the replay, or at once when skipped, reduced or empty', () => {
    expect(replayOver({ elapsed: 1000 })).toBe(false)
    expect(replayOver({ elapsed: REPLAY_END_MS })).toBe(true)
    expect(replayOver({ elapsed: 1000, skipped: true })).toBe(true)
    expect(replayOver({ elapsed: 0, reduced: true })).toBe(true)
    expect(replayOver({ elapsed: 0, empty: true })).toBe(true)
    expect(replayOver({ elapsed: NaN })).toBe(true)
  })
})
