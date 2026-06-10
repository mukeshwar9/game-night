import { cn } from '@/lib/utils'

export default function PlayerCard({ name, symbol, isActive, isMe, score, online }) {
  const isX = symbol === 'X'

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-2.5 border-2 rounded transition-all duration-200',
      isActive
        ? isX
          ? 'border-retro-p1 bg-retro-tint-p1/60 shadow-neon-p1'
          : 'border-retro-p2 bg-retro-tint-p2/60 shadow-neon-p2'
        : 'border-retro-border bg-retro-card',
    )}>
      {/* Symbol badge with presence dot */}
      <div className="relative flex-shrink-0">
        <span className={cn(
          'font-pixel text-base w-9 h-9 flex items-center justify-center rounded',
          isX
            ? 'text-retro-p1 bg-retro-tint-p1 text-glow-p1'
            : 'text-retro-p2 bg-retro-tint-p2 text-glow-p2',
        )}>
          {symbol}
        </span>
        {online !== undefined && (
          <div className={cn(
            'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-retro-bg',
            online
              ? 'bg-retro-win shadow-glow-dot'
              : 'bg-retro-dim',
          )} />
        )}
      </div>

      <div className="text-left min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn(
            'font-mono text-sm truncate',
            isActive ? 'text-retro-text' : 'text-retro-dim',
          )}>
            {name || '···'}
          </p>
          {score > 0 && (
            <span className={cn(
              'font-pixel text-xs flex-shrink-0',
              isX ? 'text-retro-p1' : 'text-retro-p2',
            )}>
              {score}
            </span>
          )}
        </div>
        {isMe && <p className="text-[10px] text-retro-dim font-mono mt-0.5">YOU</p>}
      </div>

      {isActive && (
        <div className="flex gap-1 flex-shrink-0">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={cn(
                'w-1.5 h-1.5 rounded-full animate-bounce',
                isX ? 'bg-retro-p1' : 'bg-retro-p2',
              )}
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
