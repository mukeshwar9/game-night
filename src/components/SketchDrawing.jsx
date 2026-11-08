// The shared look of a SKETCH drawing: the palette, the brush widths and the
// SVG layers (fills behind strokes) used by the live canvas and by the
// gallery thumbnails, so a saved drawing is drawn exactly as it was played.
//
// Palette and brush widths: src/lib/sketchPalette.js.
import { PALETTE, BRUSH_WIDTHS, SCALE, toPolylinePoints } from '../lib/sketchPalette'

// A map ({ pushId: item }) or an already ordered array, as [[key, item], ...]
// in draw order (push ids sort chronologically).
function ordered(items) {
  if (Array.isArray(items)) return items.map((item, i) => [i, item])
  return Object.entries(items || {}).sort(([a], [b]) => (a < b ? -1 : 1))
}

// Fills first (behind), then strokes. Render inside an <svg viewBox="0 0 256 256">.
export function DrawingLayers({ strokes, fills }) {
  return (
    <>
      {ordered(fills).map(([key, f]) => {
        const pts = f.p || []
        const fillColor = PALETTE[f.c] ?? PALETTE[0]
        const rects = []
        for (let i = 0; i + 1 < pts.length; i += 2) {
          rects.push(<rect key={i} x={pts[i] * SCALE} y={pts[i + 1] * SCALE} width={SCALE} height={SCALE} fill={fillColor} />)
        }
        return <g key={`f${key}`}>{rects}</g>
      })}
      {ordered(strokes).map(([key, s]) => (
        <polyline
          key={`s${key}`}
          points={toPolylinePoints(s.p || [])}
          stroke={PALETTE[s.c] ?? PALETTE[0]}
          strokeWidth={BRUSH_WIDTHS[s.w] ?? BRUSH_WIDTHS[2]}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </>
  )
}

// A finished drawing as a still picture (gallery cards).
export function DrawingThumb({ strokes, fills, className = '', label }) {
  return (
    <svg
      viewBox="0 0 256 256"
      shapeRendering="crispEdges"
      role="img"
      aria-label={label || 'drawing'}
      style={{ backgroundColor: '#ffffff', width: '100%', aspectRatio: '1 / 1' }}
      className={className}
    >
      <DrawingLayers strokes={strokes} fills={fills} />
    </svg>
  )
}
