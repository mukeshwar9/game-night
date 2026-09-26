import { useMemo, useState } from 'react'
import {
  ON_SIZE, cardName, cardDeltas,
  legalOnMoves, ownerOf, isMaster,
} from '../lib/onitamaLogic'
import { cn } from '@/lib/utils'
import { cellLabel } from '../lib/a11yLabels'

// Mini-grid of a card's pattern from the MOVER's perspective: 5×5 with
// center = origin, filled squares = reachable squares. `size` 'lg' is the
// mover's own hand (the core decision — ~80px, readable on a phone); 'md'
// is the opponent's hand and the spare.
function CardView({ k, active, mover, size = 'md' }) {
  const deltas = cardDeltas(k, mover)
  const marked = new Set(deltas.map(([dr, dc]) => `${dr + 2},${dc + 2}`))
  return (
    <span
      className={cn(
        'inline-grid grid-cols-5 p-1 rounded border transition-all duration-100',
        size === 'lg' ? 'gap-0.5' : 'gap-px',
        active ? 'border-retro-cta bg-retro-tint-cta/20' : 'border-retro-border/50',
      )}
      aria-hidden="true"
    >
      {Array.from({ length: 25 }, (_, n) => {
        const r = Math.floor(n / 5)
        const c = n % 5
        const isCenter = r === 2 && c === 2
        const isDot = marked.has(`${r},${c}`)
        return (
          <span
            key={n}
            className={cn(
              size === 'lg' ? 'w-3.5 h-3.5 rounded-[2px]' : 'w-2 h-2 rounded-[1px]',
              isCenter && 'bg-retro-text',
              !isCenter && isDot && 'bg-retro-cta',
              !isCenter && !isDot && 'bg-retro-border/40',
            )}
          />
        )
      })}
    </span>
  )
}

