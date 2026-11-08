import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

// SKETCH mid-match JOIN bar, under the stage (sketchJoinLogic.joinBarState):
//   open    a watcher may take a seat as a guesser (an explicit tap, so a
//           laptop on the TV is never seated by accident)
//   full    the room is at its cap
//   locked  the host locked the room
//   waiting seated, not in this round yet (`note` from waitingNote)
export default function SketchJoinBar({ state, onJoin, note }) {
  const [joining, runJoin] = useBusy()
  if (!state) return null

  if (state === 'full' || state === 'locked') {
    return (
      <p className="rounded border border-retro-border bg-retro-card px-3 py-2 text-center font-pixel text-[9px] tracking-widest text-retro-dim" data-testid="sketch-join" data-state={state}>
        {state === 'full' ? 'ROOM FULL — WATCHING' : 'ROOM LOCKED — WATCHING ONLY'}
      </p>
    )
  }

  if (state === 'waiting') {
    return (
      <div role="status" className="space-y-0.5 rounded border border-retro-win/50 bg-retro-card px-3 py-2 text-left" data-testid="sketch-join" data-state={state}>
        <p className="font-pixel text-[9px] leading-relaxed tracking-wider text-retro-win">{note?.title}</p>
        <p className="font-mono text-[10px] text-retro-dim">{note?.body}</p>
      </div>
    )
  }

  const join = () => runJoin(
    async () => { if (!(await onJoin?.())) throw new Error('join refused') },
    () => toast.error("COULDN'T JOIN — TRY AGAIN"),
  )
  return (
    <div className="flex items-center gap-3 rounded border border-retro-p1/50 bg-retro-card px-3 py-2" data-testid="sketch-join" data-state={state}>
      <div className="min-w-0 flex-1 space-y-0.5 text-left">
        <p className="font-pixel text-[9px] tracking-widest text-retro-p1">MATCH IN PROGRESS</p>
        <p className="font-mono text-[10px] leading-snug text-retro-dim">Join as a guesser — you start next round with 0 points.</p>
      </div>
      <button
        type="button"
        onClick={join}
        disabled={joining}
        className="min-h-11 min-w-[5.5rem] shrink-0 rounded bg-retro-cta px-4 py-2 font-pixel text-[10px] text-retro-bg transition press hover:shadow-neon-cta disabled:opacity-50"
      >
        {joining ? 'JOINING…' : 'JOIN'}
      </button>
    </div>
  )
}
