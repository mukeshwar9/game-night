import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import AppleMark from './AppleMark'
import { useAuth } from '../lib/AuthContext'
import { canSignInWithGoogle, canSignInWithApple, upgradeMessage } from '../lib/auth'
import { isNative } from '../lib/platform'
import { isInAppBrowser } from '../lib/uaLogic'
import { getStats } from '../lib/profile'
import { readArrowsProgress } from '../lib/arrowsProgress'
import { subscribeFriends } from '../lib/social'
import { track } from '../lib/track'
import { recordFunnel } from '../lib/analytics'
import { shouldOfferSave, saveCountsLine, isCappedSurface } from '../lib/savePromptLogic'
import { shownThisSession, markShownThisSession, snoozedUntilFor, snoozeSurface } from '../lib/savePrompt'
import useBusy from '../hooks/useBusy'

function starTotal() {
  try { return Object.values(readArrowsProgress().levels || {}).reduce((a, n) => a + (Number(n) || 0), 0) } catch { return 0 }
}

/**
 * The "save file" card: tells a guest their progress lives on this phone and
 * offers SAVE with Google/Apple. Guards itself with shouldOfferSave, so call
 * sites just render it. `friendCount` skips the friends subscription when the
 * page already knows it.
 */
export default function SaveCard({ surface, compact = false, onDismiss, friendCount }) {
  const { isAnonymous, upgrade } = useAuth()
  const showApple = canSignInWithApple()
  const showGoogle = canSignInWithGoogle()
  const canSave = (showApple || showGoogle) && (isNative || !isInAppBrowser())
  const [subFriends, setSubFriends] = useState(0)
  useEffect(() => {
    if (friendCount != null || (!isAnonymous && surface !== 'profile')) return undefined
    return subscribeFriends(list => setSubFriends(list.length))
  }, [friendCount, isAnonymous, surface])
  const friends = friendCount ?? subFriends

  const [saved, setSaved] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, run] = useBusy()
  const [provider, setProvider] = useState('google')
  // Frozen at mount: a card that is on screen stays until dismissed or saved,
  // even though showing it sets the session flag.
  const [mountState] = useState(() => ({ capped: isCappedSurface(surface), shown: shownThisSession(), snooze: snoozedUntilFor(surface) }))
  const stats = getStats()
  const counts = {
    matches: Math.max(stats?.games || 0, surface === 'match-end' ? 1 : 0),
    friends,
    stars: starTotal(),
  }
  const offer = shouldOfferSave({
    surface, isAnonymous, canSave, counts,
    shownThisSession: mountState.shown, snoozedUntil: mountState.snooze,
  })
  useEffect(() => { if (offer && mountState.capped) markShownThisSession() }, [offer, mountState.capped])

  const savedView = saved || (!isAnonymous && surface === 'profile')
  if (dismissed) return null
  if (!savedView && !offer) return null

  const save = (p) => {
    setProvider(p)
    return run(async () => {
      const u = await upgrade(p)
      if (!u) return
      track('account_saved', { source: surface, provider: p })
      recordFunnel('saved')
      setSaved(true)
    }, (e) => {
      console.error(`${p} save failed:`, e)
      toast.error(upgradeMessage(e, p))
    })
  }
  const notNow = () => {
    snoozeSurface(surface)
    setDismissed(true)
    onDismiss?.()
  }

  const first = showApple && !showGoogle ? 'apple' : (isIos() && showApple ? 'apple' : 'google')
  const order = [first, first === 'apple' ? 'google' : 'apple'].filter(p => (p === 'apple' ? showApple : showGoogle))
  const label = (p) => (busy && provider === p ? 'SAVING…' : `SAVE WITH ${p === 'apple' ? 'APPLE' : 'GOOGLE'}`)

  const status = savedView ? 'SAVED · EVERY DEVICE' : busy ? 'SAVING…' : 'NOT SAVED · THIS PHONE ONLY'
  return (
    <section
      aria-label="Save your progress"
      className={`relative overflow-hidden rounded border-2 border-retro-text/80 bg-retro-card shadow-[0_4px_0_rgb(var(--c-text)/0.35)] ${compact ? 'text-left' : ''}`}
    >
      <div className={`flex items-center gap-2 px-2.5 py-1.5 border-b-2 border-retro-text/80 font-pixel text-[7px] tracking-[0.12em] ${savedView ? 'bg-retro-tint-p1 text-retro-win' : 'bg-retro-tint-cta text-retro-cta'}`}>
        <span aria-hidden="true" className={`inline-block h-[7px] w-[7px] bg-current ${savedView ? '' : 'save-pip'}`} />
        <span role="status">{status}</span>
      </div>
      <div className={compact ? 'p-2.5 space-y-2' : 'p-3 space-y-3'}>
        {savedView ? (
          <p className="font-mono text-[11px] leading-relaxed text-retro-dim">
            <strong className="text-retro-text">{saveCountsLine(counts)}</strong> are safe. Sign in on any device to pick up where you left off.
          </p>
        ) : (
          <p className="font-mono text-[11px] leading-relaxed text-retro-dim">
            <strong className="text-retro-text">{saveCountsLine(counts)}</strong>{' '}
            {surface === 'friends' ? 'YOUR FRIENDS LIST LIVES ON THIS DEVICE ONLY UNTIL YOU SAVE.' : compact ? 'live on this phone only.' : 'live on this phone only. Save to keep them on every device, and if you clear your browser or get a new phone.'}
          </p>
        )}
        {!savedView && (
          <div className={compact ? 'flex flex-wrap items-center gap-2' : 'space-y-2'}>
            {order.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => save(p)}
                disabled={busy}
                className={`${compact ? 'flex-1 min-w-[9rem]' : 'w-full'} min-h-11 px-2 flex items-center justify-center gap-2 rounded font-pixel text-[9px] tracking-wider transition press disabled:opacity-50 ${
                  p === 'apple'
                    ? 'border border-retro-text bg-retro-text text-retro-bg'
                    : i === 0
                      ? 'border border-retro-p1 bg-retro-p1 text-retro-bg'
                      : 'border border-retro-p1/50 bg-retro-card text-retro-p1'
                }`}
              >
                {p === 'apple' ? <AppleMark size={13} /> : <span aria-hidden="true" className="font-pixel text-[10px]">G</span>}
                {label(p)}
              </button>
            ))}
            {surface !== 'profile' && <button
              type="button"
              onClick={notNow}
              disabled={busy}
              className="min-h-11 px-3 font-pixel text-[8px] tracking-wider text-retro-dim hover:text-retro-text transition-colors disabled:opacity-50"
            >
              NOT NOW
            </button>}
          </div>
        )}
      </div>
    </section>
  )
}

function isIos() {
  try { return /iPad|iPhone|iPod/.test(navigator.userAgent) } catch { return false }
}
