import { cn } from '@/lib/utils'

// EASY / NORMAL / HARD chips for a solo CPU (word games). Same look as the
// board-game demos' picker; `note` says when a change takes effect.
export default function CpuDifficultyChips({ levels, value, onChange, note, className }) {
  return (
    <div className={cn('space-y-1', className)}>
      <div role="group" aria-label="CPU difficulty" className="flex items-center justify-center gap-1.5">
        <span className="font-pixel text-[8px] text-retro-dim tracking-widest mr-1">CPU</span>
        {levels.map(level => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            aria-pressed={value === level}
            className={cn(
              'min-h-11 px-4 py-1 font-pixel text-[9px] uppercase rounded border-2 transition press',
              value === level
                ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
            )}
          >
            {level}
          </button>
        ))}
      </div>
      {note && <p className="text-center font-mono text-[9px] text-retro-dim">{note}</p>}
    </div>
  )
}
