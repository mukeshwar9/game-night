import { cn } from '@/lib/utils'
import { REVERSI_DIM, legalMoves } from '../lib/reversiLogic'

export default function ReversiBoard({ board, onMove, disabled, currentTurn, lastMove = null }) {
  const xCount = board.filter(c => c === 'X').length
  const oCount = board.filter(c => c === 'O').length

  // Legal-move hints for whoever is on the move (only while playable)
  const hints = !disabled && currentTurn ? new Set(legalMoves(board, currentTurn)) : new Set()

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* green-felt-ish board: a tinted surface with a subtle inner glow */}
      <div
        className="border-2 border-retro-border rounded p-2 sm:p-3"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgb(var(--c-win) / 0.10), rgb(var(--c-surface)) 70%)',
        }}
      >
        <div
          className="grid gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${REVERSI_DIM}, minmax(0, 1fr))` }}
        >
          {board.map((cell, i) => {
            const isHint = hints.has(i)
            const isClickable = !disabled && isHint

            return (
              <button
                key={i}
                aria-label={`reversi-cell-${Math.floor(i / REVERSI_DIM)}-${i % REVERSI_DIM}`}
                disabled={!isClickable}
                onClick={() => isClickable && onMove(i)}
                className={cn(
                  'aspect-square flex items-center justify-center rounded-sm',
                  'border border-retro-win/20 bg-retro-win/5',
                  'transition-all duration-100',
                  isClickable
                    ? currentTurn === 'X'
                      ? 'hover:bg-retro-p1/15 hover:border-retro-p1/40 cursor-pointer'
                      : 'hover:bg-retro-p2/15 hover:border-retro-p2/40 cursor-pointer'
                    : 'cursor-default',
                  // M-47: persistent marker on the most recently placed disc
                  i === lastMove && 'ring-2 ring-inset ring-retro-cta/70',
                )}
              >
                {cell ? (
                  <span
                    key={cell}
                    className={cn(
                      'w-[80%] h-[80%] rounded-full',
                      cell === 'X'
                        ? 'bg-retro-p1 shadow-neon-p1'
                        : 'bg-retro-p2 shadow-neon-p2',
                    )}
                    // re-keyed by colour so a flip re-mounts and re-pops the disc
                    style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-block' }}
                  />
                ) : isHint ? (
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      currentTurn === 'X' ? 'bg-retro-p1/50' : 'bg-retro-p2/50',
                    )}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* Disc count bar */}
      <div className="mt-2 flex items-center justify-center gap-3 font-pixel text-[10px]">
        <span className="text-retro-p1 text-glow-p1">X {xCount}</span>
        <span className="text-retro-dim">—</span>
        <span className="text-retro-p2 text-glow-p2">{oCount} O</span>
      </div>
    </div>
  )
}
