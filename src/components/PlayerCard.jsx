import { cn } from '@/lib/utils'
import Avatar from './Avatar'
import PixelDots from './loading/PixelDots'

export default function PlayerCard({ name, symbol, isActive, isMe, score, online, avatar }) {
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
      {/* Avatar (or symbol fallback) with role chip + presence dot */}
      <div className="relative flex-shrink-0">
        {avatar ? (
          <Avatar id={avatar} size={36} />
        ) : (
          <span className={cn(
            'font-pixel text-base w-9 h-9 flex items-center justify-center rounded',
            isX
              ? 'text-retro-p1 bg-retro-tint-p1 text-glow-p1'
              : 'text-retro-p2 bg-retro-tint-p2 text-glow-p2',
          )}>
            {symbol}
          </span>
        )}
        {avatar && (
          <span className={cn(
            'absolute -bottom-1 -left-1 w-4 h-4 rounded-sm flex items-center justify-center font-pixel text-[8px] border border-retro-bg',
            isX ? 'bg-retro-p1 text-retro-bg' : 'bg-retro-p2 text-retro-bg',
          )}>
            {symbol}
          </span>
        )}
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
        <PixelDots size="md" tone={isX ? 'p1' : 'p2'} className="flex-shrink-0" />
      )}
    </div>
  )
}
