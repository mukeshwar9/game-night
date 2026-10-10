import { useCallback, useRef } from 'react'

// Press queue for QUIVER. A tap is a one-shot event, not a held state: the page
// calls press(seat) from the pad's pointer-down, and the sim loop drains it with
// take(seat) once per frame. `take` returns how many presses landed since the
// last read, so a fast double tap between two reads is not lost (the sim's own
// reload decides how many of them become arrows).
const SEATS = 4

export function useQuiverControls() {
  const queue = useRef(Array(SEATS).fill(0))
  const press = useCallback((seat) => { if (seat >= 0 && seat < SEATS) queue.current[seat] += 1 }, [])
  const take = useCallback((seat) => {
    const n = queue.current[seat] || 0
    queue.current[seat] = 0
    return n
  }, [])
  const reset = useCallback(() => { queue.current = Array(SEATS).fill(0) }, [])
  return { press, take, reset }
}
