import { describe, it, expect } from 'vitest'
import { createWorld, step, DT, MAXSPD, REACH_X, REACH_Z } from './sideKickLogic'
import { COCKPIT, aimKick, cockpitZones, kickLabel, kickSideFor } from './sideKickCockpitLogic'

// An empty straight road, riders placed by hand.
function lab(placed) {
  const w = createWorld({
    riders: placed.map((_, i) => ({ id: `r${i}`, name: `R${i}`, bot: i > 0 })),
    phase: 'race',
  })
  w.cars = []
  w.track.cars = []
  placed.forEach(([x, z], i) => { w.riders[i].x = x; w.riders[i].z = z; w.riders[i].speed = MAXSPD * 0.8 })
  return w
}

describe('aimKick: the rider the one KICK button swings at', () => {
  it('finds nobody on an empty road', () => {
    const w = lab([[0, 1000], [-0.9, 1000], [0.9, 1000]])
    expect(aimKick(w, w.riders[0])).toEqual({ side: 0, target: null })
  })
  it('picks the rider beside you, on the right or on the left', () => {
    const w = lab([[0, 1000], [0.25, 1000]])
    expect(aimKick(w, w.riders[0])).toMatchObject({ side: 1, target: w.riders[1] })
    const v = lab([[0, 1000], [-0.25, 1050]])
    expect(aimKick(v, v.riders[0])).toMatchObject({ side: -1, target: v.riders[1] })
  })
  it('ignores a rider too far ahead or behind, or out of reach sideways', () => {
    const w = lab([[0, 1000], [0.25, 1000 + REACH_Z + 20], [-(REACH_X + 0.05), 1000]])
    expect(aimKick(w, w.riders[0]).target).toBeNull()
  })
  it('with two in reach takes the one laterally closer, then the closer along the road', () => {
    const w = lab([[0, 1000], [0.3, 1000], [-0.15, 1100]])
    expect(aimKick(w, w.riders[0])).toMatchObject({ side: -1, target: w.riders[2] })
    const v = lab([[0, 1000], [0.2, 1150], [-0.2, 1050]])
    expect(aimKick(v, v.riders[0])).toMatchObject({ side: -1, target: v.riders[2] })
  })
  it('skips a shielded or fallen rider (a kick would not land)', () => {
    const w = lab([[0, 1000], [0.2, 1000], [-0.3, 1000]])
    w.riders[1].shield = 1
    expect(aimKick(w, w.riders[0]).target).toBe(w.riders[2])
    w.riders[2].state = 'down'
    expect(aimKick(w, w.riders[0]).target).toBeNull()
  })
  it('is safe without a world or rider', () => {
    expect(aimKick(null, null)).toEqual({ side: 0, target: null })
  })
})

describe('kickSideFor: which way a tap swings', () => {
  it('follows the target when one is in reach, whatever the steer says', () => {
    const w = lab([[0, 1000], [0.25, 1000]])
    expect(kickSideFor(w, w.riders[0], -1)).toBe(1)
  })
  it('swings the way you steer when nobody is in reach', () => {
    const w = lab([[0, 1000], [0.9, 3000]])
    expect(kickSideFor(w, w.riders[0], -0.6)).toBe(-1)
    expect(kickSideFor(w, w.riders[0], 0.6)).toBe(1)
  })
  it('with no steer swings toward the nearest rider close along the road, else toward the middle', () => {
    const w = lab([[0, 1000], [-0.6, 1100], [0.9, 1000]])
    expect(kickSideFor(w, w.riders[0], 0)).toBe(-1)
    const v = lab([[0.8, 1000], [-0.9, 5000]])
    expect(kickSideFor(v, v.riders[0], 0)).toBe(-1)
    const u = lab([[-0.8, 1000], [0.9, 5000]])
    expect(kickSideFor(u, u.riders[0], 0)).toBe(1)
  })
  it('always returns a legal side the sim accepts, and a whiff is a normal miss', () => {
    const w = lab([[0, 1000], [0.9, 5000]])
    const side = kickSideFor(w, w.riders[0], 0)
    expect([-1, 1]).toContain(side)
    const events = []
    step(w, { 0: { steer: 0, kick: side, boost: false } }, DT)
    for (let i = 0; i < 40; i++) { step(w, {}, DT); events.push(...w.events) }
    expect(events.some((e) => e.t === 'miss' && e.by === 0)).toBe(true)
  })
})

describe('cockpitZones: what each thumb holds', () => {
  it('defaults to tilt-off steering halves on the left and BOOST over one KICK on the right', () => {
    expect(cockpitZones()).toEqual({ left: ['steerL', 'steerR'], right: ['boost', 'kick'] })
  })
  it('swaps the steering halves for the tilt gauge when tilt is live', () => {
    expect(cockpitZones({ tiltOn: true }).left).toEqual(['tilt'])
  })
  it('keeps KICK L and KICK R as a pair in the two-button setting', () => {
    expect(cockpitZones({ kickMode: 'two' }).right).toEqual(['boost', 'kickL', 'kickR'])
  })
  it('shows LASSO only in DUST KICK, and only while a coil is in hand', () => {
    expect(cockpitZones({ dust: true, rope: true }).right).toEqual(['lasso', 'boost', 'kick'])
    expect(cockpitZones({ dust: true, rope: false }).right).toEqual(['boost', 'kick'])
    expect(cockpitZones({ dust: false, rope: true }).right).toEqual(['boost', 'kick'])
  })
  it('keeps every button above the 44 px touch minimum', () => {
    for (const k of ['kick', 'kickPair', 'boost', 'steerH', 'steerW']) expect(COCKPIT[k]).toBeGreaterThanOrEqual(COCKPIT.minTouch)
    expect(COCKPIT.kick).toBeGreaterThan(COCKPIT.boost)
  })
})

describe('kickLabel', () => {
  it('points at the target side, in either skin', () => {
    expect(kickLabel({ side: 1 })).toBe('KICK ▶')
    expect(kickLabel({ side: -1 })).toBe('◀ KICK')
    expect(kickLabel({ side: 0 })).toBe('KICK')
    expect(kickLabel({ dust: true, side: 1 })).toBe('BUCK ▶')
    expect(kickLabel({ dust: true })).toBe('BUCK')
  })
})
