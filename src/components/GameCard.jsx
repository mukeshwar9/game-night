import { getPlayerTag, getGameConfig } from '../lib/games'
import { cn } from '@/lib/utils'
import PixelDots from './loading/PixelDots'

// One compact catalog row (~56px): icon left, name, then one meta line
// (players · duration, plus the blurb from sm up). Two columns on a phone
// keep the 60-game catalog to about half the old tile grid's scroll.
// Variant entries (`game.variantOf` set — e.g. ULTIMATE TTT surfaced
// directly via search) display their own label/blurb but fall back to the
// base game's icon since variants don't carry one.
// Tapping the row opens GameOptionsSheet on the Games page (see `handleTap`
// in GamePicker.jsx); in GameSwitcher's in-room picker it proposes the
// switch, and `onModes` (optional) adds a MODES button for games with
// variants so those stay reachable there. New games are surfaced by the
// catalog's NEW THIS MONTH rail, not a per-row tag.
export default function GameCard({ game, onTap, onModes, loadingType, disabled, isFav, onToggleFav }) {
  const { type, variantOf } = game
  const base = variantOf ? getGameConfig(variantOf) : null
  const label = variantOf ? (game.variantLabel || game.label) : game.label
  const desc = variantOf ? (game.variantBlurb || game.desc) : game.desc
  const Icon = variantOf ? (base?.Icon || game.Icon) : game.Icon
  const isBusy = disabled ?? !!loadingType
  const isLoading = loadingType === type
  const showModes = !!onModes && game.hasVariants

  return (
    <div className="relative">
      <button
        onClick={() => onTap(game)}
        disabled={isBusy}
        title={desc}
        className={cn(
          'w-full h-full min-h-14 flex items-center gap-2.5 pl-2.5 py-2 text-left border rounded',
          'transition-all active:scale-[0.98]',
          onToggleFav ? 'pr-7' : showModes ? 'pr-14' : 'pr-2.5',
          isLoading
            ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
            : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
          loadingType && !isLoading && 'opacity-40',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'w-8 h-8 shrink-0 rounded flex items-center justify-center',
            isLoading ? 'text-retro-cta' : 'text-retro-dim',
          )}
        >
          {Icon && <Icon />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-pixel text-[9px] text-retro-text leading-snug line-clamp-2">{label}</span>
          {isLoading ? (
            <span className="block mt-1"><PixelDots size="sm" tone="cta" /></span>
          ) : (
            <span className="block font-mono text-[10px] text-retro-dim mt-0.5 truncate">
              {' '}
              <span className={game.nPlayer ? 'text-retro-p2' : undefined}>{getPlayerTag(game)}</span>
              {game.durationMin != null && ` · ~${game.durationMin} min`}
              <span className="hidden sm:inline"> · {desc}</span>
            </span>
          )}
        </span>
      </button>
      {onToggleFav && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(type) }}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={!!isFav}
          className={cn(
            'absolute top-0 right-0 z-10 w-9 h-9 flex items-center justify-center rounded transition-colors',
            isFav ? 'text-retro-p2' : 'text-retro-dim hover:text-retro-text',
          )}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </button>
      )}
      {showModes && (
        <button
          onClick={(e) => { e.stopPropagation(); onModes(game) }}
          disabled={isBusy}
          aria-label={`More modes for ${label}`}
          className="absolute inset-y-0 right-0 z-10 w-12 flex items-center justify-center border-l border-retro-border
            font-pixel text-[8px] text-retro-dim hover:text-retro-cta transition-colors disabled:opacity-40"
        >
          MODES
        </button>
      )}
    </div>
  )
}
