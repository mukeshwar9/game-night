import { describe, it, expect } from 'vitest'
import { dealKim, kimTraySize, kimStudyMs, KIM_CHOICES } from './kimsGameLogic'
import { mulberry32 } from './detMath'

describe('lost & found', () => {
  it('grows the tray and keeps room for decoys', () => {
    expect(kimTraySize(1)).toBe(5)
    expect(kimTraySize(50)).toBe(13)
    expect(kimStudyMs(1)).toBe(7000)
    expect(kimStudyMs(40)).toBe(4000)
  })
  it('one object goes missing, the rest stay, and decoys were never on the tray', () => {
    for (let seed = 1; seed < 100; seed++) {
      const d = dealKim(1 + (seed % 15), mulberry32(seed))
      expect(d.after).toHaveLength(d.tray.length - 1)
      expect(d.after).not.toContain(d.missing)
      expect(new Set([...d.after, d.missing])).toEqual(new Set(d.tray))
      expect(d.choices).toHaveLength(KIM_CHOICES)
      expect(d.choices).toContain(d.missing)
      for (const c of d.choices) if (c !== d.missing) expect(d.tray).not.toContain(c)
    }
  })
})
