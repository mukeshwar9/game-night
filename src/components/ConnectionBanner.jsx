import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import { CONNECTION_COPY, INITIAL_GRACE_MS, LOST_GRACE_MS, connectionBannerState } from '../lib/connectionLogic'
import PixelDots from './loading/PixelDots'

// Global connection signal (H6, F-49). Firebase's `.info/connected` is the
// transport truth and navigator.onLine an extra hint (trusted immediately —
// a deliberate browser signal). `.info/connected` is noisy at boot, so a
// false value only counts as a LOST connection once we've been connected and
// then stayed disconnected past a grace window; a FIRST connection that never
// succeeds gets its own longer window and then says so, with a reload hint,
// instead of staying silent. Either way Firebase keeps retrying on its own —
// the banner only explains, and hides the moment the connection comes up.
// (Firebase missing/misconfigured is the room's configuration error instead.)
export default function ConnectionBanner() {
  const [netOffline, setNetOffline] = useState(() => !navigator.onLine)
  const [everConnected, setEverConnected] = useState(false)
  const [signalLost, setSignalLost] = useState(false)
  const [initialExpired, setInitialExpired] = useState(false)

  useEffect(() => {
    const handleOnline = () => setNetOffline(false)
    const handleOffline = () => setNetOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!db) return
    let connectedOnce = false
    let graceTimer = null
    const initialTimer = setTimeout(() => setInitialExpired(true), INITIAL_GRACE_MS)

    const unsub = onValue(ref(db, '.info/connected'), snap => {
      if (snap.val()) {
        connectedOnce = true
        clearTimeout(initialTimer)
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null }
        setEverConnected(true)
        setSignalLost(false)
        return
      }
      if (!connectedOnce) return   // boot flicker before first connect — the initial timer covers it
      if (graceTimer) clearTimeout(graceTimer)
      graceTimer = setTimeout(() => setSignalLost(true), LOST_GRACE_MS)
    })

    return () => {
      unsub()
      clearTimeout(initialTimer)
      if (graceTimer) clearTimeout(graceTimer)
    }
  }, [])

  const state = db ? connectionBannerState({ netOffline, everConnected, signalLost, initialExpired }) : (netOffline ? 'offline' : 'hidden')
  if (state === 'hidden') return null
  const unreachable = state === 'unreachable'

  return (
    <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 border-2 border-retro-p2 bg-retro-tint-p2
          rounded-full px-4 py-2 shadow-neon-p2 animate-[update-drop_0.35s_steps(6)_both]"
      >
        <span className="font-pixel text-[9px] text-retro-p2 tracking-wider">
          {CONNECTION_COPY[state]}
        </span>
        {unreachable ? (
          // Reload is only offered before the first connection: nothing this
          // session has reached the server yet, so there's no saved or
          // half-sent game state for a reload to lose.
          <button
            onClick={() => window.location.reload()}
            className="font-pixel text-[9px] text-retro-text underline underline-offset-2 hover:text-retro-p2 transition-colors p-2 -m-2"
          >
            RELOAD
          </button>
        ) : state === 'lost' ? (
          <PixelDots size="sm" tone="p2" />
        ) : null}
      </div>
    </div>
  )
}
