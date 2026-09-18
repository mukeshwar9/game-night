import { useState } from 'react'
import { QRT_SIZE, giveOptions } from '../lib/quartoLogic'
import { cn } from '@/lib/utils'

// Attribute glyph for a piece id: bit0 tall/short, bit1 round/square,
// bit2 hollow/solid, bit3 light/dark. Declared outside render (React
// Compiler rule: no components created during render).
function Piece({ v, small }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block border-2',
        (v & 2) ? 'rounded-full' : 'rounded-sm',
        (v & 1) ? 'w-3 h-5' : 'w-4 h-3',
        small && ((v & 1) ? 'w-2 h-3.5' : 'w-3 h-2'),
      )}
      style={{
        borderColor: (v & 8) ? 'rgb(var(--c-fg))' : 'rgb(var(--c-dim))',
        background: !(v & 4)
          ? 'transparent'
          : ((v & 8) ? 'rgb(var(--c-fg) / 0.7)' : 'rgb(var(--c-dim) / 0.5)'),
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
        disabled && 'opacity-60 saturate-50',
      )}>
        {/* Stage strip */}
        <div className="flex items-center justify-center gap-2 pb-1.5">
          <span className="font-pixel text-[8px] text-retro-dim">
            {pending != null
              ? (pendingCell == null
                ? 'PLACE THIS PIECE — TAP A CELL'
                : 'NOW GIVE THEM THEIR PIECE')
              : 'WAITING…'}
          </span>
          {pending != null && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded border-2 border-retro-cta bg-retro-tint-cta/20">
              <Piece v={pending} small />
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
                aria-label={`qrt-cell-${i}${cell !== '' ? `-${cell}` : ''}`}
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
          <p className="text-center font-pixel text-[8px] text-retro-dim tracking-wider pb-1">
            {pendingCell == null ? 'SHELF' : 'TAP A SHELF PIECE TO HAND OVER'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {shelf.map(v => (
              <button
                key={v}
                disabled={disabled || pendingCell == null}
                onClick={() => confirm(v)}
                className={cn(
                  'w-9 h-9 rounded border flex items-center justify-center transition-all duration-100',
                  'outline-none focus-visible:ring-2 focus-visible:ring-retro-cta',
                  pendingCell == null && 'opacity-40 cursor-default',
                  pendingCell != null && 'cursor-pointer hover:brightness-125 active:scale-95',
                  'border-retro-border/60 bg-retro-card hover:border-retro-cta',
                )}
                aria-label={`qrt-give-${v}`}
              >
                <Piece v={v} small />
              </button>
            ))}
            {shelf.length === 0 && (
              <span className="font-pixel text-[8px] text-retro-dim">EMPTY</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
