import { useEffect, useState, useSyncExternalStore } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'

// Server-corrected clock for timed phases. Every deadline comparison must run
// on this clock, not raw Date.now(), or a phone with a skewed clock ends
// phases early/late for everyone.
//
// ONE module-level `.info/serverTimeOffset` subscription is shared by every
// mounted consumer (instead of each page opening its own); it is opened by
// the first subscriber and closed when the last one unmounts. The last known
// offset is kept across remounts (e.g. a game switch), so a remounted page
// starts corrected instead of at 0.

let offset = 0
let unsubscribe = null
const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  if (!unsubscribe) {
    unsubscribe = onValue(ref(db, '.info/serverTimeOffset'), snap => {
      offset = snap.val() ?? 0
      listeners.forEach(l => l())
    })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }
}

const getOffset = () => offset

/** Current server-corrected time (ms). Safe in callbacks and transactions. */
export function getServerNow() {
  return Date.now() + offset
}

/** Latest known client→server clock offset (ms). */
export function getServerOffset() {
  return offset
}

/**
 * @param {number} [tickMs=0] - re-render every `tickMs` while > 0 (drive a
 *   countdown); 0/falsy = no ticking (pass 0 while no timed phase is active).
 * @returns {{ now: number, offset: number }} `now` is server-corrected ms as
 *   of the last tick (or mount); `offset` is the live server offset. For a
 *   fresh reading inside a handler use `getServerNow()`.
 */
export default function useServerClock(tickMs = 0) {
  const liveOffset = useSyncExternalStore(subscribe, getOffset, getOffset)
  const [localNow, setLocalNow] = useState(() => Date.now())

  useEffect(() => {
    if (!tickMs) return
    const id = setInterval(() => setLocalNow(Date.now()), tickMs)
    return () => clearInterval(id)
  }, [tickMs])

  return { now: localNow + liveOffset, offset: liveOffset }
}
