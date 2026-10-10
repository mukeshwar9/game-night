// Polls the service worker for a new build while the app sits open.
// vite-plugin-pwa (registerType: 'prompt') only finds an update on
// navigation — an SPA game session has none, so without this the UPDATE
// READY banner waits until the next reload. A check every 15 min plus one
// whenever the tab becomes visible (throttled to 5 min) surfaces it
// mid-game. When found, the new worker parks in "waiting" and the existing
// UpdatePrompt asks — never force-reloads a live match.
import { useEffect } from 'react'
import { isNative } from '../lib/platform'

const CHECK_INTERVAL_MS = 15 * 60 * 1000
const MIN_GAP_MS = 5 * 60 * 1000

export default function useSWUpdateCheck() {
  useEffect(() => {
    // The native shell bundles its assets (a store update is the update path)
    // and registers no service worker, so there is nothing to poll.
    if (isNative) return
    if (!('serviceWorker' in navigator)) return
    let alive = true
    let last = 0
    const check = () => {
      const now = Date.now()
      if (now - last < MIN_GAP_MS) return
      last = now
      navigator.serviceWorker.getRegistration()
        .then(reg => { if (alive) reg?.update().catch(() => {}) })
        .catch(() => {})
    }
    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
}
