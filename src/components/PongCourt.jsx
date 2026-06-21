import { forwardRef } from 'react'
import { PADDLE_H, PADDLE_W, PADDLE_INSET, BALL_R, GROW_MULT, SHRINK_MULT, PICKUP_SIZE } from '../lib/pongLogic'
import { cn } from '@/lib/utils'

const pct = (n) => `${n * 100}%`

const PICKUP_COLORS = {
  grow: 'bg-retro-win shadow-neon-win',
  shrink: 'bg-retro-p2 shadow-neon-p2',
  slow: 'bg-retro-cta shadow-neon-cta',
}

// Presentational Pong court. All positions are normalized (0..1) in the pure
// sim's coordinate space and mapped to CSS percentages, so the court themes
// like every other board (no canvas, no getComputedStyle). Input is captured
// by the parent via the forwarded ref to the court element.
const PongCourt = forwardRef(function PongCourt(
  { ball, paddles, scoreX, scoreO, mySide, namesX = 'X', namesO = 'O', overlay, dim = false, serving = false, pickups = [], effects, ballMod },
  ref,
) {
  const effHeight = (side) => {
    let h = PADDLE_H
    if (effects?.[side]?.grow > 0) h *= GROW_MULT
    if (effects?.[side]?.shrink > 0) h *= SHRINK_MULT
    return h
  }
  const hX = effHeight('X')
  const hO = effHeight('O')
  return (
    <div className="space-y-2 select-none">
      {/* Score */}
      <div className="flex items-center justify-center gap-8 font-pixel">
        <span className={cn('text-2xl tabular-nums', mySide === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p1/80')}>
          {scoreX}
        </span>
        <span className="text-[8px] text-retro-dim tracking-widest">PONG</span>
        <span className={cn('text-2xl tabular-nums', mySide === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-p2/80')}>
          {scoreO}
        </span>
      </div>

      {/* Court */}
      <div
        ref={ref}
        className={cn(
          'relative w-full rounded-lg border-2 border-retro-border bg-retro-surface overflow-hidden touch-none',
          dim && 'opacity-60',
        )}
        style={{ aspectRatio: '3 / 2', cursor: 'none' }}
      >
        {/* Centre net */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0 border-l-2 border-dashed border-retro-border/60" />

        {/* X paddle (left) */}
        <div
          className={cn('absolute rounded-sm', effects?.X?.grow > 0 ? 'bg-retro-win shadow-neon-win' : effects?.X?.shrink > 0 ? 'bg-retro-dim' : 'bg-retro-p1 shadow-neon-p1')}
          style={{
            left: pct(PADDLE_INSET - PADDLE_W / 2),
            top: pct(paddles.X - hX / 2),
            width: pct(PADDLE_W),
            height: pct(hX),
          }}
        />
        {/* O paddle (right) */}
        <div
          className={cn('absolute rounded-sm', effects?.O?.grow > 0 ? 'bg-retro-win shadow-neon-win' : effects?.O?.shrink > 0 ? 'bg-retro-dim' : 'bg-retro-p2 shadow-neon-p2')}
          style={{
            left: pct(1 - PADDLE_INSET - PADDLE_W / 2),
            top: pct(paddles.O - hO / 2),
            width: pct(PADDLE_W),
            height: pct(hO),
          }}
        />

        {/* Power-up pickups */}
        {pickups.map((pk) => (
          <div
            key={pk.id}
            className={cn('absolute rounded-sm animate-pulse', PICKUP_COLORS[pk.kind] || 'bg-retro-cta')}
            style={{
              left: pct(pk.x - PICKUP_SIZE / 2),
              top: pct(pk.y - PICKUP_SIZE / 2),
              width: pct(PICKUP_SIZE),
              height: pct(PICKUP_SIZE),
            }}
          />
        ))}
        {/* Ball — a square, classic Pong style. Pulses while held at centre during a serve delay.
            Tinted cta when the slow power-up is active. */}
        <div
          className={cn(
            'absolute shadow-glow-dot',
            serving && 'pong-ball-pulse',
            ballMod?.slow > 0 ? 'bg-retro-cta' : 'bg-retro-text',
          )}
          style={{
            left: pct(ball.x - BALL_R),
            top: pct(ball.y - BALL_R),
            width: pct(BALL_R * 2),
            height: pct(BALL_R * 2),
          }}
        />

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>

      {/* Player labels */}
      <div className="flex items-center justify-between px-1 font-pixel text-[8px]">
        <span className="text-retro-p1">{namesX?.toUpperCase()}{mySide === 'X' ? ' (YOU)' : ''}</span>
        <span className="text-retro-dim">↑ / ↓ · W / S · DRAG</span>
        <span className="text-retro-p2">{namesO?.toUpperCase()}{mySide === 'O' ? ' (YOU)' : ''}</span>
      </div>
    </div>
  )
})

export default PongCourt
