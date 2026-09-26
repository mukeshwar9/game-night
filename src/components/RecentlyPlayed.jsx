import { useState } from 'react'
import { getRooms, getStats } from '../lib/profile'
import { getGameConfig, GAME_TYPES } from '../lib/games'
import { buildRecentPlays, getRecentPlays, formatAgo, modeLabel } from '../lib/recentPlays'
import { cn } from '@/lib/utils'

function readRecent() {
  return buildRecentPlays({
    plays: getRecentPlays(),
    rooms: getRooms(),
    statsTypes: Object.keys(getStats()?.byGame ?? {}),
    known: new Set(GAME_TYPES.map(t => t.type)),
  })
}

// Home's JUMP BACK IN rail: the last games this browser played, each tagged
// with how (vs CPU / same device / online) and when. `onSelect(type, mode)`
// lets Home resume a solo or pass-and-play game directly. Renders nothing
// until something has been played.
export default function RecentlyPlayed({ onSelect, loadingType }) {
  const [recent] = useState(readRecent)
  const [now] = useState(() => Date.now())

  if (recent.length === 0) return null

  return (
    <div className="space-y-1.5">
      <h2 className="font-pixel text-[10px] text-retro-dim tracking-wider">JUMP BACK IN</h2>
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 snap-x snap-mandatory scroll-px-1">
          {recent.map(({ type, mode, ts }) => {
            const cfg = getGameConfig(type)
            const Icon = cfg?.Icon
            const isLoading = loadingType === type
            const ago = formatAgo(ts, now)
            return (
              <button
                key={type}
                onClick={() => onSelect(type, mode)}
                disabled={!!loadingType}
                className={cn(
                  'shrink-0 snap-start w-[calc((100%-1rem)/3)] min-w-[104px] min-h-[88px] flex flex-col items-start gap-1.5 p-2.5 text-left border rounded transition-all active:scale-95',
                  isLoading
                    ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
                    : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
                  loadingType && !isLoading && 'opacity-40',
                )}
              >
                <span className={cn('w-6 h-6 flex items-center justify-center', isLoading ? 'text-retro-cta' : 'text-retro-dim')} aria-hidden="true">
                  {Icon && <Icon />}
                </span>
                <span className="font-pixel text-[9px] text-retro-text leading-snug line-clamp-2">{cfg?.label}</span>
                <span className="font-mono text-[10px] leading-tight text-retro-dim max-w-full mt-auto">
                  <span className="block truncate">{modeLabel(mode)}</span>
                  {ago && <span className="block truncate">{ago}</span>}
                </span>
              </button>
            )
          })}
        </div>
        {recent.length > 3 && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-retro-bg to-transparent" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
