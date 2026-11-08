import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { UNITS_PER_M, VIEW_H, WORLD_W } from './updraftLogic'
import {
  AXIS_STEP_S, MAX_VIEW_H, MIN_AXIS_S, MIN_PLAY_TEXT_PX, appendSample, axisEnd, bestDelta, chartGeometry, climbCards, fitStage,
  gapText, gapToRival, railFraction, summitTime,
} from './updraftStageLogic'

const m = (n) => n * UNITS_PER_M

describe('fitStage', () => {
  it('a 9:16 phone shows exactly the classic window, full height', () => {
    const f = fitStage({ w: 375, h: 667 })
    expect(f.viewH).toBeCloseTo(VIEW_H, 0)
    expect(f.arenaH).toBeCloseTo(667, 0)
    expect(f.arenaW).toBeCloseTo(375, 0)
  })

  it('a taller phone takes the whole height and shows more tower above, never a band of nothing', () => {
    const f = fitStage({ w: 390, h: 844 })
    expect(f.arenaW).toBeCloseTo(390, 5)
    expect(f.arenaH).toBeCloseTo(844, 5)
    expect(f.viewH).toBeGreaterThan(VIEW_H)
    expect(f.viewH).toBeCloseTo(844 / (390 / WORLD_W), 5)
  })

  it('a wide window is height-bound and keeps the classic window, centred', () => {
    const f = fitStage({ w: 1200, h: 700 })
    expect(f.viewH).toBe(VIEW_H)
    expect(f.arenaH).toBeCloseTo(700, 5)
    expect(f.arenaW).toBeLessThan(1200)
    expect(f.arenaW / f.arenaH).toBeCloseTo(WORLD_W / VIEW_H, 5)
  })

  it('caps the window on an extremely tall screen and letterboxes', () => {
    const f = fitStage({ w: 300, h: 2000 })
    expect(f.viewH).toBe(MAX_VIEW_H)
    expect(f.arenaH).toBeLessThan(2000)
  })

  it('falls back to the classic window before the stage is measured', () => {
    expect(fitStage({ w: 0, h: 0 })).toMatchObject({ arenaW: WORLD_W, arenaH: VIEW_H, viewH: VIEW_H })
  })
})

describe('rail and gap', () => {
  it('railFraction clamps to 0..1', () => {
    expect(railFraction(m(100), m(400))).toBeCloseTo(0.25)
    expect(railFraction(-5, m(400))).toBe(0)
    expect(railFraction(m(900), m(400))).toBe(1)
    expect(railFraction(10, 0)).toBe(0)
  })

  it('gap is in whole metres and names who leads', () => {
    expect(gapToRival(m(30), m(12))).toEqual({ metres: 18, ahead: 'me' })
    expect(gapToRival(m(12), m(30))).toEqual({ metres: 18, ahead: 'them' })
    expect(gapToRival(m(12) + 3, m(12) + 15)).toEqual({ metres: 0, ahead: 'even' })
  })

  it('gapText reads the strip', () => {
    expect(gapText({ metres: 18, ahead: 'them' }, 'BOB')).toBe('BOB +18m')
    expect(gapText({ metres: 4, ahead: 'me' }, 'BOB')).toBe('YOU +4m')
    expect(gapText({ metres: 0, ahead: 'even' }, 'BOB')).toBe('LEVEL')
  })
})

