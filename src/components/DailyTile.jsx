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
      className="flex-1 flex flex-col justify-center bg-retro-card border-2 border-retro-border rounded px-3 py-2.5
        hover:border-retro-cta/50 transition-colors active:scale-[0.98]"
    >
      <p className="font-pixel text-[9px] text-retro-dim tracking-wider">DAILY CHALLENGE</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <p className={cn(
          'font-pixel text-[9px]',
          played ? 'text-retro-win' : 'text-retro-cta animate-pulse',
        )}>
          {played ? `BEST: ${best.best}` : 'NOT PLAYED YET'}
        </p>
        {streak.count >= 2 && (
          <p className="font-pixel text-[9px] text-retro-cta">🔥{streak.count}</p>
        )}
      </div>
    </Link>
  )
}
