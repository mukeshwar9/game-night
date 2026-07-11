import { forwardRef, useMemo } from 'react'
import { GRID } from '../lib/tronLogic'
import { cn } from '@/lib/utils'

// Presentational Tron Light Cycles arena. DOM/CSS grid (no canvas) so it
// themes like every other board via --c-* vars. Trail cells are colored by
// owner (retro-p1 / retro-p2); the HEAD (body[0]) of an alive cycle is
// brightened with retro-win + glow. Input is captured by the parent via the
// forwarded ref to the arena element. Tron has no mid-round score counter
// (single round, decided instantly by crash) — the top row shows a neutral
// VS + per-side identity dot instead of a number that would sit frozen at
// '0 · 0' for the whole round and read as a broken counter (M-77).
const TronArena = forwardRef(function TronArena(
  { cycles, mySide, namesX = 'X', namesO = 'O', overlay, dim = false },
  ref,
) {
  const cellMap = useMemo(() => {
    const map = new Map()
    for (const side of ['X', 'O']) {
      const cycle = cycles?.[side]
      if (!cycle) continue
      cycle.body.forEach((seg, i) => {
        map.set(`${seg.x},${seg.y}`, { side, head: i === 0, alive: cycle.alive })
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
            // Trail/head cells are visually scaled up + given a color halo
            // (M-75) so a 1-cell-wide line stays legible at phone widths —
            // purely a render-side thickening, GRID itself is untouched.
            let className = 'w-full h-full bg-retro-bg/40'
            if (cell) {
              if (cell.head && cell.alive) {
                className = 'w-full h-full relative z-10 scale-125 bg-retro-win shadow-neon-win'
              } else {
                className = cell.side === 'X'
                  ? 'w-full h-full relative scale-110 bg-retro-p1 shadow-[0_0_3px_1px_rgb(var(--c-p1))]'
                  : 'w-full h-full relative scale-110 bg-retro-p2 shadow-[0_0_3px_1px_rgb(var(--c-p2))]'
              }
            }
            return <div key={i} className={className} />
          })}
        </div>

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
