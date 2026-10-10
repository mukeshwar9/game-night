import { describe, it, expect, vi } from 'vitest'

vi.mock('./reefLevels', () => ({
  TILE: 8,
  buildLevel: (index) => ({ index, maxScore: 1000 }),
  raceLevelIndex: () => 0,
  maxScoreFor: (level) => level.maxScore,
}))

import {
  HIT, HARM, HITBOX, createRun, stepRun, continueRun, clearBonus, solidAt,
  REEF_RACE_MS, reefStatsFrom, normalizeReefStats, isReefDone, reefRaceEntry, reefRow,
} from './reefLogic'

// Open-water test level: 100x24 tiles, floor at row 20 (y=160), no ceiling.
function mkLevel(ents = [], extra = {}) {
  const cols = 100
  return {
    index: 0, name: 'TEST', theme: 'reef', dark: false, current: false,
    cols, rows: 24,
    ceil: Array(cols).fill(0),
    floor: Array(cols).fill(20),
    weeds: [], corals: [],
    ents: ents.map((e, id) => ({ id, ...e })),
    spawn: { x: 20, y: 80 },
    parSec: 60,
    scroll: null,
    starCount: 0,
    maxScore: 1000,
    ...extra,
  }
}
const NONE = { ix: 0, iy: 0, dash: false }
// Entity placed so its hitbox overlaps the fish hitbox at the spawn point.
const atFish = (k, level = { spawn: { x: 20, y: 80 } }) => {
  const h = HIT[k]
  return { k, x: level.spawn.x + HITBOX[0] - h[0], y: level.spawn.y + HITBOX[1] - h[1] }
}

describe('constants', () => {
  it('matches the contract', () => {
    expect(REEF_RACE_MS).toBe(180000)
    expect(HITBOX).toEqual([3, 5, 11, 7])
    expect([...HARM].sort()).toEqual(['angler', 'eel', 'jelly', 'mine', 'shark', 'urchin'])
  })
})

describe('solidAt', () => {
  const level = mkLevel()
  it('detects world edges, top and floor', () => {
    expect(solidAt(level, 50, 50, 10, 10)).toBe(false)
    expect(solidAt(level, -1, 50, 10, 10)).toBe(true)
    expect(solidAt(level, 795, 50, 10, 10)).toBe(true)
    expect(solidAt(level, 50, 1, 10, 10)).toBe(true)
    expect(solidAt(level, 50, 155, 10, 10)).toBe(true)
  })
  it('detects a ceiling', () => {
    const l = mkLevel([], { ceil: Array(100).fill(5) })
    expect(solidAt(l, 50, 39, 10, 10)).toBe(true)
    expect(solidAt(l, 50, 40, 10, 10)).toBe(false)
  })
})

describe('createRun', () => {
  it('starts at the spawn with carried totals', () => {
    const level = mkLevel([{ k: 'pearl', x: 100, y: 80 }])
    const run = createRun(level, { score: 120, pearls: 12, stars: 1 })
    expect(run.mode).toBe('play')
    expect(run.nemo).toMatchObject({ x: 20, y: 80, hp: 3, inv: 0, dashCd: 0, face: 1 })
    expect(run).toMatchObject({ score: 120, pearls: 12, stars: 1, hits: 0, t: 0, lastScoreAt: 0 })
    expect(run.cp).toMatchObject({ x: 20, y: 80, score: 120, pearls: 12, stars: 1, gone: [], on: [] })
    expect(run.ents[0]).not.toBe(level.ents[0])
    run.ents[0].gone = true
    expect(level.ents[0].gone).toBeUndefined()
  })
  it('defaults carry to zero', () => {
    const run = createRun(mkLevel())
    expect(run).toMatchObject({ score: 0, pearls: 0, stars: 0 })
  })
})

