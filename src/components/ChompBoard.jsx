import { CHOMP_COLS, POISON_INDEX } from '../lib/chompLogic'
import { cn } from '@/lib/utils'
import { cellLabel } from '../lib/a11yLabels'

// CHOMP — 6x5 chocolate bar. The top-left square is poisoned. Eat a square
// and everything below-right of it disappears. Pure rendering: the board
// receives `board` ('' | 'eaten') and reports taps via onMove(index).
// Hover preview of the bite region is computed here (pure geometry).
export default function ChompBoard({ board, onMove, disabled, lastMove = null }) {
  const rowColOf = (i) => [Math.floor(i / CHOMP_COLS), i % CHOMP_COLS]

  return (
    <div className="w-full max-w-[340px] sm:max-w-[380px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'board-idle',
      )}>
        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${CHOMP_COLS}, 1fr)` }}
        >
          {board.map((cell, i) => {
            const eaten = cell === 'eaten'
            const isPoison = i === POISON_INDEX
            const clickable = !disabled && !eaten
            const [r, c] = rowColOf(i)
            return (
              <button
                key={i}
                data-testid={`chomp-cell-${r}-${c}${isPoison ? '-poison' : ''}`}
                aria-label={cellLabel({
                  row: r, col: c,
                  occupant: eaten ? 'eaten' : isPoison ? 'poison square' : 'chocolate',
                  extra: !eaten && i === lastMove && 'last move',
                })}
                disabled={!clickable}
                onClick={() => clickable && onMove(i)}
                className={cn(
                  'aspect-square rounded transition-all duration-150 select-none',
                  'flex items-center justify-center font-pixel text-[10px]',
                  'border-2 outline-none',
                  'focus-visible:ring-2 focus-visible:ring-retro-cta',
                  eaten
                    ? 'bg-retro-bg border-retro-border/30 cursor-default'
                    : [
                        // Chocolate squares — poison gets a skull; the rest
                        // read as a bar via the card/surface tokens.
                        'bg-retro-card border-retro-border cursor-pointer',
                        'hover:border-retro-cta hover:bg-retro-tint-cta active:scale-95',
                      ],
                  // M-47 parity: ring the most recent bite.
                  !eaten && i === lastMove && 'ring-2 ring-inset ring-retro-cta/70',
                  isPoison && !eaten && 'border-retro-p2/70',
                  disabled && !eaten && 'cursor-default',
                )}
              >
                {eaten ? null : isPoison ? (
                  // Big skull + label on the cell itself, so the poison square
                  // explains itself without a legend to read.
                  <span className="flex flex-col items-center justify-center leading-none text-retro-p2 text-glow-p2" title="POISON">
                    <span aria-hidden="true" className="text-2xl sm:text-3xl leading-none">☠</span>
                    <span className="font-pixel text-[8px] mt-0.5">POISON</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-center font-mono text-xs text-retro-dim">
          Whoever eats the ☠ square loses.
        </p>
      </div>
    </div>
  )
}
