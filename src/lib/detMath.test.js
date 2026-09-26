import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { detCos, detSin, mulberry32, TWO_PI } from './detMath'
import * as artillery from './artilleryLogic'

describe('detMath', () => {
  it('detSin/detCos stay within 1e-9 of Math.sin/cos, including large arguments', () => {
    for (let x = -50; x <= 50; x += 0.37) {
      expect(Math.abs(detSin(x) - Math.sin(x))).toBeLessThan(1e-9)
      expect(Math.abs(detCos(x) - Math.cos(x))).toBeLessThan(1e-9)
    }
    expect(Math.abs(detSin(123456.789) - Math.sin(123456.789))).toBeLessThan(1e-7)
    expect(TWO_PI).toBe(6.283185307179586)
  })

  it('mulberry32 is a seeded, repeatable stream in [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42)
    for (let i = 0; i < 50; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('uses no engine-rounded transcendentals', () => {
    const src = readFileSync(new URL('./detMath.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/Math\.(sin|cos|tan|atan2?|hypot|pow|exp|log)\(/)
  })

  it('artilleryLogic still re-exports the moved helpers', () => {
    expect(artillery.detSin).toBe(detSin)
    expect(artillery.detCos).toBe(detCos)
    expect(artillery.mulberry32).toBe(mulberry32)
  })
})
