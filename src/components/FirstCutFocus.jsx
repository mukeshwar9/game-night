import FocusStage, { FocusButton } from './FocusStage'
import useFocusMode from '../hooks/useFocusMode'

// First Cut's focus mode (the shared full-screen stage, see FocusStage.jsx and
// Game.jsx): custom pages do not get it from the room shell, so each play
// surface (online room, one phone, bots) wraps its table in this frame. The
// FOCUS button sits above the table; a tap on it enters, inside the same tap,
// so the browser allows real fullscreen. Back, Esc and the X leave it.
//
// The table moves between the page and the stage (a portal), so it remounts on
// the way in and out; the game itself lives in the page's play hook and goes on.

export function FirstCutScoreChips({ seats }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {seats.map(s => (
        <div
          key={s.id}
          className="min-w-0 flex-1 flex items-center gap-1.5 px-2 py-1 rounded border border-retro-border"
          style={{ boxShadow: `inset 3px 0 0 rgb(var(--c-p${s.slot + 1}))` }}
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-retro-text">{s.name}</span>
          <span className="font-pixel text-[10px] text-retro-text tabular-nums">{s.score}</span>
        </div>
      ))}
    </div>
  )
}

export default function FirstCutFocus({ label = 'First Cut', hud, footer, children }) {
  const focus = useFocusMode()
  return (
    <>
      <div className="flex justify-end -mb-1">
        <FocusButton onClick={focus.enter} />
      </div>
      {focus.on
        ? <FocusStage label={label} onExit={focus.exit} hud={hud} footer={footer}>{children}</FocusStage>
        : children}
    </>
  )
}
