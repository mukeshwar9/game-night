import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchContinueRooms, dismissContinueRoom } from '../lib/continueRooms'
import { getGameConfig } from '../lib/games'
import useBusy from '../hooks/useBusy'
import Avatar from './Avatar'
import Skeleton from './loading/Skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TONE_CLASSES = {
  action: 'text-retro-cta text-glow-cta arcade-blink',
  win: 'text-retro-win text-glow-win',
  dim: 'text-retro-dim',
}

// One Continue Playing row. Split out from the parent so the dismiss button's
// busy state (useBusy) is scoped per-row instead of one shared flag blocking
// every other row's button while a dismiss is in flight.
function ContinueRow({ room: r, onDismissed }) {
  const navigate = useNavigate()
  const [busy, runBusy] = useBusy()
  const cfg = getGameConfig(r.gameType)
  const Icon = cfg?.Icon
  const isDismissable = r.status === 'waiting' && !r.opponent

  const dismiss = () => runBusy(
    async () => { await dismissContinueRoom(r); onDismissed(r.id) },
    () => toast.error('COULD NOT REMOVE ROOM. TRY AGAIN.'),
  )

  return (
    <div className="w-full flex items-center gap-1 bg-retro-card border border-retro-border rounded pl-3 pr-1 py-2.5 hover:border-retro-p1/50 transition-colors">
      <button
        onClick={() => navigate(`/game/${r.id}`)}
        disabled={busy}
        className="flex-1 min-w-0 flex items-center gap-2.5 disabled:opacity-50 active:scale-[0.99] transition-transform"
      >
        <div className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-retro-dim">
          {Icon && <Icon />}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {r.opponent ? (
            <Avatar id={r.opponent.avatar} size={22} />
          ) : null}
          <div className="min-w-0 text-left">
            <p className="font-pixel text-[9px] text-retro-text tracking-wide truncate">{cfg?.label}</p>
            <p className="font-mono text-[10px] text-retro-dim truncate">
              {r.opponent
                ? `${r.opponent.name}${r.opponent.extra ? ` +${r.opponent.extra}` : ''}`
                : r.id}
            </p>
          </div>
        </div>
        <span className={cn('font-pixel text-[8px] text-right shrink-0', TONE_CLASSES[r.chip.tone] || TONE_CLASSES.dim)}>
          {r.chip.text}
        </span>
      </button>
      {isDismissable && (
        <button
          onClick={dismiss}
          disabled={busy}
          aria-label={busy ? 'Removing room' : 'Remove room'}
          className="min-h-11 min-w-11 shrink-0 flex items-center justify-center text-retro-dim hover:text-retro-p2 font-pixel text-[9px] rounded transition-colors disabled:opacity-40"
        >
          {busy ? '…' : '✕'}
        </button>
      )}
    </div>
  )
}

export default function ContinuePlaying() {
  const [rooms, setRooms] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchContinueRooms().then(list => { if (!cancelled) setRooms(list) })
    return () => { cancelled = true }
  }, [])

  const handleDismissed = (id) => setRooms(list => list.filter(r => r.id !== id))

  if (rooms === null) {
    return (
      <div className="space-y-1.5">
        <label className="font-pixel text-[10px] text-retro-dim tracking-wider">CONTINUE PLAYING</label>
        <div className="space-y-1.5">
          {[0, 1].map(i => (
            <div key={i} className="w-full flex items-center gap-2.5 bg-retro-card border border-retro-border rounded px-3 py-2.5">
              <Skeleton pulse className="w-8 h-8 shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton pulse className="h-2.5 w-24" />
                <Skeleton pulse className="h-2 w-14" />
              </div>
              <Skeleton pulse className="h-2 w-8 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (rooms.length === 0) return null

  return (
    <div className="space-y-1.5">
      <label className="font-pixel text-[10px] text-retro-dim tracking-wider">CONTINUE PLAYING</label>
      <div className="space-y-1.5">
        {rooms.map(r => (
          <ContinueRow key={r.id} room={r} onDismissed={handleDismissed} />
        ))}
      </div>
    </div>
  )
}
