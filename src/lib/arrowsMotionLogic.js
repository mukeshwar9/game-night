// Pure timing for the blocked-tap bump: the arrow glides its whole route up to
// the blocker (plus a small overshoot so the head visibly meets it), then
// eases back to rest. Continuous easing, no steps(), no distance cap.

export const BUMP_OVERSHOOT = 0.3
const OUT_MIN_MS = 90
const OUT_MS_PER_CELL_NEAR = 38 // up to NEAR_CELLS, as the old fixed-cap bump felt
const NEAR_CELLS = 3.3
const OUT_MS_PER_CELL_FAR = 24 // beyond that, a long run speeds up per cell
const OUT_MAX_MS = 650
const BACK_RATIO = 0.75
const BACK_MIN_MS = 220

const easeOutQuad = (t) => 1 - (1 - t) * (1 - t)
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

// `gap`: empty cells the head walks before it meets the blocker.
export function bumpPlan(gap) {
  const g = Number.isFinite(gap) && gap > 0 ? gap : 0
  const cells = g + BUMP_OVERSHOOT
  const near = Math.min(cells, NEAR_CELLS) * OUT_MS_PER_CELL_NEAR
  const far = Math.max(0, cells - NEAR_CELLS) * OUT_MS_PER_CELL_FAR
  const outMs = Math.min(OUT_MAX_MS, Math.max(OUT_MIN_MS, near + far))
  const backMs = Math.max(BACK_MIN_MS, Math.round(outMs * BACK_RATIO))
  return { cells, outMs, backMs }
}

// Fraction (0..1) of the planned distance covered `elapsed` ms after the tap.
export function bumpProgress(elapsed, plan) {
  const { outMs, backMs } = plan
  if (!(elapsed > 0)) return { fraction: 0, done: false }
  if (elapsed < outMs) return { fraction: easeOutQuad(clamp01(elapsed / outMs)), done: false }
  const back = elapsed - outMs
  if (back < backMs) return { fraction: 1 - easeInOutCubic(back / backMs), done: false }
  return { fraction: 0, done: true }
}
