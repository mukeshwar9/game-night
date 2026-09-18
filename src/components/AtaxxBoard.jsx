import { useMemo } from 'react'
import { AX_COLS, legalAtaxxMoves } from '../lib/ataxxLogic'
import { useSelectMove } from '../lib/interact'
import { cn } from '@/lib/utils'

// ATAXX — 7x7. Clone (distance 1) or jump (distance 2) then convert
// neighbors. The board owns the select-then-move flow: first tap selects an
// own piece, second tap on a highlighted target commits { from, to } — the
// clone/jump kind is derived from the distance inside the payload path.
export default function AtaxxBoard({
  board, onMove, disabled, lastMove = null, currentTurn = null,
}) {
  // The live game passes currentTurn (whose turn it is); demo/bot harness
  // omits it — fall back to the default activeMover.
  const activeMover = currentTurn ?? 'X'

  const moves = useMemo(() => (disabled ? [] : legalAtaxxMoves(board, activeMover)), [board, activeMover, disabled])
  const { selected, targets, tap } = useSelectMove(moves, onMove)
  const targetMap = new Map(targets.map(t => [t.index, t.move.kind]))

  return (
    <div className="w-full max-w-[360px] sm:max-w-[420px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'opacity-60 saturate-50',
      )}>
        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${AX_COLS}, 1fr)` }}
        >
          {board.map((cell, i) => {
            const r = Math.floor(i / AX_COLS)
            const c = i % AX_COLS
            const dark = (r + c) % 2 === 0
            const targetKind = targetMap.get(i)
            const isTarget = !!targetKind
            const isSelected = i === selected
            return (
              <button
                key={i}
                aria-label={`ataxx-cell-${r}-${c}${cell ? `-${cell}` : ''}`}
                disabled={disabled}
                onClick={() => !disabled && tap(i)}
                className={cn(
                  'aspect-square rounded-sm transition-all duration-100 select-none',
                  'flex items-center justify-center font-pixel text-lg sm:text-xl outline-none',
                  'focus-visible:ring-2 focus-visible:ring-retro-cta',
                  dark ? 'bg-retro-surface' : 'bg-retro-card',
                  'border border-retro-border/40',
                  !disabled && 'cursor-pointer hover:brightness-125 active:scale-95',
                  isTarget && targetKind === 'clone' && 'ring-2 ring-inset ring-retro-cta/60 bg-retro-tint-cta/30',
                  isTarget && targetKind === 'jump' && 'ring-2 ring-inset ring-retro-cta/60 bg-retro-tint-cta/10',
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
        <p className="mt-2 text-center font-pixel text-[8px] text-retro-dim tracking-wider">
          NEAR = CLONE · FAR = JUMP · LANDING CONVERTS NEIGHBORS
        </p>
      </div>
    </div>
  )
}
