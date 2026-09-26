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

  return (
    <div className="w-full bg-retro-card border border-retro-border rounded p-3 space-y-2 text-center" data-testid="timer-scale">
      <p className="font-pixel text-[9px] text-retro-dim tracking-wider">
        TIMERS · <span className="text-retro-cta">{busy ? 'SAVING…' : currentLabel}</span>
      </p>
      <div className="flex justify-center gap-2 flex-wrap" role="radiogroup" aria-label="Timer speed">
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            role="radio"
            aria-checked={current === opt.value}
            disabled={!canEdit || busy}
            onClick={() => pick(opt.value)}
            className={cn(
              'min-h-11 px-3 font-pixel text-[9px] rounded border-2 transition-all active:scale-95',
              current === opt.value
                ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
                : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
              (!canEdit || busy) && 'opacity-60 cursor-not-allowed',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {!canEdit && (
        <p className="font-pixel text-[7px] text-retro-dim/70">HOST PICKS THE TIMERS</p>
      )}
    </div>
  )
}
