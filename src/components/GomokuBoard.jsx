import { cn } from '@/lib/utils'
import { GOMOKU_SIZE } from '../lib/gomokuLogic'

export default function GomokuBoard({ board, onMove, disabled, winningLine = [], currentTurn }) {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2 overflow-x-auto">
        <div
          className="mx-auto"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GOMOKU_SIZE}, minmax(0, 1fr))`,
            gap: '2px',
            minWidth: `${GOMOKU_SIZE * 20}px`,
          }}
        >
          {board.map((cell, i) => {
            const row = Math.floor(i / GOMOKU_SIZE)
            const col = i % GOMOKU_SIZE
            const isOccupied = cell !== ''
            const isClickable = !disabled && !isOccupied
            const isWinning = winningLine.includes(i)
            return (
              <button
                key={i}
                aria-label={`gomoku-cell-${row}-${col}`}
                disabled={!isClickable}
                onClick={() => isClickable && onMove(i)}
                className={cn(
                  'aspect-square flex items-center justify-center',
                  'border border-retro-border/50 rounded-sm',
                  'transition-all duration-100',
                  isClickable
                    ? currentTurn === 'X'
                      ? 'hover:bg-retro-p1/10 hover:border-retro-p1/40 cursor-pointer'
                      : 'hover:bg-retro-p2/10 hover:border-retro-p2/40 cursor-pointer'
                    : 'cursor-default',
                )}
              >
                {isOccupied && (
                  <span
                    className={cn(
                      'rounded-full',
                      'w-[70%] h-[70%]',
                      cell === 'X' ? 'bg-retro-p1' : 'bg-retro-p2',
                      isWinning && 'scale-110',
                      isWinning && (cell === 'X' ? 'shadow-neon-p1' : 'shadow-neon-p2'),
                    )}
                    style={{ animation: 'disc-drop 0.3s cubic-bezier(0.34,1.15,0.64,1)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
