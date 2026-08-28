import { cn } from '@/lib/utils'
import { supportsLocalPlay } from '../lib/games'
import BottomSheet from './BottomSheet'

// ••• sheet for a catalog card — replaces the old floating VS AI / 2P PASS /
// +MODES chip row (M-88), and (per the Home → play funnel fix) is now what a
// main card tap opens too, instead of silently creating a live Firebase room.
// Styled on the (dead, now-removed) ModeChooser. `onSolo`/`onLocal` absent
// (GameSwitcher's in-room picker) hides those two rows entirely; `onPlayOnline`
// absent (same in-room picker — tapping there proposes a game-type switch,
// not a new room) hides the PLAY ONLINE row too, leaving MORE MODES + RULES.

// Module scope, not defined inside GameOptionsSheet — a component defined
// per-render remounts on every parent render, losing focus/animation state.
function Row({ onClick, label, blurb, tone = 'text', primary, busy, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full min-h-11 text-left p-3 rounded border-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100',
        primary
          ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
          : 'border-retro-border bg-retro-card hover:border-retro-cta/60 hover:shadow-neon-cta',
      )}
    >
      <span className={cn(
        'font-pixel text-[11px]',
        tone === 'cta' ? 'text-retro-cta text-glow-cta' : tone === 'p1' ? 'text-retro-p1' : tone === 'p2' ? 'text-retro-p2' : 'text-retro-text',
      )}>{busy ? 'CREATING…' : label}</span>
      {blurb && <p className="font-mono text-[11px] text-retro-dim mt-1 leading-snug">{blurb}</p>}
    </button>
  )
}

export default function GameOptionsSheet({ game, onPlayOnline, onSolo, onLocal, onModes, onRules, onClose, loadingType }) {
  const Icon = game.Icon
  const isBusy = loadingType === game.type
  const showPlayOnline = !!onPlayOnline
  const showVsAi = !!(onSolo && game.solo)
  const showLocal = !!(onLocal && supportsLocalPlay(game.type))
  const showModes = !!(onModes && game.hasVariants)

  return (
    <BottomSheet onClose={onClose} ariaLabel={`${game.label} — options`} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 text-retro-cta flex items-center justify-center">{Icon && <Icon />}</span>
          <p className="font-pixel text-[10px] text-retro-text tracking-widest">{game.label}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors p-3 -m-2"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        {showPlayOnline && (
          <Row
            onClick={() => onPlayOnline(game)}
            label="PLAY ONLINE"
            tone="cta"
            primary
            busy={isBusy}
            disabled={isBusy}
            blurb="Create a room and share the link."
          />
        )}
        {showVsAi && <Row onClick={() => onSolo(game)} label="VS AI" tone="p1" disabled={isBusy} blurb="Play instantly, no opponent needed." />}
        {showLocal && <Row onClick={() => onLocal(game)} label="2P PASS" tone="p2" disabled={isBusy} blurb="Hot-seat — pass the device between turns." />}
        {showModes && <Row onClick={() => onModes(game)} label="MORE MODES" tone="cta" disabled={isBusy} blurb="See every variant for this game." />}
        <Row onClick={() => onRules(game.type)} label="RULES" disabled={isBusy} blurb="How to play." />
      </div>
    </BottomSheet>
  )
}
