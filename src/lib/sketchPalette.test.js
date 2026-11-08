import { describe, it, expect } from 'vitest'
import { PALETTE, BRUSH_WIDTHS, GRID, SCALE, toPolylinePoints } from './sketchPalette'

describe('sketchPalette', () => {
  it('keeps the eight drawing colours and three brush widths the strokes index into', () => {
    expect(PALETTE).toHaveLength(8)
    expect(PALETTE.every(c => /^#[0-9a-f]{6}$/.test(c))).toBe(true)
    expect(Object.keys(BRUSH_WIDTHS)).toEqual(['1', '2', '3'])
  })
  it('keeps the fill grid on the 256-unit canvas', () => {
    expect(GRID * SCALE).toBe(256)
  })
  it('turns flat ints into polyline points', () => {
    expect(toPolylinePoints([1, 2, 3, 4])).toBe('1,2 3,4')
    expect(toPolylinePoints([])).toBe('')
  })
})
