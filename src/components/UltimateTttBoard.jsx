import { cn } from '@/lib/utils'
import { joinLabel } from '../lib/a11yLabels'

// Ultimate Tic-Tac-Toe board: a 3×3 grid of nine 3×3 miniboards.
// `winningLine` holds META miniboard indices (0..8) once the game is won.
// `uWon` is per-miniboard outcome ('' | 'X' | 'O' | 'D'); `uActiveBoard` is the
// board the current player must play in (-1 = any).
export default function UltimateTttBoard({
  board, onMove, disabled, winningLine = [], currentTurn,
  uWon = [], uActiveBoard = -1, lastMove = null,
}) {
  const activeRing = currentTurn === 'O' ? 'border-retro-p2 shadow-neon-p2' : 'border-retro-p1 shadow-neon-p1'
  const isBoardActive = (m) => !disabled && !uWon[m] && (uActiveBoard === -1 || uActiveBoard === m)
  const isTargeted = (m) => uActiveBoard === m

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Free-play cue — the playable miniboards themselves carry the cta outline;
          this line only names it. Reserved height so it never shifts layout. */}
      <div className="h-4 mb-1 flex items-center justify-center">
        {!disabled && uActiveBoard === -1 && (
          <span className="font-pixel text-[10px] text-retro-cta tracking-wide">
            PLAY ANY OUTLINED BOARD
          </span>
        )}
      </div>
      <div
        className={cn(
          'grid grid-cols-3 gap-1 sm:gap-1.5 bg-retro-border/40 p-1 sm:p-1.5 rounded transition-all duration-200',
          disabled && 'board-idle',
        )}
      >
        {Array.from({ length: 9 }, (_, m) => {
          const decided = uWon[m]
          const active = isBoardActive(m)
          const targeted = isTargeted(m)
          const metaWin = winningLine.includes(m)
          return (
            <div
              key={m}
              className={cn(
                'relative rounded-sm p-0.5 border-2 transition-all',
                metaWin
                  ? 'border-retro-win shadow-neon-win bg-retro-win/10'
                  : active
                    ? (targeted
                      ? cn('bg-retro-card', activeRing, 'animate-pulse')
                      // Free play: every open miniboard gets a steady cta outline + tint
                      : 'border-retro-cta bg-retro-tint-cta/40')
                    : 'border-retro-border bg-retro-surface',
              )}
            >
              <div className="grid grid-cols-3 gap-0.5">
                {Array.from({ length: 9 }, (_, c) => {
                  const i = m * 9 + c
                  const v = board[i]
                  const playable = active && !v
                  return (
                    <button
                      key={c}
                      onClick={() => playable && onMove(i)}
                      disabled={!playable}
                      aria-label={joinLabel(
                        `Board ${m + 1}, cell ${c + 1}`,
                        v || 'empty',
                        decided === 'D' ? 'board drawn' : decided && `board won by ${decided}`,
                        !decided && targeted && 'play here',
                        i === lastMove && 'last move',
                      )}
                      className={cn(
                        'aspect-square rounded-[2px] flex items-center justify-center',
                        'font-pixel text-[10px] sm:text-sm select-none transition-colors',
                        v === 'X' && 'bg-retro-bg text-retro-p1 text-glow-p1',
                        v === 'O' && 'bg-retro-bg text-retro-p2 text-glow-p2',
                        !v && (playable ? 'bg-retro-bg hover:bg-retro-surface cursor-pointer' : 'bg-retro-bg/50 cursor-default'),
                        // M-47: persistent marker on the most recently placed mark
                        i === lastMove && 'ring-2 ring-inset ring-retro-cta/70',
                      )}
                    >
                      {v && <span style={{ animation: 'place-pop 0.2s ease-out', display: 'inline-block' }}>{v}</span>}
                    </button>
                  )
                })}
              </div>
              {decided && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-retro-bg/60 rounded-sm">
                  {decided === 'D' ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <div className="absolute inset-2 border-t-2 border-retro-dim rotate-12" aria-hidden="true" />
                      <span className="relative font-pixel text-[8px] sm:text-[8px] text-retro-dim tracking-wide bg-retro-bg/70 px-1 rounded-sm">
                        DRAW
                      </span>
                    </div>
                  ) : (
                    <span className={cn(
                      'font-pixel text-3xl sm:text-4xl',
                      decided === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2',
                    )}>
                      {decided}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
