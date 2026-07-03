import { cn } from '@/lib/utils'

// Ultimate Tic-Tac-Toe board: a 3×3 grid of nine 3×3 miniboards.
// `winningLine` holds META miniboard indices (0..8) once the game is won.
// `uWon` is per-miniboard outcome ('' | 'X' | 'O' | 'D'); `uActiveBoard` is the
// board the current player must play in (-1 = any).
export default function UltimateTttBoard({
  board, onMove, disabled, winningLine = [], currentTurn,
  uWon = [], uActiveBoard = -1,
}) {
  const activeRing = currentTurn === 'O' ? 'border-retro-p2 shadow-neon-p2' : 'border-retro-p1 shadow-neon-p1'
  const isBoardActive = (m) => !disabled && !uWon[m] && (uActiveBoard === -1 || uActiveBoard === m)

  return (
    <div className="w-full max-w-[360px] sm:max-w-[420px] mx-auto">
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-retro-border/40 p-1.5 sm:p-2 rounded">
        {Array.from({ length: 9 }, (_, m) => {
          const decided = uWon[m]
          const active = isBoardActive(m)
          const metaWin = winningLine.includes(m)
          return (
            <div
              key={m}
              className={cn(
                'relative rounded-sm p-1 border-2 transition-all',
                metaWin
                  ? 'border-retro-win shadow-neon-win bg-retro-win/10'
                  : active
                    ? cn('bg-retro-card', activeRing)
                    : 'border-retro-border bg-retro-surface',
              )}
            >
              <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
                {Array.from({ length: 9 }, (_, c) => {
                  const i = m * 9 + c
                  const v = board[i]
                  const playable = active && !v
                  return (
                    <button
                      key={c}
                      onClick={() => playable && onMove(i)}
                      disabled={!playable}
                      aria-label={`Board ${m + 1}, cell ${c + 1}, ${v || 'empty'}`}
                      className={cn(
                        'aspect-square rounded-[2px] flex items-center justify-center',
                        'font-pixel text-[10px] sm:text-sm select-none transition-colors',
                        v === 'X' && 'bg-retro-bg text-retro-p1 text-glow-p1',
                        v === 'O' && 'bg-retro-bg text-retro-p2 text-glow-p2',
                        !v && (playable ? 'bg-retro-bg hover:bg-retro-surface cursor-pointer' : 'bg-retro-bg/50 cursor-default'),
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
                    <span className="font-pixel text-lg text-retro-dim">—</span>
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
