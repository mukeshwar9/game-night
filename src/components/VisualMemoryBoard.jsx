import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ref, runTransaction } from 'firebase/database'
import { cn } from '@/lib/utils'
import { db } from '../lib/firebase'
import { serverNow } from '../lib/serverClock'
import {
  normalizeVmArray, vmGridSide, vmRevealMs, VM_START_LEVEL,
} from '../lib/visualMemoryLogic'
import useTurnDeadlineEnforcer from '../hooks/useTurnDeadlineEnforcer'

const TURN_DEADLINE_MS = 30000  // idle-opponent forfeit window, armed once the reveal ends

// Gap between tiles shrinks as the grid grows so tiles stay tappable at 390px.
const GAP = { 4: 'gap-2', 5: 'gap-1.5', 6: 'gap-1.5', 7: 'gap-1', 8: 'gap-1' }

function Check() {
  return (
    <svg viewBox="0 0 7 7" className="w-1/2 h-1/2" shapeRendering="crispEdges" aria-hidden="true">
      {[[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]].map(([x, y]) => (
        <rect key={x} x={x} y={y} width="1" height="1" className="fill-retro-win" />
      ))}
    </svg>
  )
}

export default function VisualMemoryBoard({
  onMove, disabled, vmPattern, vmClicked, vmLevel, vmMiss = null, finished = false,
  currentTurn = null, mySymbol = null,
}) {
  const { gameId } = useParams() // present under /game/:gameId; undefined in demo/solo — writes below no-op there
  useTurnDeadlineEnforcer(gameId, 'visualmemory', 'vmDeadline')

  const pattern = normalizeVmArray(vmPattern)
  const clicked = normalizeVmArray(vmClicked)
  const level = vmLevel ?? VM_START_LEVEL
  const side = vmGridSide(level)
  const revealMs = vmRevealMs(level)

  const clickedSet = new Set(clicked)
  const patternSet = new Set(pattern)

  const [showPattern, setShowPattern] = useState(false)
  const shownKeyRef = useRef(null)  // pattern signature already revealed this turn
  const revealTimerRef = useRef(null)
  const revealEndsRef = useRef(null) // local-clock end of the current reveal; null once it has run

  const patternKey = pattern.join('-')

  const armDeadline = () => {
    if (!gameId) return
    runTransaction(ref(db, `games/${gameId}/vmDeadline`), cur => cur ?? (serverNow() + TURN_DEADLINE_MS)).catch(() => {})
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
      revealEndsRef.current = null
      return
    }
    if (clicked.length > 0) {
      // Mid-recall already (e.g. a remount) — nothing left to reveal.
      setShowPattern(false)
      revealEndsRef.current = null
      if (shownKeyRef.current !== patternKey) { shownKeyRef.current = patternKey; armDeadline() }
      return
    }
    if (shownKeyRef.current !== patternKey) {
      shownKeyRef.current = patternKey
      revealEndsRef.current = Date.now() + revealMs
      setShowPattern(true)
    } else if (revealEndsRef.current === null) {
      return // this pattern's reveal already ran to completion this turn
    }
    // (Re)arm the hide timer for whatever is left of the window — an effect re-run
    // (StrictMode's double mount, a dependency blip) clears the previous timer, and
    // returning early here used to leave the pattern lit forever.
    revealTimerRef.current = setTimeout(() => {
      revealEndsRef.current = null
      setShowPattern(false)
      armDeadline()
    }, Math.max(0, revealEndsRef.current - Date.now()))
    return () => clearTimeout(revealTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the pattern's own content (patternKey), not identity, so a re-render with the same pattern never restarts the reveal
  }, [disabled, clicked.length, patternKey])

  useEffect(() => () => clearTimeout(revealTimerRef.current), [])

  // Once the round is over, everyone sees the answer: the pattern outlined, the tiles
  // found in green, and the tile that lost it in the danger colour.
  const showAnswer = finished && pattern.length > 0
  const isSpectator = mySymbol !== 'X' && mySymbol !== 'O'
  const turnName = currentTurn === 'X' || currentTurn === 'O' ? currentTurn : 'OPPONENT'

  return (
    <div className="w-full max-w-xs mx-auto space-y-3">
      {/* Level + progress */}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">LEVEL {level}</span>
        <span className="text-retro-dim">{side}×{side} · {pattern.length} TILES</span>
      </div>

      {/* Memorize timer: drains while the pattern is lit */}
      <div className="h-1.5 rounded-full bg-retro-card overflow-hidden" aria-hidden="true">
        {showPattern && (
          <div
            key={patternKey}
            className="h-full bg-retro-cta vm-reveal-drain"
            style={{ animationDuration: `${revealMs}ms` }}
          />
        )}
      </div>

      {/* Grid — grows with the level */}
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2.5">
        <div
          className={cn('grid', GAP[side] || 'gap-1')}
          style={{ gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))`, touchAction: 'manipulation' }}
        >
          {Array.from({ length: side * side }, (_, i) => {
            const inPattern = patternSet.has(i)
            const isClicked = clickedSet.has(i)
            const isMiss = showAnswer && vmMiss === i
            // Lit tiles only ever render on the active player's own screen —
            // `showPattern` is only ever true when `disabled` is false.
            const lit = showPattern && inPattern
            const missed = showAnswer && inPattern && !isClicked
            const isClickable = !disabled && !showPattern && !isClicked && pattern.length > 0
            const where = `row ${Math.floor(i / side) + 1}, column ${(i % side) + 1}`
            const state = lit ? 'lit' : isMiss ? 'wrong tile' : isClicked ? 'found' : missed ? 'was in the pattern' : null

            return (
              <button
                key={i}
                type="button"
                aria-label={state ? `${where}, ${state}` : where}
                aria-pressed={isClicked}
                disabled={!isClickable}
                onClick={() => isClickable && onMove(i)}
                className={cn(
                  'relative aspect-square rounded flex items-center justify-center transition-all duration-150',
                  'border-2',
                  lit
                    ? 'bg-retro-cta border-retro-cta shadow-neon-cta scale-[1.03]'
                    : isMiss
                      ? 'bg-retro-tint-danger border-retro-danger pairs-mismatch-shake'
                      : isClicked
                        ? 'bg-retro-win/25 border-retro-win vm-found-pop'
                        : missed
                          ? 'bg-retro-card border-dashed border-retro-cta'
                          : isClickable
                            ? 'bg-retro-card border-retro-border hover:border-retro-p1/50 active:scale-90 cursor-pointer'
                            : 'bg-retro-card border-retro-border/40 cursor-default',
                )}
              >
                {isClicked && <Check />}
                {isMiss && <span aria-hidden="true" className="font-pixel text-sm text-retro-danger">✕</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hint */}
      <p className="font-pixel text-[9px] text-center min-h-[1.25rem]" aria-live="polite">
        {showAnswer ? (
          <span className="text-retro-dim">
            {vmMiss != null ? 'WRONG TILE — DASHED TILES WERE THE PATTERN' : 'ROUND OVER'}
          </span>
        ) : disabled ? (
          <span className="text-retro-dim">{isSpectator ? `${turnName} IS RECALLING` : 'OPPONENT’S TURN'}</span>
        ) : showPattern ? (
          <span className="text-retro-cta text-glow-cta">MEMORIZE THE LIT TILES</span>
        ) : (
          <span className="text-retro-text">
            TAP THE TILES YOU SAW — {clicked.length}/{pattern.length}
          </span>
        )}
      </p>
    </div>
  )
}
