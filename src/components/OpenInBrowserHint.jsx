import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { inAppBrowserName, isInAppBrowser, openInBrowserUrl } from '../lib/uaLogic'
import { isNative } from '../lib/platform'

// Shown in place of a feature that cannot work inside an in-app browser
// (Instagram, TikTok, Facebook, ...): Google sign-in, install, push. Play
// itself is unaffected. Renders nothing in a regular browser, so callers can
// use it as `hint || feature`.
export default function OpenInBrowserHint({ feature = 'Google sign-in', className = '' }) {
  const [busy, run] = useBusy()
  // The store app is not an in-app browser: its sign-in uses the native sheet.
  if (isNative || !isInAppBrowser()) return null
  const app = inAppBrowserName()
  const href = typeof location === 'undefined' ? '' : location.href
  const intent = openInBrowserUrl(href)

  const copy = () => run(async () => {
    await navigator.clipboard.writeText(href)
    toast.success('LINK COPIED — PASTE IT IN SAFARI OR CHROME.')
  }, () => toast.error('COULD NOT COPY — USE THE ⋯ MENU → OPEN IN BROWSER.'))

  const btn = 'font-pixel text-[10px] underline decoration-dotted underline-offset-4 min-h-11 px-2 disabled:opacity-50'
  return (
    <div
      role="note"
      className={`border border-retro-p1/40 bg-retro-card rounded px-3 py-2.5 text-center space-y-1 ${className}`}
    >
      <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
        {feature} does not work inside {app}. Open this page in your browser to use it. Playing works here.
      </p>
      {intent ? (
        <a href={intent} className={`${btn} inline-flex items-center text-retro-p1`}>OPEN IN CHROME</a>
      ) : (
        <button type="button" onClick={copy} disabled={busy} className={`${btn} text-retro-p1`}>
          {busy ? 'COPYING…' : 'COPY LINK'}
        </button>
      )}
    </div>
  )
}
