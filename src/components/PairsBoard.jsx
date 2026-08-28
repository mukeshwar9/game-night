import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import Avatar from './Avatar'
import { PAIRS_SIZE } from '../lib/pairsLogic'

// How long a mismatched pair stays visibly face-up before this client hides it again.
// Purely a display timer — the underlying `flipped` state (and its legality: either
// mismatched cell is a legal first flip for the next turn, see pairsLogic.js) is
// unaffected, so a fast tap can still act immediately; this just guarantees a minimum
// look for anyone who doesn't.
const MISMATCH_REVEAL_MS = 1200

// Small 4-pixel-diamond "card back" glyph — plain SVG, currentColor so it inherits
// text-retro-dim and themes automatically (no hex, per CLAUDE.md).
function CardBackGlyph() {
  return (
    <svg viewBox="0 0 8 8" width="18" height="18" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="1" width="2" height="2" fill="currentColor" />
      <rect x="1" y="3" width="2" height="2" fill="currentColor" />
      <rect x="5" y="3" width="2" height="2" fill="currentColor" />
      <rect x="3" y="5" width="2" height="2" fill="currentColor" />
    </svg>
  )
}

export default function PairsBoard({ board, deck, flipped, onMove, disabled, currentTurn }) {
  const flippedList = flipped || []
  const xPairs = board.filter(c => c === 'X').length / 2
  const oPairs = board.filter(c => c === 'O').length / 2

  // Mismatch auto-hide timer (req 6): a leftover mismatch pair (flipped.length === 2)
  // stays visibly face-up for a fixed window, then this client flips it back down on its
  // own — display only, doesn't touch `flipped`/Firebase, so it can't desync clients or
  // block the next player's move (see pairsLogic.js's contract: either mismatched cell is
  // always a legal first flip regardless of this timer).
  const mismatchKey = flippedList.length === 2 ? flippedList.join(',') : null
  const [mismatchHidden, setMismatchHidden] = useState(false)
  const prevMismatchKey = useRef(null)
  useEffect(() => {
    if (mismatchKey === prevMismatchKey.current) return
    prevMismatchKey.current = mismatchKey
    setMismatchHidden(false)
    if (!mismatchKey) return undefined
    const t = setTimeout(() => setMismatchHidden(true), MISMATCH_REVEAL_MS)
    return () => clearTimeout(t)
  }, [mismatchKey])

  const cells = []
  for (let i = 0; i < board.length; i++) {
    const row = Math.floor(i / PAIRS_SIZE)
    const col = i % PAIRS_SIZE
    const owner = board[i]
    const claimed = owner === 'X' || owner === 'O'
    const isHeldFirstPick = flippedList.length === 1 && i === flippedList[0]
    const isLeftoverMismatch = flippedList.length === 2 && flippedList.includes(i)
    const mismatchRevealed = isLeftoverMismatch && !mismatchHidden
    const faceUp = claimed || isHeldFirstPick || mismatchRevealed
    // Only a currently-held single first pick blocks a re-tap of itself (matches
    // applyPairsMove's contract) — a leftover mismatch cell, revealed or hidden, is
    // always tappable again as the next turn's fresh first flip.
    const isDisabled = disabled || claimed || isHeldFirstPick
    const face = deck[i]

    cells.push(
      <button
        key={i}
        type="button"
        disabled={isDisabled}
        onClick={() => !isDisabled && onMove(i)}
        aria-pressed={isHeldFirstPick}
        aria-label={
          claimed
            ? `pairs-cell-${row}-${col}-claimed-${owner}`
            : isHeldFirstPick
              ? `pairs-cell-${row}-${col}-held-${face}`
              : mismatchRevealed
                ? `pairs-cell-${row}-${col}-mismatched-${face}`
                : faceUp
                  ? `pairs-cell-${row}-${col}-face-up-${face}`
                  : `pairs-cell-${row}-${col}-face-down`
        }
        className={cn(
          'relative aspect-square rounded-sm select-none',
          !isDisabled && 'cursor-pointer',
        )}
        style={{ perspective: '300px' }}
      >
        <div
          className="absolute inset-0 transition-transform duration-200"
          style={{
            transformStyle: 'preserve-3d',
            transform: faceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Back — face-down card */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-sm bg-retro-card border border-retro-border text-retro-dim"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <CardBackGlyph />
          </div>

          {/* Front — face-up / claimed card */}
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-sm',
              claimed
                ? owner === 'X' ? 'bg-retro-tint-p1' : 'bg-retro-tint-p2'
                : 'bg-retro-surface',
              isHeldFirstPick && (currentTurn === 'X' ? 'ring-2 ring-retro-p1' : 'ring-2 ring-retro-p2'),
              mismatchRevealed && 'animate-pulse ring-2 ring-dashed ring-retro-dim',
            )}
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            {face && !claimed && (
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 font-pixel text-[6px]',
                  isHeldFirstPick ? 'text-retro-dim' : 'text-retro-dim opacity-70',
                )}
              >
                {isHeldFirstPick ? '?' : mismatchRevealed ? '✕' : ''}
              </span>
            )}
            {face && (
              <span className={claimed ? 'opacity-60' : 'opacity-100'}>
                <Avatar id={`${face}.text`} size={36} />
              </span>
            )}
            {claimed && (
              <span
                className={cn(
                  'absolute bottom-0.5 right-0.5 font-pixel text-[8px]',
                  owner === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2',
                )}
              >
                {owner}
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2 sm:p-3">
        <div
          className="w-full"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${PAIRS_SIZE}, minmax(0, 1fr))`,
            gap: '3px',
            touchAction: 'manipulation',
          }}
        >
          {cells}
        </div>
      </div>

      {/* Score readout */}
      <div className="mt-2 flex items-center justify-center gap-3 font-pixel text-[10px]">
        <span className="text-retro-p1 text-glow-p1">X {xPairs}</span>
        <span className="text-retro-dim">—</span>
        <span className="text-retro-p2 text-glow-p2">{oPairs} O</span>
      </div>
    </div>
  )
}
