import { cn } from '@/lib/utils'
import { normalizeVmArray } from '../lib/visualMemoryLogic'

export default function VisualMemoryBoard({ onMove, disabled, vmPattern, vmClicked, vmLevel }) {
  const pattern = normalizeVmArray(vmPattern)
  const clicked = normalizeVmArray(vmClicked)
  const level = vmLevel ?? 3
  const showPattern = clicked.length === 0

  const clickedSet = new Set(clicked)
  const patternSet = new Set(pattern)

  return (
    <div className="w-full max-w-xs mx-auto space-y-3">
      {/* Level + progress */}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">LEVEL {level}</span>
        {!showPattern && (
          <span className="text-retro-dim">{clicked.length} / {pattern.length}</span>
        )}
      </div>

      {/* 4×4 grid */}
      <div className="bg-retro-surface border-2 border-retro-border rounded p-3">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 16 }, (_, i) => {
            const inPattern = patternSet.has(i)
            const isClicked = clickedSet.has(i)
            const lit = showPattern && inPattern
            const isClickable = !disabled && !isClicked && (showPattern ? inPattern : true)

            return (
              <button
                key={i}
                aria-label={`vm-cell-${i}`}
                disabled={!isClickable}
                onClick={() => isClickable && onMove(i)}
                className={cn(
                  'aspect-square rounded transition-all duration-100',
                  'border',
                  lit
                    ? 'bg-retro-cta/80 border-retro-cta shadow-neon-cta'
                    : isClicked
                      ? 'bg-retro-win/30 border-retro-win/60'
                      : isClickable
                        ? 'bg-retro-card border-retro-border hover:bg-retro-surface hover:border-retro-p1/40 active:scale-90 cursor-pointer'
                        : 'bg-retro-card border-retro-border/30 cursor-default',
                )}
              />
            )
          })}
        </div>
      </div>

      {/* Hint */}
      <p className="font-pixel text-[9px] text-center">
        {showPattern ? (
          <span className={cn('text-retro-cta', !disabled && 'arcade-blink')}>
            {disabled ? 'OPPONENT IS MEMORIZING...' : 'MEMORIZE — CLICK ANY TILE TO START'}
          </span>
        ) : (
          <span className="text-retro-dim">
            {disabled
              ? `OPPONENT RECALLING — ${clicked.length}/${pattern.length}`
              : `CLICK THE TILES YOU MEMORIZED — ${clicked.length}/${pattern.length}`}
          </span>
        )}
      </p>
    </div>
  )
}
