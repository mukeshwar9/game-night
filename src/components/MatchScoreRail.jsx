import { cn } from '@/lib/utils'

// Shared match header for two-player word games: both names, match score,
// first-to-N pips and the round label, so every word game states the same
// facts in the same place (Word Race's rail, generalised). Pages that render
// this set `hidePlayerCards` in the registry so the score is not shown twice.
//
// `presence` ({ X: bool, O: bool }) adds an OFFLINE label; `matchTarget`
// null/0 hides the pips (endless or team modes); `centerTitle` defaults to
// the round label.
export default function MatchScoreRail({
  game, mySymbol, isSpectator = false, matchTarget = 3, roundLabel, title, presence,
}) {
  const scores = game?.scores || { X: 0, O: 0 }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded border border-retro-border bg-retro-card px-3 py-2">
      {['X', 'O'].map((symbol, index) => {
        const isMe = symbol === mySymbol
        const color = symbol === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const score = scores[symbol] || 0
        const offline = presence && presence[symbol] === false
        return (
          <div key={symbol} className={cn('min-w-0', index === 0 ? 'col-start-1' : 'col-start-3', index === 1 && 'text-right')}>
            <p className={cn('font-pixel text-[9px] tracking-widest truncate', color)}>
              {isSpectator || !mySymbol ? symbol : isMe ? 'YOU' : 'OPPONENT'}
              {offline && <span className="text-retro-danger"> · OFFLINE</span>}
            </p>
            <div className={cn('flex items-center gap-2', index === 1 && 'justify-end')}>
              <span className="font-mono text-xs text-retro-dim truncate">{game?.players?.[symbol]?.name || symbol}</span>
              <span className={cn('font-pixel text-lg tabular-nums', color)}>{score}</span>
            </div>
            {matchTarget > 0 && (
              <div
                className={cn('flex gap-1 mt-1', index === 1 && 'justify-end')}
                role="img"
                aria-label={`${score} of ${matchTarget} rounds won`}
              >
                {Array.from({ length: matchTarget }, (_, i) => (
                  <span
                    key={i}
                    className={cn('h-1.5 w-4 rounded-sm', i < score
                      ? (symbol === 'X' ? 'bg-retro-p1' : 'bg-retro-p2')
                      : 'bg-retro-deep border border-retro-border')}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
      <div className="col-start-2 row-start-1 text-center">
        {title && <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">{title}</p>}
        {roundLabel && <p className="font-pixel text-[8px] text-retro-dim mt-1">{roundLabel}</p>}
        {matchTarget > 0 && <p className="font-pixel text-[8px] text-retro-dim mt-1">FIRST TO {matchTarget}</p>}
      </div>
    </div>
  )
}
