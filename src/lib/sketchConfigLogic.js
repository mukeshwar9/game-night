// @ts-check
// SKETCH match setup (room key `games/{id}/sketchConfig`): how many times
// everyone draws, how long a drawing lasts and how many letter hints show.
// The host picks them in the lobby's MATCH SETUP sheet; START copies the
// resolved values into the round (`round.cycles`, `round.drawBase`,
// `round.hintCount`) so a later change can never alter a match in flight.
//
// Stored shape: { v: 1, draws?: 1|2|3, drawS?: 45|60|75|90|120, hints?: 0|1|2 }.
// A field the host never picked is absent and falls back to today's rule:
// draws by player count (`cyclesFor`), 75 s, two hints. `draws` stays absent
// until picked on purpose, so a room whose player count changes keeps
// today's 3-draws-for-two default.
//
// Pure — no DOM/Firebase/React.

import { DRAW_MS, MAX_HINTS, cyclesFor } from './sketchLogic'
import { normalizeTimerScale, TIMER_SCALE_OFF } from './timerScale'

export const SKETCH_CONFIG_KEY = 'sketchConfig'
export const SKETCH_CONFIG_VERSION = 1
export const DRAW_CHOICES = [1, 2, 3]
export const DRAW_TIME_CHOICES = [45, 60, 75, 90, 120] // seconds a drawing
export const HINT_CHOICES = [0, 1, 2]
export const DEFAULT_DRAW_S = DRAW_MS / 1000
export const DEFAULT_HINTS = MAX_HINTS
// The estimate adds this much per drawing for choosing the word and the reveal.
export const ESTIMATE_OVERHEAD_S = 15

const pick = (choices, raw) => (choices.includes(raw) ? raw : null)

/**
 * The room's stored setup, every field checked: a value off its menu reads
 * as not picked (null), so a bad write can only ever fall back to defaults.
 * @param {unknown} raw - whatever Firebase returned for `sketchConfig`
 * @returns {{ draws: number|null, drawS: number|null, hints: number|null }}
 */
export function normalizeSketchConfig(raw) {
  const r = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  return {
    draws: pick(DRAW_CHOICES, r.draws),
    drawS: pick(DRAW_TIME_CHOICES, r.drawS),
    hints: pick(HINT_CHOICES, r.hints),
  }
}

/**
 * The value to write after the host taps one control: the room's current
 * setup with `patch` merged over it, unpicked fields left out (Firebase
 * would delete a null anyway, and the rules refuse anything off the menu).
 * @param {unknown} current - the room's `sketchConfig` as read inside the transaction
 * @param {{ draws?: number, drawS?: number, hints?: number }} patch
 */
export function patchSketchConfig(current, patch) {
  const merged = normalizeSketchConfig(current)
  const picked = normalizeSketchConfig(patch)
  for (const key of /** @type {const} */ (['draws', 'drawS', 'hints'])) {
    if (picked[key] != null) merged[key] = picked[key] // an off-menu tap changes nothing
  }
  /** @type {{ v: number, draws?: number, drawS?: number, hints?: number }} */
  const out = { v: SKETCH_CONFIG_VERSION }
  if (merged.draws != null) out.draws = merged.draws
  if (merged.drawS != null) out.drawS = merged.drawS
  if (merged.hints != null) out.hints = merged.hints
  return out
}

/**
 * The setup a match with `playerCount` players would use: every field filled,
 * defaults included.
 * @param {unknown} raw
 * @param {number} playerCount
 * @returns {{ draws: number, drawS: number, hints: number }}
 */
export function resolveSketchSetup(raw, playerCount) {
  const c = normalizeSketchConfig(raw)
  return {
    draws: c.draws ?? cyclesFor(playerCount),
    drawS: c.drawS ?? DEFAULT_DRAW_S,
    hints: c.hints ?? DEFAULT_HINTS,
  }
}

/**
 * What START copies into the first round (and every later round carries on).
 * @param {unknown} raw
 * @param {number} playerCount - seats in the drawing order
 * @returns {{ cycles: number, drawBase: number, hintCount: number }}
 */
export function roundSetupSnapshot(raw, playerCount) {
  const s = resolveSketchSetup(raw, playerCount)
  return { cycles: s.draws, drawBase: s.drawS * 1000, hintCount: s.hints }
}

/**
 * The lobby's one-line summary, e.g. "2 DRAWS · 75 S · 2 HINTS".
 * @param {{ draws: number, drawS: number, hints: number }} setup
 */
export function sketchSetupSummary(setup) {
  const draws = `${setup.draws} DRAW${setup.draws === 1 ? '' : 'S'}`
  const hints = setup.hints === 0 ? 'NO HINTS' : `${setup.hints} HINT${setup.hints === 1 ? '' : 'S'}`
  return `${draws} · ${setup.drawS} S · ${hints}`
}

/**
 * Rough match length in whole minutes (at least 1): players × draws ×
 * (the drawing as the room's timers run it + choosing and reveal).
 * Null when timers are off — the host ends each drawing, so nobody knows.
 * @param {{ players: number, draws: number, drawS: number, timerScale?: unknown }} p
 * @returns {number|null}
 */
export function estimateMinutes({ players, draws, drawS, timerScale }) {
  const scale = normalizeTimerScale(timerScale)
  if (scale === TIMER_SCALE_OFF) return null
  const seconds = Math.max(1, players) * draws * (drawS * scale + ESTIMATE_OVERHEAD_S)
  return Math.max(1, Math.round(seconds / 60))
}

/**
 * The sheet's footer lines: the estimate, plus how RELAXED or OFF timers
 * change a drawing.
 * @param {{ players: number, draws: number, drawS: number, timerScale?: unknown }} p
 * @returns {string[]}
 */
export function estimateLines({ players, draws, drawS, timerScale }) {
  const scale = normalizeTimerScale(timerScale)
  if (scale === TIMER_SCALE_OFF) return ['TIMERS ARE OFF — THE HOST ENDS EACH DRAWING']
  const n = Math.max(1, players)
  const mins = estimateMinutes({ players: n, draws, drawS, timerScale })
  const lines = [`ABOUT ${mins} MIN WITH ${n} PLAYER${n === 1 ? '' : 'S'}`]
  if (scale !== 1) lines.push(`${drawS} S × ${scale} = ${drawS * scale} S A DRAWING`)
  return lines
}

/** Copy under each control's value. */
export const DRAWS_BLURB = { 1: 'EVERYONE DRAWS ONCE', 2: 'EVERYONE DRAWS TWICE', 3: 'EVERYONE DRAWS 3 TIMES' }
export const HINTS_BLURB = { 0: 'NONE: BLANKS ONLY', 1: 'AT HALF TIME', 2: 'AT HALF TIME AND THREE QUARTERS' }
