import { describe, expect, it } from 'vitest'
import {
  CAM_FRACTION, CAM_LOOKAHEAD, CRUMBLE_COUNT, CURSED_BOUNCE, CURSED_V, FEATHER_MS, GATE_EVERY, GRAVITY, HOPPER_H,
  HOPPER_W, JUMP_V, MAX_CHAIN_GAP, MAX_JUMP_H, PLAT_W, SPRING_V, STEP_DT, SUMMIT_Y, UNITS_PER_M, VENT_H, VENT_W,
  VIEW_H, WORLD_W, COOP_GOAL_Y, COOP_LIVES,
  advanceRun, botInput, cameraTarget, checkpointFor, closedGateAbove, coopOutcome, createRun, curseAhead,
  curseTargets, dragInput,
  generateTower, getUpdraftMode, keysEarned, hazardForPickup, normalizeHazards, normalizeKeys, normalizeSeat,
  platformX, raceOutcome, respawnRun, seededRng, stepRun, tiltInput, toMetres, updraftFreshState, wrapDx,
} from './updraftLogic'

const seat = (over = {}) => ({ y: 0, best: 0, dead: false, top: false, ...over })

/** Run the bot for up to `secs` seconds; returns the final run. */
function botClimb(tower, secs, skill = 1, env = {}) {
  let run = createRun()
  for (let t = 0; t < secs && !run.dead && !run.top; t += STEP_DT) {
    run = stepRun(run, tower, botInput(run, tower, skill), STEP_DT, env).run
  }
  return run
}

describe('seededRng / generateTower', () => {
  it('is deterministic per seed', () => {
    expect(generateTower(42)).toEqual(generateTower(42))
    expect(generateTower(42)).not.toEqual(generateTower(43))
    const a = seededRng(7)
    const b = seededRng(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('keeps every chain gap climbable and platforms inside the world', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = generateTower(seed)
      const chain = t.platforms.filter(p => p.chain)
      for (let i = 1; i < chain.length; i++) {
        expect(chain[i].y - chain[i - 1].y).toBeLessThanOrEqual(MAX_CHAIN_GAP + 1)
      }
      expect(MAX_CHAIN_GAP).toBeLessThan(MAX_JUMP_H)
      expect(chain.at(-1).y).toBeGreaterThanOrEqual(SUMMIT_Y)
      // The curve steepens: the last stretch reaches for the widest gaps.
      const high = chain.filter(p => p.y > SUMMIT_Y * 0.85)
      expect(Math.max(...high.slice(1).map((p, i) => p.y - high[i].y))).toBeGreaterThan(MAX_CHAIN_GAP - 25)
      for (const p of t.platforms) {
        for (const time of [0, 0.7, 3.3]) {
          const x = platformX(p, time)
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x + PLAT_W).toBeLessThanOrEqual(WORLD_W)
        }
      }
    }
  })

  it('never makes a crumble platform part of the guaranteed chain', () => {
    const t = generateTower(9)
    expect(t.platforms.some(p => p.kind === 'crumble')).toBe(true)
    expect(t.platforms.filter(p => p.chain).every(p => p.kind !== 'crumble')).toBe(true)
  })

  it('sorts platforms by height', () => {
    const { platforms } = generateTower(5)
    for (let i = 1; i < platforms.length; i++) expect(platforms[i].y).toBeGreaterThanOrEqual(platforms[i - 1].y)
  })

  it('places pickups without changing the platform layout', () => {
    const t = generateTower(11)
    expect(t.pickups.filter(k => k.kind === 'gem').length).toBeGreaterThan(3)
    expect(t.pickups.some(k => k.kind === 'feather')).toBe(true)
    expect(new Set(t.pickups.map(k => k.id)).size).toBe(t.pickups.length)
    expect(t.gates).toEqual([])
    const coop = generateTower(11, { coop: true, top: COOP_GOAL_Y })
    expect(coop.gates).toEqual([1, 2, 3, 4].map(g => g * GATE_EVERY))
    expect(GATE_EVERY / UNITS_PER_M).toBe(60)
    expect(coop.keys.map(k => k.gate)).toEqual([1, 2, 3, 4])
    coop.keys.forEach((k, i) => expect(k.y).toBeLessThan(coop.gates[i]))
    // Co-op gems are BOOSTs, and the co-op tower has no feathers.
    expect(coop.pickups.length).toBeGreaterThan(0)
    expect(coop.pickups.every(k => k.kind === 'boost')).toBe(true)
  })

  it('adds vents and feathers without touching the chain, so MAX_CHAIN_GAP still holds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = generateTower(seed)
      expect(t.vents.length).toBeGreaterThan(2)
      for (const v of t.vents) {
        expect(v.x).toBeGreaterThanOrEqual(0)
        expect(v.x + VENT_W).toBeLessThanOrEqual(WORLD_W)
        expect(v.y + VENT_H).toBeLessThan(SUMMIT_Y)
      }
      // The platforms are the same with or without the new kinds' streams.
      const bare = generateTower(seed, { coop: true })
      expect(bare.platforms).toEqual(t.platforms)
      const chain = t.platforms.filter(p => p.chain)
      for (let i = 1; i < chain.length; i++) expect(chain[i].y - chain[i - 1].y).toBeLessThanOrEqual(MAX_CHAIN_GAP + 1)
    }
  })
})

