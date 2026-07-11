import { forwardRef, useEffect, useMemo, useRef } from 'react'
import { CELL_COUNT, GRID_W, GRID_H, cellIndex, counts } from '../lib/paintLogic'
import { cn } from '@/lib/utils'

// How many of a player's most-recently-painted cells stay "wet" (bright
// bg-retro-p1/p2 + glow) before fading to the duller bg-retro-tint-p1/p2.
const TRAIL_LEN = 10

// Presentational Paint Turf arena. Unlike Tron/Snake (full re-render at
// ~8-10 Hz), Paint's grid changes stream in at up to ~60 Hz, so the 400 cell
// divs are built ONCE (memoized, refs captured per cell) and every
// subsequent grid update mutates only the DOM nodes whose backing cell value
// actually changed — bypassing React's diffing for the grid entirely.
function applyCellClass(el, value, fresh) {
  if (!el) return
  el.className = value === 0
    ? 'w-full h-full bg-retro-surface'
    : value === 1
      ? (fresh ? 'w-full h-full bg-retro-p1 shadow-neon-p1' : 'w-full h-full bg-retro-tint-p1')
      : (fresh ? 'w-full h-full bg-retro-p2 shadow-neon-p2' : 'w-full h-full bg-retro-tint-p2')
}

const PaintArena = forwardRef(function PaintArena(
  { grid, players, timeLeft, mySide, namesX = 'X', namesO = 'O', overlay, dim = false },
  ref,
) {
  const cellRefs = useRef(Array(CELL_COUNT).fill(null))
  const prevGridRef = useRef(null)               // last-diffed grid (plain array) | null
  const freshRef = useRef({ X: [], O: [] })      // per-owner recency ring buffers, cap TRAIL_LEN

  // Built exactly once — the grid never needs to re-render through React;
  // every cell's class is mutated imperatively via applyCellClass below.
  const cellEls = useMemo(() => (
    Array.from({ length: CELL_COUNT }, (_, i) => (
      <div key={i} ref={(el) => { cellRefs.current[i] = el }} className="w-full h-full bg-retro-surface" />
    ))
  ), [])

  useEffect(() => {
    if (!grid) return
    const prev = prevGridRef.current
    for (let i = 0; i < CELL_COUNT; i++) {
      const v = grid[i]
      if (prev && prev[i] === v) continue
      applyCellClass(cellRefs.current[i], v, true)
      if (v === 0) continue
      const owner = v === 1 ? 'X' : 'O'
      const arr = freshRef.current[owner]
      const dupeAt = arr.indexOf(i)
      if (dupeAt !== -1) arr.splice(dupeAt, 1)
      arr.unshift(i)
      if (arr.length > TRAIL_LEN) {
        const dropped = arr.pop()
        // Only dim it back down if still owned by this player (not repainted since).
        if (grid[dropped] === (owner === 'X' ? 1 : 2)) {
          applyCellClass(cellRefs.current[dropped], grid[dropped], false)
        }
      }
    }
    prevGridRef.current = Array.from(grid)
  }, [grid])

  const c = grid ? counts(grid) : { X: 0, O: 0, neutral: CELL_COUNT }
  const pctX = (c.X / CELL_COUNT) * 100
  const pctO = (c.O / CELL_COUNT) * 100
  const contested = Math.abs(c.X - c.O) < 20
  const secs = Math.max(0, Math.ceil(timeLeft ?? 0))
  const flashClock = secs <= 10 && secs > 0

  const isSlowed = (p, ownerCode) => {
    if (!p || !grid) return false
    return grid[cellIndex(p.x, p.y)] !== 0 && grid[cellIndex(p.x, p.y)] !== ownerCode
  }
  const slowedX = isSlowed(players?.X, 1)
  const slowedO = isSlowed(players?.O, 2)

  // Center the rendered square on the player's logical (cell-center)
  // position — matches the pct(entity - RADIUS) convention every other
  // continuous-position entity in the codebase uses (SumoArena/
  // SpaceduelArena). A 1-cell-wide square's half-size is 0.5 cell units, so
  // subtract 0.5 before converting to a percentage; without this the square
  // renders half a cell down-and-right of the player's real position.
  const playerStyle = (p) => ({
    width: `${100 / GRID_W}%`, height: `${100 / GRID_H}%`,
    left: `${((p.x - 0.5) / GRID_W) * 100}%`, top: `${((p.y - 0.5) / GRID_H) * 100}%`,
    transform: (p.dir === 'left' || p.dir === 'right') ? 'scaleX(1.15)' : 'scaleY(1.15)',
  })

  return (
    <div className="space-y-2 select-none">
      {/* Split score bar — p1 fill grows from the left, p2 from the right,
          the retro-structure base shows through as the "neutral" gap. */}
      <div className="relative h-3 w-full rounded-full overflow-hidden bg-retro-structure">
        <div className="absolute inset-y-0 left-0 bg-retro-p1" style={{ width: `${pctX}%` }} />
        <div className="absolute inset-y-0 right-0 bg-retro-p2" style={{ width: `${pctO}%` }} />
        {contested && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-retro-cta shadow-glow-dot" />
        )}
      </div>

      <div className="flex items-center justify-center gap-8 font-pixel">
        <span className={cn('text-lg tabular-nums', mySide === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p1/80')}>
          {c.X}
        </span>
        <span className={cn('text-2xl tabular-nums', flashClock ? 'text-retro-p2 animate-pulse' : 'text-retro-text')}>
          {secs}
        </span>
        <span className={cn('text-lg tabular-nums', mySide === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-p2/80')}>
          {c.O}
        </span>
      </div>

      <div
        ref={ref}
        className={cn(
          'relative w-full rounded-lg border-2 border-retro-border bg-retro-surface overflow-hidden touch-none',
          dim && 'opacity-60',
        )}
        style={{ aspectRatio: `${GRID_W} / ${GRID_H}`, cursor: 'none' }}
      >
        <div
          className="grid w-full h-full"
          style={{ gridTemplateColumns: `repeat(${GRID_W}, 1fr)`, gridTemplateRows: `repeat(${GRID_H}, 1fr)` }}
        >
          {cellEls}
        </div>

        {players?.X && (
          <div
            style={playerStyle(players.X)}
            className={cn('absolute rounded-sm bg-retro-p1 shadow-neon-p1', slowedX && 'opacity-60 animate-pulse')}
          />
        )}
        {players?.O && (
          <div
            style={playerStyle(players.O)}
            className={cn('absolute rounded-sm bg-retro-p2 shadow-neon-p2', slowedO && 'opacity-60 animate-pulse')}
          />
        )}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 font-pixel text-[8px]">
        <span className="text-retro-p1">{namesX?.toUpperCase()}{mySide === 'X' ? ' (YOU)' : ''}</span>
        <span className="text-retro-dim">↑ ↓ ← → · WASD · SWIPE</span>
        <span className="text-retro-p2">{namesO?.toUpperCase()}{mySide === 'O' ? ' (YOU)' : ''}</span>
      </div>
    </div>
  )
})

export default PaintArena