describe('movement', () => {
  it('accelerates with input and applies drag', () => {
    const run = createRun(mkLevel())
    stepRun(run, mkLevel(), { ix: 1, iy: 0 })
    expect(run.nemo.vx).toBeCloseTo(0.14 * 0.92, 5)
    expect(run.nemo.x).toBeGreaterThan(20)
    const v = run.nemo.vx
    stepRun(run, mkLevel(), NONE)
    expect(run.nemo.vx).toBeCloseTo(v * 0.92, 5)
  })
  it('scales with analog input and clamps vector length to 1', () => {
    const level = mkLevel()
    const half = createRun(level)
    stepRun(half, level, { ix: 0.5, iy: 0 })
    const full = createRun(level)
    stepRun(full, level, { ix: 1, iy: 0 })
    expect(half.nemo.vx).toBeCloseTo(full.nemo.vx / 2, 5)
    const diag = createRun(level)
    stepRun(diag, level, { ix: 5, iy: 5 })
    expect(Math.hypot(diag.nemo.vx, diag.nemo.vy)).toBeCloseTo(0.14 * 0.92, 2)
  })
  it('never exceeds max speed without a dash', () => {
    const level = mkLevel()
    const run = createRun(level)
    run.nemo.y = 40
    for (let i = 0; i < 40; i++) stepRun(run, level, { ix: 1, iy: 0 })
    expect(Math.hypot(run.nemo.vx, run.nemo.vy)).toBeLessThanOrEqual(1.7)
    expect(run.nemo.face).toBe(1)
    stepRun(run, level, { ix: -1, iy: 0 })
    expect(run.nemo.face).toBe(-1)
  })
  it('bounces off the floor', () => {
    const level = mkLevel()
    const run = createRun(level)
    run.nemo.y = 160 - HITBOX[1] - HITBOX[3] - 0.1
    run.nemo.vy = 1.5
    stepRun(run, level, { ix: 0, iy: 1 })
    expect(run.nemo.vy).toBeLessThan(0)
    expect(run.nemo.y + HITBOX[1] + HITBOX[3]).toBeLessThanOrEqual(160)
  })
  it('bounces off the left world edge', () => {
    const level = mkLevel([], { spawn: { x: 0, y: 80 } })
    const run = createRun(level)
    run.nemo.x = 0; run.nemo.vx = -1
    // hitbox starts at x+3, so moving left by <3px is fine; force a wall hit
    run.nemo.x = -3
    stepRun(run, level, NONE)
    expect(run.nemo.vx).toBeGreaterThan(0)
  })
})

describe('dash', () => {
  it('bursts at 3.4 then starts a 60 frame cooldown', () => {
    const level = mkLevel()
    const run = createRun(level)
    const ev = stepRun(run, level, { ix: 1, iy: 0, dash: true })
    expect(ev).toContain('dash')
    expect(run.nemo.vx).toBeCloseTo(3.4 * 0.92, 5)
    expect(run.nemo.dashCd).toBe(59)
  })
  it('dashes in facing direction with no input', () => {
    const level = mkLevel()
    const run = createRun(level)
    run.nemo.face = -1
    stepRun(run, level, { ix: 0, iy: 0, dash: true })
    expect(run.nemo.vx).toBeLessThan(-3)
  })
  it('ignores dash while on cooldown, allows it after', () => {
    const level = mkLevel()
    const run = createRun(level)
    stepRun(run, level, { ix: 1, iy: 0, dash: true })
    for (let i = 0; i < 20; i++) run.nemo.x = 20, stepRun(run, level, { ix: 1, iy: 0, dash: true }), run.nemo.x = 20
    expect(run.nemo.dashCd).toBeGreaterThan(0)
    const ev = stepRun(run, level, { ix: 1, iy: 0, dash: true })
    expect(ev).not.toContain('dash')
    for (let i = 0; i < 60; i++) { run.nemo.x = 20; stepRun(run, level, NONE) }
    expect(run.nemo.dashCd).toBe(0)
    expect(stepRun(run, level, { ix: 1, iy: 0, dash: true })).toContain('dash')
  })
})

