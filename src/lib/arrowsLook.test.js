import { describe, it, expect } from 'vitest'
import { portalColourName, portalColourLabel, vBendD } from './arrowsLook'

describe('portal colours', () => {
  it('names the four pairs and wraps', () => {
    expect([0, 1, 2, 3, 4].map(portalColourName)).toEqual(['blue', 'orange', 'magenta', 'teal', 'blue'])
  })
  it('labels by colour, never by letter', () => {
    const p = { c: 1, a: [0, 0], b: [2, 3] }
    expect(portalColourLabel(p, 'a')).toBe('Portal, orange pair, column 1, row 1, leads to the other orange ring')
    expect(portalColourLabel({ ...p, oneway: true }, 'b')).toContain('exit only')
    expect(portalColourLabel({ ...p, turn: true }, 'a')).toContain('quarter clockwise')
  })
})

describe('vBendD', () => {
  it('meets in one point behind the spine', () => {
    // heads point +x (ux=1); prongs end at x=10, y=0 and y=8; bulge 4
    expect(vBendD([10, 0], [10, 8], 1, 0, 4)).toBe(' Q7 0 6 4 Q7 8 10 8')
  })
})
