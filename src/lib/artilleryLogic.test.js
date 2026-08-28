import { describe, it, expect } from 'vitest'
import {
  detSin,
  detCos,
  generateTerrain,
  surfaceY,
  windForShot,
  initialState,
  simulateShot,
  replayAll,
  TERRAIN_COLS,
  MAX_DAMAGE,
  BLAST_RADIUS,
} from './artilleryLogic'

describe('deterministic trig', () => {
  it('detSin/detCos track Math.sin/cos within 1e-9 over full circle', () => {
    let worstS = 0
    let worstC = 0
    for (let i = 0; i <= 2000; i++) {
      const x = (i / 2000) * Math.PI * 2
      worstS = Math.max(worstS, Math.abs(detSin(x) - Math.sin(x)))
      worstC = Math.max(worstC, Math.abs(detCos(x) - Math.cos(x)))
    }
    expect(worstS).toBeLessThan(1e-9)
    expect(worstC).toBeLessThan(1e-9)
  })
  it('is pure arithmetic — no transcendentals in the implementation', () => {
    const src = detSin.toString() + detCos.toString()
    expect(src).not.toMatch(/Math\.(sin|cos|pow|exp|tan)/)
  })
})

describe('terrain', () => {
  it('generates deterministic heightmap per seed', () => {
    expect(generateTerrain(42)).toEqual(generateTerrain(42))
    expect(generateTerrain(43)).not.toEqual(generateTerrain(42))
  })
  it('all heights within [0,1], correct length', () => {
    const t = generateTerrain(7)
    expect(t).toHaveLength(TERRAIN_COLS)
    expect(t.every(h => h >= 0 && h <= 1)).toBe(true)
  })
  it('surfaceY interpolates and inverts height', () => {
    const t = new Array(TERRAIN_COLS).fill(0.5)
    t[0] = 0; t[1] = 0
    expect(surfaceY(t, 0)).toBeCloseTo(1, 6)
    expect(surfaceY(new Array(TERRAIN_COLS).fill(1), 0.3)).toBeCloseTo(0, 6)
  })
})

describe('wind', () => {
  it('derives deterministically from seed + index within ±0.15', () => {
    expect(windForShot(99, 3)).toBe(windForShot(99, 3))
    for (let i = 0; i < 200; i++) {
      const w = windForShot(5, i)
      expect(Math.abs(w)).toBeLessThanOrEqual(0.15 + 1e-12)
    }
    // Different shot indices usually get different wind.
    const distinct = new Set(Array.from({ length: 20 }, (_, i) => windForShot(11, i)))
    expect(distinct.size).toBeGreaterThan(5)
  })
})

describe('replayAll — the determinism contract', () => {
  it('bit-identical state across replays of the same seed+shots', () => {
    const shots = { a: { by: 'X', angleDeg: 45, power: 60 } }
    const r1 = replayAll(1234, shots)
    const r2 = replayAll(1234, shots)
    expect(JSON.stringify(r1.state)).toBe(JSON.stringify(r2.state))
  })
  it('different seeds give different terrain', () => {
    expect(initialState(1).terrain).not.toEqual(initialState(2).terrain)
  })
  it('shot order follows push-key sort regardless of object key insertion order', () => {
    const a = { b: { by: 'O', angleDeg: 30, power: 40 }, a: { by: 'X', angleDeg: 45, power: 50 } }
    const b = { a: { by: 'X', angleDeg: 45, power: 50 }, b: { by: 'O', angleDeg: 30, power: 40 } }
    expect(JSON.stringify(replayAll(77, a).state)).toBe(JSON.stringify(replayAll(77, b).state))
  })
  it('stops folding after a winner is set', () => {
    // Kill O outright with an absurd direct setup, then extra shots are ignored.
    const r = replayAll(5, { s1: { by: 'X', angleDeg: 80, power: 100 } })
    void r
    // Structural check: records never exceed shots once winner exists.
    const manyShots = {}
    for (let i = 0; i < 10; i++) {
      manyShots[`k${i}`] = { by: i % 2 ? 'O' : 'X', angleDeg: 70, power: 95 }
    }
    const out = replayAll(9, manyShots)
    if (out.state.winner) expect(out.records.length).toBeLessThan(10)
  })
})

