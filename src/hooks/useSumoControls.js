import { useCallback, useEffect, useRef } from 'react'

// Captures local PUSH input for Sumo Arena from keyboard (SPACE or any key)
// and a touch button. Exposes getTap() → 0|1 with edge-triggered semantics:
// a single keydown / tap sets a pending flag that is cleared on the first
// read, so holding the key fires one impulse per press. The sim's PUSH_IMPULSE
// is a discrete velocity kick toward the opponent — tapping faster = more
// push accumulation. No-ops while `enabled` is false.
export function useSumoControls(enabled = true) {
  const pendingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const onDown = (e) => {
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