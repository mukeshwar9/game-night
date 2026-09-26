import { getPlayerTag } from '../lib/games'
import { cn } from '@/lib/utils'

// The catalog's single NEW signal: one horizontal rail at the top of the ALL
// view (games from getNewGames), replacing a NEW tag on every recent card —
// after a batch launch that was ~25 cards and meant nothing.
export default function NewGamesRail({ games, onTap, loadingType }) {
  if (games.length === 0) return null
  return (
    <section className="space-y-2" aria-labelledby="catalog-new">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="catalog-new" className="font-pixel text-[9px] text-retro-win tracking-widest">NEW THIS MONTH</h2>
        <span className="font-mono text-[11px] text-retro-dim">{games.length} {games.length === 1 ? 'game' : 'games'}</span>
      </div>
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 snap-x snap-proximity scroll-px-1">
          {games.map(g => {
            const Icon = g.Icon
            const isLoading = loadingType === g.type
            return (
              <button
                key={g.type}
                onClick={() => onTap(g)}
                disabled={!!loadingType}
                title={g.desc}
                className={cn(
                  'shrink-0 snap-start w-[118px] min-h-[92px] flex flex-col items-start gap-1.5 p-2.5 text-left border rounded transition-all active:scale-95',
                  isLoading
                    ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
                    : 'border-retro-win/50 bg-retro-card hover:border-retro-win',
                  loadingType && !isLoading && 'opacity-40',
                )}
              >
                <span className="w-6 h-6 flex items-center justify-center text-retro-dim" aria-hidden="true">{Icon && <Icon />}</span>
                <span className="font-pixel text-[9px] text-retro-text leading-snug line-clamp-2">{g.label}</span>
                <span className="font-mono text-[10px] text-retro-dim mt-auto">
                  {' '}{getPlayerTag(g)}{g.durationMin != null && ` · ~${g.durationMin} min`}
                </span>
              </button>
            )
          })}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-retro-bg to-transparent" aria-hidden="true" />
      </div>
    </section>
  )
}
