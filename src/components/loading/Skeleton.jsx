import { cn } from '@/lib/utils'

// Pixel-block placeholder — a flat dim rect, never a shimmer gradient.
export default function Skeleton({ className = '', pulse = false, style }) {
  return (
    <div
      className={cn('bg-retro-border/40 rounded-[2px]', pulse && 'skel-flicker', className)}
      style={style}
      aria-hidden="true"
    />
  )
}
