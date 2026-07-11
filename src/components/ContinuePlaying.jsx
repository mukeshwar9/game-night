import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchContinueRooms } from '../lib/continueRooms'
import { getGameConfig } from '../lib/games'
import Avatar from './Avatar'
import Skeleton from './loading/Skeleton'
import { cn } from '@/lib/utils'

const TONE_CLASSES = {
  action: 'text-retro-cta text-glow-cta arcade-blink',
  win: 'text-retro-win text-glow-win',
  dim: 'text-retro-dim',
}

export default function ContinuePlaying() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchContinueRooms().then(list => { if (!cancelled) setRooms(list) })
    return () => { cancelled = true }
  }, [])

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
        {rooms.map(r => {
          const cfg = getGameConfig(r.gameType)
          const Icon = cfg?.Icon
          return (
            <button
              key={r.id}
              onClick={() => navigate(`/game/${r.id}`)}
              className="w-full flex items-center gap-2.5 bg-retro-card border border-retro-border rounded px-3 py-2.5 hover:border-retro-p1/50 transition-colors active:scale-[0.99]"
            >
              <div className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-retro-dim">
                {Icon && <Icon />}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {r.opponent ? (
                  <Avatar id={r.opponent.avatar} size={22} />
                ) : null}
                <div className="min-w-0 text-left">
                  <p className="font-mono text-[11px] text-retro-text truncate">
                    {r.opponent
                      ? `${r.opponent.name}${r.opponent.extra ? ` +${r.opponent.extra}` : ''}`
                      : 'WAITING…'}
                  </p>
                  <p className="font-mono text-[9px] text-retro-dim">{r.id}</p>
                </div>
              </div>
              <span className={cn('font-pixel text-[8px] text-right shrink-0', TONE_CLASSES[r.chip.tone] || TONE_CLASSES.dim)}>
                {r.chip.text}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
