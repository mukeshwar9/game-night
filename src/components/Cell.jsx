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
          ? 'bg-retro-green/10 border-retro-green scale-105 shadow-neon-green'
          : 'bg-retro-card border-retro-border',
        isEmpty && !disabled
          ? 'hover:bg-retro-surface hover:border-retro-cyan/40 cursor-pointer active:scale-95'
          : 'cursor-default',
        value === 'X' && 'text-retro-cyan text-glow-cyan',
        value === 'O' && 'text-retro-pink text-glow-pink',
      )}
    >
      {value}
    </button>
  )
}
