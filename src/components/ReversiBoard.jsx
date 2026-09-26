import { cn } from '@/lib/utils'
import { REVERSI_DIM, legalMoves } from '../lib/reversiLogic'
import { cellLabel } from '../lib/a11yLabels'

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
            const row = Math.floor(i / REVERSI_DIM)
            const col = i % REVERSI_DIM

            return (
              <button
                key={i}
                data-testid={`reversi-cell-${row}-${col}`}
                aria-label={cellLabel({
                  row, col, occupant: cell, letters: true,
                  extra: [isHint && 'legal move', i === lastMove && 'last move'],
                })}
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
                      'items-center justify-center',
                      cell === 'X'
                        ? 'bg-retro-p1 shadow-neon-p1'
                        : 'bg-retro-p2 shadow-neon-p2',
                      // Round-over: emphasize the winning side's discs, dim the loser's.
                      roundOver && finalWinner !== 'draw' && cell === finalWinner && 'scale-110 shadow-neon-win ring-2 ring-retro-win',
                      roundOver && finalWinner !== 'draw' && cell !== finalWinner && 'opacity-50',
                    )}
                    // re-keyed by colour so a flip re-mounts and re-pops the disc
                    style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-flex' }}
                  >
                    {/* G-05: side letter on every disc — colour alone must not
                        carry player identity (same glyph convention as the
                        Gomoku/Hex stones and Checkers men). */}
                    <span aria-hidden="true" className="font-pixel text-[9px] sm:text-[10px] text-retro-bg leading-none select-none">{cell}</span>
                  </span>
                ) : isHint ? (
                  // Legal-move hint: a third-of-cell ring in the mover's colour,
                  // big and solid enough to spot on a phone.
                  <span
                    aria-hidden="true"
                    className={cn(
                      'w-[36%] h-[36%] rounded-full border-2',
                      currentTurn === 'X' ? 'border-retro-p1 bg-retro-p1/35' : 'border-retro-p2 bg-retro-p2/35',
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
