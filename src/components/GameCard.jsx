import { getPlayerTag, getGameConfig, isNewGame } from '../lib/games'
import { cn } from '@/lib/utils'
import PixelDots from './loading/PixelDots'

// Renders one game tile. Variant entries (`game.variantOf` set — e.g.
// ULTIMATE TTT surfaced directly via search) display their own label/blurb
// but fall back to the base game's icon since variants don't carry one.
// Tapping the card opens GameOptionsSheet (PLAY ONLINE / VS AI / 2P PASS /
// MORE MODES / RULES) rather than creating a room directly — see
// `handleTap` in GamePicker.jsx. The ••• button (`onOptions`, optional) is a
// second way into the same sheet, used only by GameSwitcher's compact
// in-room picker where a tap instead proposes a game-type switch.
export default function GameCard({ game, onTap, onOptions, loadingType, disabled, isFav, onToggleFav }) {
  const { type, variantOf } = game
  const base = variantOf ? getGameConfig(variantOf) : null
  const label = variantOf ? (game.variantLabel || game.label) : game.label
  const desc = variantOf ? (game.variantBlurb || game.desc) : game.desc
  const Icon = variantOf ? (base?.Icon || game.Icon) : game.Icon
  const isNew = isNewGame(game)
  const isBusy = disabled ?? !!loadingType

  return (
    <div className="relative">
      <button
        onClick={() => onTap(game)}
        disabled={isBusy}
        className={cn(
          'w-full flex flex-col items-center gap-2 py-2.5 px-2 border-2 rounded',
          'transition-all active:scale-95',
          loadingType === type
            ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
            : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
          loadingType && loadingType !== type && 'opacity-40',
        )}
      >
        <div className={cn(
          'w-8 h-8 rounded flex items-center justify-center',
          loadingType === type ? 'text-retro-cta' : 'text-retro-dim',
        )}>
          {Icon && <Icon />}
        </div>
        <div className="text-center">
          {/* UX-03: pixel type carries character (titles, scores); supporting
              metadata and descriptions stay mono so player count, duration,
              and what a game actually is remain readable on phones. */}
          <p className="font-pixel text-[10px] text-retro-text leading-relaxed">{label}</p>
          {desc && (
            <p className="font-mono text-[11px] text-retro-dim mt-1 leading-tight line-clamp-2">{desc}</p>
          )}
          <p className="font-mono text-[12px] mt-1 flex items-center justify-center gap-1.5">
            <span className={game.nPlayer ? 'text-retro-p2' : 'text-retro-dim'}>{getPlayerTag(game)}</span>
            {game.durationMin != null && (
              <span className="text-retro-dim">~{game.durationMin} MIN</span>
            )}
          </p>
        </div>
        {loadingType === type && <PixelDots size="sm" tone="cta" />}
        {isNew && (
          <span className="absolute bottom-1 right-1 font-pixel text-[7px] text-retro-win tracking-wider">NEW</span>
        )}
      </button>
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
      {onOptions && (
        <button
          onClick={(e) => { e.stopPropagation(); onOptions(game) }}
          disabled={isBusy}
          aria-label={`Options for ${label}`}
          className="absolute top-1 right-1 z-10 p-3.5 -m-2.5 rounded text-retro-dim hover:text-retro-cta transition-colors disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      )}
    </div>
  )
}
