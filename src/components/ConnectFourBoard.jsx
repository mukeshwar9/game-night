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
                className={cn(
                  'aspect-square rounded-full border-2 transition-all duration-150',
                  cell === 'X'
                    ? cn('bg-retro-cyan border-retro-cyan/70', winningLine.includes(i) && 'scale-110 shadow-neon-cyan')
                    : cell === 'O'
                      ? cn('bg-retro-pink border-retro-pink/70', winningLine.includes(i) && 'scale-110 shadow-neon-pink')
                      : isHovered
                        ? currentTurn === 'X'
                          ? 'bg-retro-cyan/20 border-retro-cyan/40'
                          : 'bg-retro-pink/20 border-retro-pink/40'
                        : 'bg-retro-bg border-retro-border',
                  !cell && !disabled && !colFull ? 'cursor-pointer' : 'cursor-default',
                )}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
