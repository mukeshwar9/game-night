import { describe, it, expect } from 'vitest'
import {
  createState, step, computeAI, getWinner,
  BLOB_R, FRICTION, MAX_SPEED, RESTITUTION, PUSH_IMPULSE,
  SHRINK_START, SHRINK_RATE, MIN_RADIUS, START_RADIUS,
} from './sumoLogic'

const DT = 1 / 120

const speed = ({ vx, vy }) => Math.hypot(vx, vy)

describe('createState', () => {
  it('places blobs on opposite sides with a full-size platform', () => {
    const s = createState()
    expect(s.blobs.X).toMatchObject({ x: 0.3, y: 0.5, vx: 0, vy: 0, alive: true })
    expect(s.blobs.O).toMatchObject({ x: 0.7, y: 0.5, vx: 0, vy: 0, alive: true })
    expect(s.arenaR).toBeCloseTo(START_RADIUS)
    expect(s.t).toBe(0)
  })
})

describe('step — purity', () => {
  it('does not mutate the input state', () => {
    const s = createState()
    const snap = JSON.parse(JSON.stringify(s))
    step(s, { X: { press: 1 }, O: { press: 1 } }, DT)
    expect(s).toEqual(snap)
  })
})

describe('step — friction', () => {
  it('decays velocity exponentially over time (no collisions, no walls)', () => {
    // Park O dead far away so X never collides; keep X away from the walls.
    let s = createState()
    s.blobs.O.alive = false
    s.blobs.X.vx = 0.4
    s.blobs.X.x = 0.5
    const ticks = 60                                   // 0.5s
    for (let i = 0; i < ticks; i++) s = step(s, {}, DT).state
    const f = Math.exp(-FRICTION * ticks * DT)
    expect(s.blobs.X.vx).toBeCloseTo(0.4 * f, 5)
    expect(s.blobs.X.alive).toBe(true)
  })
})

describe('step — speed cap', () => {
  it('caps speed at MAX_SPEED even under sustained input', () => {
    let s = createState()
    for (let i = 0; i < 600; i++) s = step(s, { X: { press: 1 } }, DT).state // 5s
    expect(speed(s.blobs.X)).toBeLessThanOrEqual(MAX_SPEED + 1e-9)
  })
})

describe('step — push toward opponent', () => {
  it('a tap pushes X toward O (rightward, since X left, O right)', () => {
    const s = createState()
    const r = step(s, { X: { press: 1 }, O: { press: 0 } }, DT)
    expect(r.state.blobs.X.vx).toBeGreaterThan(0)
    expect(r.state.blobs.X.vy).toBeCloseTo(0, 6)
  })

  it('no tap = no movement (only friction decay applies)', () => {
    const s = createState()
    s.blobs.X.vx = 0.2
    const r = step(s, { X: { press: 0 }, O: { press: 0 } }, DT)
    const f = Math.exp(-FRICTION * DT)
    expect(r.state.blobs.X.vx).toBeCloseTo(0.2 * f, 5)
  })

  it('tapping moves the blob closer to the opponent over time', () => {
    let s = createState()
    const startX = s.blobs.X.x
    for (let i = 0; i < 30; i++) s = step(s, { X: { press: 1 }, O: { press: 0 } }, DT).state
    expect(s.blobs.X.x).toBeGreaterThan(startX)
  })

  it('a single tap impulse magnitude is PUSH_IMPULSE (friction runs before impulse on zero-velocity start)', () => {
    const s = createState()
    const r = step(s, { X: { press: 1 }, O: { press: 0 } }, DT)
    expect(r.state.blobs.X.vx).toBeCloseTo(PUSH_IMPULSE, 5)
  })
})

