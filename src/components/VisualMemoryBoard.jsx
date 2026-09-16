import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ref, runTransaction } from 'firebase/database'
import { cn } from '@/lib/utils'
import { db } from '../lib/firebase'
import { normalizeVmArray } from '../lib/visualMemoryLogic'
import useTurnDeadlineEnforcer from '../hooks/useTurnDeadlineEnforcer'

const VM_REVEAL_MS = 1800       // fixed memorize window before the pattern hides
const TURN_DEADLINE_MS = 30000  // idle-opponent forfeit window, armed once the reveal ends

export default function VisualMemoryBoard({ onMove, disabled, vmPattern, vmClicked, vmLevel }) {
  const { gameId } = useParams() // present under /game/:gameId; undefined in demo/solo — writes below no-op there
  useTurnDeadlineEnforcer(gameId, 'visualmemory', 'vmDeadline')

  const pattern = normalizeVmArray(vmPattern)
  const clicked = normalizeVmArray(vmClicked)
  const level = vmLevel ?? 3

  const clickedSet = new Set(clicked)
  const patternSet = new Set(pattern)

  const [showPattern, setShowPattern] = useState(false)
  const shownKeyRef = useRef(null)  // pattern signature already revealed this turn
  const revealTimerRef = useRef(null)

  const patternKey = pattern.join('-')

  const armDeadline = () => {
    if (!gameId) return
    runTransaction(ref(db, `games/${gameId}/vmDeadline`), cur => cur ?? (Date.now() + TURN_DEADLINE_MS)).catch(() => {})
  }

  // Reveal the pattern for a fixed window, once, at the start of my turn — then
  // hide it. After that every cell is clickable (a wrong one loses the round),
  // matching Simon's watch-then-recall-from-memory shape.
  useEffect(() => {
    clearTimeout(revealTimerRef.current)
    if (disabled || pattern.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- turn flip must synchronously hide the reveal before the opponent's turn paints (prevents the lit-tile leak, item 6)
      setShowPattern(false)
      shownKeyRef.current = null
      return
    }
    if (clicked.length > 0) {
      // Mid-recall already (e.g. a remount) — nothing left to reveal.
      setShowPattern(false)
      if (shownKeyRef.current !== patternKey) { shownKeyRef.current = patternKey; armDeadline() }
      return
    }
    if (shownKeyRef.current === patternKey) return // already revealed this pattern this turn
    shownKeyRef.current = patternKey
    setShowPattern(true)
    revealTimerRef.current = setTimeout(() => { setShowPattern(false); armDeadline() }, VM_REVEAL_MS)
    return () => clearTimeout(revealTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the pattern's own content (patternKey), not identity, so a re-render with the same pattern never restarts the reveal
  }, [disabled, clicked.length, patternKey])

  useEffect(() => () => clearTimeout(revealTimerRef.current), [])

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
            // Lit tiles only ever render on the active player's own screen —
            // `showPattern` is only ever true when `disabled` is false.
            const lit = showPattern && inPattern
            const isClickable = !disabled && !showPattern && !isClicked && pattern.length > 0

            return (
              <button
                key={i}
                aria-label={`vm-cell-${i}${lit ? ', lit' : ''}`}
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
        {disabled ? (
          <span className="text-retro-dim">OPPONENT’S TURN</span>
        ) : showPattern ? (
          <span className="text-retro-cta arcade-blink">MEMORIZE THE LIT TILES</span>
        ) : (
          <span className="text-retro-dim">
            CLICK THE TILES YOU MEMORIZED — {clicked.length}/{pattern.length}
          </span>
        )}
      </p>
    </div>
  )
}
