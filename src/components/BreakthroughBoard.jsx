import { useMemo } from 'react'
import { BT_COLS, legalMoves } from '../lib/breakthroughLogic'
import { useSelectMove } from '../lib/interact'
import { cn } from '@/lib/utils'
import { cellLabel } from '../lib/a11yLabels'

// BREAKTHROUGH — 8x8 pawn race. X (bottom, moving up) vs O (top, moving
// down). Straight advances into empty squares, diagonal captures. The board
// owns the select-then-move flow: first tap selects a movable pawn, second
// tap on a highlighted target commits the full { from, to } payload.
export default function BreakthroughBoard({
  board, onMove, disabled, lastMove = null, currentTurn = null,
}) {
  // The live game passes currentTurn (whose turn it is); demo/bot harness
  // omits it — fall back to the default activeMover.
  const activeMover = currentTurn ?? 'X'

  const moves = useMemo(() => (disabled ? [] : legalMoves(board, activeMover)), [board, activeMover, disabled])
  const { selected, targets, tap } = useSelectMove(moves, onMove)
  const playableSet = new Set(targets.map(t => t.index))
  const captureSet = new Set(targets.filter(t => board[t.index] && board[t.index] !== activeMover).map(t => t.index))

  return (
    <div className="w-full max-w-[360px] sm:max-w-[420px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'board-idle',
      )}>
        {/* Goal rails: X wants row 0 (top), O wants the last row (bottom) */}
        <div className="flex items-center justify-center gap-2 pb-1">
          <span className="font-pixel text-[8px] text-retro-p1 text-glow-p1">
            <span aria-hidden="true">▲ </span>X GOAL<span className="sr-only">: top row</span>
          </span>
        </div>
        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${BT_COLS}, 1fr)` }}
        >
          {board.map((cell, i) => {
            const r = Math.floor(i / BT_COLS)
            const c = i % BT_COLS
            // Checkerboard tint for orientation (theme-driven, not hardcoded)
            const dark = (r + c) % 2 === 0
            const isPlayable = playableSet.has(i)
            const isCapture = captureSet.has(i)
            const isSelected = i === selected
            return (
              <button
                key={i}
                data-testid={`bt-cell-${r}-${c}${cell ? `-${cell}` : ''}`}
                aria-label={cellLabel({
                  row: r, col: c, occupant: cell && `${cell} pawn`,
                  extra: [
                    isSelected && 'selected',
                    isCapture ? 'capture here' : isPlayable && 'move here',
                    i === lastMove && 'last move',
                  ],
                })}
                disabled={disabled}
                onClick={() => !disabled && tap(i)}
                className={cn(
                  'aspect-square rounded-sm transition-all duration-100 select-none',
                  'flex items-center justify-center font-pixel text-lg sm:text-xl outline-none',
                  'focus-visible:ring-2 focus-visible:ring-retro-cta',
                  dark ? 'bg-retro-surface' : 'bg-retro-card',
                  'border border-retro-border/40',
                  !disabled && 'cursor-pointer hover:brightness-125 active:scale-95',
                  isPlayable && !cell && 'ring-2 ring-inset ring-retro-cta/60 bg-retro-tint-cta/30',
                  isCapture && 'ring-2 ring-inset ring-retro-p2/80 bg-retro-tint-p2/40',
                  isSelected && 'ring-2 ring-inset ring-retro-p1 shadow-neon-p1',
                  i === lastMove && !isSelected && 'ring-2 ring-inset ring-retro-cta/70',
                )}
              >
                {cell && (
                  <span
                    style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-block' }}
                    className={cn(
                      cell === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2',
                    )}
                  >
                    {cell}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <span className="font-pixel text-[8px] text-retro-p2 text-glow-p2">
            <span aria-hidden="true">▼ </span>O GOAL<span className="sr-only">: bottom row</span>
          </span>
        </div>
      </div>
    </div>
  )
}
