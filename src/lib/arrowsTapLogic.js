// Pure tap resolution for Arrows boards: which arrow does a board-space point
// mean? No DOM, no React.
import { cellCenter, freeArrows, occupancy } from './arrowsLogic'

// Near-miss reach in cells: thumbs are wider than lines.
export const TAP_SLOP = 0.8

// The arrow under board point (x, y) (its cell, or the nearest cell centre
// within `slop` cells), or -1. `cell` is the cell size in board units.
export function pickArrowAt(level, gone, x, y, cell, slop = TAP_SLOP) {
  const occ = occupancy(level, gone)
  const cx = Math.floor(x / cell)
  const cy = Math.floor(y / cell)
  let best = -1
  let bestDist = slop * cell
  for (let yy = cy - 1; yy <= cy + 1; yy += 1) {
    for (let xx = cx - 1; xx <= cx + 1; xx += 1) {
      if (xx < 0 || xx >= level.cols || yy < 0 || yy >= level.rows) continue
      const owner = occ[yy * level.cols + xx]
      if (owner === -1) continue
      const [mx, my] = cellCenter([xx, yy], cell)
      const dist = Math.hypot(mx - x, my - y)
      const inside = xx === cx && yy === cy
      if (inside || dist < bestDist) {
        best = owner
        bestDist = inside ? -1 : dist
      }
    }
  }
  return best
}

// Snap guard: on a dense board a thumb often lands on a blocked arrow beside
// the free one it aimed at, and that costs a life. When `hit` is blocked but
// a free arrow has a cell centre within reach, send the free arrow instead.
// Free hits, misses and blocked taps with nothing free in reach pass through.
export function snapToFree(level, gone, x, y, hit, cell, slop = TAP_SLOP) {
  if (hit < 0) return hit
  const free = freeArrows(level, gone)
  if (free.includes(hit)) return hit
  let best = hit
  let bestDist = slop * cell
  for (const i of free) {
    for (const c of level.arrows[i].cells) {
      const [mx, my] = cellCenter(c, cell)
      const dist = Math.hypot(mx - x, my - y)
      if (dist < bestDist) {
        best = i
        bestDist = dist
      }
    }
  }
  return best
}

// The arrow a tap at board point (x, y) means: the hit, snapped to a free
// neighbour when the hit is blocked.
export function resolveTap(level, gone, x, y, cell, slop = TAP_SLOP) {
  return snapToFree(level, gone, x, y, pickArrowAt(level, gone, x, y, cell, slop), cell, slop)
}