describe('stepRun physics', () => {
  it('bounces off the start platform to a normal jump height, independent of frame size', () => {
    const tower = { seed: 0, top: 10_000, platforms: [{ id: 0, x: 150, y: 0, kind: 'normal', chain: true }], pickups: [], gates: [], keys: [] }
    const peak = (dt) => {
      let run = createRun()
      let best = 0
      for (let t = 0; t < 1.5; t += dt) {
        run = stepRun(run, tower, 0, dt).run
        best = Math.max(best, run.y)
      }
      return best
    }
    // The page always steps at STEP_DT; one step size must give one arc.
    expect(peak(STEP_DT)).toBeCloseTo(MAX_JUMP_H, -1)
    const viaAdvance = (frame) => {
      let run = createRun()
      let acc = 0
      let best = 0
      for (let t = 0; t < 1.5; t += frame) {
        const out = advanceRun(run, tower, () => 0, acc, frame, () => ({}))
        run = out.run
        acc = out.acc
        best = Math.max(best, run.y)
      }
      return best
    }
    // 60 Hz and 120 Hz displays reach the same apex.
    expect(Math.abs(viaAdvance(1 / 60) - viaAdvance(1 / 120))).toBeLessThan(2)
  })

  it('lands only when falling onto a platform, and springs launch higher', () => {
    const tower = {
      seed: 0, top: 10_000, pickups: [], gates: [], keys: [],
      platforms: [{ id: 0, x: 150, y: 0, kind: 'spring', chain: true }],
    }
    const run = { ...createRun(), x: 160, y: 1, vy: -300 }
    const out = stepRun(run, tower, 0, STEP_DT)
    expect(out.run.y).toBe(0)
    expect(out.run.vy).toBe(SPRING_V)
    expect(out.events).toEqual([{ type: 'bounce', kind: 'spring' }])
    const rising = stepRun({ ...run, y: -2, vy: 300 }, tower, 0, STEP_DT)
    expect(rising.events).toEqual([])
  })

  it('misses a platform the hopper is not over', () => {
    const tower = { seed: 0, top: 10_000, pickups: [], gates: [], keys: [], platforms: [{ id: 0, x: 0, y: 0, kind: 'normal', chain: true }] }
    const out = stepRun({ ...createRun(), x: 200, y: 1, vy: -300 }, tower, 0, STEP_DT)
    expect(out.run.y).toBeLessThan(0)
  })

  it('a cursed platform gives a lower bounce than a normal one', () => {
    const tower = { seed: 0, top: 10_000, pickups: [], gates: [], keys: [], platforms: [{ id: 5, x: 150, y: 300, kind: 'normal', chain: true }] }
    const fresh = { ...createRun(), x: 160, y: 301, vy: -300 }
    const normal = stepRun(fresh, tower, 0, STEP_DT).run
    const cursed = stepRun({ ...fresh, cursed: { 5: true } }, tower, 0, STEP_DT).run
    expect(normal.vy).toBe(JUMP_V)
    expect(cursed.vy).toBe(CURSED_V)
    expect(cursed.vy).toBeLessThan(normal.vy)
    // 60% of a normal bounce's height.
    expect(cursed.vy ** 2 / (2 * GRAVITY)).toBeCloseTo(CURSED_BOUNCE * MAX_JUMP_H, 5)
    expect(CURSED_BOUNCE).toBe(0.6)
  })

  it('breaks crumble and cursed platforms after one bounce', () => {
    const tower = {
      seed: 0, top: 10_000, pickups: [], gates: [], keys: [],
      platforms: [{ id: 4, x: 150, y: 100, kind: 'crumble', chain: false }, { id: 5, x: 150, y: 300, kind: 'normal', chain: true }],
    }
    const a = stepRun({ ...createRun(), x: 160, y: 101, vy: -300 }, tower, 0, STEP_DT)
    expect(a.run.broken[4]).toBe(true)
    const b = stepRun({ ...createRun(), x: 160, y: 301, vy: -300, cursed: { 5: true } }, tower, 0, STEP_DT)
    expect(b.run.broken[5]).toBe(true)
    expect(b.events[0]).toEqual({ type: 'bounce', kind: 'crumble' })
    const c = stepRun({ ...b.run, y: 301, vy: -300 }, tower, 0, STEP_DT)
    expect(c.run.y).toBeLessThan(300)
  })

  it('wraps horizontally', () => {
    const tower = generateTower(1)
    const left = stepRun({ ...createRun(), x: -HOPPER_W / 2 + 0.5, y: 50, vy: 400 }, tower, -1, STEP_DT)
    expect(left.run.x).toBeGreaterThan(WORLD_W / 2)
    const right = stepRun({ ...createRun(), x: WORLD_W - HOPPER_W / 2 - 0.5, y: 50, vy: 400 }, tower, 1, STEP_DT)
    expect(right.run.x).toBeLessThan(WORLD_W / 2)
  })

  it('falls to death once below the camera, and stops at the goal', () => {
    const tower = { seed: 0, top: 10_000, pickups: [], gates: [], keys: [], platforms: [] }
    const fall = stepRun({ ...createRun(), y: 500, vy: -2000, camY: 520 }, tower, 0, STEP_DT)
    expect(fall.run.dead).toBe(true)
    expect(fall.events).toContainEqual({ type: 'fall' })
    const top = stepRun({ ...createRun(), y: SUMMIT_Y - 1, vy: 500 }, tower, 0, STEP_DT, { goal: SUMMIT_Y })
    expect(top.run.top).toBe(true)
    expect(top.run.best).toBe(SUMMIT_Y)
    // A finished run no longer moves.
    expect(stepRun(top.run, tower, 1, STEP_DT).run).toBe(top.run)
  })

  it('camera eases up toward its target and never moves down', () => {
    const tower = { seed: 0, top: 100_000, pickups: [], gates: [], keys: [], platforms: [] }
    let run = { ...createRun(), y: 1000, vy: 10, camY: 0 }
    const first = stepRun(run, tower, 0, STEP_DT).run
    expect(first.camY).toBeGreaterThan(0)
    expect(first.camY).toBeLessThan(1000 - VIEW_H * CAM_FRACTION) // eased, not snapped
    for (let i = 0; i < 360; i++) run = stepRun({ ...run, y: 1000, vy: 10 }, tower, 0, STEP_DT).run
    expect(run.camY).toBeCloseTo(1000 - VIEW_H * CAM_FRACTION, 0)
    const down = stepRun({ ...run, y: 900, vy: -10 }, tower, 0, STEP_DT)
    expect(down.run.camY).toBe(run.camY)
  })

  it('camera looks further ahead while a launch is rising', () => {
    expect(cameraTarget(1000, JUMP_V)).toBe(1000 - VIEW_H * CAM_FRACTION)
    expect(cameraTarget(1000, SPRING_V)).toBe(1000 - VIEW_H * CAM_LOOKAHEAD)
  })

  it('a vent lifts a hopper flying through it', () => {
    const vents = [{ id: 0, x: 150, y: 100 }]
    const tower = { seed: 0, top: 10_000, pickups: [], gates: [], keys: [], platforms: [], vents }
    const run = { ...createRun(), x: 160, y: 150, vy: -200 }
    const out = stepRun(run, tower, 0, STEP_DT)
    expect(out.run.vy).toBeGreaterThan(run.vy)
    expect(out.events).toContainEqual({ type: 'vent', id: 0 })
    const outside = stepRun({ ...run, x: 20 }, { ...tower }, 0, STEP_DT)
    expect(outside.run.vy).toBeLessThan(run.vy)
    // Entering once is one event.
    expect(stepRun(out.run, tower, 0, STEP_DT).events).toEqual([])
  })

  it('a feather floats the hopper for a while', () => {
    const tower = { seed: 0, top: 10_000, gates: [], keys: [], platforms: [], pickups: [{ id: 0, x: 180, y: 110, kind: 'feather' }] }
    const run = { ...createRun(), x: 180 - HOPPER_W / 2, y: 100, vy: 10 }
    const got = stepRun(run, tower, 0, STEP_DT, { pickups: ['feather'] })
    expect(got.events).toEqual([{ type: 'pickup', id: 0, kind: 'feather' }])
    expect(got.run.floatUntil).toBeCloseTo(STEP_DT + FEATHER_MS / 1000, 5)
    const floaty = stepRun(got.run, tower, 0, STEP_DT).run
    const plain = stepRun({ ...got.run, floatUntil: 0 }, tower, 0, STEP_DT).run
    expect(got.run.vy - floaty.vy).toBeLessThan(got.run.vy - plain.vy)
  })

  it('a BOOST turns the next landing into a spring launch', () => {
    const tower = { seed: 0, top: 10_000, pickups: [], gates: [], keys: [], platforms: [{ id: 0, x: 150, y: 0, kind: 'normal', chain: true }] }
    const run = { ...createRun(), x: 160, y: 1, vy: -300, boost: 1 }
    const out = stepRun(run, tower, 0, STEP_DT)
    expect(out.run.vy).toBe(SPRING_V)
    expect(out.run.boost).toBe(0)
    expect(out.run.springs).toBe(1)
    expect(out.events).toEqual([{ type: 'bounce', kind: 'boost' }])
    expect(out.run.land).toMatchObject({ t: STEP_DT, kind: 'boost', id: 0, y: 0 })
    expect(stepRun({ ...out.run, y: 1, vy: -300 }, tower, 0, STEP_DT).run.vy).toBe(JUMP_V)
  })

  it('applies gust drift sideways', () => {
    const tower = generateTower(3)
    const out = stepRun({ ...createRun(), y: 100, vy: 100 }, tower, 0, 0.1, { drift: 140 })
    expect(out.run.x - createRun().x).toBeCloseTo(14, 5)
  })

  it('collects pickups only of the enabled kinds, once each', () => {
    const tower = { seed: 0, top: 10_000, gates: [], keys: [], platforms: [], pickups: [{ id: 0, x: 180, y: 110, kind: 'gem' }] }
    const run = { ...createRun(), x: 180 - HOPPER_W / 2, y: 100, vy: 10 }
    expect(stepRun(run, tower, 0, STEP_DT).events).toEqual([])
    expect(stepRun(run, tower, 0, STEP_DT, { pickups: ['feather'] }).events).toEqual([])
    const got = stepRun(run, tower, 0, STEP_DT, { pickups: ['gem'] })
    expect(got.events).toEqual([{ type: 'pickup', id: 0, kind: 'gem' }])
    expect(stepRun({ ...got.run, vy: 10 }, tower, 0, STEP_DT, { pickups: ['gem'] }).events).toEqual([])
  })
})

