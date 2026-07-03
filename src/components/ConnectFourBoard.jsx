import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CF_COLS, CF_ROWS } from '../lib/connectFourLogic'

export default function ConnectFourBoard({ board, onMove, disabled, winningLine = [], currentTurn, popMode = false }) {
  const [hoveredCol, setHoveredCol] = useState(null)

  // In pop mode the board emits { col, action }; classic mode emits a bare col.
  const emit = (col, action) => {
    if (disabled) return
    onMove(popMode ? { col, action } : col)
  }
  const bottomOf = (col) => board[(CF_ROWS - 1) * CF_COLS + col]

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
                onClick={() => !colFull && emit(col, 'drop')}
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

        {popMode && (
          <div
            className="grid gap-1 sm:gap-1.5 mt-1.5 pt-1.5 border-t border-retro-border/60"
            style={{ gridTemplateColumns: `repeat(${CF_COLS}, 1fr)` }}
          >
            {Array.from({ length: CF_COLS }, (_, col) => {
              const canPop = !disabled && bottomOf(col) === currentTurn
              return (
                <button
                  key={col}
                  onClick={() => canPop && emit(col, 'pop')}
                  disabled={!canPop}
                  title="Pop your own disc out of the bottom"
                  aria-label={`Pop column ${col + 1}`}
                  className={cn(
                    'h-5 rounded-sm border font-pixel text-[9px] leading-none flex items-center justify-center transition-all',
                    canPop
                      ? 'border-retro-cta/60 text-retro-cta hover:bg-retro-tint-cta active:scale-90 cursor-pointer'
                      : 'border-retro-border/40 text-retro-border/50 cursor-default',
                  )}
                >
                  ▼
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
