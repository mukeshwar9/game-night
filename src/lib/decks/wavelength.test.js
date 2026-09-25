import { describe, it, expect } from 'vitest'
import { WAVELENGTH_PAIRS } from './wavelength'

// Content-v2 checks for the spectrum deck. Logic-level checks (clueBank shape,
// getSpectrumPair wrapping) live in src/lib/wavelengthLogic.test.js.
describe('WAVELENGTH deck content', () => {
  it('has at least 100 spectra (content v2 floor)', () => {
    expect(WAVELENGTH_PAIRS.length).toBeGreaterThanOrEqual(100)
  })

  it('every spectrum is unique and has two different ends', () => {
    const keys = WAVELENGTH_PAIRS.map(p => `${p.left}|${p.right}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const p of WAVELENGTH_PAIRS) expect(p.left, `${p.left}|${p.right}`).not.toBe(p.right)
    // A spectrum must not reappear flipped (e.g. HOT|COLD after COLD|HOT).
    for (const p of WAVELENGTH_PAIRS) expect(keys, `${p.left}|${p.right}`).not.toContain(`${p.right}|${p.left}`)
  })

  it('end labels are uppercase and short enough for the dial', () => {
    for (const p of WAVELENGTH_PAIRS) {
      for (const label of [p.left, p.right]) {
        expect(label, label).toBe(label.toUpperCase())
        expect(label, label).toBe(label.trim())
        expect(label.length, label).toBeLessThanOrEqual(16)
      }
    }
  })

  it('every clue bank reaches both halves of the dial so solo play can land anywhere', () => {
    for (const p of WAVELENGTH_PAIRS) {
      const positions = p.clueBank.map(c => c.pos)
      expect(Math.min(...positions), p.left).toBeLessThanOrEqual(35)
      expect(Math.max(...positions), p.left).toBeGreaterThanOrEqual(65)
      for (const c of p.clueBank) {
        expect(Number.isInteger(c.pos), c.word).toBe(true)
        expect(c.word, c.word).toBe(c.word.toUpperCase())
      }
    }
  })

  it('keeps the original spectra at their original indexes (rooms store spectrumIndex)', () => {
    expect(WAVELENGTH_PAIRS[0]).toMatchObject({ left: 'COLD', right: 'HOT' })
    expect(WAVELENGTH_PAIRS[16]).toMatchObject({ left: 'SAFE', right: 'DANGEROUS' })
    expect(WAVELENGTH_PAIRS[31]).toMatchObject({ left: 'LOW TECH', right: 'HIGH TECH' })
  })
})
