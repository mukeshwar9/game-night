import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { PAIRS_SIZE, PAIRS_TOTAL_PAIRS } from '../lib/pairsLogic'
import {
  pairsFaceColor, pairsFaceGlyph, pairsFaceName, pairsCellPosition,
} from '../lib/pairsFaces'

// How long a mismatched pair stays visibly face-up before this client hides it again.
// Purely a display timer — the underlying `flipped` state (and its legality: either
// mismatched cell is a legal first flip for the next turn, see pairsLogic.js) is
// unaffected, so a fast tap can still act immediately; this just guarantees a minimum
// look for anyone who doesn't.
const MISMATCH_REVEAL_MS = 1500
// How long a freshly claimed pair plays its pop + ring burst.
const MATCH_POP_MS = 650

// Card-back emblem: a 4-pixel diamond on a knocked-out plate, in the theme's CTA colour
// so the back recolours with the theme (no hex, per CLAUDE.md).
function CardBackEmblem() {
  return (
    <svg viewBox="0 0 10 10" className="w-[42%] h-[42%]" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="1" width="8" height="8" className="fill-retro-card" />
      <rect x="4" y="2" width="2" height="2" className="fill-retro-cta" />
      <rect x="2" y="4" width="2" height="2" className="fill-retro-cta" />
      <rect x="6" y="4" width="2" height="2" className="fill-retro-cta" />
      <rect x="4" y="6" width="2" height="2" className="fill-retro-cta" />
    </svg>
  )
}

// The face's pixel silhouette in card ink; 'o' cells are left open so the card colour
// shows through as eyes/windows.
function FaceSprite({ face }) {
  const grid = pairsFaceGlyph(face)
  return (
    <svg
      viewBox="0 0 8 8"
      className="w-[66%] h-[66%]"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {grid.flatMap((row, y) =>
        row.split('').map((ch, x) => (ch === '#'
          ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" style={{ fill: 'rgb(var(--c-pair-ink))' }} />
          : null)),
      )}
    </svg>
  )
}

function cellLabel({ index, face, owner, held, mismatched }) {
  const where = pairsCellPosition(index, PAIRS_SIZE)
  const name = pairsFaceName(face)
  if (owner) return `${where}: ${name}, claimed by ${owner}`
  if (held) return `${where}: ${name}, first pick`
  if (mismatched) return `${where}: ${name}, no match`
  return `${where}: face down`
}

export default function PairsBoard({ board, deck, flipped, onMove, disabled, currentTurn }) {
  const flippedList = flipped || []
  const xPairs = board.filter(c => c === 'X').length / 2
  const oPairs = board.filter(c => c === 'O').length / 2
  const pairsLeft = PAIRS_TOTAL_PAIRS - xPairs - oPairs

  // Mismatch auto-hide timer: a leftover mismatch pair (flipped.length === 2) stays
  // visibly face-up for a fixed window, then this client flips it back down on its own —
  // display only, doesn't touch `flipped`/Firebase, so it can't desync clients or block
  // the next player's move (see pairsLogic.js's contract: either mismatched cell is
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

  // Match celebration + screen-reader announcement, both derived from board/flipped
  // transitions so every client (mover, opponent, spectator) sees the same feedback.
  const boardKey = board.join(',')
  const prevBoardRef = useRef(null)
  const [popCells, setPopCells] = useState([])
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    const prev = prevBoardRef.current
    prevBoardRef.current = board
    if (!prev || prev.length !== board.length) return undefined
    const fresh = []
    for (let i = 0; i < board.length; i++) if (!prev[i] && board[i]) fresh.push(i)
    if (!fresh.length) return undefined
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot celebration keyed on the board transition itself
    setPopCells(fresh)
    setAnnouncement(`${board[fresh[0]]} matched the ${pairsFaceName(deck[fresh[0]])} pair`)
    const t = setTimeout(() => setPopCells([]), MATCH_POP_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on board content (boardKey), not array identity
  }, [boardKey])
  useEffect(() => {
    if (!mismatchKey) return
    const [a, b] = flippedList
    // eslint-disable-next-line react-hooks/set-state-in-effect -- announce the mismatch once per new pair
    setAnnouncement(`No match: ${pairsFaceName(deck[a])} and ${pairsFaceName(deck[b])}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the mismatch pair itself
  }, [mismatchKey])

  const cells = []
  for (let i = 0; i < board.length; i++) {
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
    // The face is only put in the DOM while it's face-up, so inspecting a face-down card
    // shows nothing (the deck order itself still lives in RTDB — see pairsLogic.js).
    const face = faceUp ? deck[i] : null
    const popping = popCells.includes(i)
    const heldBy = isHeldFirstPick ? currentTurn : null

    cells.push(
      <button
        key={i}
        type="button"
        disabled={isDisabled}
        onClick={() => !isDisabled && onMove(i)}
        aria-pressed={isHeldFirstPick}
        aria-label={cellLabel({ index: i, face, owner: claimed ? owner : null, held: isHeldFirstPick, mismatched: mismatchRevealed })}
        className={cn(
          'relative aspect-square rounded-md select-none transition-transform duration-150',
          !isDisabled && 'cursor-pointer active:scale-95',
          isHeldFirstPick && '-translate-y-1',
          popping && 'pairs-match-pop',
          mismatchRevealed && 'pairs-mismatch-shake',
        )}
        style={{ perspective: '400px' }}
      >
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: faceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Back — face-down card */}
          <div
            className={cn(
              'pairs-card-back absolute inset-0 flex items-center justify-center rounded-md',
              !isDisabled && 'hover:brightness-110',
            )}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <CardBackEmblem />
          </div>

          {/* Front — face-up / claimed card */}
          <div
            className={cn(
              'pairs-card-face absolute inset-0 flex items-center justify-center rounded-md',
              claimed && 'is-claimed',
            )}
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              backgroundColor: face ? pairsFaceColor(face) : undefined,
            }}
          >
            {face && <FaceSprite face={face} />}
          </div>
        </div>

        {/* Overlays sit outside the 3D flip so they never mirror or hide. */}
        {heldBy && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute -inset-[3px] rounded-lg border-2',
              heldBy === 'X' ? 'border-retro-p1 shadow-neon-p1' : 'border-retro-p2 shadow-neon-p2',
            )}
          />
        )}
        {mismatchRevealed && (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute -inset-[3px] rounded-lg border-2 border-dashed border-retro-danger" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-retro-danger font-pixel text-[8px] leading-none text-retro-bg"
            >
              ✕
            </span>
          </>
        )}
        {claimed && (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-0 rounded-md border-2',
                owner === 'X' ? 'border-retro-p1' : 'border-retro-p2',
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-sm px-0.5 font-pixel text-[8px] leading-none text-retro-bg',
                owner === 'X' ? 'bg-retro-p1' : 'bg-retro-p2',
              )}
            >
              {owner}
            </span>
          </>
        )}
        {popping && (
          <span aria-hidden="true" className="pairs-match-ring pointer-events-none absolute inset-0 rounded-lg border-2 border-retro-win" />
        )}
      </button>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2.5 sm:p-3">
        <div
          className="w-full"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${PAIRS_SIZE}, minmax(0, 1fr))`,
            gap: '6px',
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
      <p className="mt-1 text-center font-pixel text-[8px] text-retro-dim">
        {pairsLeft} {pairsLeft === 1 ? 'PAIR' : 'PAIRS'} LEFT
      </p>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  )
}
