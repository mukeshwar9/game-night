// @ts-check
// Focus mode — the game-first, full-screen stage. Pure: no DOM, no React
// (FocusStage.jsx measures and draws; useFocusMode.js talks to the browser).
//
// A game opts in with `focus: true` in its GAME_TYPES entry once its board
// has been checked inside the stage. Focus wraps the standard BoardComponent
// path (rooms and the VS CPU / pass-and-play bot board); custom pages and the
// real-time arenas bring their own layouts and stay out for now.

/** The largest scale a small board may grow to; past this pixel art turns to mush. */
export const MAX_FIT_SCALE = 2.5

/**
 * Can this room or solo board enter focus mode right now?
 * @param {{ focus?: boolean } | null | undefined} cfg  the GAME_TYPES entry
 * @param {{ custom?: boolean, status?: string }} [where]
 */
export function canFocus(cfg, { custom = false, status = 'playing' } = {}) {
  return !!cfg?.focus && !custom && status !== 'waiting'
}

/**
 * The scale that fits a `content` box inside a `stage` box, keeping its
 * aspect: never bigger than MAX_FIT_SCALE, and 1 until both are measured.
 * @param {{ w: number, h: number }} stage
 * @param {{ w: number, h: number }} content
 */
export function fitScale(stage, content, max = MAX_FIT_SCALE) {
  if (!(stage.w > 0 && stage.h > 0 && content.w > 0 && content.h > 0)) return 1
  return Math.min(max, stage.w / content.w, stage.h / content.h)
}

/**
 * The box around a set of child boxes (offset positions inside one parent),
 * so a board that centres itself inside a wider column is fitted by its own
 * size rather than the column's.
 * @param {{ left: number, top: number, width: number, height: number }[]} boxes
 */
export function unionBox(boxes) {
  const live = boxes.filter(b => b.width > 0 || b.height > 0)
  if (!live.length) return { left: 0, top: 0, width: 0, height: 0 }
  const left = Math.min(...live.map(b => b.left))
  const top = Math.min(...live.map(b => b.top))
  const right = Math.max(...live.map(b => b.left + b.width))
  const bottom = Math.max(...live.map(b => b.top + b.height))
  return { left, top, width: right - left, height: bottom - top }
}
