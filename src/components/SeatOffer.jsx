import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'

// "YOU'RE UP NEXT" — shown to a spectator of a 2P room when a seat frees up
// while the room is in its lobby. One tap claims it (a transaction, so two
// watchers racing for the same seat can't both get it).
export default function SeatOffer({ onTakeSeat }) {
  const [busy, run] = useBusy()
  const take = () => run(async () => {
    const ok = await onTakeSeat()
    if (!ok) toast("SOMEONE ELSE GOT THE SEAT — YOU'RE STILL WATCHING")
  }, () => toast.error("COULDN'T TAKE THE SEAT — CHECK CONNECTION"))
  return (
    <div className="border-2 border-retro-cta/60 bg-retro-card rounded p-3 text-center space-y-2">
      <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-wider">YOU&apos;RE UP NEXT</p>
      <p className="font-mono text-[11px] text-retro-dim">A seat just opened in this room.</p>
      <button
        onClick={take}
        disabled={busy}
        className="min-h-11 px-4 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
      >
        {busy ? 'TAKING…' : 'TAKE THE SEAT'}
      </button>
    </div>
  )
}
