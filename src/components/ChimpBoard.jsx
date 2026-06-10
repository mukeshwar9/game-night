import { cn } from '@/lib/utils'
import { normalizeChimpLayout } from '../lib/chimpLogic'

const COLS = 5

export default function ChimpBoard({ onMove, disabled, chimpLayout, chimpProgress, chimpLevel }) {
  const layout = normalizeChimpLayout(chimpLayout)
  const progress = chimpProgress ?? 0
  const level = chimpLevel ?? 4
  const showNumbers = progress === 0

  // cellIndex → 1-based number (only for numbered cells)
  const cellNum = {}
  layout.forEach((cell, i) => { cellNum[cell] = i + 1 })

  // cells correctly clicked so far
  const correctSet = new Set(layout.slice(0, progress))

  return (
    <div className="w-full max-w-xs mx-auto space-y-3">
      {/* Level + progress */}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">LEVEL {level}</span>
        {progress > 0 && (
          <span className="text-retro-dim">{progress} / {layout.length}</span>
        )}
      </div>

      {/* 5×5 grid */}
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2">
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 25 }, (_, i) => {
            const num = cellNum[i]
            const isNumbered = num !== undefined
            const isCorrect = correctSet.has(i)
            const isClickable = !disabled && isNumbered && !isCorrect

            return (
              <button
                key={i}
                aria-label={`chimp-cell-${i}`}
                disabled={!isClickable}
                onClick={() => isClickable && onMove(i)}
                className={cn(
                  'aspect-square flex items-center justify-center rounded',
                  'border font-pixel text-[9px] transition-all duration-75',
                  isCorrect
                    ? 'bg-retro-win/25 border-retro-win/50 text-retro-win'
                    : isNumbered && showNumbers
                      ? cn(
                          'bg-retro-card border-retro-p1/60 text-retro-p1',
                          !disabled && 'hover:shadow-neon-p1 active:scale-90 cursor-pointer',
                        )
                      : isNumbered
                        ? cn(
                            'bg-retro-card border-retro-border cursor-pointer',
                            !disabled && 'hover:bg-retro-surface active:scale-90',
                          )
                        : 'bg-transparent border-retro-border/15 cursor-default',
                )}
              >
                {isCorrect ? '✓' : (isNumbered && showNumbers ? num : null)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hint */}
      <p className="font-pixel text-[9px] text-center">
        {showNumbers ? (
          <span className={cn('text-retro-cta', !disabled && 'animate-pulse')}>
            {disabled ? 'OPPONENT IS MEMORIZING...' : 'MEMORIZE — CLICK 1 FIRST'}
          </span>
        ) : (
          <span className="text-retro-dim">
            {disabled
              ? `OPPONENT RECALLING — ${progress}/${layout.length}`
              : `CLICK IN ORDER — ${progress}/${layout.length}`}
          </span>
        )}
      </p>
    </div>
  )
}
