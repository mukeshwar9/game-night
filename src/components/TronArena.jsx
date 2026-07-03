import { forwardRef, useMemo } from 'react'
import { GRID } from '../lib/tronLogic'
import { cn } from '@/lib/utils'

// Presentational Tron Light Cycles arena. DOM/CSS grid (no canvas) so it
// themes like every other board via --c-* vars. Trail cells are colored by
// owner (retro-p1 / retro-p2); the HEAD (body[0]) of an alive cycle is
// brightened with retro-win + glow. Input is captured by the parent via the
// forwarded ref to the arena element. Tron has no mid-round score counter,
// so the score row shows 0/0 placeholders (the finished card owns the result).
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
      <div className="flex items-center justify-center gap-8 font-pixel">
        <span className={cn('text-2xl tabular-nums', mySide === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p1/80')}>
          0
        </span>
        <span className="text-[8px] text-retro-dim tracking-widest">TRON</span>
        <span className={cn('text-2xl tabular-nums', mySide === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-p2/80')}>
          0
        </span>
      </div>

      <div
        ref={ref}
        className={cn(
          'relative w-full rounded-lg border-2 border-retro-border bg-retro-surface overflow-hidden touch-none',
          dim && 'opacity-60',
        )}
        style={{ aspectRatio: '1 / 1', cursor: 'none' }}
      >
        <div
          className="grid w-full h-full"
          style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)`, gridTemplateRows: `repeat(${GRID}, 1fr)` }}
        >
          {Array.from({ length: GRID * GRID }, (_, i) => {
            const x = i % GRID
            const y = Math.floor(i / GRID)
            const cell = cellMap.get(`${x},${y}`)
            let className = 'bg-retro-bg/40'
            if (cell) {
              if (cell.head && cell.alive) {
                className = cell.side === 'X' ? 'bg-retro-win shadow-glow-dot' : 'bg-retro-win shadow-glow-dot'
              } else {
                className = cell.side === 'X' ? 'bg-retro-p1' : 'bg-retro-p2'
              }
            }
            return <div key={i} className={cn('w-full h-full', className)} />
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
        <span className="text-retro-dim">↑ ↓ ← → · WASD · SWIPE</span>
        <span className="text-retro-p2">{namesO?.toUpperCase()}{mySide === 'O' ? ' (YOU)' : ''}</span>
      </div>
    </div>
  )
})

export default TronArena
