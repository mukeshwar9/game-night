import { cn } from '@/lib/utils'

// One 10×10 grid, reused for both views:
//  - YOUR WATERS: fleetCells set → ships visible; incoming shots land here.
//  - TARGETING: fleetCells null → pure fog; your outgoing shots land here.
// Purely presentational — the page computes every cell's meaning.

const ROWS = Array.from({ length: 10 }, (_, i) => i)

export default function BattleshipBoard({
  shots = {},          // { [cell]: 'miss' | 'hit' | 'sunk:<ship>' }
  fleetCells = null,   // Set of ship cell indices, or null for fog view
  lastCell = null,
  onCell,
  disabled = false,
  accent = 'p1',       // hit-marker accent: shooter's color
}) {
  const accentText = accent === 'p1' ? 'text-retro-p1' : 'text-retro-p2'
  const accentBg = accent === 'p1' ? 'bg-retro-tint-p1' : 'bg-retro-tint-p2'

  return (
    <div className="inline-block">
      {/* Column labels */}
      <div className="grid grid-cols-[14px_repeat(10,minmax(0,1fr))] gap-[2px] mb-0.5">
        <span />
        {ROWS.map(c => (
          <span key={`c${c}`} className="font-pixel text-[6px] text-retro-dim text-center">{c + 1}</span>
        ))}
      </div>
      {ROWS.map(r => (
        <div key={r} className="grid grid-cols-[14px_repeat(10,minmax(0,1fr))] gap-[2px] mb-[2px] items-center">
          <span className="font-pixel text-[6px] text-retro-dim text-center">
            {'ABCDEFGHIJ'[r]}
          </span>
          {ROWS.map(c => {
            const cell = r * 10 + c
            const result = shots[cell]
            const isHit = result === 'hit' || (result && result.startsWith('sunk:'))
            const isSunk = result && result.startsWith('sunk:')
            const isShip = !!fleetCells?.has(cell)
            const isLast = cell === lastCell
            return (
              <button
                key={cell}
                onClick={() => !disabled && onCell?.(cell)}
                disabled={disabled}
                aria-label={`${'ABCDEFGHIJ'[r]}${c + 1}`}
                className={cn(
                  'aspect-square rounded-[2px] flex items-center justify-center font-pixel text-[8px] select-none transition-colors',
                  'min-w-[18px]',
                  isSunk
                    ? cn(accentBg, accentText)
                    : isHit
                      ? cn('bg-retro-surface', accentText)
                      : result === 'miss'
                        ? 'bg-retro-deep text-retro-dim'
                        : isShip
                          ? 'bg-retro-border/80'
                          : 'bg-retro-surface hover:bg-retro-border/40',
                  isLast && 'ring-1 ring-retro-cta',
                  !disabled && onCell && !result && !isShip && 'cursor-crosshair',
                )}
              >
                {isSunk ? '★' : isHit ? '✕' : result === 'miss' ? '·' : ''}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
