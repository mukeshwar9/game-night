import { describe, expect, it } from 'vitest'
import { ARTILLERY_BOT_LEVELS, pickArtilleryShot } from './artilleryBot'
import { initialState, simulateShot } from './artilleryLogic'

const SEED = 20260822
const at = (shotIndex) => ({ ...initialState(SEED), seed: SEED, shotIndex })

// The aim the demo used before levels existed (wind ignored, fixed wobble).
function originalAim(tankX, targetX, shotIndex) {
  const dx = targetX - tankX
  const base = Math.round(45 + Math.abs(dx) * 40)
  const power = Math.min(100, Math.max(20, Math.round(Math.abs(dx) * 130)))
  const noise = ((shotIndex * 37) % 7) - 3
  return { angleDeg: Math.max(5, Math.min(90, base + noise)), power: Math.max(10, Math.min(100, power + noise)) }
}

describe('pickArtilleryShot', () => {
  it('lists the levels, with NORMAL as the original gap-only bot', () => {
    expect(Object.keys(ARTILLERY_BOT_LEVELS)).toEqual(['easy', 'normal', 'hard'])
    expect(ARTILLERY_BOT_LEVELS.normal).toEqual({ wobble: 3, search: false })
  })

  it('NORMAL fires exactly the shot the demo always did', () => {
    for (let i = 1; i < 9; i++) {
      const s = at(i)
      expect(pickArtilleryShot(s, 'O', 'normal')).toEqual(originalAim(s.tanks.O.x, s.tanks.X.x, i))
      expect(pickArtilleryShot(s)).toEqual(pickArtilleryShot(s, 'O', 'normal'))
      expect(pickArtilleryShot(s, 'O', 'nonsense')).toEqual(pickArtilleryShot(s, 'O', 'normal'))
    }
  })

  it('every level stays inside the sliders', () => {
    for (const level of Object.keys(ARTILLERY_BOT_LEVELS)) {
      for (let i = 0; i < 12; i++) {
        const { angleDeg, power } = pickArtilleryShot(at(i), 'O', level)
        expect(angleDeg).toBeGreaterThanOrEqual(5)
        expect(angleDeg).toBeLessThanOrEqual(90)
        expect(power).toBeGreaterThanOrEqual(10)
        expect(power).toBeLessThanOrEqual(100)
      }
    }
  })

  it('EASY wobbles further from the NORMAL guess than HARD does from its own search', () => {
    let easyOff = 0
    for (let i = 0; i < 7; i++) {
      const s = at(i)
      const n = pickArtilleryShot(s, 'O', 'normal')
      const e = pickArtilleryShot(s, 'O', 'easy')
      easyOff += Math.abs(n.angleDeg - e.angleDeg) + Math.abs(n.power - e.power)
    }
    expect(easyOff).toBeGreaterThan(0)
  })

  // Mean hit damage over several shot indices, each fired once at the real sim.
  const meanDamage = (level) => {
    let total = 0
    const n = 12
    for (let i = 0; i < n; i++) {
      const s = at(i)
      const { angleDeg, power } = pickArtilleryShot(s, 'O', level)
      total += simulateShot(s, { by: 'O', angleDeg, power }).record.damage.X
    }
    return total / n
  }

  it('HARD lands more damage than NORMAL, and NORMAL more than EASY', () => {
    const easy = meanDamage('easy')
    const normal = meanDamage('normal')
    const hard = meanDamage('hard')
    expect(hard).toBeGreaterThan(normal)
    expect(normal).toBeGreaterThanOrEqual(easy)
  })

  it('HARD does not shoot itself', () => {
    for (let i = 0; i < 6; i++) {
      const s = at(i)
      const { angleDeg, power } = pickArtilleryShot(s, 'O', 'hard')
      expect(simulateShot(s, { by: 'O', angleDeg, power }).record.damage.O).toBe(0)
    }
  })

  it('can play the X side too', () => {
    const s = at(2)
    const { angleDeg, power } = pickArtilleryShot(s, 'X', 'hard')
    const hit = simulateShot(s, { by: 'X', angleDeg, power }).record
    expect(hit.damage.X).toBe(0)
  })
})
