import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { tiltSupported } from '../hooks/useUpdraftControls'
import { HOPPER_W, WORLD_W } from '../lib/updraftLogic'
import { FocusIcon } from './FocusStage'
import { cn } from '@/lib/utils'

// UPDRAFT's controls chrome, drawn over the arena (which is the drag area, so a
// thumb anywhere steers). A thin rail along the bottom edge shows where the
// hopper is; the top strip holds the readouts, the opt-in TILT toggle on phones
// that have a gyro, and the way out of the full-height stage.

const GLASS = 'pointer-events-auto rounded border border-retro-border bg-retro-deep/70 backdrop-blur-sm'

/** The thumb rail under the arena's bottom edge: a track and a knob at the hopper's x. */
export function ThumbRail({ x = (WORLD_W - HOPPER_W) / 2 }) {
  const frac = Math.min(1, Math.max(0, (x + HOPPER_W / 2) / WORLD_W))
  return (
    <div className="relative h-24 bg-gradient-to-t from-retro-text/15 to-transparent" aria-hidden="true">
      <span className="absolute left-6 right-6 bottom-10 h-1 rounded-sm bg-retro-text/25" />
      <span
        className="absolute bottom-[30px] w-6 h-6 rounded-full border-[3px] border-retro-text/50 bg-retro-card"
        style={{ left: `calc(24px + (100% - 48px) * ${frac} - 12px)` }}
      />
    </div>
  )
}

/** TILT ON/OFF, only where the phone has a gyro. */
export function TiltButton({ tilt, setTilt }) {
  const [busy, run] = useBusy()
  if (!tiltSupported()) return null
  const toggle = () => run(
    () => setTilt(!tilt),
    () => toast.error('TILT NEEDS MOTION ACCESS — DRAG TO STEER'),
  )
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={tilt}
      className={cn(
        GLASS, 'min-w-11 min-h-11 px-1 font-pixel text-[10px] leading-tight disabled:opacity-50 press',
        tilt ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'text-retro-dim',
      )}
    >
      {busy ? '…' : <>TILT<br />{tilt ? 'ON' : 'OFF'}</>}
    </button>
  )
}

/** The way out of the full-height stage (back to the room or page around it). */
export function LeaveStageButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Leave full height"
      title="Leave full height"
      className={cn(GLASS, 'min-w-11 min-h-11 inline-flex items-center justify-center text-retro-dim hover:text-retro-text press')}
    >
      <FocusIcon exit />
    </button>
  )
}

/** The top strip: readouts on the left, controls on the right, an optional second row (`sub`) under them. */
export function UpdraftHud({ children, sub, tilt, setTilt, onLeave }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">{children}</div>
        <div className="flex shrink-0 items-center gap-2">
          {setTilt && <TiltButton tilt={tilt} setTilt={setTilt} />}
          {onLeave && <LeaveStageButton onClick={onLeave} />}
        </div>
      </div>
      {sub && <div className="flex flex-wrap items-center gap-2">{sub}</div>}
    </div>
  )
}

/** A readout pill for the top strip. */
export function HudPill({ children, className, ...rest }) {
  return <span className={cn(GLASS, 'px-2 py-1.5 whitespace-nowrap tabular-nums', className)} {...rest}>{children}</span>
}
