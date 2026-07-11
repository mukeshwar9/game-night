import { cn } from '@/lib/utils'

export default function Cell({ value, index, onClick, isWinning, disabled, isLastMove }) {
  const isEmpty = !value

  return (
    <button
      onClick={() => isEmpty && !disabled && onClick(index)}
      disabled={!isEmpty || disabled}
      className={cn(
        'aspect-square flex items-center justify-center font-pixel text-2xl sm:text-3xl',
        'border-2 rounded transition-all duration-100 select-none outline-none',
        isWinning
          ? 'bg-retro-win/10 border-retro-win scale-105 shadow-neon-win'
          : 'bg-retro-card border-retro-border',
        // M-47: persistent marker on the most recently played cell, so a
        // returning player can re-orient without re-scanning the whole board.
        !isWinning && isLastMove && 'ring-2 ring-inset ring-retro-cta/70',
        isEmpty && !disabled
          ? 'hover:bg-retro-surface hover:border-retro-p1/40 cursor-pointer active:scale-95'
          : 'cursor-default',
        disabled && 'opacity-60 saturate-50',
        value === 'X' && 'text-retro-p1 text-glow-p1',
        value === 'O' && 'text-retro-p2 text-glow-p2',
      )}
    >
      {/* span mounts only when filled, so the pop plays once on placement */}
      {value && <span style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-block' }}>{value}</span>}
    </button>
  )
}
