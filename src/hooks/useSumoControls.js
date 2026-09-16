import { useCallback, useEffect, useRef } from 'react'

// Captures local PUSH input for Sumo Arena from keyboard (SPACE or ENTER)
// and a touch button. Exposes getTap() → 0|1 with edge-triggered semantics:
// a single keydown / tap sets a pending flag that is cleared on the first
// read, so holding the key fires one impulse per press. The sim's PUSH_IMPULSE
// is a discrete velocity kick toward the opponent — tapping faster = more
// push accumulation. No-ops while `enabled` is false.
//
// Only SPACE/ENTER are captured (and only those get preventDefault()'d) —
// every other key passes through untouched so Tab/Escape/shortcuts stay
// reachable. Keydowns targeting any focusable/interactive element (the
// on-screen PUSH button, the FORFEIT button, etc.) are ignored here so those
// elements' own native/onKeyDown activation works and isn't double-fired or
// swallowed — this handler only fires the push shortcut when SPACE/ENTER is
// pressed with focus elsewhere (e.g. the arena/page body).
const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], [tabindex]'

export function useSumoControls(enabled = true) {
  const pendingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const onDown = (e) => {
      if (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Enter') return
      if (e.target?.closest?.(INTERACTIVE_SELECTOR)) return
      if (!e.repeat) pendingRef.current = true
      e.preventDefault()
    }
    window.addEventListener('keydown', onDown)
    return () => { window.removeEventListener('keydown', onDown) }
  }, [enabled])

  const getTap = useCallback(() => {
    const v = pendingRef.current ? 1 : 0
    pendingRef.current = false
    return v
  }, [])

  const press = useCallback(() => { pendingRef.current = true }, [])

  return { getTap, press }
}