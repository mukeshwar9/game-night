import { useState } from 'react'
import { Link } from 'react-router-dom'
import { todayKey, readBest, getStreak } from '../lib/daily'
import { dailyMemoryGame, DAILY_MEMORY_UNITS } from '../lib/memoryDailyLogic'
import { readDailyAttempt } from '../lib/memoryProgress'
import { getGameConfig } from '../lib/games'

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
        hover:border-retro-cta/50 transition-colors press-card"
    >
      <span className="flex-1 min-w-0">
        <span className="block font-pixel text-[10px] text-retro-text tracking-wider">DAILY PUZZLE</span>
        <span className="block font-mono text-[11px] text-retro-dim mt-1 truncate">{detail}</span>
      </span>
      <span className="shrink-0 min-h-11 pl-2 flex items-center gap-1.5 text-retro-cta font-pixel text-[9px] tracking-wider group-hover:text-glow-cta transition-colors">
        {played ? 'RETRY' : 'PLAY'} <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}

// Home's DAILY MEMORY row: today's memory run (one try, same deal for everyone).
export function DailyMemoryTile() {
  const [date] = useState(() => todayKey())
  const [attempt] = useState(() => readDailyAttempt(date))
  const type = dailyMemoryGame(date)
  const label = getGameConfig(type)?.label ?? 'MEMORY'
  const played = attempt?.started
  const detail = played
    ? (attempt.score != null ? `Today: ${attempt.score} ${DAILY_MEMORY_UNITS[type].toLowerCase()} · see friends` : 'Today: played · see friends')
    : `${label.charAt(0)}${label.slice(1).toLowerCase()} · one try, same for everyone`

  return (
    <Link
      to="/daily/memory"
      className="group w-full min-h-14 flex items-center gap-3 bg-retro-card border border-retro-border rounded px-3 py-2.5
        hover:border-retro-cta/50 transition-colors press-card"
    >
      <span className="flex-1 min-w-0">
        <span className="block font-pixel text-[10px] text-retro-text tracking-wider">DAILY MEMORY</span>
        <span className="block font-mono text-[11px] text-retro-dim mt-1 truncate">{detail}</span>
      </span>
      <span className="shrink-0 min-h-11 pl-2 flex items-center gap-1.5 text-retro-cta font-pixel text-[9px] tracking-wider group-hover:text-glow-cta transition-colors">
        {played ? 'BOARD' : 'PLAY'} <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}
