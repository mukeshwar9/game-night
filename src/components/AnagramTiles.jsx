import { cn } from '@/lib/utils'

function LetterTile({ letter, selected, disabled, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        'flex aspect-square min-w-0 items-center justify-center rounded border-2 font-pixel text-xl sm:text-2xl',
        'select-none shadow-[2px_2px_0_rgb(var(--c-deep)/0.8)] transition-all duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-retro-cta',
        selected
          ? 'translate-y-1 border-retro-structure bg-retro-deep text-retro-dim opacity-45 shadow-none'
          : 'border-retro-cta/70 bg-retro-card text-retro-cta hover:-translate-y-0.5 hover:border-retro-cta hover:shadow-neon-cta active:translate-y-0.5',
        disabled && 'cursor-not-allowed',
      )}
    >
      {letter}
    </button>
  )
}

export default function AnagramTiles({
  rack, selectedIndexes, onPick, onRemove, onShuffle, disabled,
}) {
  const selected = new Set(selectedIndexes)
  return (
    <div className="space-y-3" aria-label="Anagram letter rack">
      <div className="min-h-16 rounded border border-retro-border bg-retro-deep/60 p-2">
        <div className="flex min-h-12 items-center justify-center gap-1.5" aria-label="Current word">
          {selectedIndexes.length ? selectedIndexes.map((index, position) => (
            <button
              type="button"
              key={`${index}-${position}`}
              onClick={() => onRemove(position)}
              disabled={disabled}
              aria-label={`Remove ${rack[index]}`}
              className="flex h-11 w-10 items-center justify-center rounded border-2 border-retro-win bg-retro-tint-cta font-pixel text-lg text-retro-win shadow-neon-cta transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-retro-cta disabled:opacity-60"
            >
              {rack[index]}
            </button>
          )) : (
            <span className="font-pixel text-[9px] tracking-widest text-retro-dim">TYPE OR TAP LETTERS</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {rack.map((letter, index) => (
          <LetterTile
            key={`${letter}-${index}`}
            letter={letter}
            selected={selected.has(index)}
            disabled={disabled || selected.has(index)}
            onClick={() => onPick(index)}
            label={`Use letter ${letter}${selected.has(index) ? ' (used)' : ''}`}
          />
        ))}
      </div>

      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={onShuffle}
          disabled={disabled}
          className="min-h-10 rounded border border-retro-border px-3 py-2 font-pixel text-[9px] tracking-widest text-retro-dim transition-colors hover:border-retro-cta hover:text-retro-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-retro-cta disabled:opacity-50"
        >
          SHUFFLE
        </button>
        <button
          type="button"
          onClick={() => onRemove('all')}
          disabled={disabled || selectedIndexes.length === 0}
          className="min-h-10 rounded border border-retro-border px-3 py-2 font-pixel text-[9px] tracking-widest text-retro-dim transition-colors hover:border-retro-p2 hover:text-retro-p2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-retro-cta disabled:opacity-50"
        >
          CLEAR
        </button>
      </div>
    </div>
  )
}
