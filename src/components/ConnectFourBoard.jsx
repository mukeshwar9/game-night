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
                  'aspect-square rounded-full border-2 transition-all duration-150 overflow-hidden',
                  'flex items-center justify-center',
                  cell
                    ? 'bg-retro-bg border-retro-border'
                    : isHovered
                      ? currentTurn === 'X'
                        ? 'bg-retro-p1/20 border-retro-p1/40'
                        : 'bg-retro-p2/20 border-retro-p2/40'
                      : 'bg-retro-bg border-retro-border',
                  !cell && !disabled && !colFull ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                {/* inner disc mounts only when filled → drops in once on placement */}
                {cell && (
                  <span
                    className={cn(
                      'w-full h-full rounded-full flex items-center justify-center',
                      cell === 'X' ? 'bg-retro-p1' : 'bg-retro-p2',
                      winningLine.includes(i) && 'scale-110',
                      winningLine.includes(i) && (cell === 'X' ? 'shadow-neon-p1' : 'shadow-neon-p2'),
                    )}
                    style={{ animation: 'disc-drop 0.3s cubic-bezier(0.34,1.15,0.64,1)' }}
                  >
                    <span className="font-pixel text-[10px] sm:text-xs text-retro-bg/80 select-none">{cell}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