describe('bot', () => {
  it('a full-skill ghost reaches the summit on many seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const run = botClimb(generateTower(seed), 120, 1, { goal: SUMMIT_Y })
      expect(run.top).toBe(true)
    }
  })

  it('an easier ghost is never faster than the full-skill one', () => {
    const tower = generateTower(4)
    const time = (skill) => botClimb(tower, 120, skill, { goal: SUMMIT_Y }).t
    expect(time(0.5)).toBeGreaterThanOrEqual(time(1) - 0.5)
  })

  it('wrapDx takes the short way round', () => {
    expect(wrapDx(10, 350)).toBe(-20)
    expect(wrapDx(350, 10)).toBe(20)
    expect(wrapDx(100, 150)).toBe(50)
  })
})

describe('input mapping', () => {
  it('drag chases the finger with a deadzone', () => {
    const hx = 100 - HOPPER_W / 2
    expect(dragInput(100, hx)).toBe(0)
    expect(dragInput(300, hx)).toBe(1)
    expect(dragInput(0, hx)).toBe(-1)
    expect(dragInput(118, hx)).toBeCloseTo(0.5, 5)
  })

  it('tilt maps roll to [-1, 1] with a deadzone', () => {
    expect(tiltInput(2)).toBe(0)
    expect(tiltInput(11)).toBeCloseTo(0.5, 5)
    expect(tiltInput(-60)).toBe(-1)
    expect(tiltInput(null)).toBe(0)
  })
})

