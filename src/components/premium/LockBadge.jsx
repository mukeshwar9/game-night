import { cn } from '@/lib/utils'

// Small padlock drawn on a locked premium item. aria-hidden: the parent button's
// label says "locked".
export default function LockBadge({ className = '', size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className={cn('shrink-0 text-retro-cta', className)}>
      <rect x="2" y="5" width="8" height="6" fill="currentColor" />
      <path d="M3.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

// ★ badge for Pass holders and Supporters.
export function PassStar({ className = '' }) {
  return <span className={cn('font-pixel text-retro-cta text-glow-cta', className)} aria-label="Game Night Pass">★</span>
}
