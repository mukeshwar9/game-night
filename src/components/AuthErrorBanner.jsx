import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { peekPendingAuthToast, clearPendingAuthToast } from '../lib/auth'

// M-07 follow-up: a redirect-based Google sign-in (mobile/standalone PWA
// fallback) completes on a full page reload, before <Toaster/> is mounted, so
// auth.js stashes the outcome instead of toasting directly. This surfaces it
// once a page has actually mounted.
//
// The error case renders BOTH a toast and a persistent banner: a toast fires
// the instant the page reloads, while the user is still looking at browser
// chrome, and auto-dismisses seconds later — easy to miss on mobile, after
// which the failure looks silent again. The banner stays until dismissed.
// Renders nothing when there's no pending outcome.
export default function AuthErrorBanner() {
  // Snapshot the one-shot outcome at mount. peek (not consume) is
  // side-effect-free, so StrictMode's double-invoked initialiser returns the
  // same value both times; the stashed value is cleared from the effect below.
  const [notice] = useState(() => peekPendingAuthToast())
  const [dismissed, setDismissed] = useState(false)
  const toasted = useRef(false)

  useEffect(() => {
    if (!notice) return
    clearPendingAuthToast()
    if (toasted.current) return
    toasted.current = true
    if (notice.type === 'success') toast.success(notice.message)
    else toast.error(notice.message)
  }, [notice])

  if (!notice || notice.type === 'success' || dismissed) return null

  return (
    <div
      role="alert"
      className="bg-retro-card border border-retro-danger/60 rounded px-3 py-2.5 flex items-start gap-3"
    >
      <p className="flex-1 font-pixel text-[9px] text-retro-danger leading-relaxed tracking-wider">
        {notice.message}
      </p>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 min-h-6 px-2 border border-retro-border text-retro-dim font-pixel text-[8px] rounded
          hover:text-retro-text hover:border-retro-danger transition-all active:scale-95"
      >
        ✕
      </button>
    </div>
  )
}