describe('hazards', () => {
  it('curseAhead marks the next solid platforms above the hopper', () => {
    const tower = generateTower(8)
    const run = { ...createRun(), y: 300 }
    const cursed = curseAhead(run, tower).cursed
    const ids = Object.keys(cursed).map(Number)
    expect(ids).toHaveLength(CRUMBLE_COUNT)
    for (const id of ids) {
      const p = tower.platforms.find(q => q.id === id)
      expect(p.y).toBeGreaterThan(300)
      expect(p.kind).not.toBe('crumble')
    }
  })

  it('curseAhead curses the telegraphed targets while they are still ahead', () => {
    const tower = generateTower(8)
    const run = { ...createRun(), y: 300 }
    const ids = curseTargets(run, tower)
    expect(ids).toHaveLength(CRUMBLE_COUNT)
    expect(Object.keys(curseAhead(run, tower, ids).cursed).map(Number)).toEqual(ids)
    // Climbed past them during the warning: the next ones above get it instead.
    const higher = { ...run, y: 2000 }
    const late = Object.keys(curseAhead(higher, tower, ids).cursed).map(Number)
    expect(late).toEqual(curseTargets(higher, tower))
  })

  it('hazardForPickup is deterministic and valid', () => {
    expect(hazardForPickup(5, 2)).toBe(hazardForPickup(5, 2))
    const kinds = new Set(Array.from({ length: 30 }, (_, i) => hazardForPickup(99, i)))
    expect([...kinds].every(k => ['crumble', 'gust', 'fog'].includes(k))).toBe(true)
    expect(kinds.size).toBe(3)
  })

  it('normalizeHazards drops junk and orders by time', () => {
    expect(normalizeHazards(null)).toEqual([])
    expect(normalizeHazards({ b: { k: 'fog', at: 20 }, a: { k: 'gust', at: 10 }, c: { k: 'nuke', at: 5 }, d: 'x', e: { k: 'boost', at: 30 } }))
      .toEqual([{ id: 'a', k: 'gust', at: 10 }, { id: 'b', k: 'fog', at: 20 }, { id: 'e', k: 'boost', at: 30 }])
  })
})

