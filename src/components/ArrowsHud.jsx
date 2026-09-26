import { ARROWS_LIVES } from '../lib/arrowsLogic'
import { cn } from '@/lib/utils'

export function Lives({ n, size = 'md' }) {
  const box = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
  return (
    <span className="flex gap-1" role="img" aria-label={`${n} of ${ARROWS_LIVES} lives`}>
      {Array.from({ length: ARROWS_LIVES }, (_, i) => (
        <span
          key={i}
          className={box}
          style={{
            background: i < n ? 'rgb(var(--c-danger))' : 'rgb(var(--c-structure))',
            opacity: i < n ? 1 : 0.25,
            clipPath: 'polygon(50% 0%, 100% 35%, 82% 100%, 50% 78%, 18% 100%, 0% 35%)',
          }}
        />
      ))}
    </span>
  )
}

// One racer's row: name, progress bar toward a cleared board, lives.
export function RaceRow({ name, sym, cleared, total, lives, isMe, status }) {
  const pct = total > 0 ? Math.min(100, Math.round((cleared / total) * 100)) : 0
  const isX = sym === 'X'
  return (
    <div
      className={cn(
        'bg-retro-card border rounded px-2.5 py-2 space-y-1.5',
        isMe ? (isX ? 'border-retro-p1/60' : 'border-retro-p2/60') : 'border-retro-border',
        lives <= 0 && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('font-pixel text-[9px] truncate', isX ? 'text-retro-p1' : 'text-retro-p2')}>
          {name}
        </span>
        <Lives n={lives} size="sm" />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-retro-deep rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-[width] duration-200', isX ? 'bg-retro-p1' : 'bg-retro-p2')}
            style={{ width: `${pct}%` }}
          />
        </div>
        {status
          ? <span className="font-pixel text-[8px] text-retro-dim border border-retro-border rounded px-1 py-0.5">{status}</span>
          : <span className="font-pixel text-[8px] text-retro-dim tabular-nums w-11 text-right">{cleared}/{total}</span>}
      </div>
    </div>
  )
}
