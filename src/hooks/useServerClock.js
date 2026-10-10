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
  if (!unsubscribe && db) {
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

/**
 * Server-corrected time for a caller that may run before any component has
 * mounted the shared subscription (e.g. creating a room straight from a
 * button). Reads `.info/serverTimeOffset` once; falls back to the last known
 * offset if the read is slow or fails, so it never blocks the caller.
 */
export async function fetchServerNow(timeoutMs = 1500) {
  if (!db || offset !== 0) return getServerNow()
  try {
    const read = new Promise((resolve, reject) => {
      const off = onValue(ref(db, '.info/serverTimeOffset'), snap => { off(); resolve(snap.val() ?? 0) }, reject)
    })
    const value = await Promise.race([read, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))])
    offset = value
    listeners.forEach(l => l())
  } catch { /* keep the last known offset */ }
  return getServerNow()
}

/** Latest known client→server clock offset (ms). */
export function getServerOffset() {
  return offset
}

/**
 * Two call shapes are accepted:
 *   useServerClock(tickMs)                  — tick every `tickMs` while > 0;
 *                                             0/falsy = no ticking
 *   useServerClock({ tickMs = 250, ticking = true })
 *
 * @returns {{ now: number, offset: number, serverNow: () => number }} `now` is
 *   server-corrected ms as of the last tick (or mount), for rendering;
 *   `offset` is the live server offset; `serverNow()` is a fresh reading for
 *   event handlers and transactions (same as `getServerNow()`).
 */
export default function useServerClock(arg = 0) {
  const { tickMs, ticking } = typeof arg === 'object' && arg !== null
    ? { tickMs: arg.tickMs ?? 250, ticking: arg.ticking ?? true }
    : { tickMs: arg, ticking: Boolean(arg) }
  const liveOffset = useSyncExternalStore(subscribe, getOffset, getOffset)
  const [localNow, setLocalNow] = useState(() => Date.now())

  useEffect(() => {
    if (!ticking || !tickMs) return undefined
    const id = setInterval(() => setLocalNow(Date.now()), tickMs)
    return () => clearInterval(id)
  }, [tickMs, ticking])

  return { now: localNow + liveOffset, offset: liveOffset, serverNow: getServerNow }
}
