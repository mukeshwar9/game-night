// @ts-check
// SKETCH match setup (S2): the host picks how many times everyone draws, how
// long a drawing lasts and how many letter hints show. Pure: no DOM, Firebase
// or React; unit-tested in sketchConfigLogic.test.js.
//
// Room key `sketchConfig` (room-level, kept across NEW MATCH and switches,
// like TIMERS; not in FIELD_NULLS):
//   { v: 1, draws?: 1|2|3, drawS: 45|60|75|90|120, hints: 0|1|2 }
// `draws` absent means "today's rule": twice, three times with 2 players.
// START copies the values into the round (`cycles`, `drawBase`, `hintCount`)
// so a later change can't alter a match in flight; every reader falls back to
// today's behaviour when a round has none (rooms and coordinators from before
// the setup existed).

export const DRAW_CHOICES = [1, 2, 3]
export const DRAW_TIME_CHOICES = [45, 60, 75, 90, 120]
export const HINT_CHOICES = [0, 1, 2]
export const DEFAULT_DRAW_S = 75
export const DEFAULT_HINTS = 2
/** Choosing + reveal + slack per drawing, for the match-length estimate. */
export const OVERHEAD_S = 15

/** The 2-player rule: three draws each with 2 players, else two. */
export function defaultDraws(playerCount) {
  return playerCount === 2 ? 3 : 2
}

/**
 * The room's setup with every field coerced into range; `draws` stays null
 * when the host never picked one (today's player-count rule applies).
 * @returns {{ draws: number | null, drawS: number, hints: number }}
 */
export function normalizeSketchConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    draws: DRAW_CHOICES.includes(r.draws) ? r.draws : null,
    drawS: DRAW_TIME_CHOICES.includes(r.drawS) ? r.drawS : DEFAULT_DRAW_S,
    hints: HINT_CHOICES.includes(r.hints) ? r.hints : DEFAULT_HINTS,
  }
}

/** The room value to write after the host changes one field. */
export function withSetup(raw, field, value) {
  const c = normalizeSketchConfig(raw)
  const next = { ...c, [field]: value }
  const out = { v: 1, drawS: next.drawS, hints: next.hints }
  if (next.draws != null) out.draws = next.draws
  return out
}

/** How many times everyone draws in a match with this setup. */
export function drawsFor(config, playerCount) {
  return normalizeSketchConfig(config).draws ?? defaultDraws(playerCount)
}

/** What START copies into the round. */
export function roundSetup(config, playerCount) {
  const c = normalizeSketchConfig(config)
  return { cycles: drawsFor(c, playerCount), drawBase: c.drawS * 1000, hintCount: c.hints }
}

/**
 * About how many minutes a match lasts: players × draws × (draw time + 15 s),
 * the draw time after the room's timer scale. Null when timers are off.
 */
export function estimateMinutes({ players, draws, drawS, timerScale = 1 }) {
  if (!(timerScale > 0)) return null
  const secs = players * draws * (drawS * timerScale + OVERHEAD_S)
  return Math.max(1, Math.round(secs / 60))
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** "2 DRAWS · 75 S · 2 HINTS" for the lobby line. */
export function setupSummary(config, playerCount) {
  const c = normalizeSketchConfig(config)
  const hints = c.hints === 0 ? 'NO HINTS' : plural(c.hints, 'HINT', 'HINTS')
  return `${plural(drawsFor(c, playerCount), 'DRAW', 'DRAWS')} · ${c.drawS} S · ${hints}`
}

export const DRAWS_SUB = { 1: 'EVERYONE DRAWS ONCE', 2: 'EVERYONE DRAWS TWICE', 3: 'EVERYONE DRAWS 3 TIMES' }
export const HINTS_SUB = { 0: 'NONE: BLANKS ONLY', 1: 'AT HALF TIME', 2: 'AT HALF TIME AND THREE QUARTERS' }

/** The sheet's footer: the estimate, or what the timers do to the draw time. */
export function setupFooter({ players, draws, drawS, timerScale = 1 }) {
  if (!(timerScale > 0)) return 'TIMERS ARE OFF — THE HOST ENDS EACH DRAWING'
  const mins = estimateMinutes({ players, draws, drawS, timerScale })
  const est = `ABOUT ${mins} MIN WITH ${players} PLAYER${players === 1 ? '' : 'S'}`
  return timerScale === 1 ? est : `${est} · ${drawS} S × ${timerScale} = ${drawS * timerScale} S A DRAWING`
}

/** A round's match length in cycles: its snapshot, else today's rule. */
export function roundCycles(round) {
  const n = round?.cycles
  return DRAW_CHOICES.includes(n) ? n : defaultDraws((round?.order || []).length)
}

/** A round's base drawing time in ms (before the timer scale): its snapshot, else 75 s. */
export function roundDrawBase(round) {
  const ms = round?.drawBase
  return Number.isFinite(ms) && DRAW_TIME_CHOICES.includes(ms / 1000) ? ms : DEFAULT_DRAW_S * 1000
}

/** A round's letter-hint count: its snapshot, else 2. */
export function roundHintCount(round) {
  const n = round?.hintCount
  return HINT_CHOICES.includes(n) ? n : DEFAULT_HINTS
}
