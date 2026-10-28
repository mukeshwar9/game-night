import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '../hooks/useBusy'
import { useSideKickPrefs, useTilt } from '../hooks/useSideKickPrefs'
import { CAMERAS, CAMERA_LABEL } from '../lib/sideKickPrefs'

// A rider's own SIDE KICK settings: which camera and how to steer. Shown on the
// solo setup sheet and in the online lobby; the camera also has a switch on the
// HUD. Choices are saved on this device (lib/sideKickPrefs.js).
//
// Tilt steering is the default on a phone that has a tilt sensor. iOS only
// gives readings after a tap, so the sheet carries an ENABLE TILT button; if the
// sensor is missing or the player says no, steering falls back to the buttons.

const chip = (on) => cn(
  'press min-h-9 rounded border-2 px-2.5 py-1.5 font-pixel text-[8px] uppercase transition',
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

/** `dust` (DUST KICK) has the chase camera only for now: the horse's-eye view comes later. */
export default function SideKickPrefs({ className, dust = false }) {
  const [prefs, setPrefs] = useSideKickPrefs()
  const tilt = useTilt(true)

  const note = prefs.steer !== 'tilt' ? null
    : tilt.status === 'denied' ? 'TILT BLOCKED · STEERING WITH THE BUTTONS'
      : tilt.status === 'unsupported' ? 'NO TILT SENSOR FOUND · STEERING WITH THE BUTTONS'
        : tilt.status === 'live' ? 'TILT ON · HOLD THE PHONE HOW YOU LIKE, IT CENTRES AT THE COUNTDOWN'
          : null

  return (
    <div className={cn('space-y-2', className)} data-testid="sidekick-prefs">
      {!dust && (
        <div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Camera">
          <span className="w-full font-pixel text-[7px] text-retro-dim sm:w-auto">CAMERA</span>
          {CAMERAS.map((id) => (
            <button key={id} type="button" aria-pressed={prefs.cam === id} data-testid={`sidekick-pref-cam-${id}`} onClick={() => setPrefs({ cam: id })} className={chip(prefs.cam === id)}>
              {CAMERA_LABEL[id]}
            </button>
          ))}
        </div>
      )}
      {tilt.supported && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Steering">
            <span className="w-full font-pixel text-[7px] text-retro-dim sm:w-auto">STEERING</span>
            {[['tilt', 'TILT'], ['touch', 'BUTTONS']].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={prefs.steer === id} data-testid={`sidekick-pref-steer-${id}`} onClick={() => setPrefs({ steer: id })} className={chip(prefs.steer === id)}>{label}</button>
            ))}
          </div>
          <EnableTiltButton />
          {note && <p className="font-pixel text-[7px] leading-relaxed text-retro-dim" data-testid="sidekick-tilt-note">{note}</p>}
        </>
      )}
    </div>
  )
}
