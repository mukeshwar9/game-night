import { describe, it, expect } from 'vitest'
import {
  createState, step, getWinner, computeAI,
  SHIP_R, BULLET_SPEED, BULLET_LIFE, FIRE_COOLDOWN, ROUND_CAP_S,
  SHIP_MAX_HP, START_FIRE_DELAY,
} from './spaceduelLogic'

const DT = 1 / 120

// Helper: step the sim N times with the given inputs (constant per step).
function runSteps(state, n, inputs, dt = DT) {
  let s = state
  const out = []
  for (let i = 0; i < n; i++) {
    const res = step(s, inputs, dt)
    s = res.state
    out.push(res)
  }
  return { state: s, results: out }
}

// Helper: create the initial state with cooldown already elapsed so firing works.
function readyState() {
  const s = createState()
  s.ships.X.cool = 0
  s.ships.O.cool = 0
  return s
}

describe('spaceduelLogic', () => {
  describe('createState', () => {
    it('places X left facing right and O right facing left, both alive & armed', () => {
      const s = createState()
      expect(s.ships.X.x).toBe(0.25)
      expect(s.ships.O.x).toBe(0.75)
      expect(s.ships.X.ang).toBe(0)
      expect(s.ships.O.ang).toBe(Math.PI)
      expect(s.ships.X.alive).toBe(true)
      expect(s.ships.O.alive).toBe(true)
      expect(s.ships.X.cool).toBe(START_FIRE_DELAY)
      expect(s.ships.X.hp).toBe(SHIP_MAX_HP)
      expect(s.ships.O.hp).toBe(SHIP_MAX_HP)
      expect(s.bullets).toEqual([])
      expect(s.t).toBe(0)
    })
  })

  describe('fire', () => {
    it('spawns a bullet at the nose inheriting ship velocity and trips cooldown', () => {
      const s = readyState()
      const res = step(s, { X: { turn: 0, thrust: 0, fire: 1 }, O: { turn: 0, thrust: 0, fire: 0 } }, DT)
      expect(res.state.bullets).toHaveLength(1)
      const b = res.state.bullets[0]
      expect(b.by).toBe('X')
      // life is aged by dt in the same step it spawns, so it's BULLET_LIFE − dt.
      expect(b.life).toBeCloseTo(BULLET_LIFE - DT, 5)
      // nose ≈ x + cos(0)*SHIP_R*1.2, then advanced one tick by its velocity.
      expect(b.x).toBeCloseTo(0.25 + SHIP_R * 1.2 + BULLET_SPEED * DT, 5)
      expect(b.vx).toBeCloseTo(BULLET_SPEED + 0, 5)
      expect(res.state.ships.X.cool).toBeCloseTo(FIRE_COOLDOWN, 5)
      expect(res.events).toContainEqual({ type: 'fire', by: 'X' })
    })

    it('cooldown prevents a second shot on the very next step (edge burst)', () => {
      const s = readyState()
      const r1 = step(s, { X: { fire: 1 }, O: {} }, DT)
      expect(r1.state.bullets).toHaveLength(1)
      // fire=1 again immediately — cooldown is now FIRE_COOLDOWN, not ready.
      const r2 = step(r1.state, { X: { fire: 1 }, O: {} }, DT)
      expect(r2.state.bullets).toHaveLength(1) // no second bullet
    })

    it('a dead ship cannot fire', () => {
      const s = readyState()
      s.ships.X.alive = false
      const r = step(s, { X: { fire: 1 }, O: {} }, DT)
      expect(r.state.bullets).toHaveLength(0)
    })

    it('firing is blocked during the start fire delay (cool > 0 from START_FIRE_DELAY)', () => {
      const s = createState()
      expect(s.ships.X.cool).toBe(START_FIRE_DELAY)
      // fire immediately — cooldown hasn't elapsed yet
      const r = step(s, { X: { fire: 1 }, O: {} }, DT)
      expect(r.state.bullets).toHaveLength(0)
    })

    it('firing works after the start fire delay elapses', () => {
      const s = createState()
      // advance enough steps to exhaust START_FIRE_DELAY
      const graceSteps = Math.ceil((START_FIRE_DELAY + DT) / DT)
      let res = s
      for (let i = 0; i < graceSteps; i++) res = step(res, { X: {}, O: {} }, DT).state
      expect(res.ships.X.cool).toBe(0)
      // now firing works
      const r = step(res, { X: { fire: 1 }, O: {} }, DT)
      expect(r.state.bullets).toHaveLength(1)
    })
  })

  describe('bullet life & wrap', () => {
    it('auto-expires a bullet after BULLET_LIFE seconds', () => {
      const s = readyState()
      const r1 = step(s, { X: { fire: 1 }, O: {} }, DT)
      expect(r1.state.bullets).toHaveLength(1)
      // advance enough steps to exceed BULLET_LIFE
      const steps = Math.ceil((BULLET_LIFE + DT) / DT)
      const { state } = runSteps(r1.state, steps, { X: {}, O: {} }, DT)
      expect(state.bullets).toHaveLength(0)
    })

    it('wraps toroidally: a bullet exiting past 1.0 re-enters near 0.0', () => {
      const s = createState()
      // place a bullet just inside the right edge moving fast rightward
      s.bullets = [{ x: 0.995, y: 0.5, vx: BULLET_SPEED, vy: 0, life: 2, by: 'X' }]
      // step once; with DT=1/120, displacement = 0.9/120 ≈ 0.0075 → 0.995+0.0075=1.0025 → wraps to ~0.0025
      const r = step(s, { X: {}, O: {} }, DT)
      const b = r.state.bullets[0]
      expect(b.x).toBeLessThan(0.01)
      expect(b.x).toBeGreaterThan(0)
    })
  })

  describe('bullet vs ship', () => {
    it('an opposite-side bullet damages the victim, decrements HP, and credits the firing ship', () => {
      const s = createState()
      // put X's bullet right next to O's nose so the very next step registers a hit
      const bx = s.ships.O.x + 0.01
      const by_ = s.ships.O.y
      s.bullets = [{ x: bx, y: by_, vx: 0, vy: 0, life: 1, by: 'X' }]
      const r = step(s, { X: {}, O: {} }, DT)
      expect(r.state.ships.O.alive).toBe(true)       // survived (hp 3→2)
      expect(r.state.ships.O.hp).toBe(SHIP_MAX_HP - 1)
      expect(r.state.ships.X.hits).toBe(1)
      expect(r.state.bullets).toHaveLength(0) // consumed
      expect(r.events).toContainEqual({ type: 'hit', by: 'X', victim: 'O' })
    })

    it('a ship dies on the 3rd hit (hp 3→2→1→0, kill event on final hit)', () => {
      const s = createState()
      s.ships.O.hp = 1  // one more hit finishes O
      s.bullets = [{ x: s.ships.O.x + 0.01, y: s.ships.O.y, vx: 0, vy: 0, life: 1, by: 'X' }]
      const r = step(s, { X: {}, O: {} }, DT)
      expect(r.state.ships.O.alive).toBe(false)
      expect(r.state.ships.O.hp).toBe(0)
      expect(r.events.some(e => e.type === 'kill' && e.by === 'X' && e.victim === 'O')).toBe(true)
      expect(r.events.some(e => e.type === 'hit' && e.by === 'X' && e.victim === 'O')).toBe(false)
    })

    it('a bullet does NOT kill the same-side ship (self-fire immunity)', () => {
      const s = createState()
      // X's own bullet sitting on X's body — heading toward X but by X
      s.bullets = [{ x: s.ships.X.x + 0.005, y: s.ships.X.y, vx: -BULLET_SPEED, vy: 0, life: 1, by: 'X' }]
      const r = step(s, { X: {}, O: {} }, DT)
      expect(r.state.ships.X.alive).toBe(true)
      expect(r.state.ships.X.hp).toBe(SHIP_MAX_HP) // no damage from self
      expect(r.state.ships.X.hits).toBe(0)
      expect(r.state.bullets.length).toBe(1) // not consumed: still alive (life > 0)
    })

    it('both ships dying in the same step → draw', () => {
      const s = createState()
      s.ships.X.hp = 1
      s.ships.O.hp = 1
      // a bullet from X sitting on O, and a bullet from O sitting on X
      s.bullets = [
        { x: s.ships.O.x + 0.005, y: s.ships.O.y, vx: 0, vy: 0, life: 1, by: 'X' },
        { x: s.ships.X.x - 0.005, y: s.ships.X.y, vx: 0, vy: 0, life: 1, by: 'O' },
      ]
      const r = step(s, { X: {}, O: {} }, DT)
      expect(r.state.ships.X.alive).toBe(false)
      expect(r.state.ships.O.alive).toBe(false)
    })
  })

  describe('wall bounce', () => {
    it('dampens and reverses the normal velocity component on impact', () => {
      const s = createState()
      // give X a fast rightward velocity such that one step crosses the right wall
      s.ships.X.x = 0.985
      s.ships.X.vx = 0.5 // 0.5/120 ≈ 0.0042 → 0.985+0.0042 = 0.989 < wall; push closer
      // Instead place exactly at edge and push past:
      s.ships.X.x = 1 - SHIP_R - 0.0001
      s.ships.X.vx = 0.5
      const r = step(s, { X: {}, O: {} }, DT)
      const sh = r.state.ships.X
      expect(sh.x).toBeLessThanOrEqual(1 - SHIP_R + 1e-9) // clamped to wall
      // normal component reversed & damped (0.5 → approx -0.25)
      expect(sh.vx).toBeLessThan(0)
      expect(sh.vx).toBeGreaterThan(-0.26)
      expect(sh.vx).toBeLessThan(-0.24)
    })
  })

  describe('getWinner', () => {
    it('both alive, time < cap → null (round in progress)', () => {
      const s = createState()
      expect(getWinner(s)).toBeNull()
    })

    it('X alive & O dead → X', () => {
      const s = createState(); s.ships.O.alive = false
      expect(getWinner(s)).toBe('X')
    })

    it('O alive & X dead → O', () => {
      const s = createState(); s.ships.X.alive = false
      expect(getWinner(s)).toBe('O')
    })

    it('both dead → draw', () => {
      const s = createState(); s.ships.X.alive = false; s.ships.O.alive = false
      expect(getWinner(s)).toBe('draw')
    })

    it('time cap + X leads by ≥ margin → X', () => {
      const s = createState(); s.t = ROUND_CAP_S
      s.ships.X.hits = 3; s.ships.O.hits = 1
      expect(getWinner(s)).toBe('X')
    })

    it('time cap + equal hits → draw', () => {
      const s = createState(); s.t = ROUND_CAP_S
      s.ships.X.hits = 2; s.ships.O.hits = 2
      expect(getWinner(s)).toBe('draw')
    })

    it('time cap + O leads by exactly the margin → O', () => {
      const s = createState(); s.t = ROUND_CAP_S
      s.ships.X.hits = 0; s.ships.O.hits = 1
      expect(getWinner(s)).toBe('O')
    })
  })

  describe('computeAI', () => {
    it('produces a valid input shape and never fires from cooldown-dead without facing', () => {
      const s = createState()
      const ai = computeAI(s, 'O')
      expect(ai).toHaveProperty('turn')
      expect(ai).toHaveProperty('thrust')
      expect(ai).toHaveProperty('fire')
      expect([-1, 0, 1]).toContain(ai.turn)
      expect([0, 1]).toContain(ai.thrust)
      expect([0, 1]).toContain(ai.fire)
    })

    it('dead ship yields all-zero input', () => {
      const s = createState(); s.ships.O.alive = false
      expect(computeAI(s, 'O')).toEqual({ turn: 0, thrust: 0, fire: 0 })
    })
  })
})