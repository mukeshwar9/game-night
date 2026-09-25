// Room-level timer scale (`games/{id}/timerScale`), set in the lobby: 1 = the
// default clocks, 2 = relaxed (every timed phase twice as long), 0 = off (no
// automatic deadline — the coordinator advances by hand). Absent or invalid
// means 1, so rooms created before the option existed keep today's clocks.
//
// Pure — no DOM/Firebase/React.

export const TIMER_SCALE_DEFAULT = 1
export const TIMER_SCALE_RELAXED = 2
export const TIMER_SCALE_OFF = 0

/**
 * @param {unknown} raw - whatever Firebase returned for `game.timerScale`.
 * @returns {number} a finite scale >= 0 (1 when absent/invalid).
 */
export function normalizeTimerScale(raw) {
  if (raw == null || raw === '' || typeof raw === 'boolean') return TIMER_SCALE_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return TIMER_SCALE_DEFAULT
  return n
}

export function timersOff(raw) {
  return normalizeTimerScale(raw) === TIMER_SCALE_OFF
}

/**
 * Scale a phase's base duration.
 * @returns {number|null} the scaled duration in ms, or null when timers are off.
 */
export function scaledMs(baseMs, raw) {
  const scale = normalizeTimerScale(raw)
  if (scale === TIMER_SCALE_OFF) return null
  return Math.round(baseMs * scale)
}
