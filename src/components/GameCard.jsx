import { getPlayerTag, getGameConfig, isNewGame } from '../lib/games'
import { cn } from '@/lib/utils'
import { RulesButton } from './RulesModal'

// Renders one game tile. Variant entries (`game.variantOf` set — e.g.
// ULTIMATE TTT surfaced directly via search) display their own label/blurb
// but fall back to the base game's icon since variants don't carry one.
export default function GameCard({ game, onTap, onRules, loadingType, disabled, isFav, onToggleFav }) {
  const { type, variantOf } = game
  const base = variantOf ? getGameConfig(variantOf) : null
  const label = variantOf ? (game.variantLabel || game.label) : game.label
  const desc = variantOf ? (game.variantBlurb || game.desc) : game.desc
  const Icon = variantOf ? (base?.Icon || game.Icon) : game.Icon
  const hasVariants = !!game.hasVariants
  const isNew = isNewGame(game)

  return (
    <div className="relative">
      <button
        onClick={() => onTap(game)}
        disabled={disabled ?? !!loadingType}
        className={cn(
          'w-full flex flex-col items-center gap-2.5 py-4 px-2 border-2 rounded',
          'transition-all active:scale-95',
          loadingType === type
            ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
            : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
          loadingType && loadingType !== type && 'opacity-40',
        )}
      >
        <div className={cn(
          'w-10 h-10 rounded flex items-center justify-center',
          loadingType === type ? 'text-retro-cta' : 'text-retro-dim',
        )}>
          {Icon && <Icon />}
        </div>
        <div className="text-center">
          <p className="font-pixel text-[10px] text-retro-text leading-relaxed">{label}</p>
          <p className="font-mono text-[10px] text-retro-dim mt-0.5">{desc}</p>
          <p className="font-pixel text-[7px] mt-1 flex items-center justify-center gap-1.5">
            <span className={game.nPlayer ? 'text-retro-p2' : 'text-retro-dim'}>{getPlayerTag(game)}</span>
            {game.durationMin != null && (
              <span className="text-[6px] text-retro-dim">~{game.durationMin} MIN</span>
            )}
          </p>
        </div>
        {loadingType === type && (
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1 h-1 bg-retro-cta rounded-full animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}
        {hasVariants && (
          <span className="absolute bottom-1 left-1 font-pixel text-[6px] text-retro-cta/80 tracking-wider">+MODES</span>
        )}
        {isNew && (
          <span className="absolute bottom-1 right-1 font-pixel text-[6px] text-retro-win tracking-wider">NEW</span>
        )}
      </button>
      <RulesButton
        onClick={(e) => { e.stopPropagation(); onRules(type) }}
        className="absolute top-1 right-1 z-10 hover:text-retro-cta"
      />
      {onToggleFav && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(type) }}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={!!isFav}
          className={cn(
            'absolute top-1 left-1 z-10 p-3 -m-2 rounded transition-colors',
            isFav ? 'text-retro-p2' : 'text-retro-dim hover:text-retro-text',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </button>
      )}
    </div>
  )
}