describe('pickups', () => {
  const grab = (k, setup) => {
    const level = mkLevel([atFish(k)])
    const run = createRun(level)
    setup?.(run)
    const ev = stepRun(run, level, NONE)
    return { run, ev }
  }
  it('pearl +10', () => {
    const { run, ev } = grab('pearl')
    expect(run.score).toBe(10)
    expect(run.pearls).toBe(1)
    expect(run.ents[0].gone).toBe(true)
    expect(ev).toEqual(['pearl'])
    expect(run.lastScoreAt).toBe(1)
  })
  it('shell +50', () => {
    const { run, ev } = grab('shell')
    expect(run.score).toBe(50)
    expect(ev).toContain('shell')
  })
  it('star +100 and counts stars', () => {
    const { run, ev } = grab('star')
    expect(run.score).toBe(100)
    expect(run.stars).toBe(1)
    expect(ev).toContain('star')
  })
  it('is not collected twice', () => {
    const { run } = grab('pearl')
    const level = mkLevel([atFish('pearl')])
    stepRun(run, level, NONE)
    expect(run.score).toBe(10)
  })
  it('every 50th pearl heals one heart', () => {
    const { run, ev } = grab('pearl', (r) => { r.pearls = 49; r.nemo.hp = 2 })
    expect(run.nemo.hp).toBe(3)
    expect(ev).toContain('heart')
  })
  it('50th pearl at full hp does not exceed 3', () => {
    const { run } = grab('pearl', (r) => { r.pearls = 49 })
    expect(run.nemo.hp).toBe(3)
  })
  it('heart bubble heals when hurt', () => {
    const { run, ev } = grab('heartB', (r) => { r.nemo.hp = 1 })
    expect(run.nemo.hp).toBe(2)
    expect(run.score).toBe(0)
    expect(ev).toContain('heart')
  })
  it('heart bubble at full hp gives +200', () => {
    const { run } = grab('heartB')
    expect(run.nemo.hp).toBe(3)
    expect(run.score).toBe(200)
  })
})

describe('hazards', () => {
  it('hit costs a heart, grants invulnerability, counts and knocks back', () => {
    const level = mkLevel([{ ...atFish('urchin'), x: atFish('urchin').x + 4 }])
    const run = createRun(level)
    const ev = stepRun(run, level, NONE)
    expect(ev).toContain('hit')
    expect(run.nemo.hp).toBe(2)
    expect(run.nemo.inv).toBe(90)
    expect(run.hits).toBe(1)
    expect(run.nemo.vx).toBeLessThan(0)
    expect(run.mode).toBe('play')
  })
  it('cannot be hit again during invulnerability', () => {
    const level = mkLevel([{ ...atFish('mine'), by: atFish('mine').y, amp: 0, ph: 0 }])
    const run = createRun(level)
    stepRun(run, level, NONE)
    // park the fish back on the hazard
    run.nemo.x = 20; run.nemo.y = 80
    const ev = stepRun(run, level, NONE)
    expect(ev).not.toContain('hit')
    expect(run.nemo.hp).toBe(2)
    expect(run.hits).toBe(1)
  })
  it('can be hit again after invulnerability ends', () => {
    const level = mkLevel([atFish('urchin')])
    const run = createRun(level)
    stepRun(run, level, NONE)
    run.nemo.inv = 0
    run.nemo.x = 20; run.nemo.y = 80
    stepRun(run, level, NONE)
    expect(run.nemo.hp).toBe(1)
    expect(run.hits).toBe(2)
  })
  it('hp 0 sets mode dead, emits dead, and freezes the sim', () => {
    const level = mkLevel([{ ...atFish('shark'), a: 0, b: 900, v: 0 }])
    const run = createRun(level)
    run.nemo.hp = 1
    const ev = stepRun(run, level, NONE)
    expect(ev).toEqual(['hit', 'dead'])
    expect(run.mode).toBe('dead')
    expect(run.nemo.hp).toBe(0)
    const t = run.t
    expect(stepRun(run, level, { ix: 1, iy: 0 })).toEqual([])
    expect(run.t).toBe(t)
  })
  it('sharks patrol between a and b', () => {
    const level = mkLevel([{ k: 'shark', x: 300, y: 40, a: 290, b: 310, v: 2, flip: false }])
    const run = createRun(level)
    for (let i = 0; i < 30; i++) stepRun(run, level, NONE)
    expect(run.ents[0].x).toBeGreaterThan(300)
    expect(run.ents[0].flip).toBe(true)
    for (let i = 0; i < 30; i++) stepRun(run, level, NONE)
    expect(run.ents[0].x).toBeLessThan(310)
  })
  it('jellies bob around their base', () => {
    const level = mkLevel([{ k: 'jelly', x: 400, y: 80, by: 80, amp: 20, ph: 0 }])
    const run = createRun(level)
    for (let i = 0; i < 40; i++) stepRun(run, level, NONE)
    expect(run.ents[0].y).not.toBe(80)
    expect(Math.abs(run.ents[0].y - 80)).toBeLessThanOrEqual(20)
  })
})

