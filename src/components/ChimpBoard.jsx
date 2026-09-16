import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { normalizeChimpLayout } from '../lib/chimpLogic'

// How long the numbers stay visible before they hide on their own, even if
// the player hasn't tapped anything yet — otherwise a player could just read
// the sequence off the grid with no time pressure. Scales up with level so
// harder (longer) sequences still get enough time to memorize.
function memorizeWindowMs(level) {
  return (3 + level * 0.5) * 1000
}

export default function ChimpBoard({
  onMove, disabled,
  chimpLayout, myProgress, opProgress,
  myDone, opDone, chimpLevel,
  roundStartedAt = null,
}) {
  const layout = normalizeChimpLayout(chimpLayout)
  const progress = myProgress ?? 0
  const level    = chimpLevel ?? 4

  // Anchor the memorize window to a shared round-start timestamp when the
  // caller provides one (keeps both players' countdowns in sync); otherwise
  // fall back to this client's own local clock. `layoutSignature` changes
  // exactly once per round, so it's the dependency that re-arms the timer —
  // all clock reads/ref writes happen inside the effect (not render) to stay
  // pure, and the expiry state is reset asynchronously via setTimeout(...,0)
  // rather than synchronously in the effect body.
  const layoutSignature = `${level}:${layout.join(',')}`
  const startRef = useRef(null)
  const [numbersExpired, setNumbersExpired] = useState(false)

  useEffect(() => {
    startRef.current = roundStartedAt ?? Date.now()
    const windowMs = memorizeWindowMs(level)
    const remaining = windowMs - (Date.now() - startRef.current)
    const reset = setTimeout(() => setNumbersExpired(remaining <= 0), 0)
    const timer = remaining > 0 ? setTimeout(() => setNumbersExpired(true), remaining) : null
    return () => { clearTimeout(reset); if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutSignature is the intentional re-arm trigger (one per round); level is folded into it, roundStartedAt is stable for the round
  }, [layoutSignature, roundStartedAt])

  const showNumbers = progress === 0 && !numbersExpired

  // cellIndex → 1-based number (only for numbered cells)
  const cellNum = {}
  layout.forEach((cell, i) => { cellNum[cell] = i + 1 })

  // Cells this player has already clicked correctly
  const correctSet = new Set(layout.slice(0, progress))

  return (
    <div className="w-full max-w-xs mx-auto space-y-3">
      {/* Level + both-player progress */}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">LEVEL {level}</span>
        <div className="flex items-center gap-3 text-retro-dim">
          <span className={myDone ? 'text-retro-win' : ''}>
            ME {progress}/{level}{myDone ? ' ✓' : ''}
          </span>
          <span className={opDone ? 'text-retro-win' : ''}>
            OP {opProgress ?? 0}/{level}{opDone ? ' ✓' : ''}
          </span>
        </div>
      </div>

      {/* 5×5 grid */}
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2 relative">
        {/* Waiting overlay when I'm done but opponent isn't */}
        {myDone && !opDone && (
          <div className="absolute inset-0 bg-retro-bg/70 flex items-center justify-center rounded z-10">
            <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center leading-relaxed arcade-blink">
              DONE!{'\n'}WAITING FOR{'\n'}OPPONENT
            </p>
          </div>
        )}
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 25 }, (_, i) => {
            const num = cellNum[i]
            const isNumbered = num !== undefined
            const isCorrect  = correctSet.has(i)
            const isClickable = !disabled && isNumbered && !isCorrect

            return (
              <button
                key={i}
                aria-label={`chimp-cell-${i}`}
                disabled={!isClickable}
                onClick={() => isClickable && onMove(i)}
                className={cn(
                  'aspect-square flex items-center justify-center rounded',
                  'border font-pixel text-[9px] transition-all duration-100',
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

      {/* Status hint */}
      <p className="font-pixel text-[9px] text-center">
        {myDone ? (
          <span className="text-retro-win text-glow-win">
            {opDone ? 'BOTH DONE — NEXT LEVEL!' : 'WAITING FOR OPPONENT...'}
          </span>
        ) : showNumbers ? (
          <span className="text-retro-cta arcade-blink">
            {disabled ? 'SPECTATING' : 'MEMORIZE — CLICK 1 FIRST'}
          </span>
        ) : (
          <span className="text-retro-dim">
            {disabled ? 'SPECTATING' : `CLICK IN ORDER — ${progress}/${level}`}
          </span>
        )}
      </p>
    </div>
  )
}
