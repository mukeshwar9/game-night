// Shared drawing surface for SKETCH. Fully self-contained: owns its own Firebase
// subscription (independent of the parent's whole-game onValue), its own toolbar
// state, and every strokes/undo/clear write. Non-artists render the exact same
// component with isArtist={false} — read-only, no toolbar, no pointer handlers.
//
// Strokes live at games/{gameId}/round/strokes/{pushId}: { c, w, p }
//   c: palette index (0-7), w: brush size (1|2|3), p: [x0,y0,x1,y1,...] — ints
//   quantized to the 0-255 grid, which IS the SVG viewBox, so rendering needs
//   no dequantize step.
//
// Palette + white canvas background are the sanctioned hardcoded-hex exception
// (docs/prds/README.md precedent: cursor sprites) — drawing content must look
// identical across themes. Toolbar chrome (borders/labels) themes normally via
// retro-*/--c-* tokens.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, onChildAdded, onChildRemoved, push, remove, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { quantize } from '../lib/sketchLogic'
import { cn } from '@/lib/utils'

const PALETTE = ['#1a1a1a', '#ffffff', '#e0393c', '#f2994a', '#f5d947', '#3fae6a', '#3a7bd5', '#7a4a2a']
const BRUSH_WIDTHS = { 1: 3, 2: 7, 3: 13 }
const FLUSH_MS = 100

// Flat [x0,y0,x1,y1,...] ints -> SVG polyline `points` string.
function toPolylinePoints(p) {
  const out = []
  for (let i = 0; i < p.length; i += 2) out.push(`${p[i]},${p[i + 1]}`)
  return out.join(' ')
}

export default function SketchCanvas({ gameId, isArtist }) {
  const [strokes, setStrokes] = useState({})
  const [color, setColor] = useState(0)
  const [brushSize, setBrushSize] = useState(2)

  const svgRef = useRef(null)
  const pointerDownRef = useRef(false)
  const bufferRef = useRef([]) // flat quantized ints buffered since the last flush
  const flushTimerRef = useRef(null)

  // Own subscription — replay-on-mount (onChildAdded fires once per existing
  // child immediately) reconstructs the canvas for a late joiner for free, and
  // when the parent replaces the whole `round` between rounds, Firebase diffs
  // the subtree into a child_removed per old stroke, so the canvas empties
  // itself automatically with no round-boundary key needed.
  useEffect(() => {
    const strokesRef = ref(db, `games/${gameId}/round/strokes`)
    const local = {}
    const unAdd = onChildAdded(strokesRef, snap => { local[snap.key] = snap.val(); setStrokes({ ...local }) })
    const unRem = onChildRemoved(strokesRef, snap => { delete local[snap.key]; setStrokes({ ...local }) })
    return () => { unAdd(); unRem() }
  }, [gameId])

  // Stop any in-flight flush interval on unmount.
  useEffect(() => () => {
    if (flushTimerRef.current) clearInterval(flushTimerRef.current)
  }, [])

  const pointToQuantized = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    const fx = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0
    const fy = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0
    return [quantize(fx), quantize(fy)]
  }, [])

  // Push whatever's buffered since the last flush as one new stroke segment,
  // then reset the buffer to just the last point (not empty) so the next
  // segment starts contiguously with no visual gap.
  const flush = useCallback(() => {
    const pts = bufferRef.current
    if (pts.length < 2) return
    push(ref(db, `games/${gameId}/round/strokes`), { c: color, w: brushSize, p: pts })
    bufferRef.current = pts.slice(-2)
  }, [gameId, color, brushSize])

  const handlePointerDown = useCallback((e) => {
    if (!isArtist) return
    e.target.setPointerCapture(e.pointerId)
    const [x, y] = pointToQuantized(e)
    bufferRef.current = [x, y]
    pointerDownRef.current = true
    if (flushTimerRef.current) clearInterval(flushTimerRef.current)
    flushTimerRef.current = setInterval(flush, FLUSH_MS)
  }, [isArtist, pointToQuantized, flush])

  const handlePointerMove = useCallback((e) => {
    if (!isArtist || !pointerDownRef.current) return
    const [x, y] = pointToQuantized(e)
    bufferRef.current = [...bufferRef.current, x, y]
  }, [isArtist, pointToQuantized])

  const handlePointerEnd = useCallback(() => {
    if (!isArtist) return
    pointerDownRef.current = false
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current)
      flushTimerRef.current = null
    }
    flush() // don't drop whatever was buffered since the last 100ms tick
  }, [isArtist, flush])

  // Undo: remove only the single most-recently-pushed key (may only remove
  // part of one continuous pen stroke — intentional v1 simplification).
  const handleUndo = useCallback(() => {
    const keys = Object.keys(strokes).sort()
    const last = keys[keys.length - 1]
    if (last) remove(ref(db, `games/${gameId}/round/strokes/${last}`))
  }, [strokes, gameId])

  const handleClear = useCallback(() => {
    set(ref(db, `games/${gameId}/round/strokes`), null)
  }, [gameId])

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox="0 0 256 256"
        shapeRendering="crispEdges"
        style={{ touchAction: 'none', backgroundColor: '#ffffff', width: '100%', aspectRatio: '1 / 1' }}
        className="rounded border-2 border-retro-border select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {Object.entries(strokes)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([key, s]) => (
            <polyline
              key={key}
              points={toPolylinePoints(s.p || [])}
              stroke={PALETTE[s.c] ?? PALETTE[0]}
              strokeWidth={BRUSH_WIDTHS[s.w] ?? BRUSH_WIDTHS[2]}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
      </svg>

      {isArtist && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {PALETTE.map((hex, i) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(i)}
                aria-label={`Color swatch ${i + 1}`}
                aria-pressed={color === i}
                className={cn(
                  'w-7 h-7 rounded border-2 transition-transform active:scale-90 shrink-0',
                  color === i ? 'border-retro-cta shadow-neon-cta scale-110' : 'border-retro-border',
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBrushSize(size)}
                  aria-label={`Brush size ${size}`}
                  aria-pressed={brushSize === size}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded border-2 transition-all active:scale-90',
                    brushSize === size ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border',
                  )}
                >
                  <span
                    className="rounded-full bg-retro-text"
                    style={{ width: BRUSH_WIDTHS[size], height: BRUSH_WIDTHS[size] }}
                  />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleUndo}
                className="px-2.5 py-1.5 font-pixel text-[9px] border-2 border-retro-border text-retro-dim rounded hover:border-retro-p1 hover:text-retro-p1 transition-all active:scale-95"
              >
                UNDO
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1.5 font-pixel text-[9px] border-2 border-retro-border text-retro-dim rounded hover:border-retro-p2 hover:text-retro-p2 transition-all active:scale-95"
              >
                CLEAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