describe('checkpoints and continue', () => {
  it('anemone saves state, heals, and lights once', () => {
    const level = mkLevel([atFish('pearl'), atFish('anem')])
    const run = createRun(level)
    run.nemo.hp = 1
    const ev = stepRun(run, level, NONE)
    expect(ev).toContain('checkpoint')
    expect(run.nemo.hp).toBe(2)
    expect(run.ents[1].on).toBe(true)
    expect(run.cp).toMatchObject({ score: 10, pearls: 1, stars: 0, gone: [0], on: [1] })
    expect(run.cp.x).toBe(run.ents[1].x)
    expect(run.cp.y).toBe(run.ents[1].y - 12)
    run.nemo.x = 20; run.nemo.y = 80
    expect(stepRun(run, level, NONE)).not.toContain('checkpoint')
    expect(run.nemo.hp).toBe(2)
  })
  it('continueRun restores the checkpoint with hp 3 and invulnerability', () => {
    const level = mkLevel([atFish('anem'), { k: 'pearl', x: 300, y: 80 }, { k: 'urchin', x: 300, y: 120 }])
    const run = createRun(level)
    stepRun(run, level, NONE)
    // pick up a later pearl, then die
    run.score += 10; run.pearls += 1; run.ents[1].gone = true
    run.nemo.hp = 0; run.mode = 'dead'
    run.nemo.x = 500
    expect(continueRun(run, level)).toBe(true)
    expect(run.mode).toBe('play')
    expect(run.nemo).toMatchObject({ hp: 3, inv: 120, vx: 0, vy: 0, x: run.cp.x, y: run.cp.y })
    expect(run.score).toBe(0)
    expect(run.pearls).toBe(0)
    expect(run.ents[1].gone).toBe(false)
    expect(run.ents[0].on).toBe(true)
  })
  it('continueRun keeps pickups made before the checkpoint', () => {
    const level = mkLevel([atFish('pearl'), atFish('anem')])
    const run = createRun(level)
    stepRun(run, level, NONE)
    run.mode = 'dead'
    expect(continueRun(run, level)).toBe(true)
    expect(run.score).toBe(10)
    expect(run.ents[0].gone).toBe(true)
  })
  it('continueRun returns false when not dead', () => {
    const level = mkLevel()
    const run = createRun(level)
    expect(continueRun(run, level)).toBe(false)
    expect(run.mode).toBe('play')
  })
})

describe('goal and clear bonus', () => {
  it('goal clears the level and adds the bonus', () => {
    const level = mkLevel([atFish('goal')])
    const run = createRun(level)
    const ev = stepRun(run, level, NONE)
    expect(ev).toEqual(['clear'])
    expect(run.mode).toBe('clear')
    // 3 hp * 500 + no-hit 1000 + par bonus (60 - 1/60)s * 10 rounded to 10 = 600
    expect(run.bonus).toBe(1500 + 1000 + 600)
    expect(run.score).toBe(run.bonus)
    expect(run.lastScoreAt).toBe(1)
    expect(stepRun(run, level, NONE)).toEqual([])
  })
  it('clearBonus: hp, no-hit and par components', () => {
    const level = mkLevel()
    const run = createRun(level)
    expect(clearBonus(run, level)).toBe(3 * 500 + 1000 + 600)
    run.hits = 1
    run.nemo.hp = 2
    expect(clearBonus(run, level)).toBe(1000 + 600)
    run.t = 30 * 60
    expect(clearBonus(run, level)).toBe(1000 + 300)
    run.t = 90 * 60
    expect(clearBonus(run, level)).toBe(1000)
  })
  it('clearBonus rounds the time bonus to 10', () => {
    const level = mkLevel()
    const run = createRun(level)
    run.hits = 1
    run.nemo.hp = 0
    run.t = Math.round(59.57 * 60) // 0.43s left -> 4.3 -> 0
    expect(clearBonus(run, level)).toBe(0)
    run.t = Math.round(58.7 * 60) // 1.3s -> 13 -> 10
    expect(clearBonus(run, level)).toBe(10)
  })
})

