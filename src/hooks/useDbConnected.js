import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'

// Live Firebase transport state from `.info/connected`: null until the first
// value arrives, then true/false. A write made while this is false is queued
// by the SDK and lands whenever the connection returns — possibly on a room
// that has moved on — so callers block irreversible actions (moves) on false.
export default function useDbConnected() {
  const [connected, setConnected] = useState(null)
  useEffect(() => {
    if (!db) return
    return onValue(ref(db, '.info/connected'), snap => setConnected(!!snap.val()))
  }, [])
  return connected
}
