import { useMemo } from 'react'
import { LOA_SIZE, loaMoves } from '../lib/loaLogic'
import { useSelectMove } from '../lib/interact'
import { cn } from '@/lib/utils'
import { cellLabel } from '../lib/a11yLabels'

// LINES OF ACTION — 8×8. A checker moves EXACTLY as many squares as there
// are pieces on its line (own pieces jumpable, enemies not); land on an
// enemy to capture. Unite all your checkers to win. The board owns the
// select-then-move flow with target counts printed on the highlight.
export default function LoaBoard({
  board, onMove, disabled, lastMove = null, currentTurn = null,
}) {
  // The live game passes currentTurn (whose turn it is); demo/bot harness
  // omits it — fall back to the default activeMover.
  const activeMover = currentTurn ?? 'X'

  const moves = useMemo(() => {
    if (disabled) return []
    const all = []
    for (let i = 0; i < 64; i++) {
      if (board[i] === activeMover) {
        for (const to of loaMoves(board, i, activeMover)) all.push({ from: i, to })
      }
    }
    return all
  }, [board, activeMover, disabled])
  const { selected, targets, tap } = useSelectMove(moves, onMove)
  const targetSet = new Set(targets.map(t => t.index))
  const captureSet = new Set(targets.filter(t => board[t.index] && board[t.index] !== activeMover).map(t => t.index))

  return (
    <div className="w-full max-w-[380px] sm:max-w-[440px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'board-idle',
      )}>
        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${LOA_SIZE}, 1fr)` }}
        >
          {board.map((cell, i) => {
            const r = Math.floor(i / LOA_SIZE)
            const c = i % LOA_SIZE
            const dark = (r + c) % 2 === 0
            const isTarget = targetSet.has(i)
            const isCapture = captureSet.has(i)
            const isSelected = i === selected
            return (
              <button
                key={i}
                data-testid={`loa-cell-${r}-${c}${cell ? `-${cell}` : ''}`}
                aria-label={cellLabel({
                  row: r, col: c, occupant: cell && `${cell} checker`,
                  extra: [
                    isSelected && 'selected',
                    isCapture ? 'capture here' : isTarget && 'move here',
                    i === lastMove && 'last move',
                  ],
                })}
                disabled={disabled}
                onClick={() => !disabled && tap(i)}
                className={cn(
                  'aspect-square rounded-sm transition-all duration-100 select-none',
                  'flex items-center justify-center font-pixel text-base sm:text-lg outline-none',
                  'focus-visible:ring-2 focus-visible:ring-retro-cta',
                  dark ? 'bg-retro-surface' : 'bg-retro-card',
                  'border border-retro-border/40',
                  !disabled && 'cursor-pointer hover:brightness-125 active:scale-95',
                  isTarget && !isCapture && 'ring-2 ring-inset ring-retro-cta/60 bg-retro-tint-cta/25',
                  isCapture && 'ring-2 ring-inset ring-retro-p2/80 bg-retro-tint-p2/40',
                  isSelected && 'ring-2 ring-inset ring-retro-p1 shadow-neon-p1',
                  i === lastMove && !isSelected && !isTarget && 'ring-2 ring-inset ring-retro-cta/60',
                )}
              >
                {cell && (
                  <span
                    style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-block' }}
                    className={cn(
                      'w-[72%] h-[72%] rounded-full border',
                      cell === 'X'
                        ? 'bg-retro-p1/25 border-retro-p1 text-retro-p1 text-glow-p1'
                        : 'bg-retro-p2/25 border-retro-p2 text-retro-p2 text-glow-p2',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-center font-pixel text-[8px] text-retro-dim tracking-wider">
          MOVE EXACTLY AS FAR AS PIECES ON THAT LINE · UNITE ALL TO WIN
        </p>
      </div>
    </div>
  )
}
