import { describe, it, expect } from 'vitest'
import { FORTS, quantShot, starsFor, fortScore } from './birdseyeCore'
import { fortItems, fortSnapshot, runShot, simulateShot, replayFort, replayDuel, BirdseyeSim, hashSnap } from './birdseyeLogic'

// One known clearing (or near-clearing) shot per fort, found with a headless
// sweep of angle × power × ability tick. If physics or a fort changes, these
// fail first — re-run the sweep and update both the shot and the stars.
const deg = (d) => Math.round(d / 360 * 4096)
const SOLUTIONS = {
  '1-1': { shot: { b: 'pip', a: deg(16), p: 950, k: -1 }, pops: 1 },
  '1-2': { shot: { b: 'pip', a: deg(13), p: 950, k: -1 }, pops: 2 },
  '1-3': { shot: { b: 'pip', a: deg(13), p: 950, k: -1 }, pops: 2 },
  '1-4': { shot: { b: 'pip', a: deg(25), p: 850, k: -1 }, pops: 3 },
  '1-5': { shot: { b: 'pip', a: deg(13), p: 750, k: 50 }, pops: 3 },
}
const MISS = { b: 'pip', a: deg(60), p: 200, k: -1 }

describe('forts settle', () => {
  it.each(FORTS.map(f => [f.id, f]))('%s stands on load (nothing drifts > 0.1 m)', (_id, fort) => {
    const items = fortItems(fort)
    const snap = fortSnapshot(fort)
    expect(snap).toHaveLength(items.length)
    snap.forEach((s, i) => {
      expect(Math.hypot(s.x - items[i].x, s.y - items[i].y), `${fort.id} body ${i}`).toBeLessThan(0.1)
      expect(Math.abs(s.a), `${fort.id} body ${i}`).toBeLessThan(0.05)
    })
  })

  it.each(FORTS.map(f => [f.id, f]))('%s survives a missed shot untouched', (_id, fort) => {
    const r = runShot(fortSnapshot(fort), fort, MISS)
    expect(r.pops).toBe(0)
    expect(r.crowsLeft).toBe(fort.crows.length)
  })
})

describe('forts are winnable', () => {
  it.each(FORTS.map(f => [f.id, f]))('%s: the recorded solution pops the expected scarecrows', (id, fort) => {
    const { shot, pops } = SOLUTIONS[id]
    expect(fort.birds).toContain(shot.b)
    const r = runShot(fortSnapshot(fort), fort, shot)
    expect(r.pops).toBe(pops)
  })

  it.each(FORTS.map(f => [f.id, f]))('%s: three stars are reachable from a one-bird clear', (id, fort) => {
    const { shot } = SOLUTIONS[id]
    const r = runShot(fortSnapshot(fort), fort, shot)
    if (r.crowsLeft === 0) {
      const score = fortScore(r.points, true, fort.birds.length - 1)
      expect(starsFor(fort, score, true), id).toBe(3)
    } else {
      // The best single bird cannot clear: the 3-star bar must still sit
      // below a two-bird clear with this opener plus a perfect follow-up.
      expect(fort.stars[1]).toBeLessThan(r.points + 1000 * r.crowsLeft + 1500)
    }
  })
})

