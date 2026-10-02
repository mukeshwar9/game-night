import { cn } from '@/lib/utils'

// Shared pieces for the memory-shelf boards (Cup Shuffle, What Changed?, Lost &
// Found, Name Tags, Verbal Memory, N-Back, Split Signal).

// The shared 3-2-1 over a board before its level starts (duels stamp a start a
// few seconds ahead so both players are looking when the reveal begins).
export function CountdownCover({ msLeft, label = 'GET READY' }) {
  return (
    <div className="absolute inset-0 z-10 bg-retro-bg/85 rounded flex flex-col items-center justify-center gap-2" role="status">
      <p className="font-pixel text-[9px] text-retro-dim tracking-widest">{label}</p>
      <p className="font-pixel text-3xl text-retro-cta text-glow-cta">{msLeft == null ? '…' : Math.max(1, Math.ceil(msLeft / 1000))}</p>
    </div>
  )
}

// A draining bar for timed study phases.
export function PhaseBar({ left, total }) {
  return (
    <div className="h-1.5 rounded-full bg-retro-card overflow-hidden" aria-hidden="true">
      {left != null && total ? (
        <div className="h-full bg-retro-cta transition-[width] duration-100 ease-linear" style={{ width: `${Math.max(0, Math.min(100, (left / total) * 100))}%` }} />
      ) : null}
    </div>
  )
}

// The one-line status under a board.
export function BoardHint({ children, tone = 'text' }) {
  return (
    <p
      className={cn(
        'font-pixel text-[9px] text-center min-h-[1.5em] leading-relaxed',
        tone === 'cta' && 'text-retro-cta text-glow-cta',
        tone === 'danger' && 'text-retro-danger',
        tone === 'win' && 'text-retro-win text-glow-win',
        tone === 'text' && 'text-retro-text',
        tone === 'dim' && 'text-retro-dim',
      )}
      aria-live="polite"
    >
      {children}
    </p>
  )
}

// Lives as drawn hearts (an authored pixel heart, not a glyph).
export function Lives({ lives, max = 3 }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${lives} of ${max} lives left`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 7 6" className="w-3.5 h-3" shapeRendering="crispEdges" aria-hidden="true">
          {[[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [3, 5]].map(([x, y]) => (
            <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" className={i < lives ? 'fill-retro-danger' : 'fill-retro-border'} />
          ))}
        </svg>
      ))}
    </span>
  )
}
