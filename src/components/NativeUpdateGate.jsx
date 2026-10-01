import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { deadEndPrimaryClass } from './DeadEnd'
import { isNative, nativePlatform } from '../lib/platform'
import { watchMinVersion, openStoreListing } from '../lib/native/versionGate'

// Blocking "update required" screen for store builds older than
// config/minNativeVersion (src/lib/native/versionGate.js). Renders nothing on
// the web, while the check runs, and whenever the build is current or the
// check fails. Mount once, inside the auth gate (App.jsx), next to the other
// app-wide overlays.
//
// It covers the viewport above everything except toasts, and marks the app
// root inert so keyboards and screen readers cannot reach the page behind it.
export default function NativeUpdateGate() {
  const [required, setRequired] = useState(false)

  useEffect(() => {
    if (!isNative) return undefined
    let cancelled = false
    let stop = () => {}
    watchMinVersion(() => setRequired(true)).then((stopFn) => {
      if (cancelled) stopFn()
      else stop = stopFn
    })
    return () => { cancelled = true; stop() }
  }, [])

  useEffect(() => {
    if (!required) return undefined
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    return () => root?.removeAttribute('inert')
  }, [required])

  if (!required) return null

  const store = nativePlatform === 'ios' ? 'APP STORE' : 'GOOGLE PLAY'
  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
      aria-describedby="update-required-body"
      className="fixed inset-0 z-[100] bg-retro-bg flex flex-col items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="w-full max-w-sm bg-retro-card border border-retro-border rounded p-6 text-center space-y-4">
        <p id="update-required-title" className="font-pixel text-sm text-retro-text tracking-wider">UPDATE REQUIRED</p>
        <p id="update-required-body" className="font-mono text-sm text-retro-dim leading-relaxed">
          This version of Game Night is out of date and can no longer connect to games. Update it to keep playing.
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => openStoreListing(nativePlatform)}
          className={`${deadEndPrimaryClass} w-full`}
        >
          OPEN {store}
        </button>
      </div>
    </div>,
    document.body,
  )
}