describe('co-op gates', () => {
  const tower = generateTower(21, { coop: true, top: COOP_GOAL_Y })

  it('the first closed gate above the hopper is a ceiling until the partner grabs its key', () => {
    expect(closedGateAbove(tower, 0, {})).toBe(GATE_EVERY)
    expect(closedGateAbove(tower, 0, { 1: true })).toBe(2 * GATE_EVERY)
    expect(closedGateAbove(tower, GATE_EVERY + 10, { 1: true, 2: true })).toBe(3 * GATE_EVERY)
    expect(closedGateAbove(tower, 0, { 1: true, 2: true, 3: true, 4: true })).toBe(null)
  })

  it('a closed gate stops a rising hopper', () => {
    const run = { ...createRun(), y: GATE_EVERY - HOPPER_H - 2, vy: 600 }
    const out = stepRun(run, tower, 0, STEP_DT, { ceiling: GATE_EVERY })
    expect(out.run.y + HOPPER_H).toBeLessThanOrEqual(GATE_EVERY)
    expect(out.run.vy).toBe(0)
  })

  it('earns a key by grabbing it or by climbing past its gate', () => {
    expect(keysEarned(tower, createRun())).toEqual([])
    expect(keysEarned(tower, { ...createRun(), keys: { 2: true } })).toEqual([2])
    expect(keysEarned(tower, { ...createRun(), best: 2 * GATE_EVERY, keys: { 3: true } })).toEqual([1, 2, 3])
  })

  it('grabs a key once', () => {
    const k = tower.keys[0]
    const run = { ...createRun(), x: k.x - HOPPER_W / 2, y: k.y - 5, vy: 10 }
    const got = stepRun(run, tower, 0, STEP_DT)
    expect(got.events).toContainEqual({ type: 'key', gate: 1 })
    expect(got.run.keys[1]).toBe(true)
  })

  it('checkpoints at the last gate passed and respawns on a solid platform below it', () => {
    expect(checkpointFor(tower, 0)).toBe(0)
    expect(checkpointFor(tower, 2 * GATE_EVERY + 200)).toBe(2 * GATE_EVERY)
    const back = respawnRun({ ...createRun(), dead: true, camY: 2 * GATE_EVERY + 500 }, tower, 2 * GATE_EVERY)
    expect(back.dead).toBe(false)
    expect(back.y).toBeLessThanOrEqual(2 * GATE_EVERY)
    expect(back.camY).toBeLessThan(back.y)
    expect(back.vy).toBe(JUMP_V)
    const p = tower.platforms.find(q => q.y === back.y)
    expect(p && p.kind !== 'crumble' && p.kind !== 'moving').toBe(true)
  })

  it('a bot with its partner holding every key climbs to the co-op goal', () => {
    const all = { 1: true, 2: true, 3: true, 4: true }
    let run = createRun()
    for (let t = 0; t < 120 && !run.dead && !run.top; t += STEP_DT) {
      run = stepRun(run, tower, botInput(run, tower), STEP_DT, { goal: COOP_GOAL_Y, ceiling: closedGateAbove(tower, run.y, all) }).run
    }
    expect(run.top).toBe(true)
  })
})

