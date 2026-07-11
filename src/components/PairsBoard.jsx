import { cn } from '@/lib/utils'
import Avatar from './Avatar'
import { PAIRS_SIZE } from '../lib/pairsLogic'

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

  const cells = []
  for (let i = 0; i < board.length; i++) {
    const row = Math.floor(i / PAIRS_SIZE)
    const col = i % PAIRS_SIZE
    const owner = board[i]
    const claimed = owner === 'X' || owner === 'O'
    const isHeldFirstPick = flippedList.length === 1 && i === flippedList[0]
    const isLeftoverMismatch = flippedList.length === 2 && flippedList.includes(i)
    const faceUp = claimed || flippedList.includes(i)
    const isDisabled = disabled || claimed || flippedList.includes(i)
    const face = deck[i]

    cells.push(
      <button
        key={i}
        type="button"
        disabled={isDisabled}
        onClick={() => !isDisabled && onMove(i)}
        aria-label={
          claimed
            ? `pairs-cell-${row}-${col}-claimed-${owner}`
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
              isLeftoverMismatch && 'animate-pulse',
            )}
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
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
