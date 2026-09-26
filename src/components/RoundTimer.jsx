import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Shared countdown for timed word/party rounds: a bar plus m:ss, a low-time
// state that changes the label text (not just its colour), and screen-reader
// announcements only at 30/10/5 seconds so assistive tech is not spammed
// every tick.
const ANNOUNCE_AT = [30, 10, 5]

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function RoundTimer({ endsAt, now, totalMs, label = 'TIME LEFT', lowMs = 10_000, className }) {
  const left = endsAt ? Math.max(0, endsAt - now) : 0
  const secs = Math.ceil(left / 1000)
  const low = left > 0 && left <= lowMs
  const pct = totalMs ? Math.max(0, Math.min(100, (left / totalMs) * 100)) : 0

  const [announcement, setAnnouncement] = useState('')
  const lastAnnounced = useRef(null)
  useEffect(() => {
    const mark = ANNOUNCE_AT.find(t => secs === t)
    if (mark && lastAnnounced.current !== mark) {
      lastAnnounced.current = mark
      setAnnouncement(`${mark} seconds left`)
    }
    if (secs > ANNOUNCE_AT[0]) lastAnnounced.current = null
  }, [secs])

  if (!endsAt) return null
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className={low ? 'text-retro-danger' : 'text-retro-dim'}>{low ? 'HURRY!' : label}</span>
        <span className={cn('tabular-nums', low ? 'text-retro-danger arcade-blink' : 'text-retro-text')}>{formatClock(left)}</span>
      </div>
      <div className="h-1.5 w-full rounded bg-retro-structure/40 overflow-hidden" aria-hidden="true">
        <div
          className={cn('h-full transition-[width] duration-200 ease-linear', low ? 'bg-retro-danger' : 'bg-retro-cta')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    </div>
  )
}