describe('step — blob collision', () => {
  it('swaps the normal velocity component on a head-on collision (momentum + restitution)', () => {
    // Head-on along x: both y equal, vy=0 → normal is the x-axis exactly.
    const f = Math.exp(-FRICTION * DT)
    const s = {
      blobs: {
        X: { x: 0.5 - BLOB_R, y: 0.5, vx: 1, vy: 0, alive: true },
        O: { x: 0.5 + BLOB_R, y: 0.5, vx: -1, vy: 0, alive: true },
      },
      arenaR: MIN_RADIUS, t: 100,                       // tiny arena so they collide before any wall/death
    }
    // Move them slightly inside so the post-move overlap triggers collision.
    s.blobs.X.x = 0.5 - BLOB_R * 0.6
    s.blobs.O.x = 0.5 + BLOB_R * 0.6
    // Keep them alive: centre the arena on the collision and give it room.
    s.arenaR = START_RADIUS
    s.t = 0
    const r = step(s, {}, DT)
    const X = r.state.blobs.X
    const O = r.state.blobs.O
    // Post-friction normal velocities (normal = x).
    const v1n = 1 * f
    const v2n = -1 * f
    // Momentum along normal is conserved through the collision.
    expect(X.vx + O.vx).toBeCloseTo(v1n + v2n, 5)
    // Relative velocity along normal reverses scaled by RESTITUTION.
    expect(O.vx - X.vx).toBeCloseTo(-(v2n - v1n) * RESTITUTION, 5)
    // X should now be moving left, O right (bounced back).
    expect(X.vx).toBeLessThan(0)
    expect(O.vx).toBeGreaterThan(0)
  })

  it('preserves the tangential velocity component (same vy → normal stays on x)', () => {
    const f = Math.exp(-FRICTION * DT)
    // Both blobs share the same vy so dy stays 0 after the move → normal is
    // the x-axis and vy is purely tangential (only scaled by friction).
    const s = {
      blobs: {
        X: { x: 0.5 - BLOB_R * 0.6, y: 0.5, vx: 1, vy: 0.5, alive: true },
        O: { x: 0.5 + BLOB_R * 0.6, y: 0.5, vx: -1, vy: 0.5, alive: true },
      },
      arenaR: START_RADIUS, t: 0,
    }
    const r = step(s, {}, DT)
    expect(r.state.blobs.X.vy).toBeCloseTo(0.5 * f, 5)
    expect(r.state.blobs.O.vy).toBeCloseTo(0.5 * f, 5)
  })

  it('separates overlapping blobs so they no longer overlap', () => {
    const s = {
      blobs: {
        X: { x: 0.5 - BLOB_R * 0.4, y: 0.5, vx: 1, vy: 0, alive: true },
        O: { x: 0.5 + BLOB_R * 0.4, y: 0.5, vx: -1, vy: 0, alive: true },
      },
      arenaR: START_RADIUS, t: 0,
    }
    const r = step(s, {}, DT)
    const dist = Math.hypot(r.state.blobs.O.x - r.state.blobs.X.x, r.state.blobs.O.y - r.state.blobs.X.y)
    expect(dist).toBeGreaterThanOrEqual(2 * BLOB_R - 1e-9)
  })
})

describe('step — off-platform death', () => {
  it('kills a blob pushed off the platform and emits an out event', () => {
    // Shrink the arena so X is already off it.
    const s = {
      blobs: {
        X: { x: 0.5, y: 0.5, vx: 0, vy: 0, alive: true },
        O: { x: 0.5, y: 0.5, vx: 0, vy: 0, alive: true },
      },
      arenaR: MIN_RADIUS, t: 100,
    }
    s.blobs.X.x = 0.95 // far outside arenaR - BLOB_R/2
    const r = step(s, {}, DT)
    const out = r.events.find(e => e.type === 'out' && e.by === 'X')
    expect(out).toBeTruthy()
    expect(r.state.blobs.X.alive).toBe(false)
    expect(r.state.blobs.X.vx).toBe(0)
    expect(r.state.blobs.X.vy).toBe(0)
  })

  it('a blob past the death radius dies and the opponent wins', () => {
    // Place X just past the death radius with outward velocity; O at centre.
    let s = createState()
    s.arenaR = MIN_RADIUS
    s.t = 100
    const deathR = MIN_RADIUS - BLOB_R * 0.5
    s.blobs.X.x = 0.5 + deathR + 0.01  // just past the boundary
    s.blobs.X.vx = 0.1                  // moving further outward
    s.blobs.O.x = 0.5
    let winner = null
    for (let i = 0; i < 30 && !winner; i++) {
      const r = step(s, {}, DT)
      s = r.state
      winner = getWinner(s)
    }
    expect(winner).toBe('O')
    expect(s.blobs.X.alive).toBe(false)
    expect(s.blobs.O.alive).toBe(true)
  })
})

