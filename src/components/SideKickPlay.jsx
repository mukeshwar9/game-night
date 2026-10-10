import { cn } from '@/lib/utils'
import { SideKickArena, SideKickHud, SideKickPad } from './SideKickBoard'
import { ordinal } from '../hooks/useSideKickRun'

/**
 * The whole play surface: road, HUD chips and thumb pad. Used by the solo page
 * and the online racer. Full-screen mode is the shared one: the registry's
 * `focusPage: true` makes Game.jsx (the room header button) and Demo.jsx
 * (FocusPlay on /solo) wrap the page in FocusFrame, which keeps this component
 * mounted while the stage goes full screen.
 *
 * `run` is useSideKickRun's result, `controls` is useSideKickControls'. `cover`
 * is drawn over the road (setup, results). `status` is one line of text above
 * the road (race x of 3, track name); `hideHud` clears the chips behind a setup sheet.
 */
export default function SideKickPlay({ run, controls, avatars, enabled = true, cover = null, status = null, hideHud = false, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="min-w-0 truncate pr-9 font-pixel text-[9px] text-retro-dim tracking-wider">{status}</p>
      <div className="space-y-2">
        <SideKickArena rendererRef={run.rendererRef} avatars={avatars}>
          {!hideHud && <SideKickHud hud={run.hud} toast={run.toast} ordinalOf={ordinal} />}
          {cover}
        </SideKickArena>
        <SideKickPad bind={controls.bind} hud={run.hud} enabled={enabled} />
      </div>
    </div>
  )
}
