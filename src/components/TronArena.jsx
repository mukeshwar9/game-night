import { forwardRef, useMemo } from 'react'
import { GRID } from '../lib/tronLogic'
import { cn } from '@/lib/utils'

// Presentational Tron Light Cycles arena. DOM/CSS grid (no canvas) so it
// themes like every other board via --c-* vars. Trail cells are colored by
// owner (retro-p1 / retro-p2). The HEAD (body[0]) of each cycle is rendered
// separately as an absolutely-positioned, fractionally-placed overlay (also
// colored by owner, retro-p1/retro-p2 — previously both heads used the same
// bg-retro-win, making X's head indistinguishable from O's) so the guest can
// interpolate it smoothly between snapshots (see TronGame.jsx's
// RENDER_DELAY_MS lerp) instead of only ever snapping to whole cells. Input
// is captured by the parent via the forwarded ref to the arena element. Tron
// has no mid-round score counter (a round is decided instantly by crash) —
// the top row shows a neutral VS + per-side identity dot instead of a number
// that would sit frozen at '0 · 0' for the whole round and read as a broken
// counter (M-77).
const TronArena = forwardRef(function TronArena(
  { cycles, mySide, namesX = 'X', namesO = 'O', overlay, dim = false },
  ref,
) {
  const cellSize = 100 / GRID
  const cellMap = useMemo(() => {
    const map = new Map()
    for (const side of ['X', 'O']) {
      const cycle = cycles?.[side]
      if (!cycle) continue
      // Trail only — the head (index 0) is rendered separately below.
      cycle.body.slice(1).forEach(seg => {
        map.set(`${seg.x},${seg.y}`, { side })
      })
    }
    return map
  }, [cycles])

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-center gap-3 font-pixel">
        <span
          aria-hidden="true"
          className={cn('h-2.5 w-2.5 rounded-full bg-retro-p1', mySide !== 'X' && 'opacity-50')}
          style={mySide === 'X' ? { boxShadow: '0 0 4px 1px rgb(var(--c-p1))' } : undefined}
        />
        <span className="text-[10px] text-retro-dim tracking-widest">VS</span>
        <span
          aria-hidden="true"
          className={cn('h-2.5 w-2.5 rounded-full bg-retro-p2', mySide !== 'O' && 'opacity-50')}
          style={mySide === 'O' ? { boxShadow: '0 0 4px 1px rgb(var(--c-p2))' } : undefined}
        />
      </div>

      {/* Arena — width is capped by both the container AND the viewport
          height (min() against a 100dvh-derived budget) so short/landscape
          phones still see the whole square arena instead of it overflowing. */}
      <div
        ref={ref}
        className={cn(
          'relative mx-auto rounded-lg border-2 border-retro-border bg-retro-surface overflow-hidden touch-none',
          dim && 'opacity-60',
        )}
        style={{ aspectRatio: '1 / 1', cursor: 'none', width: 'min(100%, calc(100dvh - 260px))' }}
      >
        <div
          className="grid w-full h-full"
          style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)`, gridTemplateRows: `repeat(${GRID}, 1fr)` }}
        >
          {Array.from({ length: GRID * GRID }, (_, i) => {
            const x = i % GRID
            const y = Math.floor(i / GRID)
            const cell = cellMap.get(`${x},${y}`)
            // Trail cells are visually scaled up + given a color halo (M-75)
            // so a 1-cell-wide line stays legible at phone widths — purely a
            // render-side thickening, GRID itself is untouched.
            const className = cell
              ? (cell.side === 'X'
                  ? 'w-full h-full relative scale-110 bg-retro-p1 shadow-[0_0_3px_1px_rgb(var(--c-p1))]'
                  : 'w-full h-full relative scale-110 bg-retro-p2 shadow-[0_0_3px_1px_rgb(var(--c-p2))]')
              : 'w-full h-full bg-retro-bg/40'
            return <div key={i} className={className} />
          })}
        </div>

        {/* Heads — absolutely positioned on top of the trail grid at a
            (possibly fractional, guest-interpolated) position, colored by
            side so they stay legible against — and distinguishable from —
            each other and the trail. */}
        {['X', 'O'].map(side => {
          const cycle = cycles?.[side]
          if (!cycle?.body?.length) return null
          const seg = cycle.body[0]
          const className = cycle.alive
            ? (side === 'X' ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-p2 shadow-neon-p2')
            : (side === 'X' ? 'bg-retro-p1/70' : 'bg-retro-p2/70')
          return (
            <div
              key={side}
              className={cn('absolute z-10 scale-125', className)}
              style={{
                width: `${cellSize}%`, height: `${cellSize}%`,
                left: `${seg.x * cellSize}%`, top: `${seg.y * cellSize}%`,
              }}
            />
          )
        })}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 font-pixel text-[8px]">
        <span className="text-retro-p1">{namesX?.toUpperCase()}{mySide === 'X' ? ' (YOU)' : ''}</span>
        <span className="text-retro-p2">{namesO?.toUpperCase()}{mySide === 'O' ? ' (YOU)' : ''}</span>
      </div>
      <p className="text-center font-pixel text-[10px] text-retro-dim leading-relaxed">
        ARROWS / WASD · SWIPE OR HOLD + DRAG ON TOUCH
      </p>
    </div>
  )
})

export default TronArena
