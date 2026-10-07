import { Link } from 'react-router-dom'
import { getGameConfig } from '../lib/games'
import { HEADLINE_GAMES } from '../lib/adLanding'
import { GameArt } from './GameArt'
import { cn } from '@/lib/utils'

// A short, curated set of games for someone who has not played yet (Home for a
// first-time visitor, and the solo page an ad lands on) in place of the full
// catalogue. Every tile opens the game against the CPU: no name, no waiting
// for an opponent. `current` marks the game already on screen.
export default function HeadlineGames({ heading = 'START WITH ONE OF THESE', current = null, className }) {
  return (
    <section className={cn('space-y-2', className)} aria-label="Quick games">
      <h2 className="font-pixel text-[10px] text-retro-dim tracking-wider">{heading}</h2>
      <ul className="grid grid-cols-2 gap-2">
        {HEADLINE_GAMES.map(({ type, pitch }) => {
          const cfg = getGameConfig(type)
          const Icon = cfg?.Icon
          const isCurrent = type === current
          return (
            <li key={type}>
              <Link
                to={`/solo/${type}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'glass glass-tx h-full min-h-[104px] flex flex-col items-start gap-1.5 p-2.5 border rounded transition press',
                  isCurrent
                    ? 'border-retro-cta bg-retro-tint-cta'
                    : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
                )}
              >
                <span className="relative w-7 h-7 shrink-0 rounded overflow-hidden flex items-center justify-center text-retro-dim" aria-hidden="true">
                  {Icon && <Icon />}
                  <GameArt type={type} className="absolute inset-0 w-full h-full block" />
                </span>
                <span className="font-pixel text-[10px] text-retro-text leading-snug">{cfg?.label}</span>
                <span className="font-mono text-[11px] leading-tight text-retro-dim">{pitch}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
