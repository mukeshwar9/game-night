import { cn } from '@/lib/utils'
import FocusStage, { FocusButton } from './FocusStage'
import { SideKickArena, SideKickHud, SideKickPad } from './SideKickBoard'
import { ordinal } from '../hooks/useSideKickRun'

/**
 * The whole play surface: road, HUD chips, thumb pad, and the shared full-screen
 * mode (FocusStage, entered from a tap on the corner button). Used by the solo
 * page and the online racer, so both get the same layout and the same focus mode.
 *
 * `run` is useSideKickRun's result, `controls` is useSideKickControls', `focus`
 * is useFocusMode's. `cover` is drawn over the road (setup, results, waiting).
 * `status` is one line of text above the road (race x of 3, track name).
 */
export default function SideKickPlay({ run, controls, focus, avatars, enabled = true, cover = null, status = null, className }) {
  const play = (
    <div className="space-y-2">
      <SideKickArena rendererRef={run.rendererRef} avatars={avatars}>
        <SideKickHud hud={run.hud} toast={run.toast} ordinalOf={ordinal} />
        {cover}
      </SideKickArena>
      <SideKickPad bind={controls.bind} hud={run.hud} enabled={enabled} />
    </div>
  )
  if (focus.on) {
    return (
      <FocusStage
        label="SIDE KICK"
        onExit={focus.exit}
        hud={(
          <div className="flex items-center justify-between gap-2 font-pixel text-[9px] text-retro-dim">
            <span className="truncate">{status ?? 'SIDE KICK'}</span>
            {run.hud && <span className="shrink-0 tabular-nums text-retro-text">{ordinal(run.hud.place)} · {run.hud.time}</span>}
          </div>
        )}
      >
        {play}
      </FocusStage>
    )
  }
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="min-w-0 truncate font-pixel text-[9px] text-retro-dim tracking-wider">{status}</p>
        <FocusButton onClick={focus.enter} />
      </div>
      {play}
    </div>
  )
}
