import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { setTimerScale } from '../lib/night'
import { normalizeTimerScale, TIMER_SCALE_DEFAULT, TIMER_SCALE_RELAXED, TIMER_SCALE_OFF } from '../lib/timerScale'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: TIMER_SCALE_DEFAULT, label: 'NORMAL' },
  { value: TIMER_SCALE_RELAXED, label: 'RELAXED ×2' },
  { value: TIMER_SCALE_OFF, label: 'OFF' },
]

// Lobby timer scale (report 4.2 "Timer scale"): the host picks NORMAL,
// RELAXED (every timed phase twice as long) or OFF; everyone else sees the
// current setting. Stored as `game.timerScale` (1/2/0) — a room preference
// that survives game switches and new matches.
export default function TimerScalePicker({ gameId, game, canEdit }) {
  const current = normalizeTimerScale(game?.timerScale)
  const [busy, run] = useBusy()
  const currentLabel = OPTIONS.find(o => o.value === current)?.label || `×${current}`

  const pick = (value) => {
    if (!canEdit || value === current) return
    run(() => setTimerScale(gameId, value), () => toast.error("COULDN'T SET TIMERS — TRY AGAIN"))
  }

  // One flat row, not a card: it's a room preference, not the screen's job.
  return (
    <div className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-2" data-testid="timer-scale">
      <p className="font-pixel text-[9px] text-retro-dim tracking-wider">
        TIMERS · <span className="text-retro-cta">{busy ? 'SAVING…' : currentLabel}</span>
        {!canEdit && <span className="text-retro-dim/70"> · HOST PICKS</span>}
      </p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Timer speed">
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            role="radio"
            aria-checked={current === opt.value}
            disabled={!canEdit || busy}
            onClick={() => pick(opt.value)}
            className={cn(
              'min-h-11 px-2.5 font-pixel text-[8px] rounded border transition active:scale-95',
              current === opt.value
                ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-cta/40',
              (!canEdit || busy) && 'opacity-60 cursor-not-allowed',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
