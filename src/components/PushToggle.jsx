import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import OpenInBrowserHint from './OpenInBrowserHint'
import { isInAppBrowser } from '../lib/uaLogic'
import { pushAvailable, permissionState, checkPushPermission, vapidKey, enablePush, disablePush } from '../lib/push'
import { isNative } from '../lib/platform'

// Opt-in push toggle. Hidden when push can't work: on the web, no SW/Push
// support or no VAPID key; in the native shell, NATIVE_PUSH off (no APNs key or
// Firebase config yet). Follows useBusy convention: sync busy flag, disabled
// state, …ING label, toast.error on failure.
export default function PushToggle() {
  const [supported] = useState(() => pushAvailable())
  // The browser's permission reads synchronously; the native plugin's does not.
  const [perm, setPerm] = useState(() => (isNative ? 'default' : permissionState()))
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('push-enabled') === '1' } catch { return false }
  })
  const [token, setToken] = useState(null)
  const [busy, run] = useBusy()

  useEffect(() => {
    if (isNative) {
      if (!supported) return undefined
      let live = true
      const refresh = () => { checkPushPermission().then(p => { if (live) setPerm(p) }) }
      refresh()
      // Coming back from the phone's settings after allowing notifications.
      document.addEventListener('visibilitychange', refresh)
      return () => { live = false; document.removeEventListener('visibilitychange', refresh) }
    }
    const update = () => setPerm(permissionState())
    try {
      navigator.permissions?.query({ name: 'notifications' }).then(
        s => { s.onchange = update },
        () => {},
      )
    } catch { /* ignore */ }
    return undefined
  }, [supported])

  // Webviews cannot hold a push subscription: say so instead of failing on tap.
  // (The app's own shell is a webview too, but it has native push instead.)
  if (!isNative && isInAppBrowser() && Boolean(vapidKey())) return <OpenInBrowserHint feature="Notifications" />
  if (!supported) return null

  const enable = () => run(async () => {
    const t = await enablePush()
    setToken(t)
    setOn(true)
    setPerm(await checkPushPermission())
    toast.success('NOTIFICATIONS ON!')
  }, (e) => {
    const code = e?.message || 'failed'
    if (code.includes('permission-denied') || code.includes('permission-')) {
      toast.error(isNative
        ? 'NOTIFICATIONS BLOCKED — ALLOW THEM IN YOUR PHONE SETTINGS.'
        : 'NOTIFICATIONS BLOCKED — ALLOW THEM IN BROWSER SETTINGS.')
    } else if (code === 'no-vapid-key') {
      toast.error('PUSH NOT CONFIGURED YET.')
    } else {
      toast.error('COULD NOT ENABLE NOTIFICATIONS — TRY AGAIN.')
    }
  })

  const disable = () => run(async () => {
    await disablePush(token)
    setToken(null)
    setOn(false)
  }, () => toast.error("COULDN'T TURN OFF — TRY AGAIN."))

  return (
    <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
      <p className="font-pixel text-[10px] text-retro-dim tracking-wider">NOTIFICATIONS</p>
      <p className="font-mono text-[11px] text-retro-dim">
        {perm === 'denied'
          ? `Blocked in ${isNative ? 'phone' : 'browser'} settings — re-allow to get invites and turn alerts.`
          : on
            ? 'On — invites and turn alerts push even when app closed.'
            : 'Get invites and turn alerts even when app closed.'}
      </p>
      <button
        onClick={on ? disable : enable}
        disabled={busy || perm === 'denied'}
        className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? (on ? 'TURNING OFF…' : 'TURNING ON…') : on ? 'TURN OFF' : 'TURN ON'}
      </button>
    </div>
  )
}