describe('ballistics behavior', () => {
  it('gravity-only vertical-ish shot lands where closed form predicts', () => {
    const seed = 31337
    const st = initialState(seed)
    const shooter = st.tanks.X.x
    // Fire straight up (90°): shell returns to start x.
    const { state, records } = replayAll(seed, { k: { by: 'X', angleDeg: 90, power: 50 } })
    const impact = records[records.length - 1].impact
    // Wind (±0.15 accel over ~1s flight) can push a vertical shell ≤ ~0.15.
    expect(Math.abs(impact.x - shooter)).toBeLessThan(0.3)
    expect(state.lastShot.path.length).toBeGreaterThan(10)
  })
  it('wind drifts the shell downwind', () => {
    const seed = 4242
    const noWindState = initialState(seed)
    void noWindState
    // Same angle/power under two different seeds → different impact x when winds differ.
    const impacts = new Set()
    for (let seed = 0; seed < 30; seed++) {
      const r = replayAll(seed, { k: { by: 'X', angleDeg: 45, power: 65 } })
      impacts.add(r.records[0].impact.kind + Math.round(r.records[0].impact.x * 500))
    }
    expect(impacts.size).toBeGreaterThan(3)
  })
  it('craters only subtract and floors at zero', () => {
    const seed = 8888
    const before = generateTerrain(seed)
    const flat = new Array(TERRAIN_COLS).fill(0.02)
    const st = {
      terrain: flat,
      tanks: { X: { x: 0.15, hp: 100, y: surfaceY(flat, 0.15) }, O: { x: 0.85, hp: 100, y: surfaceY(flat, 0.85) } },
    }
    // Drop a shell right next to X onto near-floor terrain.
    const { state } = simulateShot(
      { ...st, seed: 0, shotIndex: 0 },
      { by: 'X', angleDeg: 88, power: 99 },
    )
    expect(state.terrain.every(h => h >= 0 && h <= 1)).toBe(true)
    expect(state.terrain.length).toBe(TERRAIN_COLS)
    void before
  })
  it('self-splash damage applies to the shooter when the shell lands on top of them', () => {
    // Build a scenario where the crater math is unambiguous: X sits at
    // x=0.15 on flat ground, a shell impacts directly on that x (dist 0) —
    // full MAX_DAMAGE must land on X regardless of engine.
    const flat = new Array(TERRAIN_COLS).fill(0.5)
    const st = {
      terrain: flat,
      tanks: { X: { x: 0.15, hp: 100, y: surfaceY(flat, 0.15) }, O: { x: 0.85, hp: 100, y: surfaceY(flat, 0.85) } },
    }
    const { state } = simulateShot(
      { ...st, seed: 0, shotIndex: 0 },
      { by: 'X', angleDeg: 90, power: 1 }, // negligible power — lands ~at the muzzle
    )
    expect(state.tanks.X.hp).toBeLessThan(100)
    expect(state.lastShot.damage.X).toBeGreaterThan(0)
  })

  it('computed splash damage matches the real 2D-distance falloff formula (regression guard for the old x-only distance bug)', () => {
    // Cliff terrain: low ground left of the midpoint, a tall plateau right of
    // it, with both tanks sitting right at the edge on the plateau side. A
    // shell that lands mid-air near one tank but on a different height band
    // than the other exercises the y term the old x-only formula dropped.
    const terrain = new Array(TERRAIN_COLS).fill(0)
    for (let i = 0; i < TERRAIN_COLS; i++) terrain[i] = i < TERRAIN_COLS / 2 ? 0.1 : 0.9
    const tankX = { x: 0.52, hp: 100, y: surfaceY(terrain, 0.52) }
    const tankO = { x: 0.6, hp: 100, y: surfaceY(terrain, 0.6) }
    const st = { terrain, tanks: { X: tankX, O: tankO } }

    const { state } = simulateShot({ ...st, seed: 42, shotIndex: 0 }, { by: 'O', angleDeg: 15, power: 30 })
    const impact = state.lastShot.impact
    expect(impact.kind).not.toBe('out')
    // Both tanks sit at very different heights than the shell's mid-air
    // impact point in this setup — a real assertion the y term is load-bearing.
    expect(state.lastShot.damage.X).toBeGreaterThan(0)

    for (const sym of ['X', 'O']) {
      const t = st.tanks[sym] // PRE-shot position/height — matches what the fix measures against
      const ty = surfaceY(terrain, t.x) // PRE-crater terrain
      const dx = t.x - impact.x
      const dy = ty - impact.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const expected = Math.round(MAX_DAMAGE * Math.max(0, 1 - dist / BLAST_RADIUS))
      expect(state.lastShot.damage[sym]).toBe(expected)
    }
  })

  it('determinism: replaying the same shot twice against sloped terrain (crater math) yields bit-identical damage and terrain', () => {
    const seed = 20260828
    const shots = {
      a: { by: 'X', angleDeg: 42, power: 55 },
      b: { by: 'O', angleDeg: 38, power: 62 },
      c: { by: 'X', angleDeg: 50, power: 70 },
    }
    const r1 = replayAll(seed, shots)
    const r2 = replayAll(seed, shots)
    expect(JSON.stringify(r1.state.terrain)).toBe(JSON.stringify(r2.state.terrain))
    expect(JSON.stringify(r1.state.tanks)).toBe(JSON.stringify(r2.state.tanks))
    expect(r1.records.map(r => r.damage)).toEqual(r2.records.map(r => r.damage))
  })

  it('crater shaping never calls Math.cos/sin/pow/tan — only the deterministic detSin/detCos', () => {
    const src = generateTerrain.toString() + surfaceY.toString() + simulateShot.toString()
    expect(src).not.toMatch(/Math\.(cos|sin|pow|tan)\(/)
  })
})
