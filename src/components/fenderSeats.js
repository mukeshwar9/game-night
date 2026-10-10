import { HEARTS } from '../lib/fenderLogic'

/** Per-seat accent classes, written out so Tailwind keeps them. */
export const SEAT_STYLES = [
  { text: 'text-retro-p1', border: 'border-retro-p1', tint: 'bg-retro-tint-p1', dot: 'bg-retro-p1' },
  { text: 'text-retro-p2', border: 'border-retro-p2', tint: 'bg-retro-tint-p2', dot: 'bg-retro-p2' },
  { text: 'text-retro-p3', border: 'border-retro-p3', tint: 'bg-retro-tint-p3', dot: 'bg-retro-p3' },
  { text: 'text-retro-p4', border: 'border-retro-p4', tint: 'bg-retro-tint-p4', dot: 'bg-retro-p4' },
]

export function heartsText(hp) {
  return '♥'.repeat(Math.max(0, hp)) + '·'.repeat(Math.max(0, HEARTS - Math.max(0, hp)))
}
