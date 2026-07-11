import { useMemo } from 'react'
import { getRooms, getStats } from '../lib/profile'
import { getGameConfig, GAME_TYPES } from '../lib/games'
import { cn } from '@/lib/utils'

function recentGameTypes() {
  const known = new Set(GAME_TYPES.map(t => t.type))
  const seen = new Set()
  const types = []

  for (const r of getRooms()) {
    if (r.gameType && known.has(r.gameType) && !seen.has(r.gameType)) {
      seen.add(r.gameType)
      types.push(r.gameType)
    }
  }
  for (const type of Object.keys(getStats()?.byGame ?? {})) {
    if (known.has(type) && !seen.has(type)) {
      seen.add(type)
      types.push(type)
    }
  }
  return types.slice(0, 6)
}

export default function RecentlyPlayed({ onSelect, loadingType }) {
  const types = useMemo(() => recentGameTypes(), [])

  if (types.length === 0) return null

  return (
    <div className="space-y-1.5">
      <label className="font-pixel text-[10px] text-retro-dim tracking-wider">RECENTLY PLAYED</label>
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scroll-px-1">
          {types.map(type => {
            const cfg = getGameConfig(type)
            const Icon = cfg?.Icon
            const isLoading = loadingType === type
            return (
              <button
                key={type}
                onClick={() => onSelect(type)}
                disabled={!!loadingType}
                className={cn(
                  'shrink-0 snap-start flex items-center gap-1.5 px-3 py-2 border rounded transition-all active:scale-95',
                  isLoading
                    ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
                    : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
                  loadingType && !isLoading && 'opacity-40',
                )}
              >
                <div className={cn('w-5 h-5 flex items-center justify-center', isLoading ? 'text-retro-cta' : 'text-retro-dim')}>
                  {Icon && <Icon />}
                </div>
                <span className="font-pixel text-[9px] text-retro-text whitespace-nowrap">{cfg?.label}</span>
              </button>
            )
          })}
        </div>
        {/* Right-edge fade — hints there's more to scroll to without a hard cut */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-retro-bg to-transparent" aria-hidden="true" />
      </div>
    </div>
  )
}