describe('outcomes', () => {
  it('summit first wins', () => {
    expect(raceOutcome({ X: seat({ top: true, best: SUMMIT_Y }), O: seat({ best: 3000 }) })).toBe('X')
    expect(raceOutcome({ X: seat(), O: seat({ top: true }) })).toBe('O')
    expect(raceOutcome({ X: seat({ top: true }), O: seat({ top: true }) })).toBe(null)
  })

  it('a faller loses only once the survivor passes them', () => {
    const m = UNITS_PER_M
    expect(raceOutcome({ X: seat({ dead: true, best: 120 * m }), O: seat({ best: 110 * m }) })).toBe(null)
    expect(raceOutcome({ X: seat({ dead: true, best: 120 * m }), O: seat({ best: 121 * m }) })).toBe('O')
    expect(raceOutcome({ X: seat({ best: 100 * m - 1 }), O: seat({ dead: true, best: 99 * m }) })).toBe(null) // same metre
  })

  it('both fallen or time up: higher best wins, same metre draws', () => {
    expect(raceOutcome({ X: seat({ dead: true, best: 800 }), O: seat({ dead: true, best: 700 }) })).toBe('X')
    expect(raceOutcome({ X: seat({ dead: true, best: 805 }), O: seat({ dead: true, best: 809 }) })).toBe('draw')
    expect(raceOutcome({ X: seat({ best: 400 }), O: seat({ best: 900 }) }, { timeUp: true })).toBe('O')
  })

  it('co-op clears when both top out, fails on no lives or time', () => {
    expect(coopOutcome({ X: seat({ top: true }), O: seat({ top: true }), lives: 1 })).toBe('cleared')
    expect(coopOutcome({ X: seat({ top: true }), O: seat(), lives: 0 })).toBe('failed')
    expect(coopOutcome({ X: seat(), O: seat(), lives: 2 }, { timeUp: true })).toBe('failed')
    expect(coopOutcome({ X: seat(), O: seat(), lives: 2 })).toBe(null)
  })
})

describe('firebase shapes', () => {
  it('normalizeSeat reads junk as a fresh climber', () => {
    expect(normalizeSeat(undefined)).toEqual(seat())
    expect(normalizeSeat({ y: '12', best: -3, dead: 'yes', top: true })).toEqual({ y: 12, best: 0, dead: false, top: true })
  })

  it('normalizeKeys maps by parsed key, never position', () => {
    expect(normalizeKeys({ 3: true, 1: true, 0: true, x: true, 2: false })).toEqual({ 1: true, 3: true })
    expect(normalizeKeys([null, true, null, true])).toEqual({ 1: true, 3: true })
  })

  it('toMetres floors to whole metres', () => {
    expect(toMetres(123 * UNITS_PER_M + UNITS_PER_M - 1)).toBe(123)
    expect(toMetres(-5)).toBe(0)
  })

  it('fresh state keeps the host mode across a rematch only', () => {
    expect(updraftFreshState(null).updraft.mode).toBe('chaos')
    expect(updraftFreshState({ gameType: 'updraft', updraft: { mode: 'pure' } }).updraft.mode).toBe('pure')
    expect(updraftFreshState({ gameType: 'pong', updraft: { mode: 'pure' } }).updraft.mode).toBe('chaos')
    const coop = updraftFreshState(null, { coop: true }).updraft
    expect(coop.lives).toBe(COOP_LIVES)
    expect(coop.mode).toBeUndefined()
    expect(getUpdraftMode('bogus')).toBe('chaos')
  })

  it('constants agree with the physics', () => {
    expect(MAX_JUMP_H).toBeCloseTo((JUMP_V * JUMP_V) / (2 * GRAVITY), 5)
  })
})
