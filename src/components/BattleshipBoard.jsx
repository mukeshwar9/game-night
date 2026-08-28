import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

// One 10×10 grid, reused for both views:
//  - YOUR WATERS: fleetCells set → ships visible; incoming shots land here.
//  - TARGETING: fleetCells null → pure fog; your outgoing shots land here.
// Purely presentational — the page computes every cell's meaning.

const ROWS = Array.from({ length: 10 }, (_, i) => i)

// Miss marker fades in on the cell that just became the last shot; hits/sinks
// get the shared `place-pop` keyframe instead (applied via inline style below).
// FadeIn mounts fresh each time it becomes the last miss (React remounts on
// the isLast->false->true edge below), so its "hidden" state is the initial
// render, not a setState call inside the effect.
function FadeIn({ children }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <span className={cn('transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')}>
      {children}
    </span>
  )
}

function ShotGlyph({ result, isLast }) {
  const isMiss = result === 'miss'
  const isSunk = result && result.startsWith('sunk:')
  const glyph = isSunk ? '★' : result === 'hit' ? '✕' : isMiss ? '·' : ''
  return isLast && isMiss ? <FadeIn key="fade">{glyph}</FadeIn> : <span>{glyph}</span>
}

export default function BattleshipBoard({
  shots = {},          // { [cell]: 'miss' | 'hit' | 'sunk:<ship>' }
  fleetCells = null,   // Map<cellIndex, shipIndex> for per-ship shading, or null for fog view
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
      <div className="grid grid-cols-[18px_repeat(10,minmax(0,1fr))] gap-[2px] mb-0.5">
        <span />
        {ROWS.map(c => (
          <span key={`c${c}`} className="font-pixel text-[9px] text-retro-dim text-center">{c + 1}</span>
        ))}
      </div>
      {ROWS.map(r => (
        <div key={r} className="grid grid-cols-[18px_repeat(10,minmax(0,1fr))] gap-[2px] mb-[2px] items-center">
          <span className="font-pixel text-[9px] text-retro-dim text-center">
            {'ABCDEFGHIJ'[r]}
          </span>
          {ROWS.map(c => {
            const cell = r * 10 + c
            const result = shots[cell]
            const isHit = result === 'hit' || (result && result.startsWith('sunk:'))
            const isSunk = result && result.startsWith('sunk:')
            const shipIdx = fleetCells?.get ? fleetCells.get(cell) : (fleetCells?.has?.(cell) ? 0 : undefined)
            const isShip = shipIdx != null
            const isLast = cell === lastCell
            return (
              <button
                key={cell}
                onClick={() => !disabled && onCell?.(cell)}
                disabled={disabled}
                aria-label={`${'ABCDEFGHIJ'[r]}${c + 1}`}
                style={isLast && isHit ? { animation: 'place-pop 0.2s ease-out' } : undefined}
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
                          ? cn(
                              shipIdx % 2 === 0 ? 'bg-retro-border/80' : 'bg-retro-border/60',
                              'ring-1 ring-inset ring-retro-deep',
                            )
                          : 'bg-retro-surface hover:bg-retro-border/40',
                  isLast && 'ring-1 ring-retro-cta',
                  !disabled && onCell && !result && !isShip && 'cursor-crosshair',
                )}
              >
                <ShotGlyph result={result} isLast={isLast} />
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
