// SKETCH drawing constants. The palette and the white canvas background are the
// sanctioned hardcoded-hex exception (docs/prds/README.md precedent: cursor
// sprites) — drawing content must look identical across themes. No DOM or React.

export const PALETTE = ['#1a1a1a', '#ffffff', '#e0393c', '#f2994a', '#f5d947', '#3fae6a', '#3a7bd5', '#7a4a2a']
export const BRUSH_WIDTHS = { 1: 3, 2: 7, 3: 13 }
export const GRID = 64
export const SCALE = 4 // 256 / GRID

// Flat [x0,y0,x1,y1,...] ints -> SVG polyline `points` string.
export function toPolylinePoints(p) {
  const out = []
  for (let i = 0; i < p.length; i += 2) out.push(`${p[i]},${p[i + 1]}`)
  return out.join(' ')
}
