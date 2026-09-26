import { describe, expect, it } from 'vitest'
import { detCos, detSin, mulberry32 } from './detMath'
import * as artillery from './artilleryLogic'

describe('detMath', () => {
  it('detSin/detCos track Math.sin/cos within 1e-9 over several turns', () => {
    let worst = 0
    for (let x = -20; x <= 20; x += 0.0137) {
      worst = Math.max(worst, Math.abs(detSin(x) - Math.sin(x)), Math.abs(detCos(x) - Math.cos(x)))
    }
    expect(worst).toBeLessThan(1e-9)
  })

  it('mulberry32 is seeded and reproducible', () => {
    const a = mulberry32(42), b = mulberry32(42)
    const xs = Array.from({ length: 5 }, () => a())
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()))
    xs.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) })
  })

  it('artilleryLogic re-exports the same functions', () => {
    expect(artillery.detSin).toBe(detSin)
    expect(artillery.detCos).toBe(detCos)
    expect(artillery.mulberry32).toBe(mulberry32)
  })
})
