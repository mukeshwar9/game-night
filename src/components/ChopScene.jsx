import { cn } from '@/lib/utils'
import Avatar from './Avatar'
import { isReducedMotion } from '../hooks/useMotionPref'

// Chop Chop scene — rendering only. The page (or the solo run) owns the
// stats and calls chopLogic; this draws the stack, the beams, the player's
// own avatar with a mallet, the counters and the LEFT / RIGHT buttons.
//
// A beam is a striped bar sticking out of one side of a crate: its side is
// its position, never only its colour. The crate about to arrive at the
// bottom carries a "!" tag.

const CRATE_H = 38

function Crate({ alt, className, style }) {
  const plank = `rgb(var(--c-cta) / ${alt ? 0.38 : 0.5})`
  return (
    <div
      className={cn('absolute w-16 border-2 border-retro-text shadow-[inset_0_2px_0_rgb(255_255_255/0.5),inset_-2px_-2px_0_rgb(var(--c-text)/0.18)]', alt ? 'bg-retro-card' : 'bg-retro-tint-cta', className)}
      style={{
        height: CRATE_H,
        backgroundImage: `linear-gradient(${plank}, ${plank}), linear-gradient(${plank}, ${plank}), linear-gradient(to top right, transparent 46%, ${plank} 46% 54%, transparent 54%), linear-gradient(to top left, transparent 46%, ${plank} 46% 54%, transparent 54%)`,
        backgroundSize: '100% 5px, 100% 5px, 100% 100%, 100% 100%',
        backgroundPosition: '0 2px, 0 calc(100% - 2px), 0 0, 0 0',
        backgroundRepeat: 'no-repeat',
        ...style,
      }}
    />
  )
}

function Mallet({ side }) {
  return (
    <span
      className={cn('absolute top-3 block w-7 h-10 origin-bottom', side === 'L' ? '-right-3 rotate-[62deg]' : '-left-3 -rotate-[62deg]')}
      aria-hidden="true"
    >
      <span className="absolute inset-x-0 top-0 h-4 rounded-sm border-2 border-retro-text bg-retro-cta shadow-[inset_2px_2px_0_rgb(255_255_255/0.35)]" />
      <span className="absolute left-1/2 -translate-x-1/2 top-4 bottom-0 w-2 border-2 border-t-0 border-retro-text bg-retro-tint-cta" />
    </span>
  )
}