describe('step — simultaneous out', () => {
  it('returns draw when both blobs exit on the same step', () => {
    // Both blobs off the platform at once.
    const s = {
      blobs: {
        X: { x: 0.02, y: 0.5, vx: 0, vy: 0, alive: true },
        O: { x: 0.98, y: 0.5, vx: 0, vy: 0, alive: true },
      },
      arenaR: MIN_RADIUS, t: 100,
    }
    const r = step(s, {}, DT)
    expect(r.state.blobs.X.alive).toBe(false)
    expect(r.state.blobs.O.alive).toBe(false)
    expect(getWinner(r.state)).toBe('draw')
  })
})

describe('step — arena shrink', () => {
  it('does not shrink before SHRINK_START', () => {
    let s = createState()
    for (let i = 0; i < Math.ceil(SHRINK_START * 120) - 1; i++) s = step(s, {}, DT).state
    expect(s.arenaR).toBeCloseTo(START_RADIUS, 5)
  })

  it('shrinks by SHRINK_RATE after SHRINK_START (single tick)', () => {
    let s = createState()
    s.t = SHRINK_START // next step crosses the threshold
    const r = step(s, {}, DT)
    expect(r.state.arenaR).toBeCloseTo(START_RADIUS - SHRINK_RATE * DT, 5)
  })

  it('never shrinks below MIN_RADIUS', () => {
    let s = createState()
    s.arenaR = MIN_RADIUS
    s.t = 1000
    const r = step(s, {}, DT)
    expect(r.state.arenaR).toBeGreaterThanOrEqual(MIN_RADIUS - 1e-9)
  })
})

describe('computeAI', () => {
  it('returns {press: 0|1} shape', () => {
    const s = createState()
    const inp = computeAI(s, 'X')
    expect(inp).toHaveProperty('press')
    expect([0, 1]).toContain(inp.press)
  })

  it('taps toward the edge when near it (presses to retreat to centre)', () => {
    const s = createState()
    s.arenaR = MIN_RADIUS
    s.blobs.X.x = 0.5 + MIN_RADIUS - 0.05
    s.blobs.X.y = 0.5
    s.t = 0 // on an even tap window → press=1
    const inp = computeAI(s, 'X')
    expect(inp.press).toBe(1)
  })

  it('taps to ram when opponent is close', () => {
    const s = createState()
    s.blobs.X.x = 0.45
    s.blobs.O.x = 0.5
    s.t = 0 // on an even tap window
    const inp = computeAI(s, 'X')
    expect(inp.press).toBe(1)
  })

  it('stays still when dead', () => {
    const s = createState()
    s.blobs.X.alive = false
    expect(computeAI(s, 'X')).toEqual({ press: 0 })
  })
})

describe('getWinner', () => {
  it('returns null while both are alive', () => {
    expect(getWinner(createState())).toBe(null)
  })
  it('returns the survivor', () => {
    const s = createState()
    s.blobs.X.alive = false
    expect(getWinner(s)).toBe('O')
    s.blobs.O.alive = false
    s.blobs.X.alive = true
    expect(getWinner(s)).toBe('X')
  })
  it('returns draw when both are dead', () => {
    const s = createState()
    s.blobs.X.alive = false
    s.blobs.O.alive = false
    expect(getWinner(s)).toBe('draw')
  })
})
