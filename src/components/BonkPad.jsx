import { cn } from '@/lib/utils'

// One player's two big buttons under the BONK BUGGIES arena. `props` come from
// useBonkPads().buttonProps; `down` reads the live held state for styling.
// `hop` is the charge of the hop jet in 0..1 (null when the twist is off).
// Both buttons together fire the hop, so the pad says so in words.

const TONE = {
  p1: { ring: 'border-retro-p1 text-retro-p1', on: 'bg-retro-p1 text-retro-bg shadow-neon-p1', meter: 'bg-retro-p1' },
  p2: { ring: 'border-retro-p2 text-retro-p2', on: 'bg-retro-p2 text-retro-bg shadow-neon-p2', meter: 'bg-retro-p2' },
}

export default function BonkPad({ id, tone = 'p1', label, hop, buttonProps, isDown, compact = false, disabled = false }) {
  const t = TONE[tone]
  const btn = (side, glyph, name) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label ? `${label} ` : ''}${name}`}
      aria-pressed={isDown(id, side)}
      data-testid={`bonk-pad-${id}-${side}`}
      {...buttonProps(id, side)}
      className={cn(
        'flex-1 select-none touch-none rounded-lg border-2 font-pixel transition-colors duration-press',
        compact ? 'min-h-[72px] text-xl' : 'min-h-[88px] text-2xl',
        'disabled:opacity-40',
        isDown(id, side) ? t.on : `${t.ring} bg-retro-card`,
      )}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  )
  return (
    <div className="flex-1 min-w-0 space-y-1" data-testid={`bonk-pad-${id}`}>
      <div className="flex gap-2">
        {btn('l', '◀', 'LEFT')}
        {btn('r', '▶', 'RIGHT')}
      </div>
      {hop != null && (
        <div className="flex items-center gap-1.5">
          <span className="font-pixel text-[7px] text-retro-dim whitespace-nowrap">{hop >= 1 ? 'BOTH = HOP' : 'HOP…'}</span>
          <span className="flex-1 h-1.5 rounded bg-retro-border overflow-hidden" aria-hidden="true">
            <i className={cn('block h-full origin-left', t.meter, hop >= 1 ? 'opacity-100' : 'opacity-60')} style={{ transform: `scaleX(${hop})` }} />
          </span>
        </div>
      )}
    </div>
  )
}
