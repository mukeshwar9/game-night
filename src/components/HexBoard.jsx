import { cn } from '@/lib/utils'
import { HEX_SIZE } from '../lib/hexLogic'

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
const CELL_W = 26
const CELL_H = 30
const ROW_OVERLAP = CELL_H * 0.25
const BOARD_W = CELL_W * HEX_SIZE + (CELL_W / 2) * (HEX_SIZE - 1)

export default function HexBoard({ board, onMove, disabled, winningLine = [], currentTurn, lastMove = null }) {
  const showHint = board.every(c => !c)
  return (
    <div className="w-full max-w-md mx-auto">
      <div
        className={cn(
          'relative bg-retro-bg border-2 border-retro-border rounded transition-all duration-200',
          disabled && 'opacity-60 saturate-50',
        )}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-9 rounded-l bg-gradient-to-r from-retro-p1/30 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-9 rounded-r bg-gradient-to-l from-retro-p1/30 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-retro-p2/30 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-retro-p2/30 to-transparent" />
        <div className="p-3 overflow-x-auto">
          <div className="mx-auto" style={{ width: `${BOARD_W}px` }}>
            {Array.from({ length: HEX_SIZE }, (_, row) => (
              <div
                key={row}
                className="flex"
                style={{
                  marginTop: row === 0 ? 0 : `-${ROW_OVERLAP}px`,
                  marginLeft: `${(row * CELL_W) / 2}px`,
                }}
              >
                {board.slice(row * HEX_SIZE, row * HEX_SIZE + HEX_SIZE).map((cell, col) => {
                  const i = row * HEX_SIZE + col
                  const isOccupied = cell !== ''
                  const isClickable = !disabled && !isOccupied
                  const isWinning = winningLine.includes(i)
                  const isLast = i === lastMove && !isWinning
                  return (
                    <button
                      key={i}
                      aria-label={`hex-cell-${row}-${col}`}
                      disabled={!isClickable}
                      onClick={() => isClickable && onMove(i)}
                      className={cn(
                        'relative shrink-0 transition-[filter] duration-100',
                        isClickable ? 'cursor-pointer hover:brightness-150' : 'cursor-default',
                      )}
                      style={{ width: `${CELL_W}px`, height: `${CELL_H}px` }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{ clipPath: HEX_CLIP, background: 'rgb(var(--c-border))' }}
                      />
                      <span
                        aria-hidden="true"
                        className="absolute"
                        style={{
                          clipPath: HEX_CLIP,
                          inset: '1.5px',
                          background: isOccupied
                            ? `rgb(var(--c-${cell === 'X' ? 'p1' : 'p2'}))`
                            : 'rgb(var(--c-surface))',
                          filter: isOccupied
                            ? `drop-shadow(0 0 ${isWinning ? 8 : 5}px rgb(var(--c-${cell === 'X' ? 'p1' : 'p2'})${isWinning ? '' : ' / 0.7'}))${isWinning ? ' brightness(1.35)' : ''}`
                            : undefined,
                          animation: isOccupied ? 'place-pop 0.2s cubic-bezier(0.34,1.15,0.64,1)' : undefined,
                        }}
                      />
                      {isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-retro-bg animate-pulse"
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {showHint && (
        <p className={cn(
          'mt-2 text-center font-pixel text-[9px] tracking-widest',
          currentTurn === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2',
        )}>
          CONNECT YOUR EDGES
        </p>
      )}
    </div>
  )
}
