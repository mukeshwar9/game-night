import { getPlayerTag, getGameConfig, isNewGame } from '../lib/games'
import { cn } from '@/lib/utils'
import { RulesButton } from './RulesModal'
import PixelDots from './loading/PixelDots'

// Renders one game tile. Variant entries (`game.variantOf` set — e.g.
// ULTIMATE TTT surfaced directly via search) display their own label/blurb
// but fall back to the base game's icon since variants don't carry one.
// Tapping the card creates a PLAY-A-FRIEND room directly with the
// default/Classic variant (one-tap room creation) — VS AI and variant
// picks are demoted to small secondary chips below the card so the common
// path isn't gated behind a modal (`onVsAi`/`onModes`, both optional).
export default function GameCard({ game, onTap, onRules, onVsAi, onModes, loadingType, disabled, isFav, onToggleFav }) {
  const { type, variantOf } = game
  const base = variantOf ? getGameConfig(variantOf) : null
  const label = variantOf ? (game.variantLabel || game.label) : game.label
  const desc = variantOf ? (game.variantBlurb || game.desc) : game.desc
  const Icon = variantOf ? (base?.Icon || game.Icon) : game.Icon
  const hasVariants = !!game.hasVariants
  const isNew = isNewGame(game)
  const isBusy = disabled ?? !!loadingType
  const showVsAi = !!(onVsAi && game.solo)
  const showModes = !!(onModes && hasVariants)

  return (
    <div className="relative">
      <button
        onClick={() => onTap(game)}
        disabled={isBusy}
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
        {loadingType === type && <PixelDots size="sm" tone="cta" />}
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
            'absolute top-1 left-1 z-10 p-4 -m-3 rounded transition-colors',
            isFav ? 'text-retro-p2' : 'text-retro-dim hover:text-retro-text',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </button>
      )}
      {(showVsAi || showModes) && (
        <div className="flex items-center justify-center gap-1">
          {showVsAi && (
            <button
              onClick={(e) => { e.stopPropagation(); onVsAi(game) }}
              disabled={isBusy}
              aria-label={`Play ${label} vs AI`}
              className="min-h-11 px-2.5 flex items-center justify-center font-pixel text-[7px]
                text-retro-p1/90 hover:text-retro-p1 tracking-wider transition-colors disabled:opacity-40"
            >
              VS AI
            </button>
          )}
          {showModes && (
            <button
              onClick={(e) => { e.stopPropagation(); onModes(game) }}
              disabled={isBusy}
              aria-label={`More modes for ${label}`}
              className="min-h-11 px-2.5 flex items-center justify-center font-pixel text-[7px]
                text-retro-cta/80 hover:text-retro-cta tracking-wider transition-colors disabled:opacity-40"
            >
              +MODES
            </button>
          )}
        </div>
      )}
    </div>
  )
}
