import {
  PARTY_TIERS, PARTY_ROUND_CHOICES, PARTY_ROUND_MS, SABOTAGE_STREAK, normalizePartyConfig, partyZoneSize,
} from '../lib/arrowsPartyLogic'
import { ARROWS_DIFFICULTY_INFO } from '../lib/arrowsLogic'
import { cn } from '@/lib/utils'

// Host-only setup for an ARROWS PARTY room, shown in the lobby and between
// rounds (RaceShell's `Config`): the difficulty and the length of the cup.
// Both are picked before the game starts and freeze once the cup is under way
// (RaceShell's `configLocked`), so every round of a cup is the same game.
const TIER_BLURB = {
  easy: 'STRAIGHT ARROWS',
  medium: '+ DIAGONALS',
  hard: '+ DIAGONALS AND HOOKS',
}

export default function ArrowsPartySettings({ config, disabled = false, busy = false, onChange }) {
  const value = normalizePartyConfig(config)
  const blocked = disabled || busy
  const option = (selected) => cn(
    'min-h-11 flex-1 rounded border-2 px-2 py-1.5 font-pixel transition press',
    selected
      ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
      : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
    blocked && 'cursor-not-allowed opacity-60',
  )
  const patch = (changes) => onChange?.(changes)
  const [zc, zr] = partyZoneSize(2, value.tier)
  return (
    <section className="bg-retro-card border border-retro-border rounded p-3 space-y-3" aria-label="Arrows Party setup">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-pixel text-[9px] text-retro-text">PARTY SETUP</h3>
        <span className="font-pixel text-[8px] text-retro-dim">
          {busy ? 'SAVING…' : disabled ? 'HOST PICKS · LOCKED FOR THE CUP' : 'HOST ONLY · LOCKS AT START'}
        </span>
      </div>

      <fieldset disabled={blocked} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim mb-1">DIFFICULTY</legend>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Arrows Party difficulty">
          {PARTY_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              aria-pressed={value.tier === tier}
              onClick={() => patch({ tier })}
              className={option(value.tier === tier)}
            >
              <span className="block text-[10px]">{ARROWS_DIFFICULTY_INFO[tier].label}</span>
              <span className="block mt-1 text-[7px] leading-snug opacity-80">{TIER_BLURB[tier]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={blocked} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim mb-1">ROUNDS IN THE CUP</legend>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Rounds in the cup">
          {PARTY_ROUND_CHOICES.map((rounds) => (
            <button
              key={rounds}
              type="button"
              aria-pressed={value.rounds === rounds}
              onClick={() => patch({ rounds })}
              className={option(value.rounds === rounds)}
            >
              <span className="block text-[12px] tabular-nums">{rounds}</span>
              <span className="block mt-1 text-[7px] leading-snug opacity-80">ROUNDS</span>
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        disabled={blocked}
        aria-pressed={value.sabotage}
        onClick={() => patch({ sabotage: !value.sabotage })}
        className={cn(
          'w-full min-h-11 rounded border-2 px-3 py-1.5 text-left font-pixel transition press',
          value.sabotage
            ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
            : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
          blocked && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="block text-[9px]">SABOTAGE · {value.sabotage ? 'ON' : 'OFF'}</span>
        <span className="block mt-1 text-[7px] leading-snug opacity-80">
          {SABOTAGE_STREAK} CLEARS IN A ROW DROP A CRATE ON THE LEADER · IT NEVER TRAPS THEM
        </span>
      </button>

      <p className="font-pixel text-[7px] leading-relaxed text-retro-dim">
        {zc}×{zr} ZONE FOR TWO · SMALLER WITH MORE RACERS · {Math.round(PARTY_ROUND_MS[value.tier] / 1000)} S A ROUND
      </p>
    </section>
  )
}
