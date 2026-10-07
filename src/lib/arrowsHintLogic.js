// Which free arrow the HINT button points at. Pure — no DOM, no Firebase.
//
// Any free arrow is a legal move (clearing only ever opens cells), so the hint
// is about which one helps most: the one whose removal frees the most arrows
// that are blocked right now. Ties go to the arrow on the longest remaining
// dependency chain (clearing it leaves the fewest solve waves), then to the
// lowest index so the hint is stable.

import { freeArrows } from './arrowsLogic'

// How many wave-by-wave passes the rest of the board still needs.
function remainingWaves(level, gone) {
  let g = gone
  let waves = 0
  for (;;) {
    const free = freeArrows(level, g)
    if (free.length === 0) return waves
    waves += 1
    g = g.slice()
    for (const i of free) g[i] = true
  }
}

// `free` may be passed when the caller already has freeArrows(level, gone).
export function bestHintArrow(level, gone, free = freeArrows(level, gone)) {
  if (free.length === 0) return null
  if (free.length === 1) return free[0]
  const before = new Set(free)
  const scored = free.map((index) => {
    const next = gone.slice()
    next[index] = true
    const freed = freeArrows(level, next).filter((i) => !before.has(i)).length
    return { index, freed, next }
  })
  const top = Math.max(...scored.map((s) => s.freed))
  const tied = scored.filter((s) => s.freed === top)
  if (tied.length === 1) return tied[0].index
  let best = null
  for (const s of tied) {
    const waves = remainingWaves(level, s.next)
    if (!best || waves < best.waves) best = { index: s.index, waves }
  }
  return best.index
}
