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
// Fills live at games/{gameId}/round/fills/{pushId}: { c, p }
//   c: palette index, p: flat [gx0,gy0,gx1,gy1,...] grid cells on a 64×64 grid
//   (each cell = 4×4 viewBox units). Rendered as <rect> behind strokes.
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
const GRID = 64
const SCALE = 4 // 256 / GRID

// Flat [x0,y0,x1,y1,...] ints -> SVG polyline `points` string.
function toPolylinePoints(p) {
  const out = []
  for (let i = 0; i < p.length; i += 2) out.push(`${p[i]},${p[i + 1]}`)
  return out.join(' ')
}

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

export default function SketchCanvas({ gameId, isArtist }) {
  const [strokes, setStrokes] = useState({})
  const [fills, setFills] = useState({})
  const [color, setColor] = useState(0)
  const [brushSize, setBrushSize] = useState(2)
  const [tool, setTool] = useState('brush') // 'brush' | 'bucket'

  const svgRef = useRef(null)
  const pointerDownRef = useRef(false)
  const bufferRef = useRef([]) // flat quantized ints buffered since the last flush
  const flushTimerRef = useRef(null)

  // Strokes subscription
  useEffect(() => {
    const strokesRef = ref(db, `games/${gameId}/round/strokes`)
    const local = {}
    const unAdd = onChildAdded(strokesRef, snap => { local[snap.key] = snap.val(); setStrokes({ ...local }) })
    const unRem = onChildRemoved(strokesRef, snap => { delete local[snap.key]; setStrokes({ ...local }) })
    return () => { unAdd(); unRem() }
  }, [gameId])

  // Fills subscription
  useEffect(() => {
    const fillsRef = ref(db, `games/${gameId}/round/fills`)
    const local = {}
    const unAdd = onChildAdded(fillsRef, snap => { local[snap.key] = snap.val(); setFills({ ...local }) })
    const unRem = onChildRemoved(fillsRef, snap => { delete local[snap.key]; setFills({ ...local }) })
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
    e.target.setPointerCapture(e.pointerId)
    const [x, y] = pointToQuantized(e)
    if (tool === 'bucket') {
      handleBucketFill(x, y)
      return
    }
    bufferRef.current = [x, y]
    pointerDownRef.current = true
    if (flushTimerRef.current) clearInterval(flushTimerRef.current)
    flushTimerRef.current = setInterval(flush, FLUSH_MS)
  }, [isArtist, pointToQuantized, flush, tool, handleBucketFill])

  const handlePointerMove = useCallback((e) => {
    if (!isArtist || !pointerDownRef.current) return
    if (tool === 'bucket') return
    const [x, y] = pointToQuantized(e)
    bufferRef.current = [...bufferRef.current, x, y]
  }, [isArtist, pointToQuantized, tool])

  const handlePointerEnd = useCallback(() => {
    if (!isArtist) return
    if (tool === 'bucket') return
    pointerDownRef.current = false
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current)
      flushTimerRef.current = null
    }
    flush() // don't drop whatever was buffered since the last 100ms tick
  }, [isArtist, flush, tool])

  // Undo: remove most recent fill if any, otherwise last stroke.
  const handleUndo = useCallback(() => {
    const fillKeys = Object.keys(fills).sort()
    const strokeKeys = Object.keys(strokes).sort()
    const lastFill = fillKeys[fillKeys.length - 1]
    const lastStroke = strokeKeys[strokeKeys.length - 1]
    // pushIds sort chronologically — pick whichever is lexicographically larger (more recent)
    if (lastFill && lastStroke) {
      if (lastFill > lastStroke) remove(ref(db, `games/${gameId}/round/fills/${lastFill}`))
      else remove(ref(db, `games/${gameId}/round/strokes/${lastStroke}`))
    } else if (lastFill) {
      remove(ref(db, `games/${gameId}/round/fills/${lastFill}`))
    } else if (lastStroke) {
      remove(ref(db, `games/${gameId}/round/strokes/${lastStroke}`))
    }
  }, [strokes, fills, gameId])

  const handleClear = useCallback(() => {
    set(ref(db, `games/${gameId}/round/strokes`), null)
    set(ref(db, `games/${gameId}/round/fills`), null)
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
        {/* Fills behind strokes */}
        {Object.entries(fills)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([key, f]) => {
            const pts = f.p || []
            const fillColor = PALETTE[f.c] ?? PALETTE[0]
            return (
              <g key={key}>
                {(() => {
                  const rects = []
                  for (let i = 0; i + 1 < pts.length; i += 2) {
                    const gx = pts[i]
                    const gy = pts[i + 1]
                    rects.push(<rect key={i} x={gx * SCALE} y={gy * SCALE} width={SCALE} height={SCALE} fill={fillColor} />)
                  }
                  return rects
                })()}
              </g>
            )
          })}
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
          {/* Tool toggle */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTool('brush')}
              aria-label="Brush tool"
              aria-pressed={tool === 'brush'}
              className={cn(
                'px-3 py-1.5 font-pixel text-[9px] border-2 rounded transition-all active:scale-95 flex items-center gap-1',
                tool === 'brush' ? 'border-retro-cta bg-retro-cta text-retro-bg shadow-neon-cta' : 'border-retro-border text-retro-dim',
              )}
            >
              <span>🖌</span> BRUSH
            </button>
            <button
              type="button"
              onClick={() => setTool('bucket')}
              aria-label="Fill bucket tool"
              aria-pressed={tool === 'bucket'}
              className={cn(
                'px-3 py-1.5 font-pixel text-[9px] border-2 rounded transition-all active:scale-95 flex items-center gap-1',
                tool === 'bucket' ? 'border-retro-cta bg-retro-cta text-retro-bg shadow-neon-cta' : 'border-retro-border text-retro-dim',
              )}
            >
              <span>🪣</span> FILL
            </button>
            {tool === 'bucket' && (
              <span className="font-pixel text-[8px] text-retro-dim ml-1">TAP TO FILL ENCLOSED AREA</span>
            )}
          </div>
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
                  disabled={tool === 'bucket'}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded border-2 transition-all active:scale-90',
                    brushSize === size ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border',
                    tool === 'bucket' && 'opacity-40',
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
