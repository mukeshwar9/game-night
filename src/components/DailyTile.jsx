import { useState } from 'react'
import { Link } from 'react-router-dom'
import { todayKey, readBest, getStreak } from '../lib/daily'
import { cn } from '@/lib/utils'

export default function DailyTile() {
  const [best] = useState(() => readBest(todayKey()))
  const [streak] = useState(() => getStreak())

  const played = best != null

  return (
    <Link
      to="/daily"
      className="flex-1 min-w-0 min-h-11 flex flex-col justify-center overflow-hidden bg-retro-card border-2 border-retro-border rounded px-3 py-3
        hover:border-retro-cta/50 transition-colors active:scale-[0.98]"
    >
      {/* Single-line, nowrap text only — the tile shares a row with the join
          input on a ~375px viewport (~140px of content width), and the pixel
          font wraps ugly: "NOT PLAYED YET" became three lines on phones. */}
      <p className="font-pixel text-[9px] text-retro-dim tracking-wider whitespace-nowrap">DAILY</p>
      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
        <p className={cn(
          'font-pixel text-[9px] whitespace-nowrap',
          played ? 'text-retro-win' : 'text-retro-cta arcade-blink',
        )}>
          {played ? `BEST: ${best.best}` : 'NOT PLAYED'}
        </p>
        {streak.count >= 2 && (
          <p className="font-pixel text-[9px] text-retro-cta whitespace-nowrap">🔥{streak.count}</p>
        )}
      </div>
    </Link>
  )
}
