import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { pushAvailable, checkPushPermission, enablePush } from '../lib/push'
import { shouldShowPushNudge } from '../lib/pushNudgeLogic'

// Asks for notifications where they pay off right away (lib/pushNudgeLogic.js):
// a host waiting for a friend, or someone looking at their friends. The full
// toggle stays in Profile. `spot` keys the NOT NOW snooze; `text` says what
// the player gets here.
export default function PushNudge({ spot, text, className = '' }) {
  const key = `push-nudge-${spot}`
  const [show, setShow] = useState(false)
  const [busy, run] = useBusy()

  useEffect(() => {
    let live = true
    const available = pushAvailable()
    let enabled = false
    let dismissedAt = null
    try {
      enabled = localStorage.getItem('push-enabled') === '1'
      dismissedAt = Number(localStorage.getItem(key)) || null
    } catch { /* storage unavailable */ }
    if (!available || enabled) return undefined
    checkPushPermission().then((permission) => {
      if (live) setShow(shouldShowPushNudge({ available, enabled, permission, dismissedAt }))
    })
    return () => { live = false }
  }, [key])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(key, String(Date.now())) } catch { /* storage unavailable */ }
    setShow(false)
  }

  const enable = () => run(async () => {
    await enablePush()
    setShow(false)
    toast.success('NOTIFICATIONS ON!')
  }, (e) => {
    const code = e?.message || ''
    toast.error(code.includes('permission-')
      ? 'NOTIFICATIONS BLOCKED — YOU CAN ALLOW THEM IN PROFILE LATER.'
      : 'COULD NOT ENABLE NOTIFICATIONS — TRY AGAIN.')
    dismiss()
  })

  return (
    <div className={`w-full bg-retro-card border border-retro-border rounded p-3 flex items-center gap-3 ${className}`} data-testid="push-nudge">
      <p className="flex-1 font-mono text-[11px] text-retro-dim">{text}</p>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          onClick={enable}
          disabled={busy}
          className="px-3 py-2 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
        >
          {busy ? 'TURNING ON…' : 'TURN ON'}
        </button>
        <button onClick={dismiss} disabled={busy} className="px-3 py-1 font-pixel text-[8px] text-retro-dim hover:text-retro-text">
          NOT NOW
        </button>
      </div>
    </div>
  )
}
