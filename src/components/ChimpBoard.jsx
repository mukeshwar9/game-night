import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { normalizeChimpLayout, chimpMemorizeMs, CHIMP_START_LEVEL } from '../lib/chimpLogic'
import { serverNow } from '../lib/serverClock'

const SIDE = 5

export default function ChimpBoard({
  onMove, disabled,
  chimpLayout, myProgress, opProgress,
  myDone, opDone, chimpLevel,
  roundStartedAt = null,
  // Answer mode (round over): every number shown, the tile that lost it marked.
  reveal = false, missCell = null,
  spectating = false,
  solo = false, // single-player run: no opponent progress
}) {
  const layout = normalizeChimpLayout(chimpLayout)
  const progress = myProgress ?? 0
  const level    = chimpLevel ?? CHIMP_START_LEVEL
  const windowMs = chimpMemorizeMs(level)

  // Anchor the memorize window to the shared round-start timestamp (server time) when
  // the room has one, so both players' countdowns line up whatever their device clocks
  // say; otherwise fall back to this client's own clock. `layoutSignature` changes
  // exactly once per round, so it's the dependency that re-arms the timer — clock
  // reads/ref writes happen inside the effect (not render) to stay pure, and the expiry
  // state is reset asynchronously via setTimeout(...,0).
  const layoutSignature = `${level}:${layout.join(',')}`
  const startRef = useRef(null)
  const [numbersExpired, setNumbersExpired] = useState(false)
  const [msLeft, setMsLeft] = useState(windowMs)

  useEffect(() => {
    startRef.current = roundStartedAt ?? serverNow()
    const remaining = windowMs - (serverNow() - startRef.current)
    const reset = setTimeout(() => { setNumbersExpired(remaining <= 0); setMsLeft(Math.max(0, remaining)) }, 0)
    const timer = remaining > 0 ? setTimeout(() => setNumbersExpired(true), remaining) : null
    const tick = setInterval(() => setMsLeft(Math.max(0, windowMs - (serverNow() - startRef.current))), 250)
    return () => { clearTimeout(reset); clearInterval(tick); if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutSignature is the intentional re-arm trigger (one per round); level is folded into it, roundStartedAt is stable for the round
  }, [layoutSignature, roundStartedAt])

  const showNumbers = reveal || (progress === 0 && !numbersExpired)
  const memorizing = !reveal && progress === 0 && !numbersExpired

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
            {spectating ? 'X' : 'ME'} {progress}/{level}{myDone ? ' ✓' : ''}
          </span>
          {!solo && (
            <span className={opDone ? 'text-retro-win' : ''}>
              {spectating ? 'O' : 'OP'} {opProgress ?? 0}/{level}{opDone ? ' ✓' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Memorize timer: drains while the numbers are showing */}
      <div className="h-1.5 rounded-full bg-retro-card overflow-hidden" aria-hidden="true">
        {memorizing && (
          <div className="h-full bg-retro-cta transition-[width] duration-200 ease-linear" style={{ width: `${(msLeft / windowMs) * 100}%` }} />
        )}
      </div>

      {/* 5×5 grid */}
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2 relative">
        {/* Waiting overlay when I'm done but opponent isn't */}
        {!reveal && myDone && !opDone && (
          <div className="absolute inset-0 bg-retro-bg/70 flex items-center justify-center rounded z-10">
            <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center leading-relaxed arcade-blink">
              DONE!{'\n'}WAITING FOR{'\n'}OPPONENT
            </p>
          </div>
        )}
        <div className="grid grid-cols-5 gap-1.5" style={{ touchAction: 'manipulation' }}>
          {Array.from({ length: SIDE * SIDE }, (_, i) => {
            const num = cellNum[i]
            const isNumbered = num !== undefined
            const isCorrect  = correctSet.has(i)
            const isMiss = reveal && missCell === i
            // The tile that should have been tapped instead.
            const isExpected = reveal && missCell != null && layout[progress] === i
            const isClickable = !reveal && !disabled && isNumbered && !isCorrect
            const where = `row ${Math.floor(i / SIDE) + 1}, column ${(i % SIDE) + 1}`
            // Never speak a hidden number — that would read the answer out.
            const label = !isNumbered
              ? (isMiss ? `${where}, wrong tile` : `${where}, empty`)
              : isMiss ? `${where}, tile ${num}, wrong tile`
                : isExpected ? `${where}, tile ${num}, the one to tap next`
              : isCorrect ? `${where}, tile ${num}, done`
                : showNumbers ? `${where}, tile ${num}`
                  : `${where}, hidden tile`

            return (
              <button
                key={i}
                type="button"
                aria-label={label}
                disabled={!isClickable}
                onClick={() => isClickable && onMove(i)}
                className={cn(
                  'aspect-square flex items-center justify-center rounded',
                  'border-2 font-pixel text-base leading-none transition-all duration-100',
                  isMiss
                    ? 'bg-retro-tint-danger border-retro-danger text-retro-danger pairs-mismatch-shake'
                    : isCorrect
                      ? 'bg-retro-win/25 border-retro-win/60 text-retro-win vm-found-pop'
                      : isNumbered && showNumbers
                        ? cn(
                            'bg-retro-card border-retro-p1/70 text-retro-p1',
                            reveal && !isExpected && 'opacity-70',
                            isExpected && 'border-retro-cta text-retro-cta shadow-neon-cta',
                            isClickable && 'hover:shadow-neon-p1 active:scale-90 cursor-pointer',
                          )
                        : isNumbered
                          ? cn(
                              'bg-retro-card border-retro-border',
                              isClickable && 'hover:bg-retro-surface active:scale-90 cursor-pointer',
                            )
                          : 'bg-transparent border-retro-border/15 cursor-default',
                )}
              >
                {isMiss ? (isNumbered ? num : '✕') : isCorrect ? '✓' : (isNumbered && showNumbers ? num : null)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Status hint */}
      <p className="font-pixel text-[9px] text-center" aria-live="polite">
        {reveal ? (
          <span className="text-retro-text">
            {missCell != null ? `WRONG TILE — NEXT WAS ${progress + 1} (GLOWING)` : 'ROUND OVER'}
          </span>
        ) : myDone ? (
          <span className="text-retro-win text-glow-win">
            {opDone ? 'BOTH DONE — NEXT LEVEL!' : 'WAITING FOR OPPONENT...'}
          </span>
        ) : showNumbers ? (
          <span className="text-retro-cta text-glow-cta">
            {disabled ? 'SPECTATING' : `MEMORIZE — TAP 1 FIRST · ${Math.ceil(msLeft / 1000)}s`}
          </span>
        ) : (
          <span className="text-retro-text">
            {disabled ? 'SPECTATING' : `TAP IN ORDER — ${progress}/${level}`}
          </span>
        )}
      </p>
    </div>
  )
}
