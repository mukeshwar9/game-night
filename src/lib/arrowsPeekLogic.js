// Pure decisions for the Arrows route peek (solo): hold an arrow, or hover it
// with a mouse, to see the route the rules give it. No DOM, no React.
import { TAP_SLOP_PX } from './arrowsCameraLogic'

// A touch or pen press this long (still, single finger) shows the route.
export const PEEK_HOLD_MS = 380
// The route stays this long after the finger lifts.
export const PEEK_LINGER_MS = 600
// A mouse rests on an arrow this long before its faint route shows.
export const HOVER_DWELL_MS = 120
// Movement that cancels a hold (the same slop a tap allows).
export const PEEK_SLOP_PX = TAP_SLOP_PX

/**
 * What a finished press means.
 *  - 'tap':    send the arrow
 *  - 'peek':   show the route, send nothing
 *  - 'cancel': a drag or a pinch; send nothing
 * A mouse never peeks by holding (it hovers instead), so a still click is a tap.
 */
export function peekOutcome({ heldMs, movedPx, multi, pointerType }) {
  if (multi || movedPx >= PEEK_SLOP_PX) return 'cancel'
  if (pointerType === 'mouse') return 'tap'
  return heldMs >= PEEK_HOLD_MS ? 'peek' : 'tap'
}

/** Does this pointer start a hold timer? Touch and pen do; a mouse hovers. */
export const canHold = (pointerType) => pointerType !== 'mouse'

/**
 * The one line under the solo board (ROUTES mode and its first-bump prompt).
 * The most useful thing wins: a previewed arrow's verdict, then the nudge after
 * a session's first bump (ROUTES still off), then the board's twist tip, then
 * the ROUTES-on reminder. Tone is a theme role, never a colour.
 *  - routes: ROUTES mode is on
 *  - pick:   null, or { free } for the arrow whose route is previewed
 *  - nudge:  a blocked tap has just happened this session and ROUTES is off
 *  - tip:    the level's twist tip, or ''
 * @returns {{ tone: 'win' | 'danger' | 'cta' | 'dim', text: string } | null}
 */
export function routeCoach({ routes = false, pick = null, nudge = false, tip = '' } = {}) {
  if (routes && pick) {
    return pick.free
      ? { tone: 'win', text: 'CLEAR · TAP AGAIN TO SEND' }
      : { tone: 'danger', text: 'BLOCKED · SENDING IT COSTS A STAR' }
  }
  if (!routes && nudge) return { tone: 'cta', text: 'BUMPED? TURN ON ROUTES TO SEE WHERE AN ARROW GOES' }
  if (!routes && tip) return { tone: 'cta', text: tip }
  if (routes) return { tone: 'dim', text: 'ROUTES ON · TAP AN ARROW TO PREVIEW, TAP AGAIN TO SEND' }
  return null
}
