// Shared clock/countdown formatters (replaces the per-page fmtTime / fmtClock /
// formatTimer copies). Pure — no DOM/Firebase/React.

/** Two-digit zero pad: 7 → '07'. */
export const pad2 = (n) => String(n).padStart(2, '0')

const toSafeNumber = (n) => (Number.isFinite(n) ? n : 0)

/**
 * Seconds → 'm:ss' (or 'mm:ss' with padMinutes). Fractions are floored;
 * negatives clamp to 0.
 *
 * @param {number} secs
 * @param {{ padMinutes?: boolean }} [opts]
 */
export function formatClockSecs(secs, { padMinutes = false } = {}) {
  const s = Math.max(0, Math.floor(toSafeNumber(secs)))
  const m = Math.floor(s / 60)
  return `${padMinutes ? pad2(m) : m}:${pad2(s % 60)}`
}

/**
 * Milliseconds → 'm:ss'. Rounds UP by default so a countdown reads 0:01 until
 * time is really up (the convention every timed page used); pass
 * `round: 'floor'` for elapsed-time displays.
 *
 * @param {number} ms
 * @param {{ round?: 'ceil'|'floor', padMinutes?: boolean }} [opts]
 */
export function formatClock(ms, { round = 'ceil', padMinutes = false } = {}) {
  const v = Math.max(0, toSafeNumber(ms)) / 1000
  const secs = round === 'floor' ? Math.floor(v) : Math.ceil(v)
  return formatClockSecs(secs, { padMinutes })
}

/** Whole seconds left in a countdown (rounded up, never negative). */
export function secondsLeft(ms) {
  return Math.max(0, Math.ceil(toSafeNumber(ms) / 1000))
}
