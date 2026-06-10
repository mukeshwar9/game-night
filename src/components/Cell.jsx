import { cn } from '@/lib/utils'

export default function Cell({ value, index, onClick, isWinning, disabled }) {
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
        isEmpty && !disabled
          ? 'hover:bg-retro-surface hover:border-retro-p1/40 cursor-pointer active:scale-95'
          : 'cursor-default',
        value === 'X' && 'text-retro-p1 text-glow-p1',
        value === 'O' && 'text-retro-p2 text-glow-p2',
      )}
    >
      {value}
    </button>
  )
}
