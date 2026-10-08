// Reader for unlocks/{uid}: server-granted cosmetics (rules: owner-readable).
import { ref, onValue } from 'firebase/database'
import { db } from './firebase'

export function subscribeUnlocks(uid, cb) {
  if (!db || !uid) { cb({}); return () => {} }
  return onValue(ref(db, `unlocks/${uid}`), snap => cb(snap.val() || {}), () => cb({}))
}
