import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  BK_SIZE,
  BK_CELL_COUNT,
  BK_WALL_SLOT_COUNT,
  decodeSlot,
  legalPawnMoves,
  isWallMoveLegal,
} from '../lib/blockadeLogic'

export default function BlockadeBoard({ board, pawns, walls, onMove, disabled, currentTurn, lastMove = null }) {
  const [mode, setMode] = useState('move')
  const [pendingWallSlot, setPendingWallSlot] = useState(null)
  const [hoverSlot, setHoverSlot] = useState(null)
  const [illegalFlashSlot, setIllegalFlashSlot] = useState(null)

  // Opponent just moved, or I just moved — either way, clear any wall preview
  // and reset back to MOVE mode. Adjusted during render (not an effect) per
  // React's "adjusting state when a prop changes" pattern — avoids an extra
  // render pass and the lint rule against setState-in-effect.
  const [lastTurn, setLastTurn] = useState(currentTurn)
  if (currentTurn !== lastTurn) {
    setLastTurn(currentTurn)
    setMode('move')
    setPendingWallSlot(null)
    setHoverSlot(null)
  }

  // Also reset to MOVE mode the moment the board becomes interactive again
  // (covers a `disabled` flip that isn't accompanied by a currentTurn change).
  const [lastDisabled, setLastDisabled] = useState(disabled)
  if (disabled !== lastDisabled) {
    setLastDisabled(disabled)
    if (!disabled) {
      setMode('move')
      setPendingWallSlot(null)
      setHoverSlot(null)
    }
  }

  function handleSetMode(next) {
    if (disabled) return
    setMode(next)
    setPendingWallSlot(null)
    setHoverSlot(null)
  }

  function flashIllegal(slot) {
    setIllegalFlashSlot(slot)
    setTimeout(() => setIllegalFlashSlot(cur => (cur === slot ? null : cur)), 300)
  }

  function handleWallTap(slot) {
    if (disabled) return
    if (pendingWallSlot === slot) {
      // second tap on the same slot confirms — but reject silently-turned-loud
      // if it's illegal (occupied/conflicting/would seal a path): flash it
      // instead of sending a doomed move to the server.
      if (!isWallMoveLegal(board, pawns, walls[currentTurn], slot, currentTurn)) {
        flashIllegal(slot)
        return
      }
      // clear optimistically, don't wait for the round-trip
      onMove({ type: 'wall', slot })
      setPendingWallSlot(null)
    } else {
      setPendingWallSlot(slot)
    }
  }

  const lastMoveCell = lastMove != null && lastMove >= 0 && lastMove < BK_CELL_COUNT ? lastMove : null
  const lastMoveWallSlot = lastMove != null && lastMove >= BK_CELL_COUNT ? lastMove - BK_CELL_COUNT : null

  const legalMoveSet = mode === 'move' && !disabled
    ? new Set(legalPawnMoves(pawns, board, currentTurn))
    : new Set()

  // --- Cells (pawn layer) ---
  const cellEls = []
  for (let r = 0; r < BK_SIZE; r++) {
    for (let c = 0; c < BK_SIZE; c++) {
      const cellIndex = r * BK_SIZE + c
      const isGoalX = r === 0
      const isGoalO = r === BK_SIZE - 1
      const isHint = legalMoveSet.has(cellIndex)
      const isClickable = mode === 'move' && !disabled && isHint
      const pawnHere = pawns.X === cellIndex ? 'X' : pawns.O === cellIndex ? 'O' : null

      cellEls.push(
        <div
          key={`cell-${cellIndex}`}
          style={{ gridRow: `${2 * r + 1} / ${2 * r + 2}`, gridColumn: `${2 * c + 1} / ${2 * c + 2}` }}
          className={cn(
            'relative flex items-center justify-center',
            isGoalX ? 'bg-retro-p1/5' : isGoalO ? 'bg-retro-p2/5' : '',
          )}
        >
          {isClickable && (
            <button
              aria-label={`blockade-cell-${r}-${c}`}
              onClick={() => onMove({ type: 'pawn', to: cellIndex })}
              className={cn(
                'absolute inset-0 rounded-sm transition-all duration-100 cursor-pointer',
                currentTurn === 'X'
                  ? 'bg-retro-p1/10 border border-retro-p1/25 hover:bg-retro-p1/15 hover:border-retro-p1/40'
                  : 'bg-retro-p2/10 border border-retro-p2/25 hover:bg-retro-p2/15 hover:border-retro-p2/40',
              )}
            />
          )}
          {pawnHere && (
            <span
              // Mounts fresh each time this cell newly gains a pawn (it moved
              // here), so place-pop replays on every move without extra state.
              className={cn(
                'w-[60%] h-[60%] rounded-full',
                pawnHere === 'X' ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-p2 shadow-neon-p2',
                cellIndex === lastMoveCell && 'ring-2 ring-retro-cta/70',
              )}
              style={{ animation: 'place-pop 0.25s ease-out' }}
            />
          )}
        </div>
      )
    }
  }

  // --- Wall slots (groove layer) ---
  const wallEls = []
  for (let slot = 0; slot < BK_WALL_SLOT_COUNT; slot++) {
    const { orientation, r, c } = decodeSlot(slot)
    const owner = board[slot]
    const isOccupied = !!owner

    const gridRow = orientation === 'h' ? `${2 * r + 2} / ${2 * r + 3}` : `${2 * r + 1} / ${2 * r + 4}`
    const gridColumn = orientation === 'h' ? `${2 * c + 1} / ${2 * c + 4}` : `${2 * c + 2} / ${2 * c + 3}`
    // ±19px over the 6px groove = 44px tap target on the thin axis (was ±8px = 22px).
    const hitClasses = orientation === 'h'
      ? 'absolute -top-[19px] -bottom-[19px] left-0 right-0'
      : 'absolute top-0 bottom-0 -left-[19px] -right-[19px]'

    const isPending = pendingWallSlot === slot
    const isHovered = hoverSlot === slot
    const isFlashing = illegalFlashSlot === slot
    const showPreview = !isOccupied && mode === 'wall' && !disabled && (isPending || isHovered || isFlashing)
    const isLegalPreview = showPreview && !isFlashing
      && isWallMoveLegal(board, pawns, walls[currentTurn], slot, currentTurn)
    const isLastMoveWall = isOccupied && slot === lastMoveWallSlot

    let inner
    if (isOccupied) {
      inner = (
        <div
          // Mounts fresh the instant this slot flips from empty to occupied,
          // so place-pop replays on every wall placement without extra state.
          className={cn(
            hitClasses,
            'pointer-events-none rounded-sm',
            owner === 'X' ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-p2 shadow-neon-p2',
            isLastMoveWall && 'ring-2 ring-retro-cta/70',
          )}
          style={{ animation: 'place-pop 0.25s ease-out' }}
        />
      )
    } else if (mode === 'wall' && !disabled) {
      inner = (
        <button
          aria-label={`blockade-wall-${orientation}-${r}-${c}`}
          onClick={() => handleWallTap(slot)}
          onMouseEnter={() => setHoverSlot(slot)}
          onMouseLeave={() => setHoverSlot(null)}
          className={cn(
            hitClasses,
            'rounded-sm transition-all duration-100',
            isFlashing
              // Illegal-tap rejection: a brief danger pulse instead of silently doing nothing.
              ? 'bg-retro-danger/40 border border-retro-danger shadow-neon-danger animate-pulse cursor-not-allowed'
              : showPreview
                ? isLegalPreview
                  ? isPending
                    // Armed-for-confirm: solid player-color fill + pulsing ring, distinct from hover.
                    ? cn(
                        currentTurn === 'X' ? 'bg-retro-p1' : 'bg-retro-p2',
                        'ring-2 ring-retro-cta animate-pulse shadow-neon-cta cursor-pointer',
                      )
                    : 'bg-retro-cta/40 border border-retro-cta shadow-neon-cta cursor-pointer'
                  : 'bg-retro-danger/15 border border-retro-danger/50 cursor-not-allowed'
                : 'bg-retro-border/30 hover:bg-retro-border/50 cursor-pointer',
          )}
        />
      )
    } else {
      inner = <div className={cn(hitClasses, 'pointer-events-none rounded-sm bg-retro-border/30')} />
    }

    wallEls.push(
      <div key={`wall-${slot}`} style={{ gridRow, gridColumn }} className="relative">
        {inner}
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        className={cn(
          'bg-retro-surface border-2 rounded p-3 transition-all duration-200',
          mode === 'wall' && !disabled ? 'border-retro-cta' : 'border-retro-border',
          disabled && 'opacity-60 saturate-50',
        )}
      >
        <div
          className="aspect-square w-full"
          style={{
            display: 'grid',
            gridTemplateRows: 'repeat(8, minmax(0,1fr) 6px) minmax(0,1fr)',
            gridTemplateColumns: 'repeat(8, minmax(0,1fr) 6px) minmax(0,1fr)',
          }}
        >
          {/* Cell layer — pointer-events-none in WALL mode is defense-in-depth so a stray
              tap can never fall through to a cell handler (cells only render <button>s in
              MOVE mode anyway). */}
          <div className={cn('contents', mode === 'wall' && 'pointer-events-none')}>
            {cellEls}
          </div>
          {wallEls}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mt-3 flex items-center justify-center gap-3">
        {['move', 'wall'].map(m => (
          <button
            key={m}
            aria-label={`mode-${m}`}
            disabled={disabled}
            onClick={() => handleSetMode(m)}
            className={cn(
              'px-4 py-2 font-pixel text-[10px] rounded border-2 uppercase transition-all duration-100 active:scale-95',
              mode === m
                ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
              disabled && 'opacity-50 cursor-default',
            )}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Wall-count chip bar */}
      <div className="mt-2 flex items-center justify-center gap-4 font-pixel text-[10px]">
        <span className="text-retro-p1 text-glow-p1">X</span>
        <div className="flex gap-[2px]">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={cn('w-1.5 h-3 rounded-[1px]',
              i < walls.X ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-border/30')} />
          ))}
        </div>
        <span className="text-retro-dim">—</span>
        <div className="flex gap-[2px]">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={cn('w-1.5 h-3 rounded-[1px]',
              i < walls.O ? 'bg-retro-p2 shadow-neon-p2' : 'bg-retro-border/30')} />
          ))}
        </div>
        <span className="text-retro-p2 text-glow-p2">O</span>
      </div>
    </div>
  )
}