export default function ChopScene({
  rows,                 // visibleRows(): bottom first, [{ row, beam }]
  side,                 // 'L' | 'R': where the player stands
  chops, streak,
  stunned = false,
  avatar,
  lead = null,          // { text, ahead, avatar } against the best rival
  clock = null,         // { text, frac, low } when the scene owns the timer (solo)
  warn = { L: false, R: false },
  lastSide = null,      // the side of the last chop, for the crate that flies off
  onChop,
  disabled = false,
  hint = null,
}) {
  const fly = lastSide && chops > 0 && !isReducedMotion()
  const button = (s, label) => {
    const w = warn[s]
    return (
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); onChop?.(s) }}
        onKeyDown={(e) => { if (!e.repeat && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); onChop?.(s) } }}
        disabled={disabled || stunned}
        aria-label={`Chop from the ${s === 'L' ? 'left' : 'right'}${w ? ', beam on this side' : ''}`}
        className={cn(
          'min-h-16 rounded border-2 font-pixel text-xs press disabled:opacity-45 disabled:shadow-none select-none',
          w ? 'border-retro-danger text-retro-danger shadow-[0_4px_0_rgb(var(--c-danger)/0.5)]' : 'border-retro-cta text-retro-cta shadow-[0_4px_0_rgb(var(--c-cta)/0.55)]',
          side === s ? (w ? 'bg-retro-tint-danger' : 'bg-retro-tint-cta') : 'bg-retro-card',
        )}
        style={{ touchAction: 'manipulation' }}
      >
        {label}
        <span className={cn('block mt-1 text-[7px]', w ? 'text-retro-danger' : 'text-retro-dim')}>{w ? 'BEAM!' : ' '}</span>
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div
        className="relative h-[320px] overflow-hidden rounded-md border-2 border-retro-text shadow-[0_4px_0_rgb(var(--c-structure))] select-none"
        style={{ background: 'linear-gradient(rgb(var(--c-tint-p4)) 0 62%, rgb(var(--c-tint-p1)) 62%)', animation: stunned ? 'shake 0.3s ease-out both' : undefined }}
      >
        {/* Skyline */}
        <div className="absolute inset-x-0 bottom-6 h-36 pointer-events-none" aria-hidden="true">
          {[[0, 11, 60], [13, 9, 86], [24, 10, 44], [68, 9, 70], [79, 11, 100], [91, 9, 52]].map(([l, w, h]) => (
            <span key={l} className="absolute bottom-0 bg-retro-structure/55" style={{ left: `${l}%`, width: `${w}%`, height: `${h}%` }} />
          ))}
        </div>

        {clock && (
          <div className="absolute top-2 inset-x-2 flex items-center gap-1.5 z-10">
            <div className="flex-1 h-3 rounded-sm border-2 border-retro-text bg-retro-card overflow-hidden">
              <div className={cn('h-full origin-left', clock.low ? 'bg-retro-danger' : 'bg-retro-win')} style={{ transform: `scaleX(${clock.frac})` }} />
            </div>
            <span className={cn('rounded-sm border-2 border-retro-text bg-retro-card px-1 py-0.5 font-pixel text-[8px] tabular-nums', clock.low && 'text-retro-danger')}>{clock.text}</span>
          </div>
        )}

        <div className={cn('absolute inset-x-2.5 flex items-start justify-between z-10', clock ? 'top-8' : 'top-2.5')}>
          <div>
            <p className="font-pixel text-2xl leading-none tabular-nums [text-shadow:2px_2px_0_rgb(var(--c-card))]" aria-label={`${chops} crates`}>{chops}</p>
            <p className="mt-1 font-pixel text-[6px] text-retro-dim">CRATES</p>
            <p className={cn('mt-1.5 w-max rounded-sm border-2 px-1 py-0.5 font-pixel text-[7px]', streak > 2 ? '' : 'invisible', streak > 9 ? 'border-retro-text bg-retro-cta text-retro-card' : 'border-retro-cta bg-retro-tint-cta text-retro-cta')}>
              STREAK ×{streak}
            </p>
          </div>
          {lead && (
            <div className={cn('flex items-center gap-1.5 rounded border-2 py-0.5 pl-0.5 pr-1.5', lead.ahead ? 'border-retro-p1 bg-retro-tint-p1 text-retro-p1' : 'border-retro-p2 bg-retro-tint-p2 text-retro-p2')}>
              <Avatar id={lead.avatar} size={24} className="w-5 h-5 rounded-sm" />
              <span className="font-pixel leading-none">
                <span className="block text-[5px] text-retro-dim">{lead.label}</span>
                <span className="block mt-0.5 text-[7px]">{lead.text}</span>
              </span>
            </div>
          )}
        </div>

        {/* The stack. It is keyed by the count so each chop replays the landing. */}
        <div className="absolute left-1/2 bottom-6 w-16 -translate-x-1/2">
          <div key={chops} className="absolute inset-x-0 bottom-0" style={chops > 0 ? { animation: 'chop-drop 0.1s steps(3) both' } : undefined}>
            {rows.map((r, i) => (
              <div key={r.row} className="absolute inset-x-0" style={{ bottom: i * CRATE_H, height: CRATE_H }}>
                <Crate alt={r.row % 2 === 1} className="inset-x-0 bottom-0" />
                {r.beam && (
                  <span
                    className={cn(
                      'absolute top-2.5 h-4 w-14 border-2 border-retro-text shadow-[0_3px_0_rgb(var(--c-text)/0.18)]',
                      r.beam === 'L' ? 'right-full -mr-0.5 border-r-0 rounded-l-sm' : 'left-full -ml-0.5 border-l-0 rounded-r-sm',
                    )}
                    style={{ background: 'repeating-linear-gradient(45deg, rgb(var(--c-danger)) 0 7px, rgb(var(--c-card)) 7px 14px)' }}
                    aria-label={`Beam on the ${r.beam === 'L' ? 'left' : 'right'}, ${i === 0 ? 'at the bottom' : `${i} up`}`}
                    role="img"
                  >
                    {i < 2 && (
                      <span className={cn('absolute -top-5 rounded-sm border-2 border-retro-text bg-retro-danger px-1 font-pixel text-[8px] text-retro-card', r.beam === 'L' ? 'left-2' : 'right-2')} aria-hidden="true">!</span>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
          {fly && (
            <Crate
              key={`fly-${chops}`}
              alt={(chops - 1) % 2 === 1}
              className="inset-x-0 bottom-0 pointer-events-none"
              style={{ animation: `${lastSide === 'L' ? 'chop-fly-r' : 'chop-fly-l'} 0.32s steps(6) forwards` }}
            />
          )}
        </div>
        <span className="absolute left-1/2 bottom-4 h-2.5 w-24 -translate-x-1/2 rounded-full bg-retro-text/20" aria-hidden="true" />

        {/* The player's own avatar with a mallet */}
        <div className="absolute bottom-5 w-[72px]" style={{ left: side === 'L' ? 'calc(50% - 108px)' : 'calc(50% + 36px)' }}>
          <span className="absolute inset-x-3 -bottom-1 h-2 rounded-full bg-retro-text/25" aria-hidden="true" />
          <div className={cn('relative', side === 'R' && '-scale-x-100', stunned && '-rotate-[80deg] translate-y-2')}>
            <Avatar id={avatar} size={72} view="hero" tile={false} className="block w-[72px] h-auto" />
          </div>
          {!stunned && <Mallet side={side} />}
          {stunned && <span className="absolute inset-x-0 -top-3 text-center font-pixel text-[8px] text-retro-cta arcade-blink" aria-hidden="true">* * *</span>}
        </div>

        {stunned && (
          <p className="absolute inset-x-0 top-24 text-center font-pixel text-lg text-retro-danger [text-shadow:2px_2px_0_rgb(var(--c-card)),-2px_-2px_0_rgb(var(--c-card))]" role="status">BONK!</p>
        )}

        <div className="absolute inset-x-0 bottom-0 h-6 border-t-2 border-retro-text bg-retro-structure" aria-hidden="true" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {button('L', '◀ LEFT')}
        {button('R', 'RIGHT ▶')}
      </div>
      {hint && <p className="text-center font-pixel text-[8px] text-retro-dim" role="status">{hint}</p>}
    </div>
  )
}
