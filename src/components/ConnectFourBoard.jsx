import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CF_COLS } from '../lib/connectFourLogic'

export default function ConnectFourBoard({ board, onMove, disabled, winningLine = [], currentTurn }) {
  const [hoveredCol, setHoveredCol] = useState(null)

  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto">
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2 sm:p-2.5">
        <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: `repeat(${CF_COLS}, 1fr)` }}>
          {board.map((cell, i) => {
            const col = i % CF_COLS
            const colFull = !!board[col]
            const isHovered = hoveredCol === col && !disabled && !colFull
            return (
              <button
                key={i}
                onClick={() => !disabled && !colFull && onMove(col)}
                onMouseEnter={() => setHoveredCol(col)}
                onMouseLeave={() => setHoveredCol(null)}
                disabled={disabled || colFull}
                aria-label={`Column ${col + 1}, ${cell || 'empty'}`}
                className={cn(
                  'aspect-square rounded-full border-2 transition-all duration-150',
                  'flex items-center justify-center',
                  cell === 'X'
                    ? cn('bg-retro-p1 border-retro-p1/70', winningLine.includes(i) && 'scale-110 shadow-neon-p1')
                    : cell === 'O'
                      ? cn('bg-retro-p2 border-retro-p2/70', winningLine.includes(i) && 'scale-110 shadow-neon-p2')
                      : isHovered
                        ? currentTurn === 'X'
                          ? 'bg-retro-p1/20 border-retro-p1/40'
                          : 'bg-retro-p2/20 border-retro-p2/40'
                        : 'bg-retro-bg border-retro-border',
                  !cell && !disabled && !colFull ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                {cell && <span className="font-pixel text-[10px] sm:text-xs text-retro-bg/80 select-none">{cell}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
