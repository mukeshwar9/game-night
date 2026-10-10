// @ts-check
// Split Signal (co-op): one lit pattern, split between two players. Each sees only
// their half during the reveal; together they rebuild it on a shared board, each
// tapping the tiles they saw. A wrong tap costs a shared life and replays the level.
import { generateVmPattern, vmGridSide } from './visualMemoryLogic'

export const SPLIT_LIVES = 3
// Tiles in the whole pattern: 4 at level 1, one more per level.
export function splitTiles(level) { return 3 + level }
export function splitSide(level) { return vmGridSide(splitTiles(level)) }
// Reveal (posture B): 2 s plus 0.15 s per tile, at most 4 s (each sees only half).
export function splitRevealMs(level) { return Math.min(4000, 2000 + splitTiles(level) * 150) }

/** @returns {{ side: number, X: number[], O: number[] }} the halves each seat sees */
export function dealSplit(level, rand = Math.random) {
  const side = splitSide(level)
  const pattern = generateVmPattern(splitTiles(level), side * side, rand)
  return { side, X: pattern.filter((_, i) => i % 2 === 0), O: pattern.filter((_, i) => i % 2 === 1) }
}

/**
 * One tap by `seat` on `cell`, given tiles already found. Returns 'found' for one of
 * the seat's own tiles, 'repeat' for one already found, and 'wrong' otherwise
 * (a blank tile, or the partner's tile: you can only know the ones you saw).
 */
export function splitTap(deal, found, seat, cell) {
  if (found?.[cell]) return 'repeat'
  return deal[seat].includes(cell) ? 'found' : 'wrong'
}

export function splitCleared(deal, found) {
  return [...deal.X, ...deal.O].every(c => found?.[c])
}
