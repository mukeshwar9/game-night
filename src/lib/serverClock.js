import { ref, onValue } from 'firebase/database'
import { db } from './firebase'

// Firebase-corrected clock for deadlines that one client writes and another enforces.
// Each client's own Date.now() can be seconds apart, which silently shrinks (or
// erases) a shared window; `.info/serverTimeOffset` puts every client on the server's
// clock. Subscribes once, lazily, and falls back to the local clock when offline or
// when Firebase isn't configured (local/solo play).
let offset = 0
let subscribed = false

export function serverNow() {
  if (!subscribed && db) {
    subscribed = true
    try {
      onValue(ref(db, '.info/serverTimeOffset'), snap => { offset = snap.val() ?? 0 })
    } catch { /* offline or unconfigured — local clock it is */ }
  }
  return Date.now() + offset
}