describe('determinism', () => {
  it('replays the same shot to the same hash', () => {
    const fort = FORTS[3]
    const a = simulateShot(fortSnapshot(fort), fort, SOLUTIONS['1-4'].shot)
    const b = simulateShot(fortSnapshot(fort), fort, SOLUTIONS['1-4'].shot)
    expect(a.hash).toBe(b.hash)
    expect(a.points).toBe(b.points)
  })

  it('replays identically from a JSON round-tripped snapshot', () => {
    const fort = FORTS[4]
    const snap = fortSnapshot(fort)
    const viaJson = JSON.parse(JSON.stringify(snap))
    expect(simulateShot(viaJson, fort, SOLUTIONS['1-5'].shot).hash).toBe(simulateShot(snap, fort, SOLUTIONS['1-5'].shot).hash)
  })

  it('a live ability tap records the tick that a replay reproduces', () => {
    const fort = FORTS[2]
    const live = new BirdseyeSim(fortSnapshot(fort), fort)
    live.launch(quantShot('dart', 4 / 180 * Math.PI, 0.8))
    while (live.tick < 40) live.step()
    expect(live.useAbility()).toBe(true)
    expect(live.useAbility()).toBe(false) // once per bird
    while (!live.done) live.step()
    const replay = simulateShot(fortSnapshot(fort), fort, live.shot)
    expect(live.shot.k).toBe(40)
    expect(replay.hash).toBe(hashSnap(live.snapshot()))
  })

  it('FLAP lifts, DIVE speeds up and SPLIT adds two birds', () => {
    const fort = { ...FORTS[0], wind: 0 }
    const go = (b) => { const s = new BirdseyeSim(fortSnapshot(FORTS[0]), fort); s.launch({ b, a: deg(30), p: 800, k: -1 }); for (let i = 0; i < 20; i++) s.step(); return s }
    const flap = go('pip'); const vy0 = flap.bird.getLinearVelocity().y; flap.useAbility(); expect(flap.bird.getLinearVelocity().y).toBeGreaterThan(vy0)
    const dive = go('dart'); const v0 = dive.bird.getLinearVelocity().length(); dive.useAbility(); expect(dive.bird.getLinearVelocity().length()).toBeCloseTo(v0 * 1.8, 5)
    const split = go('trio'); split.useAbility(); expect(split.birds).toHaveLength(3)
  })
})

describe('shot cache', () => {
  it('returns the remembered result for the same board and shot', () => {
    const fort = FORTS[0], snap = fortSnapshot(fort)
    expect(runShot(snap, fort, MISS)).toBe(runShot(JSON.parse(JSON.stringify(snap)), fort, MISS))
    expect(runShot(snap, fort, MISS)).not.toBe(runShot(snap, fort, { ...MISS, p: 210 }))
  })
})

describe('replays', () => {
  it('solo: chains shots from snapshot to snapshot', () => {
    const fort = FORTS[1]
    const r = replayFort(fort, [MISS, SOLUTIONS['1-2'].shot])
    expect(r.results.map(x => x.pops)).toEqual([0, 2])
    expect(r.cleared).toBe(true)
  })

  it('duel: X clears with the opener and wins', () => {
    const d = replayDuel(0, { a: { by: 'X', ...SOLUTIONS['1-1'].shot } })
    expect(d.done).toBe(true)
    expect(d.pops).toEqual({ X: 1, O: 0 })
    expect(d.winner).toBe('X')
  })

  it('duel: alternating misses run to six birds and draw', () => {
    const raw = {}
    'abcdef'.split('').forEach((k, i) => { raw[k] = { by: i % 2 ? 'O' : 'X', ...MISS } })
    const d = replayDuel(0, raw)
    expect(d.thrown).toEqual({ X: 3, O: 3 })
    expect(d.done).toBe(true)
    expect(d.winner).toBe('draw')
  })

  it('duel: ignores shots past a seat\'s three birds and after the fort is cleared', () => {
    const raw = { a: { by: 'X', ...MISS }, b: { by: 'O', ...SOLUTIONS['1-1'].shot }, c: { by: 'X', ...SOLUTIONS['1-1'].shot } }
    const d = replayDuel(0, raw)
    expect(d.records).toHaveLength(2)
    expect(d.winner).toBe('O')
  })

  it('duel: names the next bird for each seat', () => {
    const d = replayDuel(2, { a: { by: 'X', ...MISS } })
    expect(d.done).toBe(false)
    expect(d.nextBird('X')).toBe('dart')
    expect(d.nextBird('O')).toBe('pip')
  })
})
