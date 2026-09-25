import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'

// One copy of the server-clock pattern the word games each re-implemented:
// Firebase's `.info/serverTimeOffset` corrects this device's clock so every
// player's deadline, countdown and "who was faster" stamp agrees, and a
// ticker re-renders the page while a timer is on screen.
//
// Returns { offset, now, serverNow }:
//   - `now`       — server-corrected time at the last tick (for rendering)
//   - `serverNow` — function returning server-corrected time right now (for
//                   event handlers and transactions)
export default function useServerClock({ tickMs = 250, ticking = true } = {}) {
  const [offset, setOffset] = useState(0)
  const offsetRef = useRef(0)
  const [localNow, setLocalNow] = useState(() => Date.now())

  useEffect(() => {
    if (!db) return undefined
    return onValue(ref(db, '.info/serverTimeOffset'), snap => {
      const value = snap.val() || 0
      offsetRef.current = value
      setOffset(value)
    })
  }, [])

  useEffect(() => {
    if (!ticking) return undefined
    const id = setInterval(() => setLocalNow(Date.now()), tickMs)
    return () => clearInterval(id)
  }, [tickMs, ticking])

  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  return { offset, now: localNow + offset, serverNow }
}
