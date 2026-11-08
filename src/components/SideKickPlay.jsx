import { cn } from '@/lib/utils'
import { SideKickArena, SideKickHud, SideKickPad } from './SideKickBoard'
import { ordinal } from '../hooks/useSideKickRun'
import { useSideKickPrefs } from '../hooks/useSideKickPrefs'
import { EnableTiltButton } from './SideKickPrefs'

/**
 * The whole play surface: the road with one HUD strip over its top and the two thumb zones over its bottom
 * (left thumb steers, right thumb has KICK and BOOST). Used by the solo page and the online racer. Full-screen
 * mode is the shared one: the registry's `focusPage: true` makes Game.jsx (the room header button) and Demo.jsx
 * (FocusPlay on /solo) wrap the page in FocusFrame, which keeps this component mounted while the stage goes
 * full screen.
 *
 * `dust` swaps the labels and the renderer for DUST KICK's Western kit (horses, SPURS, BUCK, LASSO).
 * `run` is useSideKickRun's result, `controls` is useSideKickControls'. `cover` is drawn over the road (setup,
 * results). `status` is one line of text above the road (race x of 3, track name); `hideHud` clears the HUD
 * and the thumb zones behind a setup or results sheet.
 */
export default function SideKickPlay({ run, controls, avatars, enabled = true, cover = null, status = null, hideHud = false, dust = false, className }) {
  const [prefs, setPrefs] = useSideKickPrefs()
  const toggleCamera = () => setPrefs({ cam: prefs.cam === 'first' ? 'chase' : 'first' })
  return (
    <div className={cn('space-y-2', className)}>
      <p className="min-w-0 truncate pr-9 font-pixel text-[9px] text-retro-dim tracking-wider">{status}</p>
      <SideKickArena rendererRef={run.rendererRef} avatars={avatars} dust={dust}>
        {!hideHud && <SideKickHud hud={run.hud} toast={run.toast} ordinalOf={ordinal} camera={prefs.cam} onCamera={dust ? null : toggleCamera} />}
        {!hideHud && <SideKickPad bind={controls.bind} hud={run.hud} enabled={enabled} tilt={controls.tilt} dust={dust} kickMode={prefs.kick} />}
        {!hideHud && <EnableTiltButton className="absolute left-2.5 top-[68px] z-10 !min-h-9 !px-3 !py-2 !text-[8px]" />}
        {cover}
      </SideKickArena>
    </div>
  )
}
