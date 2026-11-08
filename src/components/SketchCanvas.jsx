// Shared drawing surface for SKETCH. Fully self-contained: owns its own Firebase
// subscription (independent of the parent's whole-game onValue), its own toolbar
// state, and every strokes/undo/clear write. Non-artists render the exact same
// component with isArtist={false} — read-only, no toolbar, no pointer handlers.
//
// Strokes live at games/{gameId}/round/strokes/{pushId}: { c, w, p, g }
//   c: palette index (0-7), w: brush size (1|2|3), p: [x0,y0,x1,y1,...] — ints
//   quantized to the 0-255 grid, which IS the SVG viewBox, so rendering needs
//   no dequantize step. g groups periodic segments from one pointer gesture.
//
// Fills live at games/{gameId}/round/fills/{pushId}: { c, p }
//   c: palette index, p: flat [gx0,gy0,gx1,gy1,...] grid cells on a 64×64 grid
//   (each cell = 4×4 viewBox units). Rendered as <rect> behind strokes.
//
// The palette and layers live in SketchDrawing.jsx (the sanctioned hardcoded-hex
// exception). The artist's tools are one dock under the canvas; `children` is an
// overlay drawn over the canvas (the guess bubbles), `side` caps the canvas
// width so the whole stage fits one screen, and `onContent` hands the page the
// current strokes and fills (it keeps them for the end-of-match gallery).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, onChildAdded, onChildRemoved, push, remove, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { quantize } from '../lib/sketchLogic'
import { cn } from '@/lib/utils'
import { PALETTE, BRUSH_WIDTHS, GRID, SCALE } from '../lib/sketchPalette'
import { DrawingLayers } from './SketchDrawing'

const FLUSH_MS = 100

// Mark wall grid from strokes. grid[y*GRID+x] = 1 for wall.
function buildWallGrid(strokes) {
  const grid = new Uint8Array(GRID * GRID)
  for (const s of Object.values(strokes)) {
    const pts = s.p || []
    if (pts.length < 2) continue
    const w = s.w
    const sw = BRUSH_WIDTHS[w] ?? BRUSH_WIDTHS[2]
    const radius = Math.max(1, Math.ceil(sw / 2 / SCALE))
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = Math.floor(pts[i] / SCALE)
      const y0 = Math.floor(pts[i + 1] / SCALE)
      const x1 = Math.floor(pts[i + 2] / SCALE)
      const y1 = Math.floor(pts[i + 3] / SCALE)
      // Bresenham
      let dx = Math.abs(x1 - x0)
      let dy = Math.abs(y1 - y0)
      let sx = x0 < x1 ? 1 : -1
      let sy = y0 < y1 ? 1 : -1
      let err = dx - dy
      let x = x0
      let y = y0
      for (;;) {
        for (let ry = -radius + 1; ry < radius; ry++) {
          for (let rx = -radius + 1; rx < radius; rx++) {
            const nx = x + rx
            const ny = y + ry
            if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) {
              if (rx * rx + ry * ry < radius * radius + 1) grid[ny * GRID + nx] = 1
            }
          }
        }
        if (x === x1 && y === y1) break
        const e2 = 2 * err
        if (e2 > -dy) { err -= dy; x += sx }
        if (e2 < dx) { err += dx; y += sy }
      }
    }
    // single-point dot
    if (pts.length === 2) {
      const gx = Math.floor(pts[0] / SCALE)
      const gy = Math.floor(pts[1] / SCALE)
      for (let ry = -radius + 1; ry < radius; ry++) {
        for (let rx = -radius + 1; rx < radius; rx++) {
          const nx = gx + rx
          const ny = gy + ry
          if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) {
            if (rx * rx + ry * ry < radius * radius + 1) grid[ny * GRID + nx] = 1
          }
        }
      }
    }
  }
  return grid
}

function floodFillCells(strokes, sx, sy) {
  const gx = Math.floor(sx / SCALE)
  const gy = Math.floor(sy / SCALE)
  if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID) return null
  const wall = buildWallGrid(strokes)
  if (wall[gy * GRID + gx] === 1) return null
  const visited = new Uint8Array(GRID * GRID)
  const queue = [[gx, gy]]
  visited[gy * GRID + gx] = 1
  const cells = []
  let head = 0
  while (head < queue.length) {
    const [x, y] = queue[head++]
    cells.push(x, y)
    // guard against filling entire canvas accidentally being too large
    if (cells.length > 8000) break
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (const [dx, dy] of dirs) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue
      const idx = ny * GRID + nx
      if (visited[idx] || wall[idx]) continue
      visited[idx] = 1
      queue.push([nx, ny])
    }
  }
  if (cells.length === 0) return null
  return cells
}

