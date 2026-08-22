import { useEffect, useRef } from 'react'

// Wires an open overlay into the browser/Android back-gesture history stack
// (M-06). Call it once from a mounted-while-open overlay: it pushes a no-op
// history marker on mount so the system back gesture pops that marker
// instead of navigating the underlying route, and closes the overlay via
// `onClose` when that happens. On a normal close (backdrop tap, Escape, a
// button inside the overlay) the overlay unmounts first — the cleanup then
// consumes the still-pending marker with a programmatic back-step so it
// never lingers as an extra dead entry in history.
export default function useModalHistory(onClose) {
  // Temporarily disabled to diagnose popup flicker — restore M-06 history wiring
  // once open → close is stable. Back gesture will navigate while disabled.
  void onClose
}
