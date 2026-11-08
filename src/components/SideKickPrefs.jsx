import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '../hooks/useBusy'
import { useSideKickPrefs, useTilt } from '../hooks/useSideKickPrefs'
import { CAMERAS, CAMERA_LABEL, KICK_MODES, KICK_LABEL } from '../lib/sideKickPrefs'

// A rider's own SIDE KICK settings: which camera, how to steer and how to kick. Shown on the
// solo setup sheet and in the online lobby; the camera also has a switch on the
// HUD. Choices are saved on this device (lib/sideKickPrefs.js).
//
// Tilt steering is the default on a phone that has a tilt sensor. iOS only
// gives readings after a tap, so the TILT chip is that tap; if the sensor is
// missing or the player says no, steering falls back to the buttons. KICK is one
// self-aiming button by default; the other choice is the old KICK L / KICK R pair.

const chip = (on) => cn(
  'press min-h-9 rounded border-2 px-2 py-1.5 font-pixel text-[8px] uppercase transition disabled:opacity-60',
  on ? 'border-retro-cta text-retro-cta shadow-neon-cta' : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
)

/** iOS only gives tilt readings after a tap: this is that tap. Renders nothing when it is not needed. */
export function EnableTiltButton({ className }) {
  const [prefs, setPrefs] = useSideKickPrefs()
  const tilt = useTilt(true)
  const [busy, run] = useBusy()
  if (!tilt.supported || prefs.steer !== 'tilt' || tilt.status !== 'prompt') return null
  const enable = () => run(async () => {
    const ok = await tilt.request()
    if (ok) setPrefs({ steer: 'tilt' })
    else toast.error('TILT BLOCKED — STEERING WITH THE BUTTONS')
  })
  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      data-testid="sidekick-enable-tilt"
      className={cn('press min-h-11 rounded bg-retro-cta px-4 py-2.5 font-pixel text-[9px] text-retro-bg disabled:opacity-60', className)}
    >
      {busy ? 'ASKING…' : 'ENABLE TILT STEERING'}
    </button>
  )
}

export function PrefRow({ label, children, ariaLabel }) {
  return (
    <div className="flex items-start gap-2" role="group" aria-label={ariaLabel ?? label}>
      <span className="w-[62px] shrink-0 pt-3 text-left font-pixel text-[8px] leading-none text-retro-dim">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

/**
 * `dust` (DUST KICK) has the chase camera only for now: the horse's-eye view comes later.
 * Tilt is asked once, here: with tilt chosen on a phone that still needs a tap (iOS), the TILT chip is
 * the permission ask. The in-play ENABLE TILT strip only shows if it was skipped.
 */
export default function SideKickPrefs({ className, dust = false }) {
  const [prefs, setPrefs] = useSideKickPrefs()
  const tilt = useTilt(true)
  const [busy, run] = useBusy()
  const needsTap = tilt.supported && tilt.status === 'prompt'

  const chooseTilt = () => {
    setPrefs({ steer: 'tilt' })
    if (!needsTap) return
    run(async () => {
      const ok = await tilt.request()
      if (!ok) toast.error('TILT BLOCKED — STEERING WITH THE BUTTONS')
    })
  }

  const note = prefs.steer !== 'tilt' ? null
    : tilt.status === 'denied' ? 'TILT BLOCKED · STEERING WITH THE BUTTONS'
      : tilt.status === 'unsupported' ? 'NO TILT SENSOR FOUND · STEERING WITH THE BUTTONS'
        : tilt.status === 'live' ? 'TILT ON · IT CENTRES AT THE COUNTDOWN'
          : null

  return (
    <div className={cn('space-y-1.5', className)} data-testid="sidekick-prefs">
      {!dust && (
        <PrefRow label="CAMERA">
          {CAMERAS.map((id) => (
            <button key={id} type="button" aria-pressed={prefs.cam === id} data-testid={`sidekick-pref-cam-${id}`} onClick={() => setPrefs({ cam: id })} className={chip(prefs.cam === id)}>
              {CAMERA_LABEL[id]}
            </button>
          ))}
        </PrefRow>
      )}
      {tilt.supported && (
        <PrefRow label="STEER">
          <button type="button" aria-pressed={prefs.steer === 'tilt'} data-testid="sidekick-pref-steer-tilt" disabled={busy} onClick={chooseTilt} className={chip(prefs.steer === 'tilt')}>
            {busy ? 'ASKING…' : prefs.steer === 'tilt' && needsTap ? 'TILT · TAP TO ALLOW' : 'TILT'}
          </button>
          <button type="button" aria-pressed={prefs.steer === 'touch'} data-testid="sidekick-pref-steer-touch" onClick={() => setPrefs({ steer: 'touch' })} className={chip(prefs.steer === 'touch')}>BUTTONS</button>
        </PrefRow>
      )}
      <PrefRow label={dust ? 'BUCK' : 'KICK'} ariaLabel={dust ? 'Buck buttons' : 'Kick buttons'}>
        {KICK_MODES.map((id) => (
          <button key={id} type="button" aria-pressed={prefs.kick === id} data-testid={`sidekick-pref-kick-${id}`} onClick={() => setPrefs({ kick: id })} className={chip(prefs.kick === id)}>
            {id === 'two' ? (dust ? 'BUCK L / R' : KICK_LABEL.two) : KICK_LABEL.auto}
          </button>
        ))}
      </PrefRow>
      {note && <p className="text-left font-pixel text-[8px] leading-relaxed text-retro-dim" data-testid="sidekick-tilt-note">{note}</p>}
    </div>
  )
}
