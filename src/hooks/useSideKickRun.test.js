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
