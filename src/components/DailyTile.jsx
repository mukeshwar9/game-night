import { useState } from 'react'
import { Link } from 'react-router-dom'
import { todayKey, readBest, getStreak } from '../lib/daily'

// Home's DAILY PUZZLE row: what it is and how long it takes, with one PLAY
// action — the old "DAILY / NOT PLAYED" tile read like a status, not an
// invitation. Once played today it shows the best score and streak instead.
export default function DailyTile() {
  const [best] = useState(() => readBest(todayKey()))
  const [streak] = useState(() => getStreak())

  const played = best != null
  const detail = played
    ? `Best today: ${best.best}${streak.count >= 2 ? ` · 🔥${streak.count}` : ''}`
    : `Mental math · 60s${streak.count >= 2 ? ` · 🔥${streak.count}` : ''}`

  return (
    <Link
      to="/daily"
      className="group w-full min-h-14 flex items-center gap-3 bg-retro-card border border-retro-border rounded px-3 py-2.5
        hover:border-retro-cta/50 transition-colors active:scale-[0.99]"
    >
      <span className="flex-1 min-w-0">
        <span className="block font-pixel text-[10px] text-retro-text tracking-wider">DAILY PUZZLE</span>
        <span className="block font-mono text-[11px] text-retro-dim mt-1 truncate">{detail}</span>
      </span>
      <span className="shrink-0 min-h-11 min-w-[76px] px-3 flex items-center justify-center border border-retro-cta text-retro-cta font-pixel text-[9px] tracking-wider rounded group-hover:bg-retro-tint-cta transition-colors">
        {played ? 'RETRY' : 'PLAY'}
      </span>
    </Link>
  )
}
