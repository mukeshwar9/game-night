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
