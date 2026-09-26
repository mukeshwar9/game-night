import { useState } from 'react'
import { QRT_SIZE, giveOptions } from '../lib/quartoLogic'
import { cn } from '@/lib/utils'
import { cellLabel, quartoPieceLabel } from '../lib/a11yLabels'

// Attribute glyph for a piece id: bit0 tall/short, bit1 round/square,
// bit2 hollow/solid, bit3 light/dark. Declared outside render (React
// Compiler rule: no components created during render).
// Sizes: 'lg' on the board, 'md' on the shelf, 'sm' in the stage strip —
// tall vs short must stay obvious at every size.
const PIECE_SIZE = {
  lg: { tall: 'w-6 h-10', short: 'w-8 h-5' },
  md: { tall: 'w-4 h-7', short: 'w-6 h-4' },
  sm: { tall: 'w-2 h-3.5', short: 'w-3 h-2' },
}
function Piece({ v, size = 'lg' }) {
  const dims = PIECE_SIZE[size] ?? PIECE_SIZE.lg
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block',
        size === 'sm' ? 'border-2' : 'border-[3px]',
        (v & 2) ? 'rounded-full' : 'rounded-sm',
        (v & 1) ? dims.tall : dims.short,
      )}
      style={{
        // "dark" pieces use the text channel, "light" ones the dim channel
        // (there is no --c-fg token — it rendered both shades the same).
        borderColor: (v & 8) ? 'rgb(var(--c-text))' : 'rgb(var(--c-dim))',
        background: !(v & 4)
          ? 'transparent'
          : ((v & 8) ? 'rgb(var(--c-text) / 0.75)' : 'rgb(var(--c-dim) / 0.55)'),
      }}
    />
  )
}

// QUARTO — 4×4 with 16 shared four-attribute pieces. Two-stage turn, owned
// by the board: tap an empty CELL to place the pending piece, then tap a
// shelf piece to GIVE it to the opponent — one combined { place, give }
// payload. Piece glyphs render the 4 attributes as shape (round/square),
// size (tall/short), fill (hollow/solid) and shade (light/dark), all through
// --c-* channels.
export default function QuartoBoard({
  board, onMove, disabled, lastMove = null,
  unplaced = [], pending = null,
}) {
  // Local two-stage state: chosen cell → chosen give piece → commit.
  const [pendingCell, setPendingCell] = useState(null)

  const shelf = giveOptions(board, unplaced, pending)

  const tapPlace = (i) => {
    if (disabled || board[i] !== '') return
    setPendingCell(prev => (prev === i ? null : i))
  }

  const confirm = (piece) => {
    if (pendingCell == null || piece == null) return
    const payload = { place: pendingCell, give: piece }
    setPendingCell(null)
    onMove(payload)
  }

  return (
    <div className="w-full max-w-[380px] sm:max-w-[420px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'board-idle',
      )}>
        {/* Stage strip */}
        <div className="flex items-center justify-center gap-2 pb-1.5">
          <span className="font-pixel text-[10px] text-retro-text">
            {pending != null
              ? (pendingCell == null
                ? 'PLACE THIS PIECE — TAP A CELL'
                : 'NOW GIVE THEM THEIR PIECE')
              : 'WAITING…'}
          </span>
          {pending != null && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded border-2 border-retro-cta bg-retro-tint-cta/20">
              <Piece v={pending} size="sm" />
              <span className="sr-only">Piece to place: {quartoPieceLabel(pending)}</span>
            </span>
          )}
        </div>

        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${QRT_SIZE}, 1fr)` }}
        >
          {board.map((cell, i) => {
            const isPlacing = pendingCell === i
            const isLast = i === lastMove
            return (
              <button
                key={i}
                data-testid={`qrt-cell-${i}${cell !== '' ? `-${cell}` : ''}`}
                aria-label={cellLabel({
                  row: Math.floor(i / QRT_SIZE), col: i % QRT_SIZE,
                  occupant: quartoPieceLabel(cell),
                  extra: [isPlacing && 'chosen', isLast && 'last move'],
                })}
                disabled={disabled}
                onClick={() => tapPlace(i)}
                className={cn(
                  'aspect-square rounded-sm transition-all duration-100 select-none',
                  'flex items-center justify-center outline-none',
                  'focus-visible:ring-2 focus-visible:ring-retro-cta',
                  'bg-retro-surface border border-retro-border/40',
                  !disabled && 'cursor-pointer hover:brightness-125 active:scale-95',
                  isPlacing && 'ring-2 ring-inset ring-retro-cta bg-retro-tint-cta/30',
                  isLast && !isPlacing && 'ring-2 ring-inset ring-retro-cta/60',
                )}
              >
                {cell !== '' && (
                  <span style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-flex' }}>
                    <Piece v={cell} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Shelf: give stage */}
        <div className="pt-2">
          <p className={cn(
            'text-center font-pixel text-[9px] tracking-wider pb-1.5',
            pendingCell == null ? 'text-retro-dim' : 'text-retro-cta',
          )}>
            {pendingCell == null ? 'SHELF' : 'TAP A SHELF PIECE TO HAND OVER'}
          </p>
          {/* 44px targets, 8 per row on a phone (two rows for a full shelf) */}
          <div className="mx-auto flex max-w-[380px] flex-wrap items-center justify-center gap-1">
            {shelf.map(v => (
              <button
                key={v}
                disabled={disabled || pendingCell == null}
                onClick={() => confirm(v)}
                className={cn(
                  'w-10 h-11 sm:w-11 rounded border flex items-center justify-center transition-all duration-100',
                  'outline-none focus-visible:ring-2 focus-visible:ring-retro-cta',
                  pendingCell == null && 'opacity-40 cursor-default',
                  pendingCell != null && 'cursor-pointer hover:brightness-125 active:scale-95',
                  'border-retro-border/60 bg-retro-card hover:border-retro-cta',
                )}
                data-testid={`qrt-give-${v}`}
                aria-label={`Give ${quartoPieceLabel(v)}`}
              >
                <Piece v={v} size="md" />
              </button>
            ))}
            {shelf.length === 0 && (
              <span className="font-pixel text-[9px] text-retro-dim">EMPTY</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
