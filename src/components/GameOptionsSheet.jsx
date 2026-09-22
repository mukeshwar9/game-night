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
//
// R-05 rework (ux-research-2026-09): the old six equal-weight rows read as a
// wall of glowing buttons — MORE MODES and RULES carried the same neon
// emphasis as the real primary action. The sheet is a fork-in-the-road, so it
// now presents as three intent groups with ONE primary CTA:
//   1. PLAY WITH A FRIEND  (primary, CTA glow) — the marquee social path
//   2. RIGHT NOW           (public matchmaking / VS AI / same-device)
//   3. a quiet utility footer (MORE MODES · RULES) in one row, chip-styled
// Labels are verb phrases ("play", "practice") instead of mode jargon, and
// the header carries game meta (players · duration) so rows don't repeat it.

// Module scope, not defined inside GameOptionsSheet — a component defined
// per-render remounts at every parent render, losing focus/animation state.
function Row({ onClick, label, blurb, tone = 'text', primary, busy, disabled, badge }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group w-full min-h-14 text-left p-3 rounded border-2 transition-all active:scale-[0.98]',
        'flex items-center gap-3 disabled:opacity-60 disabled:active:scale-100',
        primary
          ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta hover:shadow-none'
          : 'border-retro-border bg-retro-card hover:border-retro-cta/60 hover:shadow-neon-cta',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'shrink-0 w-8 h-8 rounded border flex items-center justify-center font-pixel text-[9px] transition-colors',
          primary ? 'border-retro-cta/60 text-retro-cta' : 'border-retro-border text-retro-dim group-hover:border-retro-cta/40 group-hover:text-retro-cta',
        )}
      >
        {badge}
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn(
          'font-pixel text-[11px] block',
          tone === 'cta' ? 'text-retro-cta text-glow-cta' : tone === 'p1' ? 'text-retro-p1' : tone === 'p2' ? 'text-retro-p2' : 'text-retro-text',
        )}>{busy ? 'CREATING…' : label}</span>
        {blurb && <span className="font-mono text-[11px] text-retro-dim mt-0.5 leading-snug block">{blurb}</span>}
      </span>
      <span aria-hidden="true" className="shrink-0 font-pixel text-[10px] text-retro-border group-hover:text-retro-cta transition-colors">›</span>
    </button>
  )
}

function GroupCaption({ children }) {
  return (
    <p className="font-pixel text-[8px] text-retro-dim tracking-[0.2em] pt-1">{children}</p>
  )
}

export default function GameOptionsSheet({ game, onInvite, onPublic, onSolo, onLocal, onModes, onRules, onClose, loadingType }) {
  const Icon = game.Icon
  const isBusy = loadingType === game.type
  const showInvite = !!onInvite
  const showPublic = !!onPublic
  const showVsAi = !!(onSolo && game.solo)
  const showLocal = !!(onLocal && supportsLocalPlay(game.type))
  const showModes = !!(onModes && game.hasVariants)
  const playerTag = game.nPlayer ? `${game.minPlayers}-${game.maxPlayers}P` : '2P'
  const anyPlayRow = showInvite || showPublic || showVsAi || showLocal
  const group2Rows = [showPublic, showVsAi, showLocal].filter(Boolean).length

  return (
    <BottomSheet onClose={onClose} ariaLabel={`${game.label} — how do you want to play?`} className="space-y-3">
      {/* Header: icon + name + meta — game identity lives here once instead
          of being repeated across rows. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded border-2 border-retro-cta/50 bg-retro-tint-cta text-retro-cta flex items-center justify-center shrink-0">
            {Icon && <Icon />}
          </span>
          <div className="min-w-0">
            <p className="font-pixel text-[11px] text-retro-text tracking-widest truncate">{game.label}</p>
            <p className="font-mono text-[10px] text-retro-dim mt-0.5 truncate">
              {playerTag} · ~{game.durationMin ?? '?'} MIN · {game.desc}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 min-w-11 min-h-11 flex items-center justify-center -m-2 font-pixel text-[11px] text-retro-dim hover:text-retro-text transition-colors"
        >
          ✕
        </button>
      </div>

      {anyPlayRow ? (
        <>
          {showInvite && (
            <>
              <GroupCaption>PLAY WITH A FRIEND</GroupCaption>
              <Row
                onClick={() => onInvite(game)}
                label="INVITE FRIEND"
                tone="cta"
                primary
                badge="+"
                busy={isBusy}
                disabled={isBusy}
                blurb="Create a private room and share the invite link."
              />
            </>
          )}

          {group2Rows > 0 && (
            <>
              <GroupCaption>RIGHT NOW</GroupCaption>
              <div className="space-y-2">
                {showPublic && (
                  <Row
                    onClick={() => onPublic(game)}
                    label="PLAY PUBLIC"
                    tone="p1"
                    badge="◍"
                    disabled={isBusy}
                    blurb="Get matched with a waiting opponent."
                  />
                )}
                {showVsAi && (
                  <Row
                    onClick={() => onSolo(game)}
                    label="PRACTICE VS AI"
                    tone="p1"
                    badge="AI"
                    disabled={isBusy}
                    blurb="Play instantly against the computer."
                  />
                )}
                {showLocal && (
                  <Row
                    onClick={() => onLocal(game)}
                    label="SAME DEVICE"
                    tone="p2"
                    badge="2P"
                    disabled={isBusy}
                    blurb="Hot-seat — pass the device between turns."
                  />
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <GroupCaption>CHOOSE A MODE</GroupCaption>
      )}

      {/* Utility footer — one quiet row instead of two glowing cards.
          HOW TO PLAY is always offered (no gating condition). */}
        <div className="flex gap-2 pt-1">
          {showModes && (
            <button
              onClick={() => onModes(game)}
              disabled={isBusy}
              className="flex-1 min-h-11 px-2 rounded border border-retro-border bg-transparent text-retro-dim
                font-pixel text-[9px] tracking-wider hover:text-retro-cta hover:border-retro-cta/50 transition-all active:scale-95
                disabled:opacity-60"
            >
              MORE MODES
            </button>
          )}
          <button
            onClick={() => onRules(game.type)}
            disabled={isBusy}
            className={cn(
              'min-h-11 px-2 rounded border border-retro-border bg-transparent text-retro-dim font-pixel text-[9px]',
              'tracking-wider hover:text-retro-cta hover:border-retro-cta/50 transition-all active:scale-95 disabled:opacity-60',
              !showModes && 'flex-1',
            )}
          >
            HOW TO PLAY
          </button>
        </div>
    </BottomSheet>
  )
}
