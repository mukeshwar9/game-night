import { cn } from '@/lib/utils'
import { CF_COLS } from '../lib/connectFourLogic'

export default function ConnectFourBoard({ board, onMove, disabled, winningLine = [], currentTurn }) {
  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto">
      {/* Column drop buttons */}
      <div className="grid mb-1" style={{ gridTemplateColumns: `repeat(${CF_COLS}, 1fr)` }}>
        {Array.from({ length: CF_COLS }, (_, col) => {
          const colFull = !!board[col]
          return (
            <button
              key={col}
              onClick={() => !disabled && !colFull && onMove(col)}
              disabled={disabled || colFull}
              className={cn(
                'flex items-center justify-center h-7 rounded text-sm transition-all',
                disabled || colFull
                  ? 'text-retro-border cursor-not-allowed'
                  : currentTurn === 'X'
                    ? 'text-retro-cyan/50 hover:text-retro-cyan hover:bg-[#001a2e]/40'
                    : 'text-retro-pink/50 hover:text-retro-pink hover:bg-[#2e0018]/40',
              )}
            >
              ▼
            </button>
          )
        })}
      </div>

      {/* Board */}
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2 sm:p-2.5">
        <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: `repeat(${CF_COLS}, 1fr)` }}>
          {board.map((cell, i) => (
            <div
              key={i}
              className={cn(
                'aspect-square rounded-full border-2 transition-all duration-200',
                cell === 'X'
                  ? cn('bg-retro-cyan border-retro-cyan/70', winningLine.includes(i) && 'scale-110 shadow-neon-cyan')
                  : cell === 'O'
                    ? cn('bg-retro-pink border-retro-pink/70', winningLine.includes(i) && 'scale-110 shadow-neon-pink')
                    : 'bg-retro-bg border-retro-border',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