describe('climb trace', () => {
  it('stores whole metres and merges samples inside the gap', () => {
    let t = appendSample([], { t: 0, me: 0, rival: 0 })
    t = appendSample(t, { t: 0.2, me: m(3) + 5, rival: m(1) })
    expect(t).toEqual([{ t: 0.2, me: 3, rival: 1 }])
    t = appendSample(t, { t: 1, me: m(8), rival: m(6) })
    expect(t).toHaveLength(2)
    expect(t[1]).toEqual({ t: 1, me: 8, rival: 6 })
  })

  it('time never runs backwards', () => {
    let t = appendSample([], { t: 5, me: m(1), rival: m(1) })
    t = appendSample(t, { t: 2, me: m(9), rival: m(9) })
    expect(t.map(s => s.t)).toEqual([5])
    expect(t[0].me).toBe(9)
  })

  it('axisEnd rounds up to the step and has a floor', () => {
    expect(axisEnd([])).toBe(MIN_AXIS_S)
    expect(axisEnd([{ t: 34.8, me: 1, rival: 1 }])).toBe(35)
    expect(axisEnd([{ t: 35.2, me: 1, rival: 1 }])).toBe(35 + AXIS_STEP_S)
  })
})

describe('chartGeometry', () => {
  const trace = [{ t: 0, me: 0, rival: 0 }, { t: 5, me: 100, rival: 50 }, { t: 10, me: 400, rival: 300 }]
  const box = { goalM: 400, w: 300, h: 200 }

  it('draws both lines from the floor to the goal inside the plot', () => {
    const g = chartGeometry(trace, [], box)
    expect(g.end).toBe(10)
    expect(g.me).toBe('M0.0 200.0L0.0 200.0L150.0 150.0L300.0 0.0')
    expect(g.rival).toBe('M0.0 200.0L0.0 200.0L150.0 175.0L300.0 50.0')
    expect(g.last).toEqual({ x: 300, y: 0 })
  })

  it('never draws above the goal line', () => {
    const g = chartGeometry([{ t: 1, me: 900, rival: 0 }], [], box)
    expect(g.last.y).toBe(0)
  })

  it('puts a mark on my line at the height I had then', () => {
    const g = chartGeometry(trace, [{ t: 6, kind: 'took' }], box)
    expect(g.marks[0]).toMatchObject({ kind: 'took', x: 180, y: 150 })
  })

  it('an empty trace draws nothing', () => {
    const g = chartGeometry([], [], box)
    expect(g.me).toBe('')
    expect(g.last).toBeNull()
  })
})

describe('result numbers', () => {
  it('climbCards counts a fall only when the climber did not summit', () => {
    expect(climbCards({ dead: true, top: false, springs: 2 }, { sent: 3, took: 1 }).map(c => c.value)).toEqual([1, 2, 3, 1])
    expect(climbCards({ dead: false, top: true }).map(c => c.value)).toEqual([0, 0, 0, 0])
  })

  it('summitTime only exists for a summit', () => {
    expect(summitTime({ top: true, t: 34.84 })).toBe('34.8s')
    expect(summitTime({ top: false, t: 20 })).toBeNull()
  })

  it('bestDelta names a first summit, a new best and a miss', () => {
    expect(bestDelta(null, 40)).toEqual({ best: true, text: 'FIRST SUMMIT' })
    expect(bestDelta(36.2, 34.8)).toEqual({ best: true, text: 'NEW BEST · −1.4s' })
    expect(bestDelta(30, 34.8)).toEqual({ best: false, text: 'BEST 30.0s' })
  })
})

describe('in-play text floor', () => {
  // Every pixel size written in the arena, its controls, the stage, the chart
  // and the three pages must be at least MIN_PLAY_TEXT_PX (the mobile audit's
  // floor).
  const FILES = [
    'src/components/UpdraftArena.jsx', 'src/components/UpdraftControls.jsx', 'src/components/UpdraftStage.jsx',
    'src/components/UpdraftClimbChart.jsx', 'src/pages/UpdraftDemo.jsx', 'src/pages/UpdraftGame.jsx', 'src/pages/UpdraftCoopGame.jsx',
  ]
  it.each(FILES)('%s has no text under the floor', (file) => {
    const sizes = [...readFileSync(file, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map(m => Number(m[1]))
    expect(sizes.filter(n => n < MIN_PLAY_TEXT_PX)).toEqual([])
  })
})