describe('level 6 auto-scroll', () => {
  const chaseLevel = () => mkLevel(
    [{ k: 'shark', x: 0, y: 75, chaser: true, a: 0, b: 0, v: 0 }, { k: 'goal', x: 700, y: 120 }],
    { scroll: { speed0: 1, speed1: 2 }, spawn: { x: 60, y: 80 } },
  )
  it('scrolls and the camera follows scrollX', () => {
    const level = chaseLevel()
    const run = createRun(level)
    const s0 = run.scrollX
    for (let i = 0; i < 10; i++) stepRun(run, level, NONE)
    expect(run.scrollX).toBeGreaterThan(s0 + 9)
    expect(run.cam.x).toBeCloseTo(run.scrollX, 5)
  })
  it('speed ramps up from speed0 toward speed1 with progress', () => {
    const level = chaseLevel()
    const a = createRun(level)
    const s = a.scrollX
    stepRun(a, level, NONE)
    const early = a.scrollX - s
    const b = createRun(level)
    b.nemo.x = 650
    const s2 = b.scrollX
    stepRun(b, level, NONE)
    expect(b.scrollX - s2).toBeGreaterThan(early)
  })
  it('clamps the fish to the left screen edge', () => {
    const level = chaseLevel()
    const run = createRun(level)
    run.nemo.hp = 3
    run.nemo.x = 0
    stepRun(run, level, NONE)
    expect(run.nemo.x).toBeGreaterThanOrEqual(run.scrollX + 4)
  })
  it('the chaser sits behind the edge and bites a fish pressed against it', () => {
    const level = chaseLevel()
    const run = createRun(level)
    run.nemo.x = 0
    stepRun(run, level, NONE)
    expect(run.ents[0].x).toBeCloseTo(run.scrollX - 26, 5)
    expect(run.hits).toBe(1)
  })
  it('does not bite a fish well ahead of the edge', () => {
    const level = chaseLevel()
    const run = createRun(level)
    run.nemo.x = run.scrollX + 60
    stepRun(run, level, NONE)
    expect(run.hits).toBe(0)
  })
  it('scrollX never passes the world end minus the viewport', () => {
    const level = chaseLevel()
    const run = createRun(level)
    run.scrollX = 100 * 8 - 160
    for (let i = 0; i < 5; i++) stepRun(run, level, NONE)
    expect(run.scrollX).toBe(100 * 8 - 160)
  })
})

describe('camera', () => {
  it('is clamped to the world', () => {
    const level = mkLevel()
    const run = createRun(level)
    for (let i = 0; i < 200; i++) stepRun(run, level, { ix: 1, iy: 0 })
    expect(run.cam.x).toBeGreaterThanOrEqual(0)
    expect(run.cam.x).toBeLessThanOrEqual(100 * 8 - 160)
    expect(run.cam.y).toBeGreaterThanOrEqual(0)
    expect(run.cam.y).toBeLessThanOrEqual(24 * 8 - 128)
  })
})

