import { useState } from 'react'
import { cn } from '@/lib/utils'
import { SOS_SIZE } from '../lib/sosLogic'

export default function SosBoard({ board, onMove, disabled, currentTurn, sosLines }) {
  const [selectedLetter, setSelectedLetter] = useState('S')

  // Build a map from cell index to the most recent scorer's symbol
  // (last entry wins when a cell appears in multiple lines)
  const cellScorer = {}
  const lines = sosLines || []
  for (const line of lines) {
    for (const cell of line.cells) {
      cellScorer[cell] = line.by
    }
  }

  const xCount = lines.filter(l => l.by === 'X').length
  const oCount = lines.filter(l => l.by === 'O').length

  const cells = []
  for (let i = 0; i < board.length; i++) {
    const row = Math.floor(i / SOS_SIZE)
    const col = i % SOS_SIZE
    const letter = board[i]
    const scorer = cellScorer[i]
    const isOccupied = letter !== ''
    const isClickable = !disabled && !isOccupied

    cells.push(
      <button
        key={i}
        aria-label={`sos-cell-${row}-${col}`}
        disabled={!isClickable}
        onClick={() => isClickable && onMove({ index: i, letter: selectedLetter })}
        className={cn(
          'aspect-square flex items-center justify-center',
          'border border-retro-border/60 rounded-sm',
          'transition-all duration-100',
          scorer === 'X'
            ? 'bg-retro-p1/15 shadow-[inset_0_0_4px_rgba(0,255,255,0.25)]'
            : scorer === 'O'
              ? 'bg-retro-p2/15 shadow-[inset_0_0_4px_rgba(255,0,128,0.25)]'
              : '',
          isClickable && !isOccupied
            ? currentTurn === 'X'
              ? 'hover:bg-retro-p1/10 hover:border-retro-p1/40 cursor-pointer'
              : 'hover:bg-retro-p2/10 hover:border-retro-p2/40 cursor-pointer'
            : 'cursor-default',
        )}
      >
        {isOccupied && (
          <span className="font-pixel text-[10px] leading-none text-retro-text">
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
            gridTemplateColumns: `repeat(${SOS_SIZE}, minmax(0, 1fr))`,
            gap: '3px',
          }}
        >
          {cells}
        </div>
      </div>

      {/* Letter picker */}
      <div className="mt-3 flex items-center justify-center gap-3">
        {['S', 'O'].map(letter => (
          <button
            key={letter}
            aria-label={`pick-letter-${letter}`}
            disabled={disabled}
            onClick={() => !disabled && setSelectedLetter(letter)}
            className={cn(
              'w-10 h-10 flex items-center justify-center',
              'font-pixel text-[11px] rounded border-2',
              'transition-all duration-100 active:scale-95',
              selectedLetter === letter
                ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
              disabled && 'opacity-50 cursor-default',
            )}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Score bar */}
      <div className="mt-2 flex items-center justify-center gap-3 font-pixel text-[10px]">
        <span className="text-retro-p1 text-glow-p1">X {xCount}</span>
        <span className="text-retro-dim">—</span>
        <span className="text-retro-p2 text-glow-p2">{oCount} O</span>
      </div>
    </div>
  )
}
