import { useState } from 'react'
import { getGameConfig } from '../lib/games'
import { getRooms, getStats } from '../lib/profile'
import { cn } from '@/lib/utils'

// F-45: a curated START HERE path for first-session visitors. At 40+ tiles,
// the ALL view can freeze a newcomer with choice overload; this rail offers
// a 4-step editorial on-ramp (TTT → Connect Four → Battleship → Sketch),
// rendered above the category picker on Home.
//
// Visibility: genuinely-first-session visitors only — no local rooms, no
// recorded stats — and it self-retires the moment either signal exists or
// the visitor dismisses it (persisted, like the other dismissible nudges).
const CURATED = ['tictactoe', 'connectfour', 'battleship', 'sketch']
const DISMISS_KEY = 'gn-start-here-dismissed'

function isEligible() {
  try {
    if (localStorage.getItem(DISMISS_KEY)) return false
    if (getRooms().length > 0) return false
    const byGame = getStats()?.byGame
    if (byGame && Object.keys(byGame).length > 0) return false
    return true
  } catch {
    return false
  }
}

function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* quota */ }
}

export default function StartHere({ onSelect, loadingType }) {
  const [dismissed, setDismissed] = useState(() => !isEligible())

  if (dismissed) return null

  const dismiss = () => { markDismissed(); setDismissed(true) }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between max-w-md mx-auto w-full">
        <label className="font-pixel text-[10px] text-retro-cta tracking-wider">START HERE</label>
        <button
          onClick={dismiss}
          aria-label="Dismiss START HERE"
          className="font-pixel text-[8px] text-retro-dim hover:text-retro-text transition-colors px-2 py-1 -m-1"
        >
          DISMISS ✕
        </button>
      </div>
      <div className="relative max-w-md mx-auto w-full">
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scroll-px-1">
          {CURATED.map((type, i) => {
            const cfg = getGameConfig(type)
            const Icon = cfg?.Icon
            const isLoading = loadingType === type
            return (
              <button
                key={type}
                onClick={() => onSelect(type)}
                disabled={!!loadingType}
                className={cn(
                  'shrink-0 snap-start flex items-center gap-1.5 px-3 py-2 border-2 rounded transition-all active:scale-95',
                  isLoading
                    ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
                    : 'border-retro-cta/40 bg-retro-card hover:border-retro-cta/70 hover:shadow-neon-cta',
                  loadingType && !isLoading && 'opacity-40',
                )}
              >
                <span className="font-pixel text-[8px] text-retro-dim">{i + 1}</span>
                <div className={cn('w-5 h-5 flex items-center justify-center', isLoading ? 'text-retro-cta' : 'text-retro-dim')}>
                  {Icon && <Icon />}
                </div>
                <span className="font-pixel text-[9px] text-retro-text whitespace-nowrap">{cfg?.label}</span>
              </button>
            )
          })}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-retro-bg to-transparent" aria-hidden="true" />
      </div>
    </div>
  )
}
