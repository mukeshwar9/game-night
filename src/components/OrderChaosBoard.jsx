import { useState } from 'react'
import { cn } from '@/lib/utils'
import { OC_SIZE } from '../lib/orderChaosLogic'

export default function OrderChaosBoard({ board, onMove, disabled, winningLine = [], currentTurn }) {
  const [selectedLetter, setSelectedLetter] = useState('X')

  const cells = []
  for (let i = 0; i < board.length; i++) {
    const row = Math.floor(i / OC_SIZE)
    const col = i % OC_SIZE
    const letter = board[i]
    const isOccupied = letter !== ''
    const isClickable = !disabled && !isOccupied
    const isWin = winningLine.includes(i)

    cells.push(
      <button
        key={i}
        aria-label={`oc-cell-${row}-${col}`}
        disabled={!isClickable}
        onClick={() => isClickable && onMove({ index: i, letter: selectedLetter })}
        className={cn(
          'aspect-square flex items-center justify-center',
          'border border-retro-border/60 rounded-sm',
          'transition-all duration-100',
          isOccupied
            ? letter === 'X'
              ? 'bg-retro-p1/10'
              : 'bg-retro-p2/10'
            : '',
          isWin && 'bg-retro-win/20 shadow-neon-win',
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
              'font-pixel text-[11px] leading-none',
              letter === 'X' ? 'text-retro-p1' : 'text-retro-p2',
              isWin && 'text-retro-win text-glow-win',
            )}
          >
            {letter}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-retro-surface border-2 border-retro-border rounded p-3">
        <div
          className="w-full"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${OC_SIZE}, minmax(0, 1fr))`,
            gap: '3px',
          }}
        >
          {cells}
        </div>
      </div>

      {/* Letter picker — both seats may place either X or O */}
      <div className="mt-3 flex items-center justify-center gap-3">
        {['X', 'O'].map(l => (
          <button
            key={l}
            aria-label={`pick-letter-${l}`}
            disabled={disabled}
            onClick={() => !disabled && setSelectedLetter(l)}
            className={cn(
              'w-10 h-10 flex items-center justify-center',
              'font-pixel text-[11px] rounded border-2',
              'transition-all duration-100 active:scale-95',
              selectedLetter === l
                ? l === 'X'
                  ? 'border-retro-p1 text-retro-p1 shadow-neon-p1'
                  : 'border-retro-p2 text-retro-p2 shadow-neon-p2'
                : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
              disabled && 'opacity-50 cursor-default',
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Role hint */}
      <div className="mt-2 flex items-center justify-center gap-3 font-pixel text-[9px]">
        <span className="text-retro-p1 text-glow-p1">X = ORDER</span>
        <span className="text-retro-dim">vs</span>
        <span className="text-retro-p2 text-glow-p2">CHAOS = O</span>
      </div>
    </div>
  )
}