// Mirrors a node's children into `setMap`, at most once per frame.
function subscribeChildren(nodeRef, setMap) {
  const local = {}
  let frame = 0
  const publish = () => { frame = 0; setMap({ ...local }) }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(publish) }
  const unAdd = onChildAdded(nodeRef, snap => { local[snap.key] = snap.val(); schedule() })
  const unRem = onChildRemoved(nodeRef, snap => { delete local[snap.key]; schedule() })
  return () => { unAdd(); unRem(); cancelAnimationFrame(frame) }
}

export default function SketchCanvas({ gameId, isArtist, side = null, onContent = null, children = null }) {
  const [strokes, setStrokes] = useState({})
  const [fills, setFills] = useState({})
  const [color, setColor] = useState(0)
  const [brushSize, setBrushSize] = useState(2)
  const [tool, setTool] = useState('brush') // 'brush' | 'bucket'

  const svgRef = useRef(null)
  const pointerDownRef = useRef(false)
  const gestureIdRef = useRef(null)
  const bufferRef = useRef([]) // flat quantized ints buffered since the last flush
  const flushTimerRef = useRef(null)

  // Strokes and fills subscriptions. Child events are coalesced into one
  // state update per animation frame: joining mid-round fires one
  // onChildAdded per existing segment, and copying the map on each of those
  // was quadratic in the drawing's size.
  useEffect(() => subscribeChildren(ref(db, `games/${gameId}/round/strokes`), setStrokes), [gameId])
  useEffect(() => subscribeChildren(ref(db, `games/${gameId}/round/fills`), setFills), [gameId])

  // Let the page keep the latest drawing (read at reveal time for the gallery).
  const onContentRef = useRef(onContent)
  useEffect(() => { onContentRef.current = onContent })
  useEffect(() => { onContentRef.current?.(strokes, fills) }, [strokes, fills])

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
    push(ref(db, `games/${gameId}/round/strokes`), {
      c: color,
      w: brushSize,
      p: pts,
      ...(gestureIdRef.current ? { g: gestureIdRef.current } : {}),
    })
    bufferRef.current = pts.slice(-2)
  }, [gameId, color, brushSize])

  const handleBucketFill = useCallback((x, y) => {
    const cells = floodFillCells(strokes, x, y)
    if (!cells || cells.length === 0) return
    // Don't push fills that would cover >90% of canvas (likely accidental click on empty canvas)
    // — still allow but cap single fill to avoid huge payload on empty canvas
    // Empty canvas fill = 4096 cells *2 = 8192 ints — acceptable, keep it.
    push(ref(db, `games/${gameId}/round/fills`), { c: color, p: cells })
  }, [gameId, color, strokes])

  const handlePointerDown = useCallback((e) => {
    if (!isArtist) return
    // Capture on the svg itself: target may be a polyline/rect child, and
    // touch-action isn't inherited — a stroke starting on an old stroke would
    // otherwise hand the gesture to the browser (page scroll).
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    const [x, y] = pointToQuantized(e)
    if (tool === 'bucket') {
      handleBucketFill(x, y)
      return
    }
    bufferRef.current = [x, y]
    gestureIdRef.current = push(ref(db, `games/${gameId}/round/strokes`)).key
    pointerDownRef.current = true
    if (flushTimerRef.current) clearInterval(flushTimerRef.current)
    flushTimerRef.current = setInterval(flush, FLUSH_MS)
  }, [gameId, isArtist, pointToQuantized, flush, tool, handleBucketFill])

  const handlePointerMove = useCallback((e) => {
    if (!isArtist || !pointerDownRef.current) return
    if (tool === 'bucket') return
    const [x, y] = pointToQuantized(e)
    // In place: flush() hands the old array to push(), which serialises it
    // synchronously, then starts a new one.
    bufferRef.current.push(x, y)
  }, [isArtist, pointToQuantized, tool])

  const handlePointerEnd = useCallback(() => {
    if (!isArtist) return
    if (tool === 'bucket') return
    if (!pointerDownRef.current) return
    pointerDownRef.current = false
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current)
      flushTimerRef.current = null
    }
    flush() // don't drop whatever was buffered since the last 100ms tick
    gestureIdRef.current = null
  }, [isArtist, flush, tool])

  // Undo latest action. New stroke segments share gesture ID, so one undo
  // removes the complete gesture. Legacy segments without g remain standalone.
  const handleUndo = useCallback(() => {
    const fillKeys = Object.keys(fills).sort()
    const strokeKeys = Object.keys(strokes).sort()
    const lastFill = fillKeys[fillKeys.length - 1]
    const lastStroke = strokeKeys[strokeKeys.length - 1]
    // pushIds sort chronologically — pick whichever is lexicographically larger (more recent)
    if (lastFill && lastStroke) {
      if (lastFill > lastStroke) {
        remove(ref(db, `games/${gameId}/round/fills/${lastFill}`))
      } else {
        const gesture = strokes[lastStroke]?.g
        const keys = gesture
          ? strokeKeys.filter(key => strokes[key]?.g === gesture)
          : [lastStroke]
        Promise.all(keys.map(key => remove(ref(db, `games/${gameId}/round/strokes/${key}`))))
      }
    } else if (lastFill) {
      remove(ref(db, `games/${gameId}/round/fills/${lastFill}`))
    } else if (lastStroke) {
      const gesture = strokes[lastStroke]?.g
      const keys = gesture
        ? strokeKeys.filter(key => strokes[key]?.g === gesture)
        : [lastStroke]
      Promise.all(keys.map(key => remove(ref(db, `games/${gameId}/round/strokes/${key}`))))
    }
  }, [strokes, fills, gameId])

  const handleClear = useCallback(() => {
    set(ref(db, `games/${gameId}/round/strokes`), null)
    set(ref(db, `games/${gameId}/round/fills`), null)
  }, [gameId])

  const toolBtn = (active) => cn(
    'w-10 h-11 shrink-0 flex items-center justify-center rounded border-2 transition press',
    active ? 'border-retro-cta bg-retro-cta text-retro-bg' : 'border-retro-border text-retro-dim',
  )

  return (
    <div className="space-y-1.5">
      <div className="relative mx-auto" style={{ width: side ? `${side}px` : '100%', maxWidth: '100%' }}>
        <svg
          ref={svgRef}
          viewBox="0 0 256 256"
          shapeRendering="crispEdges"
          data-testid="sketch-canvas"
          style={{ touchAction: 'none', backgroundColor: '#ffffff', width: '100%', aspectRatio: '1 / 1' }}
          className="block rounded border-2 border-retro-border select-none touch-none [&_*]:touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
        >
          <DrawingLayers strokes={strokes} fills={fills} />
        </svg>
        {children}
      </div>

      {isArtist && (
        <div className="space-y-1 rounded border border-retro-border bg-retro-card p-1" data-testid="sketch-dock">
          <div className="grid grid-cols-8 gap-1">
            {PALETTE.map((hex, i) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(i)}
                aria-label={`Color swatch ${i + 1}`}
                aria-pressed={color === i}
                className={cn(
                  'w-full h-10 rounded border-2 transition-transform press',
                  color === i ? 'border-retro-cta shadow-neon-cta scale-105' : 'border-retro-border',
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setTool('brush')} aria-label="Brush tool" aria-pressed={tool === 'brush'} className={toolBtn(tool === 'brush')}>
              <span aria-hidden="true">🖌</span>
            </button>
            <button type="button" onClick={() => setTool('bucket')} aria-label="Fill bucket tool" aria-pressed={tool === 'bucket'} className={toolBtn(tool === 'bucket')}>
              <span aria-hidden="true">🪣</span>
            </button>
            {[1, 2, 3].map(size => (
              <button
                key={size}
                type="button"
                onClick={() => setBrushSize(size)}
                aria-label={`Brush size ${size}`}
                aria-pressed={brushSize === size}
                disabled={tool === 'bucket'}
                className={cn(
                  'w-10 h-11 shrink-0 flex items-center justify-center rounded border-2 transition press',
                  brushSize === size ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border',
                  tool === 'bucket' && 'opacity-40',
                )}
              >
                <span className="rounded-full bg-retro-text" style={{ width: BRUSH_WIDTHS[size], height: BRUSH_WIDTHS[size] }} />
              </button>
            ))}
            <button
              type="button"
              onClick={handleUndo}
              className="min-h-11 flex-1 min-w-0 px-1 font-pixel text-[8px] border-2 border-retro-border text-retro-dim rounded hover:border-retro-p1 hover:text-retro-p1 transition press"
            >
              UNDO
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="min-h-11 flex-1 min-w-0 px-1 font-pixel text-[8px] border-2 border-retro-border text-retro-dim rounded hover:border-retro-p2 hover:text-retro-p2 transition press"
            >
              CLEAR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
