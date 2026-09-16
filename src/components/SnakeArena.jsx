import { forwardRef } from 'react'
import { GRID } from '../lib/snakeLogic'
import { cn } from '@/lib/utils'

// Presentational Snake Battle arena. DOM/CSS (no canvas) so it themes like
// every other board via --c-* vars. The background is a static GRID×GRID
// grid (empty cells + food); snake segments render as absolutely-positioned
// overlay cells on top, keyed by fractional x/y (0..GRID) rather than a
// grid-cell lookup — this lets the guest interpolate segment positions
// between snapshots (see SnakeGame.jsx's RENDER_DELAY_MS lerp) instead of
// only ever snapping to whole cells. Body cells are colored by owner
// (retro-p1 / retro-p2); food is retro-cta; dead snake bodies dim. Input is
// captured by the parent via the forwarded ref to the arena element.
const SnakeArena = forwardRef(function SnakeArena(
  { snakes, food, eatenX, eatenO, mySide, namesX = 'X', namesO = 'O', overlay, dim = false },
  ref,
) {
  const cellSize = 100 / GRID

  return (
    <div className="space-y-2 select-none">
      {/* Score (food eaten this round) */}
      <div className="flex items-center justify-center gap-8 font-pixel">
        <span className={cn('text-2xl tabular-nums', mySide === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p1/80')}>
          {eatenX}
        </span>
        <span className="text-[8px] text-retro-dim tracking-widest">SNAKE</span>
        <span className={cn('text-2xl tabular-nums', mySide === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-p2/80')}>
          {eatenO}
        </span>
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
            const isFood = food && food.x === x && food.y === y
            return <div key={i} className={cn('w-full h-full', isFood ? 'bg-retro-cta shadow-glow-dot' : 'bg-retro-bg/40')} />
          })}
        </div>

        {['X', 'O'].flatMap(side => {
          const snake = snakes?.[side]
          if (!snake) return []
          return snake.body.map((seg, i) => {
            const head = i === 0
            const className = head && snake.alive
              ? (side === 'X' ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-p2 shadow-neon-p2')
              : (side === 'X' ? 'bg-retro-p1/70' : 'bg-retro-p2/70')
            return (
              <div
                key={`${side}-${i}`}
                className={cn('absolute', className)}
                style={{
                  width: `${cellSize}%`, height: `${cellSize}%`,
                  left: `${seg.x * cellSize}%`, top: `${seg.y * cellSize}%`,
                }}
              />
            )
          })
        })}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>

      {/* Player labels */}
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

export default SnakeArena