// ONITAMA — 5×5 dojo. The board owns the whole interaction: pick one of your
// two cards (highlighted moves preview on the grid), then tap a highlighted
// destination to commit { from, to, card }. Squares, pieces and cards are
// theme-driven (--c-p1/--c-p2/--c-cta); card mini-grids render each pattern
// from the mover's own perspective.
export default function OnitamaBoard({
  board, onMove, disabled, lastMove = null,
  handX = [], handO = [], spare = null, currentTurn = null,
}) {
  // The live game passes currentTurn (whose turn it is); demo/bot harness
  // omits it — fall back to the default activeMover.
  const activeMover = currentTurn ?? 'X'

  const [card, setCard] = useState(null)

  const hand = activeMover === 'X' ? handX : handO
  const moves = useMemo(
    () => (disabled || card == null ? [] : legalOnMoves(board, activeMover, card)),
    [board, activeMover, card, disabled],
  )
  const targets = new Map(moves.map(m => [m.to, m]))
  const selectable = useMemo(() => {
    if (disabled) return new Set()
    const s = new Set()
    for (const k of hand) {
      if (legalOnMoves(board, activeMover, k).length) s.add(k)
    }
    return s
  }, [board, activeMover, hand, disabled])

  const pickCard = (k) => {
    if (disabled || !selectable.has(k)) return
    setCard(prev => (prev === k ? null : k))
  }

  const tap = (i) => {
    const m = targets.get(i)
    if (m) {
      setCard(null)
      onMove(m)
    }
  }

  return (
    <div className="w-full max-w-[400px] sm:max-w-[440px] mx-auto">
      <div className={cn(
        'bg-retro-bg border-2 border-retro-border rounded p-2 sm:p-3 transition-all duration-200',
        disabled && 'board-idle',
      )}>
        {/* Opponent's hand (face-up, as in real Onitama) + spare */}
        <div className="flex items-end justify-center gap-2 pb-2">
          {handO.map(k => (
            <span key={k} className="flex flex-col items-center gap-0.5">
              <CardView k={k} active={false} mover={activeMover} />
              <span aria-hidden="true" className="font-pixel text-[8px] text-retro-dim">{cardName(k)}</span>
            </span>
          ))}
          <span className="sr-only">O cards: {handO.map(cardName).join(', ') || 'none'}.</span>
          <span className="ml-2 flex flex-col items-center gap-0.5 border-l border-retro-border/60 pl-3">
            {spare != null && <CardView k={spare} active={false} mover={activeMover} />}
            <span className="font-pixel text-[8px] text-retro-dim">
              SPARE: {spare != null ? cardName(spare) : '—'}
            </span>
          </span>
        </div>

        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${ON_SIZE}, 1fr)` }}
        >
          {board.map((cell, i) => {
            const r = Math.floor(i / ON_SIZE)
            const c = i % ON_SIZE
            const dark = (r + c) % 2 === 0
            const isTarget = targets.has(i)
            const owner = ownerOf(cell)
            return (
              <button
                key={i}
                data-testid={`on-cell-${r}-${c}${cell ? `-${cell}` : ''}`}
                aria-label={cellLabel({
                  row: r, col: c,
                  occupant: cell && `${owner} ${isMaster(cell) ? 'master' : 'student'}`,
                  extra: [
                    i === 22 && 'X temple',
                    i === 2 && 'O temple',
                    isTarget && 'move here',
                    i === lastMove && 'last move',
                  ],
                })}
                disabled={disabled}
                onClick={() => !disabled && tap(i)}
                className={cn(
                  'aspect-square rounded-sm transition-all duration-100 select-none',
                  'flex items-center justify-center font-pixel text-base sm:text-lg outline-none',
                  'focus-visible:ring-2 focus-visible:ring-retro-cta',
                  dark ? 'bg-retro-surface' : 'bg-retro-card',
                  'border border-retro-border/40',
                  !disabled && 'cursor-pointer hover:brightness-125 active:scale-95',
                  isTarget && 'ring-2 ring-inset ring-retro-cta/70 bg-retro-tint-cta/20',
                  (i === 2 || i === 22) && 'border-retro-cta/60',
                  i === lastMove && !isTarget && 'ring-2 ring-inset ring-retro-cta/60',
                )}
              >
                {cell && (
                  <span
                    style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-block' }}
                    className={cn(
                      'w-[76%] h-[76%] flex items-center justify-center rounded-full',
                      'bg-retro-bg/85 border',
                      owner === 'X'
                        ? 'border-retro-p1 text-retro-p1 text-glow-p1'
                        : 'border-retro-p2 text-retro-p2 text-glow-p2',
                    )}
                  >
                    {isMaster(cell) ? 'K' : 'P'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Mover's hand: pick a card, then a highlighted square */}
        <div className="flex items-stretch justify-center gap-3 pt-2">
          {hand.map(k => (
            <button
              key={k}
              disabled={disabled}
              onClick={() => pickCard(k)}
              className={cn(
                'flex flex-col items-center gap-1 rounded border-2 px-2 py-1.5 transition-all duration-100',
                'focus-visible:ring-2 focus-visible:ring-retro-cta outline-none',
                selectable.has(k) ? 'cursor-pointer hover:brightness-125' : 'opacity-40 cursor-default',
                card === k ? 'border-retro-cta bg-retro-tint-cta/20' : 'border-retro-border/50',
              )}
              aria-pressed={card === k}
              data-testid={`onitama-card-${cardName(k)}`}
              aria-label={`${cardName(k)} card${selectable.has(k) ? '' : ', no legal moves'}`}
            >
              <CardView k={k} active={card === k} mover={activeMover} size="lg" />
              <span className={cn(
                'font-pixel text-[10px] tracking-wider',
                card === k ? 'text-retro-cta' : 'text-retro-dim',
              )}>
                {cardName(k)}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-center font-mono text-xs text-retro-dim">
          {card == null ? 'Pick a card — its moves light up.' : 'Tap a lit square. The card then passes to your rival.'}
        </p>
      </div>
    </div>
  )
}
