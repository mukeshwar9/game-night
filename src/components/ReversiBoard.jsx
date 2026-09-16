import { cn } from '@/lib/utils'
import { REVERSI_DIM, legalMoves } from '../lib/reversiLogic'

export default function ReversiBoard({ board, onMove, disabled, currentTurn, lastMove = null }) {
  const xCount = board.filter(c => c === 'X').length
  const oCount = board.filter(c => c === 'O').length

  // Legal-move hints for whoever is on the move (only while playable)
  const hints = !disabled && currentTurn ? new Set(legalMoves(board, currentTurn)) : new Set()

  // Round-over detection independent of the `disabled` prop (which also goes
  // true when it's simply not your turn): mirrors getReversiWinner's own
  // end condition — full board, or neither side has a legal move.
  const boardFull = !board.includes('')
  const roundOver =
    boardFull || (legalMoves(board, 'X').length === 0 && legalMoves(board, 'O').length === 0)
  const finalWinner = roundOver ? (xCount > oCount ? 'X' : oCount > xCount ? 'O' : 'draw') : null

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
                      'w-[80%] h-[80%] rounded-full transition-all duration-200',
                      cell === 'X'
                        ? 'bg-retro-p1 shadow-neon-p1'
                        : 'bg-retro-p2 shadow-neon-p2',
                      // Round-over: emphasize the winning side's discs, dim the loser's.
                      roundOver && finalWinner !== 'draw' && cell === finalWinner && 'scale-110 shadow-neon-win ring-2 ring-retro-win',
                      roundOver && finalWinner !== 'draw' && cell !== finalWinner && 'opacity-50',
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

      {/* Disc count bar — emphasized final tally once the round is over */}
      <div
        className={cn(
          'mt-2 flex items-center justify-center gap-3 font-pixel transition-all duration-200',
          roundOver ? 'text-sm sm:text-base' : 'text-[10px]',
        )}
      >
        <span
          className={cn(
            'text-retro-p1 text-glow-p1',
            roundOver && finalWinner === 'X' && 'scale-125 inline-block',
            roundOver && finalWinner === 'O' && 'opacity-50',
          )}
        >
          X {xCount}
        </span>
        <span className="text-retro-dim">{roundOver ? (finalWinner === 'draw' ? 'DRAW' : 'WINS') : '—'}</span>
        <span
          className={cn(
            'text-retro-p2 text-glow-p2',
            roundOver && finalWinner === 'O' && 'scale-125 inline-block',
            roundOver && finalWinner === 'X' && 'opacity-50',
          )}
        >
          {oCount} O
        </span>
      </div>
    </div>
  )
}
