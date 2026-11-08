// The shared look of a SKETCH drawing: the palette, the brush widths and the
// SVG layers (fills behind strokes) used by the live canvas and by the
// gallery thumbnails, so a saved drawing is drawn exactly as it was played.
//
// Palette and brush widths: src/lib/sketchPalette.js.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { PALETTE, BRUSH_WIDTHS, SCALE, toPolylinePoints } from '../lib/sketchPalette'
import { fillCount, frameAt, strokeDash } from '../lib/sketchReplayLogic'

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

// The same layers redrawn as a time-lapse (src/lib/sketchReplayLogic.js).
// Everything is rendered once, as in DrawingLayers, so the last frame is the
// finished picture; one requestAnimationFrame loop then hides what is not drawn
// yet, draws the current stroke along its length (stroke-dashoffset) and pours
// the current fill in cell by cell, with no React render per frame.
// `elapsed()` is the replay time in ms (negative = not started); `onDone`
// fires once when the last item is drawn.
const HIDDEN = 0
const PARTIAL = 1
const FULL = 2

export function ReplayLayers({ plan, elapsed, onDone }) {
  const rootRef = useRef(null)
  const elapsedRef = useRef(elapsed)
  const onDoneRef = useRef(onDone)
  useEffect(() => { elapsedRef.current = elapsed; onDoneRef.current = onDone })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const items = plan.items
    const els = new Array(items.length)
    root.querySelectorAll('[data-ri]').forEach(el => { els[Number(el.dataset.ri)] = el })
    const state = new Array(items.length).fill(-1)
    const poured = new Array(items.length).fill(0) // fill cells made visible

    const set = (i, next, progress) => {
      const el = els[i]
      const item = items[i]
      if (!el) return
      if (item.kind === 'stroke') {
        if (next === HIDDEN) {
          el.style.visibility = 'hidden'
        } else if (next === FULL) {
          el.style.visibility = ''
          el.style.strokeDasharray = ''
          el.style.strokeDashoffset = ''
        } else {
          const { dasharray, dashoffset } = strokeDash(item.len, progress)
          el.style.visibility = ''
          el.style.strokeDasharray = dasharray
          el.style.strokeDashoffset = String(dashoffset)
        }
      } else {
        // A fill is a group of cells in flood order: the group stays hidden and
        // each poured cell is made visible on its own.
        const cells = el.children
        const want = next === FULL ? cells.length : next === HIDDEN ? 0 : fillCount(cells.length, progress)
        if (want < poured[i]) {
          for (let k = want; k < poured[i]; k++) cells[k].style.visibility = ''
        } else {
          for (let k = poured[i]; k < want; k++) cells[k].style.visibility = 'visible'
        }
        poured[i] = want
        el.style.visibility = next === FULL ? '' : 'hidden'
      }
      state[i] = next
    }

    let frameId = 0
    let finished = false
    let applied = -1 // frame index last applied; items after it are hidden
    const tick = () => {
      const { index, progress, done } = frameAt(plan, elapsedRef.current())
      if (applied < 0 || index < applied) {
        // First frame (or the clock stepped back): set every item.
        for (let i = 0; i < items.length; i++) set(i, i < index ? FULL : HIDDEN, 0)
      } else {
        for (let i = applied; i < index; i++) if (state[i] !== FULL) set(i, FULL, 1)
      }
      if (index < items.length) set(index, progress > 0 ? PARTIAL : HIDDEN, progress)
      applied = index
      if (done) {
        if (!finished) { finished = true; onDoneRef.current?.() }
        return
      }
      frameId = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frameId)
  }, [plan])

  const fills = []
  const strokes = []
  plan.items.forEach((item, i) => {
    if (item.kind === 'fill') {
      const pts = item.data.p
      const fillColor = PALETTE[item.data.c] ?? PALETTE[0]
      const rects = []
      for (let k = 0; k + 1 < pts.length; k += 2) {
        rects.push(<rect key={k} x={pts[k] * SCALE} y={pts[k + 1] * SCALE} width={SCALE} height={SCALE} fill={fillColor} />)
      }
      fills.push(<g key={`f${item.key}`} data-ri={i}>{rects}</g>)
    } else {
      strokes.push(
        <polyline
          key={`s${item.key}`}
          data-ri={i}
          points={toPolylinePoints(item.data.p)}
          stroke={PALETTE[item.data.c] ?? PALETTE[0]}
          strokeWidth={BRUSH_WIDTHS[item.data.w] ?? BRUSH_WIDTHS[2]}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />,
      )
    }
  })
  // Fills behind strokes, as in DrawingLayers.
  return <g ref={rootRef}>{fills}{strokes}</g>
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
