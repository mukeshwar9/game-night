import { getPlayerTag } from '../lib/games'
import { cn } from '@/lib/utils'
import { GameArt } from './GameArt'

// A horizontal rail at the top of the ALL view. Used for NEW THIS MONTH (games
// from getNewGames, so a batch launch is one rail instead of ~25 tags) and,
// with title/tone, for the hand-picked START HERE row.
export default function NewGamesRail({ games, onTap, loadingType, id = 'catalog-new', title = 'NEW THIS MONTH', tone = 'win' }) {
  if (games.length === 0) return null
  return (
    <section className="space-y-2" aria-labelledby={id}>
      <h2 id={id} className={cn('font-pixel text-[9px] tracking-widest', tone === 'cta' ? 'text-retro-cta' : 'text-retro-win')}>{title}</h2>
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
                  'glass glass-tx shrink-0 snap-start w-[118px] min-h-[92px] flex flex-col items-start gap-1.5 p-2.5 text-left border rounded transition press',
                  isLoading
                    ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
                    : tone === 'cta'
                      ? 'border-retro-cta/40 bg-retro-card hover:border-retro-cta'
                      : 'border-retro-win/50 bg-retro-card hover:border-retro-win',
                  loadingType && !isLoading && 'opacity-40',
                )}
              >
                <span className="relative w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center text-retro-dim" aria-hidden="true">
                  {Icon && <Icon />}
                  <GameArt type={g.variantOf || g.type} className="absolute inset-0 w-full h-full block" />
                </span>
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
