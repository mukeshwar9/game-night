import { cn } from '@/lib/utils'

// UPDRAFT's pixel icons: 8×8 paths drawn in the current text colour, so they
// stay inside the pixel style (the font's latin subset has no ◆ ⚑ ⚷ ♥ ⚠ » glyphs)
// and follow the theme through a text-retro-* class.
const PATHS = {
  gem: 'M2 0h4v1h1v2h1v2h-1v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-1v-2h1v-2h1z',
  feather: 'M5 0h3v3h-1v1h-1v1h-1v1h-2v1h-2v-1h1v-2h1v-1h1v-1h1z',
  boost: 'M3 0h2v1h1v1h1v1h-2v-1h-2v1h-2v-1h1v-1h1zM3 4h2v1h1v1h1v1h-2v-1h-2v1h-2v-1h1v-1h1z',
  warn: 'M3 0h2v2h1v2h1v2h1v2h-8v-2h1v-2h1v-2h1zM3.5 2.5v2.5h1v-2.5zM3.5 6v1h1v-1z',
  flag: 'M1 0h1v8h-1zM2 0h5v1h-1v1h1v1h-5z',
  lock: 'M2 1h4v1h1v2h-1v-2h-4v2h-1v-2h1zM1 4h6v4h-6zM3.5 5v2h1v-2z',
  key: 'M1 1h3v1h1v1h3v1h-1v1h-1v-1h-1v1h-1v1h-3v-1h-1v-3h1zM2 3v1h1v-1z',
  heart: 'M1 1h2v1h2v-1h2v1h1v2h-1v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-1v-2h1z',
  wind: 'M0 2h5v-1h1v1h1v1h-7zM0 5h6v1h1v1h-1v-1h-6z',
  arrow: 'M5 1h1v6h-1v-1h-1v-1h-1v-2h1v-1h1z',
  cross: 'M0 0h2v1h1v1h2v-1h1v-1h2v2h-1v1h-1v2h1v1h1v2h-2v-1h-1v-1h-2v1h-1v1h-2v-2h1v-1h1v-2h-1v-1h-1z',
}

/**
 * @param {{ name: keyof typeof PATHS, className?: string, flip?: boolean, title?: string }} props
 */
export default function UpdraftIcon({ name, className, flip = false, title }) {
  return (
    <svg
      viewBox="0 0 8 8"
      className={cn('inline-block w-[1em] h-[1em] fill-current align-[-0.1em]', className)}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      shapeRendering="crispEdges"
      fillRule="evenodd"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** HUD status after a climber's height: the summit flag, or a cross for a fall. */
export function SeatStatus({ seat }) {
  if (seat.top) return <><UpdraftIcon name="flag" className="text-retro-cta" /><span className="sr-only">SUMMIT</span></>
  if (seat.dead) return <><UpdraftIcon name="cross" /><span className="sr-only">FELL</span></>
  return null
}
