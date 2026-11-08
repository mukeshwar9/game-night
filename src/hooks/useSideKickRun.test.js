import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createWorld, step, DT, BOOST_SECS, BOOST_MIN } from '../lib/sideKickLogic'

// The hook module pulls in the sound layer, which reads localStorage when it loads.
let hudOf
beforeAll(async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })
  ;({ hudOf } = await import('./useSideKickRun'))
})

const world = () => createWorld({ riders: [{ id: 'a', name: 'AAA' }, { id: 'b', name: 'BBB', bot: true }], phase: 'race' })

describe('the HUD snapshot of the boost meter', () => {
  it('starts empty and not ready', () => {
    const h = hudOf(world(), 0)
    expect(h).toMatchObject({ boost: 0, boostReady: false, boosting: false, boostLeft: 0, wake: false, oil: false })
  })
  it('is ready once the meter passes the minimum, then drains by time left while the burst runs', () => {
    const w = world()
    w.cars = []
    w.riders[0].boost = BOOST_MIN + 0.05
    expect(hudOf(w, 0).boostReady).toBe(true)
    w.riders[0].boost = 1
    step(w, { 0: { boost: true } }, DT)
    let h = hudOf(w, 0)
    expect(h).toMatchObject({ boost: 0, boosting: true, boostReady: false })
    expect(h.boostLeft).toBeGreaterThan(0.95)
    for (let i = 0; i < Math.round((BOOST_SECS / 2) * 60); i++) step(w, {}, DT)
    h = hudOf(w, 0)
    expect(h.boostLeft).toBeGreaterThan(0.4)
    expect(h.boostLeft).toBeLessThan(0.6)
    expect(h.chip).toMatch(/^BOOST/)
  })
  it('reports oil with its own chip, and the lean for the tilt gauge', () => {
    const w = world()
    w.riders[0].oil = 1
    w.riders[0].lean = 0.5
    const h = hudOf(w, 0)
    expect(h).toMatchObject({ oil: true, lean: 0.5, chip: 'OIL · SLOWED' })
  })
})

describe('the HUD snapshot of the kick aim', () => {
  const lab = () => {
    const w = createWorld({ riders: [{ id: 'a', name: 'AAA' }, { id: 'b', name: 'BBB', bot: true }, { id: 'c', name: 'CCC', bot: true }], phase: 'race' })
    w.cars = []
    return w
  }
  it('is empty with nobody beside you', () => {
    const w = lab()
    w.riders[0].x = 0; w.riders[0].z = 1000
    w.riders[1].x = 0.9; w.riders[1].z = 4000
    w.riders[2].x = -0.9; w.riders[2].z = 4000
    expect(hudOf(w, 0).aim).toBeNull()
  })
  it('names the rider a KICK would land on and which side they are on', () => {
    const w = lab()
    w.riders[0].x = 0; w.riders[0].z = 1000
    w.riders[1].x = -0.25; w.riders[1].z = 1050
    w.riders[2].x = 0.9; w.riders[2].z = 4000
    expect(hudOf(w, 0).aim).toEqual({ i: 1, side: -1, name: 'BBB' })
  })
  it('clears while you are down, finished or on the grid countdown', () => {
    const w = lab()
    w.riders[0].x = 0; w.riders[0].z = 1000
    w.riders[1].x = 0.25; w.riders[1].z = 1000
    expect(hudOf(w, 0).aim).not.toBeNull()
    w.phase = 'count'
    expect(hudOf(w, 0).aim).toBeNull()
    w.phase = 'race'
    w.riders[0].state = 'down'
    expect(hudOf(w, 0).aim).toBeNull()
    w.riders[0].state = 'ride'
    w.riders[0].done = true
    expect(hudOf(w, 0).aim).toBeNull()
  })
})
