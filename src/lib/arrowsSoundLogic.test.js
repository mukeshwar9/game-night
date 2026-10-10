import { describe, expect, it } from 'vitest'
import { ARROWS_PENTATONIC, melodicNote } from './arrowsSoundLogic'

describe('melodicNote', () => {
  it('starts on the root and ascends through the scale', () => {
    expect(melodicNote(0)).toBe(523)
    const first = Array.from({ length: 10 }, (_, i) => melodicNote(i))
    expect(first).toEqual(ARROWS_PENTATONIC)
  })
  it('turns around without repeating the top note', () => {
    expect(melodicNote(9)).toBe(1760)
    expect(melodicNote(10)).toBe(1568)
    expect(melodicNote(17)).toBe(587)
  })
  it('repeats with period 18', () => {
    for (let i = 0; i < 40; i += 1) expect(melodicNote(i + 18)).toBe(melodicNote(i))
    expect(melodicNote(18)).toBe(523)
  })
  it('never leaves the scale', () => {
    for (let i = 0; i < 200; i += 1) expect(ARROWS_PENTATONIC).toContain(melodicNote(i))
  })
  it('treats negative and NaN streaks as 0', () => {
    expect(melodicNote(-5)).toBe(523)
    expect(melodicNote(NaN)).toBe(523)
    expect(melodicNote(undefined)).toBe(523)
  })
})
