import { useState } from 'react'
import { cn } from '@/lib/utils'
import { GOMOKU_SIZE, SWAP_ACTION, canGomokuSwap } from '../lib/gomokuLogic'
import { cellLabel } from '../lib/a11yLabels'

// Fit-to-width: the whole 15×15 board is always visible (five-in-a-row is
// about reading long lines — a horizontally scrolling board hid half of it).
// Cells get small on phones (~21px at 360), so placement is two-tap: the
// first tap drops a ghost stone, a second tap on it confirms. A mouse keeps
// single-click placement.
const isCoarse = () => {
  try { return window.matchMedia('(pointer: coarse)').matches } catch { return false }
}
export default function GomokuBoard({ board, onMove, disabled, winningLine = [], currentTurn, lastMove = null, swapRule = false, pieSwap = false }) {
  // Swap (pie) rule (GOMOKU SWAP only): on move 2 the player to move may take
  // the opening stone.
  const stones = board.filter(Boolean)
  const swapOpen = swapRule && canGomokuSwap(board, currentTurn, pieSwap)
  const opener = currentTurn === 'X' ? 'O' : 'X'
  const justSwapped = swapRule && pieSwap && stones.length === 1
  const [twoTap] = useState(isCoarse)
  const [pending, setPending] = useState(null)
  const pendingLive = pending != null && !disabled && board[pending] === '' ? pending : null
  const tap = (i) => {
    if (!twoTap || pendingLive === i) { setPending(null); onMove(i) } else setPending(i)
  }
  return (
    <div className="w-full max-w-sm mx-auto">
      <div
        className={cn(
          'relative bg-retro-surface border-2 border-retro-border rounded transition-all duration-200',
          disabled && 'board-idle',
        )}
      >
        <div className="p-1.5">
          <div
            className="mx-auto"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GOMOKU_SIZE}, minmax(0, 1fr))`,
              gap: '1px',
            }}
          >
            {board.map((cell, i) => {
              const row = Math.floor(i / GOMOKU_SIZE)
              const col = i % GOMOKU_SIZE
              const isOccupied = cell !== ''
              const isClickable = !disabled && !isOccupied
              const isWinning = winningLine.includes(i)
              return (
                <button
                  key={i}
                  data-testid={`gomoku-cell-${row}-${col}`}
                  aria-label={cellLabel({
                    row, col, occupant: cell, letters: true,
                    extra: [isWinning && 'winning line', !isWinning && i === lastMove && 'last move'],
                  })}
                  disabled={!isClickable}
                  onClick={() => isClickable && tap(i)}
                  className={cn(
                    'aspect-square flex items-center justify-center',
                    'border border-retro-border/50 rounded-sm',
                    'transition-all duration-100',
                    isClickable
                      ? currentTurn === 'X'
                        ? 'hover:bg-retro-p1/10 hover:border-retro-p1/40 cursor-pointer'
                        : 'hover:bg-retro-p2/10 hover:border-retro-p2/40 cursor-pointer'
                      : 'cursor-default',
                  )}
                >
                  {!isOccupied && pendingLive === i && (
                    <span className={cn('rounded-full w-[70%] h-[70%] opacity-50 ring-2 ring-retro-cta', currentTurn === 'X' ? 'bg-retro-p1' : 'bg-retro-p2')} aria-hidden="true" />
                  )}
                  {isOccupied && (
                    <span
                      className={cn(
                        'rounded-full flex items-center justify-center',
                        'w-[70%] h-[70%]',
                        cell === 'X' ? 'bg-retro-p1' : 'bg-retro-p2',
                        isWinning && 'scale-110',
                        isWinning && (cell === 'X' ? 'shadow-neon-p1' : 'shadow-neon-p2'),
                        // M-47: persistent ring on the most recently placed stone
                        !isWinning && i === lastMove && 'ring-2 ring-inset ring-retro-cta/70',
                      )}
                      style={{ animation: 'disc-drop 0.3s cubic-bezier(0.34,1.15,0.64,1)' }}
                    >
                      {/* GAMEPLAY-04: side letter in every stone — the board must
                          not rely on color alone for player identity (amber and
                          mono themes reduce the pair to brightness). Matches the
                          repo-wide X/O glyph convention. */}
                      <span className="font-pixel text-[9px] text-retro-bg leading-none">{cell}</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-center font-pixel text-[8px] text-retro-dim tracking-wider" aria-live="polite">
        {pendingLive != null ? 'TAP AGAIN TO PLACE' : '\u00a0'}
      </p>
      {swapOpen && !disabled && (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <button
            onClick={() => onMove({ action: SWAP_ACTION })}
            aria-label={`Swap: take ${opener}'s opening stone`}
            className={cn(
              'px-4 py-2 rounded border-2 font-pixel text-[10px] tracking-widest transition-all active:scale-95',
              'border-retro-cta text-retro-cta bg-retro-tint-cta hover:shadow-neon-cta',
            )}
          >
            SWAP
          </button>
          <p className="font-mono text-[11px] text-retro-dim text-center leading-snug">
            Take {opener}&apos;s opening stone as yours — or just place a stone.
          </p>
        </div>
      )}
      {((swapOpen && disabled) || justSwapped) && (
        <p role="status" className="mt-2 text-center font-pixel text-[9px] tracking-widest text-retro-dim">
          {justSwapped
            ? `${stones[0]} SWAPPED — THE OPENING STONE IS NOW ${stones[0]}'S`
            : `${currentTurn} MAY SWAP INSTEAD OF MOVING`}
        </p>
      )}
    </div>
  )
}
