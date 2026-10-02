import { cn } from '@/lib/utils'
import { pairsFaceColor, pairsFaceGlyph, pairsFaceName } from '../lib/pairsFaces'

// The Pairs faces as objects: an 8×8 pixel silhouette in card ink ('o' cells stay
// open so the face colour shows through). Shared by Pairs and the memory games that
// show objects (What Changed?, Lost & Found).
export function FaceSprite({ face, className = 'w-[66%] h-[66%]' }) {
  const grid = pairsFaceGlyph(face)
  return (
    <svg viewBox="0 0 8 8" className={className} shapeRendering="crispEdges" aria-hidden="true">
      {grid.flatMap((row, y) =>
        row.split('').map((ch, x) => (ch === '#'
          ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" style={{ fill: 'rgb(var(--pair-ink))' }} />
          : null)),
      )}
    </svg>
  )
}

// A face on its own coloured card (the fixed --pair-* palette, the same on every theme).
export function FaceCard({ face, className }) {
  return (
    <span
      className={cn('pairs-card-face rounded-lg flex items-center justify-center', className)}
      style={{ backgroundColor: pairsFaceColor(face) }}
      role="img"
      aria-label={pairsFaceName(face)}
    >
      <FaceSprite face={face} />
    </span>
  )
}
