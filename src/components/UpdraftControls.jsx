import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { tiltSupported } from '../hooks/useUpdraftControls'
import { cn } from '@/lib/utils'

// The thumb band under the UPDRAFT arena (part of the drag area, so a thumb
// down here steers without covering the platforms) plus the opt-in TILT
// toggle on phones that have a gyro.
export function ThumbBand({ tilt, setTilt }) {
  const [busy, run] = useBusy()
  const canTilt = tiltSupported()
  const toggle = () => run(
    () => setTilt(!tilt),
    () => toast.error('TILT NEEDS MOTION ACCESS — DRAG TO STEER'),
  )
  return (
    <div className="flex items-stretch gap-2 h-16">
      <div className="flex-1 flex items-center justify-center rounded border-2 border-dashed border-retro-border text-retro-dim font-pixel text-[8px] tracking-widest">
        ◀ DRAG TO STEER ▶
      </div>
      {canTilt && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={tilt}
          className={cn(
            'w-20 rounded border-2 font-pixel text-[8px] leading-relaxed disabled:opacity-50',
            tilt ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim',
          )}
        >
          {busy ? 'ASKING…' : <>TILT<br />{tilt ? 'ON' : 'OFF'}</>}
        </button>
      )}
    </div>
  )
}
