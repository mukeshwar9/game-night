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

// seg -> end-cap rounding. Mids get no rounding (hull continues past them).
const CAP_CLASS = {
  'start-h': 'rounded-l-full',
  'end-h': 'rounded-r-full',
  'mid-h': 'rounded-none',
  'start-v': 'rounded-t-full',
  'end-v': 'rounded-b-full',
  'mid-v': 'rounded-none',
}

// seg -> bridge classes that paper over the 2px grid gap so the hull reads as
// one continuous shape. Only cells that continue toward the next segment get
// a bridge (start/mid, never end).
const BRIDGE_CLASS = {
  'start-h': 'relative after:absolute after:pointer-events-none after:bg-retro-structure after:top-0 after:bottom-0 after:-right-[2px] after:w-[2px]',
  'mid-h': 'relative after:absolute after:pointer-events-none after:bg-retro-structure after:top-0 after:bottom-0 after:-right-[2px] after:w-[2px]',
  'end-h': '',
  'start-v': 'relative after:absolute after:pointer-events-none after:bg-retro-structure after:left-0 after:right-0 after:-bottom-[2px] after:h-[2px]',
  'mid-v': 'relative after:absolute after:pointer-events-none after:bg-retro-structure after:left-0 after:right-0 after:-bottom-[2px] after:h-[2px]',
  'end-v': '',
}

export default function BattleshipBoard({
  shots = {},          // { [cell]: 'miss' | 'hit' | 'sunk:<ship>' }
  fleetCells = null,   // Map<cellIndex, { shipIdx, seg }> for hull rendering, or null for fog view
  lastCell = null,
  onCell,
  disabled = false,
  accent = 'p1',       // hit-marker accent: shooter's color
  preview = null,      // { cells: number[], valid: boolean } | null — hover placement preview
  onHoverCell,         // (cellOrNull) => void — placement-phase hover only
}) {
  const accentText = accent === 'p1' ? 'text-retro-p1' : 'text-retro-p2'
  const accentBg = accent === 'p1' ? 'bg-retro-tint-p1' : 'bg-retro-tint-p2'
  const previewCells = preview?.cells ?? null
  const previewValid = preview?.valid ?? false

  return (
    <div
      className="w-full"
      onMouseLeave={() => onHoverCell?.(null)}
    >
      {/* Column labels */}
      <div className="grid grid-cols-[16px_repeat(10,minmax(0,1fr))] sm:grid-cols-[20px_repeat(10,minmax(0,1fr))] gap-[2px] mb-0.5">
        <span />
        {ROWS.map(c => (
          <span key={`c${c}`} className="font-pixel text-[9px] sm:text-[10px] text-retro-dim text-center">{c + 1}</span>
        ))}
      </div>
      {ROWS.map(r => (
        <div key={r} className="grid grid-cols-[16px_repeat(10,minmax(0,1fr))] sm:grid-cols-[20px_repeat(10,minmax(0,1fr))] gap-[2px] mb-[2px] items-center">
          <span className="font-pixel text-[9px] sm:text-[10px] text-retro-dim text-center">
            {'ABCDEFGHIJ'[r]}
          </span>
          {ROWS.map(c => {
            const cell = r * 10 + c
            const result = shots[cell]
            const isHit = result === 'hit' || (result && result.startsWith('sunk:'))
            const isSunk = result && result.startsWith('sunk:')
            const seg = fleetCells?.get ? fleetCells.get(cell) : undefined
            const shipIdx = seg?.shipIdx
            const isShip = shipIdx != null
            const isLast = cell === lastCell
            const inPreview = !!previewCells && previewCells.includes(cell)

            const hullShapeClass = isShip ? cn(CAP_CLASS[seg.seg], BRIDGE_CLASS[seg.seg]) : ''
            const hullColorClass = shipIdx % 2 === 0 ? 'bg-retro-structure' : 'bg-retro-structure/70'

            return (
              <button
                key={cell}
                onClick={() => !disabled && onCell?.(cell)}
                onMouseEnter={() => onHoverCell?.(cell)}
                disabled={disabled}
                aria-label={`${'ABCDEFGHIJ'[r]}${c + 1}`}
                style={isLast && isHit ? { animation: 'place-pop 0.2s ease-out' } : undefined}
                className={cn(
                  'aspect-square flex items-center justify-center font-pixel text-[10px] sm:text-xs select-none transition-colors',
                  isShip ? hullShapeClass : 'rounded-[2px]',
                  isSunk
                    ? cn(accentBg, accentText)
                    : isHit
                      ? cn('bg-retro-surface', accentText)
                      : result === 'miss'
                        ? 'bg-retro-deep text-retro-dim'
                        : isShip
                          ? hullColorClass
                          : cn('bg-retro-surface', !inPreview && 'hover:bg-retro-border/40'),
                  inPreview && !result && (
                    previewValid
                      ? 'bg-retro-win/30 ring-1 ring-inset ring-retro-win'
                      : 'bg-retro-danger/30 ring-1 ring-inset ring-retro-danger'
                  ),
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