describe('determinism', () => {
  it('same inputs give the same state', () => {
    const level = mkLevel([
      { k: 'jelly', x: 100, y: 80, by: 80, amp: 20, ph: 1 },
      { k: 'pearl', x: 60, y: 84 },
      { k: 'eel', x: 200, y: 100, a: 180, b: 260, v: 0.5 },
    ])
    const play = () => {
      const run = createRun(level)
      for (let i = 0; i < 300; i++) {
        stepRun(run, level, { ix: Math.sin(i / 20), iy: Math.cos(i / 31) * 0.5, dash: i % 70 === 0 })
      }
      return JSON.stringify(run)
    }
    expect(play()).toBe(play())
  })
})

describe('race stats', () => {
  it('reefStatsFrom omits falsy flags', () => {
    const level = mkLevel()
    const run = createRun(level)
    run.score = 130; run.pearls = 13; run.lastScoreAt = 400
    expect(reefStatsFrom(run)).toEqual({ score: 130, pearls: 13, hp: 3, at: 400 })
    run.mode = 'clear'
    expect(reefStatsFrom(run)).toEqual({ score: 130, pearls: 13, hp: 3, at: 400, done: true })
    run.mode = 'dead'; run.nemo.hp = 0
    expect(reefStatsFrom(run)).toEqual({ score: 130, pearls: 13, hp: 0, at: 400, dead: true })
  })

  it('normalizeReefStats clamps and rejects garbage', () => {
    expect(normalizeReefStats(null, 100)).toBeNull()
    expect(normalizeReefStats('x', 100)).toBeNull()
    expect(normalizeReefStats({ score: 9999, pearls: -4, hp: 9, at: 12.6 }, 500))
      .toEqual({ score: 500, pearls: 0, hp: 3, at: 13 })
    expect(normalizeReefStats({ score: 'abc', pearls: NaN, hp: undefined, at: Infinity }, 500))
      .toEqual({ score: 0, pearls: 0, hp: 0, at: 0 })
    expect(normalizeReefStats({ score: 10, done: 'yes', dead: 1 }, 500)).toEqual({ score: 10, pearls: 0, hp: 0, at: 0 })
    expect(normalizeReefStats({ score: 10, done: true, dead: true }, 500))
      .toMatchObject({ done: true, dead: true })
  })

  it('isReefDone is true for done or dead', () => {
    expect(isReefDone(null)).toBe(false)
    expect(isReefDone({ score: 1 })).toBe(false)
    expect(isReefDone({ done: true })).toBe(true)
    expect(isReefDone({ dead: true })).toBe(true)
  })

  const round = { seed: 7 }
  it('reefRaceEntry orders by score desc then earlier at', () => {
    const a = reefRaceEntry({ score: 300, at: 900 }, round)
    const b = reefRaceEntry({ score: 500, at: 2000 }, round)
    const c = reefRaceEntry({ score: 300, at: 100 }, round)
    const cmp = (x, y) => x.sortKey[0] - y.sortKey[0] || x.sortKey[1] - y.sortKey[1]
    expect([a, b, c].sort(cmp)).toEqual([b, c, a])
    expect(b.score).toBe(500)
  })
  it('reefRaceEntry has null sortKey with no stats and clamps to the level max', () => {
    expect(reefRaceEntry(null, round).sortKey).toBeNull()
    expect(reefRaceEntry(undefined, round).sortKey).toBeNull()
    const e = reefRaceEntry({ score: 99999, at: 5 }, round)
    expect(e.score).toBe(1000)
    expect(e.sortKey).toEqual([-1000, 5])
  })

  it('reefRow statuses', () => {
    expect(reefRow(null, round)).toMatchObject({ status: 'idle', progress: null })
    const racing = reefRow({ score: 1230, pearls: 37, hp: 2, at: 10 }, round)
    expect(racing).toMatchObject({ primary: '1000 PTS', secondary: '37 PEARLS', status: 'racing', progress: null })
    expect(reefRow({ score: 120, pearls: 37, hp: 2, at: 10 }, round).primary).toBe('120 PTS')
    expect(reefRow({ score: 120, pearls: 3, hp: 3, at: 10, done: true }, round)).toMatchObject({ status: 'done', detail: '✓' })
    expect(reefRow({ score: 120, pearls: 3, hp: 0, at: 10, dead: true }, round)).toMatchObject({ status: 'out', detail: 'OUT' })
  })
})
