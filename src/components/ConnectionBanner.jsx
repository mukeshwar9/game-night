import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import PixelDots from './loading/PixelDots'

// Grace period before a lost RTDB connection surfaces as a banner — absorbs
// the false→true flicker every client sees on normal boot/reconnect.
const GRACE_MS = 2500

// Global offline signal (H6). Two independent sources combine into one
// visible/hidden flag: navigator.onLine is trusted immediately (a deliberate
// browser signal); Firebase's `.info/connected` is noisy at boot, so it only
// counts once we've seen a real connection this session and then lost it for
// a sustained period.
export default function ConnectionBanner() {
  const [netOffline, setNetOffline] = useState(() => !navigator.onLine)
  const [signalLost, setSignalLost] = useState(false)

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
    let everConnected = false
    let graceTimer = null

    const unsub = onValue(ref(db, '.info/connected'), snap => {
      if (snap.val()) {
        everConnected = true
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null }
        setSignalLost(false)
        return
      }
      if (!everConnected) return   // boot flicker before first connect — ignore
      if (graceTimer) clearTimeout(graceTimer)
      graceTimer = setTimeout(() => setSignalLost(true), GRACE_MS)
    })

    return () => {
      unsub()
      if (graceTimer) clearTimeout(graceTimer)
    }
  }, [])

  if (!netOffline && !signalLost) return null

  return (
    <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 border-2 border-retro-p2 bg-retro-tint-p2
          rounded-full px-4 py-2 shadow-neon-p2 animate-[update-drop_0.35s_steps(6)_both]"
      >
        <span className="font-pixel text-[9px] text-retro-p2 tracking-wider">
          SIGNAL LOST — RECONNECTING
        </span>
        <PixelDots size="sm" tone="p2" />
      </div>
    </div>
  )
}
