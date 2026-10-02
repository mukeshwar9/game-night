import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import Avatar from '../components/Avatar'
import PetSprite from '../components/PetSprite'
import AuthErrorBanner from '../components/AuthErrorBanner'
import EmptyState from '../components/EmptyState'
import { canonicalAvatarId as canonicalAvatar, defaultAvatarForId, isKitAvatar, optionInfo } from '../lib/avatarKit'
import { petOf } from '../lib/avatarEditorLogic'
import { openAvatarStudio, openPetPicker } from '../lib/avatarStudioUi'
import { validateName } from '../lib/onboardingLogic'
import { getPlayerId } from '../lib/playerId'
import { useAuth } from '../lib/AuthContext'
import { setProfile, deleteMyData } from '../lib/social'
import { getStats, getMatches } from '../lib/profile'
import { getGameConfig } from '../lib/games'
import { preloadGoogleSignIn, canSignInWithGoogle, canSignInWithApple, upgradeMessage } from '../lib/auth'
import { accountStatusLine } from '../lib/nativeAuthLogic'
import { isNative } from '../lib/platform'
import { mutedList } from '../lib/moderationLogic'
import { unmute, useMutedMap } from '../lib/mute'
import useBusy from '../hooks/useBusy'
import PushToggle from '../components/PushToggle'
import OpenInBrowserHint from '../components/OpenInBrowserHint'
import AppleMark from '../components/AppleMark'
import { isInAppBrowser } from '../lib/uaLogic'
import LegalLinks from '../components/LegalLinks'
import PassStatus from '../components/premium/PassStatus'
import { monetizationEnabled } from '../lib/monetizationState'
import { cn } from '@/lib/utils'

const DEEP_LINKS = { '#look': openAvatarStudio, '#pet': openPetPicker }

export default function Profile() {
  const { profile, isAnonymous, upgrade, signOutToGuest, user } = useAuth()
  const [nameEdit, setNameEdit] = useState(null) // null = mirror profile name
  const muted = mutedList(useMutedMap())
  const [busy, setBusy] = useState(false)
  // The store app is never an in-app browser; it signs in through native sheets.
  const inApp = !isNative && isInAppBrowser()
  const showGoogle = canSignInWithGoogle()
  const showApple = canSignInWithApple()
  useEffect(() => (isAnonymous && !inApp && showGoogle ? preloadGoogleSignIn() : undefined), [isAnonymous, inApp, showGoogle])
  const [upgrading, runUpgrade] = useBusy()
  const [upgradeProvider, setUpgradeProvider] = useState('google')
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, runDelete] = useBusy()
  const [nameBusy, runNameSave] = useBusy()
  // The look editor and the pet sheet are overlays (AvatarStudioHost). The
  // /profile#look and /profile#pet deep links open them straight away.
  const savedAvatar = canonicalAvatar(profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId()))
  const pet = petOf(savedAvatar)
  // The router sees every entry (a link, a typed hash, back/forward), and the
  // hash is dropped once used, so the same link opens the overlay again later.
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const open = DEEP_LINKS[location.hash]
    if (!open) return
    open()
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: location.state })
  }, [location, navigate])
  const stats = getStats()
  const matches = getMatches()

  const nameValue = nameEdit ?? profile?.displayName ?? ''
  const nameCheck = validateName(nameValue)
  const nameError = nameEdit !== null && !nameCheck.ok ? nameCheck.error : null
  const dirty = nameEdit !== null && nameCheck.ok && nameCheck.name !== profile?.displayName

  const saveName = () => runNameSave(async () => {
    // validateName runs the shared moderation (sanitizeDisplayName) too.
    if (!nameCheck.ok) return
    await setProfile({ displayName: nameCheck.name })
    setNameEdit(null)
    toast.success('NAME SAVED!')
  }, () => toast.error("COULDN'T SAVE YOUR NAME — TRY AGAIN."))

  // provider: 'google' | 'apple'. null/undefined from upgrade() = the sheet or
  // popup was dismissed (or a redirect started): stay put, stay silent.
  const handleUpgrade = (provider) => {
    setUpgradeProvider(provider)
    return runUpgrade(async () => {
      const u = await upgrade(provider)
      if (u) toast.success('SIGNED IN — YOUR PROFILE IS NOW SAVED ACROSS DEVICES!')
    }, (e) => {
      console.error(`${provider} sign-in failed:`, e)
      toast.error(upgradeMessage(e, provider))
    })
  }

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOutToGuest()
      toast('SIGNED OUT — PLAYING AS A GUEST.')
    } finally {
      setBusy(false)
    }
  }

  // Sign-out switches the session identity immediately with no way back —
  // require a second tap within a few seconds before it actually fires.
  // Follows the useBusy convention: DELETING…, disabled, toast on failure. On
  // success the page reloads to a fresh start, so there is no success toast.
  const handleDelete = () => runDelete(deleteMyData, (e) => {
    // Dismissing the native re-sign-in sheet aborts before anything is removed.
    if (e?.code === 'auth/native-cancelled') {
      toast('DELETE CANCELLED — NOTHING WAS REMOVED.')
      return
    }
    console.error('Delete my data failed:', e)
    if (e?.code === 'auth/user-mismatch') {
      toast.error(upgradeMessage(e))
      return
    }
    toast.error(e?.code === 'PERMISSION_DENIED' || /permission/i.test(e?.message || '')
      ? 'COULDN\'T DELETE YET — WAIT 30 SECONDS AND TRY AGAIN.'
      : 'COULDN\'T DELETE — CHECK YOUR CONNECTION AND TRY AGAIN.')
  })

  const handleSignOutClick = () => {
    if (busy) return
    if (!confirmSignOut) {
      setConfirmSignOut(true)
      setTimeout(() => setConfirmSignOut(false), 3000)
      return
    }
    setConfirmSignOut(false)
    handleSignOut()
  }

  const byGame = stats?.byGame ? Object.entries(stats.byGame) : []
  const vs = stats?.vs ? Object.entries(stats.vs) : []
  const recentMatches = matches.slice(0, 10)

  return (
    <div className="min-h-screen bg-retro-bg">
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm mx-auto space-y-6 pt-2">
        <h1 className="font-pixel text-base text-retro-cta text-glow-cta">PROFILE</h1>

        <AuthErrorBanner />

        {/* Identity card — the avatar is drawn once, full body with the pet
            beside it, and both editors start here: the look and, separately,
            the pet. */}
        <div id="look" className="bg-retro-card border border-retro-border rounded p-4 space-y-3 scroll-mt-20">
          <div className="flex items-center gap-4">
            <Avatar id={savedAvatar} size={96} view="hero" />
            <div className="min-w-0 flex-1">
              <p className="font-pixel text-xs text-retro-text truncate">{profile?.displayName || '…'}</p>
              <p className="font-mono text-[11px] text-retro-dim mt-1 truncate">
                {accountStatusLine({ isAnonymous, providerData: user?.providerData, email: user?.email })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={openAvatarStudio}
              aria-haspopup="dialog"
              className="min-h-12 px-3 border border-retro-border rounded font-pixel text-[9px] text-retro-cta hover:border-retro-cta transition-all active:scale-95"
            >
              EDIT AVATAR
            </button>
            {isKitAvatar(savedAvatar) && (
              <button
                type="button"
                onClick={openPetPicker}
                aria-haspopup="dialog"
                aria-label={pet === 'none' ? 'Pick a pet' : `Pet: ${optionInfo('pet', pet).label}. Change pet`}
                className="min-h-12 px-3 flex items-center justify-center gap-2 border border-retro-border rounded font-pixel text-[9px] text-retro-cta hover:border-retro-cta transition-all active:scale-95"
              >
                {pet !== 'none' && <PetSprite id={pet} scale={3} />}
                <span className="truncate">{pet === 'none' ? 'PICK A PET' : optionInfo('pet', pet).label}</span>
              </button>
            )}
          </div>
        </div>

        {/* Display name */}
        <div className="space-y-2">
          <label htmlFor="profile-name" className="font-pixel text-[10px] text-retro-dim tracking-wider">DISPLAY NAME</label>
          <div className="flex gap-2">
            <input
              id="profile-name"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'profile-name-error' : undefined}
              value={nameValue}
              onChange={e => setNameEdit(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && dirty && !nameBusy && saveName()}
              maxLength={20}
              placeholder="your name"
              aria-label="Display name"
              className="flex-1 bg-retro-card border border-retro-border rounded px-3 py-2 font-mono text-sm
                text-retro-text placeholder:text-retro-dim focus:outline-none focus:border-retro-p1"
            />
            <button
              onClick={saveName}
              disabled={!dirty || nameBusy}
              className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
                hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {nameBusy ? 'SAVING…' : 'SAVE'}
            </button>
          </div>
          {nameError && (
            <p id="profile-name-error" role="alert" className="font-pixel text-[9px] text-retro-p2 leading-relaxed">{nameError}</p>
          )}
        </div>

        {/* Friend code — read-only here. COPY / SHARE live on the Friends
            page, which is where adding people happens. */}
        <Link
          to="/friends"
          className="group flex min-h-14 items-center gap-3 bg-retro-card border border-retro-border rounded px-3 py-2.5 hover:border-retro-cta/50 transition-colors"
        >
          <span className="flex-1 min-w-0">
            <span className="block font-pixel text-[10px] text-retro-dim tracking-wider">FRIEND CODE</span>
            {/* Plain mono, no glow: people copy these characters by eye. */}
            <span data-selectable className="block font-mono text-base text-retro-p1 tracking-[0.2em] mt-1">{profile?.code || '······'}</span>
          </span>
          <span className="shrink-0 font-pixel text-[9px] text-retro-cta tracking-wider">FRIENDS <span aria-hidden="true">→</span></span>
        </Link>

        <PushToggle />

        {/* Blocked players — synced to the account (lib/mute.js) */}
        <div id="muted" className="space-y-2 scroll-mt-20">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">BLOCKED PLAYERS</label>
          {muted.length === 0 ? (
            <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
              Nobody. Tap a name in room chat to block them — they can&apos;t chat to you, send friend requests or invite you, and they aren&apos;t told.
            </p>
          ) : (
            <div className="space-y-2">
              {muted.map(m => (
                <div key={m.uid} className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-2.5">
                  <p className="flex-1 min-w-0 font-mono text-sm text-retro-text truncate">{m.name || 'Player'}</p>
                  <button
                    type="button"
                    onClick={() => unmute(m.uid)}
                    className="min-h-11 px-4 border border-retro-border text-retro-dim font-pixel text-[10px] rounded
                      hover:text-retro-text hover:border-retro-p1 transition-all active:scale-95"
                  >
                    UNBLOCK
                  </button>
                </div>
              ))}
            </div>
          )}
          {muted.length > 0 && (
            <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
              Blocks follow your account to other devices. Blocked players aren&apos;t told.
            </p>
          )}
        </div>

        {/* Account. A guest with no sign-in method on offer (native shell while
            the launch flags are off) has nothing to show here. */}
        {(!isAnonymous || inApp || showGoogle || showApple) && (
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">ACCOUNT</label>
          {isAnonymous && inApp ? (
            <OpenInBrowserHint />
          ) : isAnonymous ? (
            <div className="space-y-2">
              {showGoogle && (
                <button
                  onClick={() => handleUpgrade('google')}
                  disabled={upgrading}
                  className="w-full py-2.5 flex items-center justify-center gap-2 border border-retro-p1/40
                    bg-retro-card text-retro-p1 font-pixel text-[10px] rounded
                    hover:border-retro-p1 hover:shadow-neon-p1 transition-all active:scale-95 disabled:opacity-50"
                >
                  <GoogleMark /> {upgrading && upgradeProvider === 'google' ? 'SIGNING IN…' : 'SIGN IN WITH GOOGLE'}
                </button>
              )}
              {showApple && (
                <button
                  onClick={() => handleUpgrade('apple')}
                  disabled={upgrading}
                  className="w-full py-2.5 min-h-11 flex items-center justify-center gap-2 border border-retro-text
                    bg-retro-text text-retro-bg font-pixel text-[10px] rounded
                    transition-all active:scale-95 disabled:opacity-50"
                >
                  <AppleMark /> {upgrading && upgradeProvider === 'apple' ? 'SIGNING IN…' : 'SIGN IN WITH APPLE'}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleSignOutClick}
              disabled={busy}
              className={`w-full py-2.5 border font-pixel text-[10px] rounded transition-all active:scale-95 disabled:opacity-50 ${
                confirmSignOut
                  ? 'border-retro-p2 bg-retro-p2/10 text-retro-p2'
                  : 'border-retro-border bg-retro-card text-retro-dim hover:text-retro-text hover:border-retro-p2'
              }`}
            >
              {busy ? 'SIGNING OUT…' : confirmSignOut ? 'TAP AGAIN TO CONFIRM' : 'SIGN OUT'}
            </button>
          )}
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
            {isAnonymous
              ? 'Sign in to keep your profile, avatar, friends & stats across devices. You can keep playing as a guest.'
              : 'Your profile, avatar, friends & stats sync across every device you sign in on.'}
          </p>
        </div>
        )}

        {/* Stats */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">YOUR STATS</label>
          {!stats || stats.games === 0 ? (
            <EmptyState>PLAY A MATCH TO START YOUR RECORD</EmptyState>
          ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'WINS', val: stats.wins, col: 'text-retro-win' },
                { label: 'LOSSES', val: stats.losses, col: 'text-retro-p2' },
                { label: 'BEST STREAK', val: stats.bestStreak, col: 'text-retro-cta' },
              ].map(({ label, val, col }) => (
                <div key={label} className="bg-retro-card border border-retro-border rounded py-2">
                  <p className={cn('font-pixel text-base', col)}>{val}</p>
                  <p className="font-pixel text-[8px] text-retro-dim mt-1 tracking-wider">{label}</p>
                </div>
              ))}
            </div>

            {byGame.length > 0 && (
              <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
                <p className="font-pixel text-[8px] text-retro-dim tracking-wider mb-1">BY GAME</p>
                {byGame.map(([type, g]) => (
                  <div key={type} className="flex justify-between items-center">
                    <span className="font-mono text-[11px] text-retro-text">{getGameConfig(type).label}</span>
                    <span className="font-mono text-[11px]">
                      <span className="text-retro-win">{g.w || 0}W</span>
                      <span className="text-retro-dim"> · </span>
                      <span className="text-retro-p2">{g.l || 0}L</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {vs.length > 0 && (
              <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
                <p className="font-pixel text-[8px] text-retro-dim tracking-wider mb-1">HEAD TO HEAD</p>
                {vs.map(([opp, v]) => (
                  <div key={opp} className="flex justify-between items-center">
                    <span className="font-mono text-[11px] text-retro-text truncate max-w-[60%]">{v.name || opp}</span>
                    <span className="font-mono text-[11px]">
                      <span className="text-retro-win">{v.w || 0}W</span>
                      <span className="text-retro-dim"> · </span>
                      <span className="text-retro-p2">{v.l || 0}L</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
          )}
        </div>

        {/* Recent matches — hidden while empty: YOUR STATS already says
            "play a match", a second empty box said it again. */}
        {recentMatches.length > 0 && (
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">RECENT MATCHES</label>
          {(
            <div className="space-y-2">
              {recentMatches.map((m, i) => {
                const Icon = m.gameType ? getGameConfig(m.gameType)?.Icon : null
                return (
                  <div key={`${m.ts}-${i}`} className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-2.5">
                    <div className="w-7 h-7 shrink-0 flex items-center justify-center text-retro-dim">
                      {Icon && <Icon />}
                    </div>
                    <Avatar id={m.opponentAvatar} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-retro-text truncate">{m.opponentName || 'Opponent'}</p>
                      <p className="font-mono text-[10px] text-retro-dim">{formatRelativeTime(m.ts)}</p>
                    </div>
                    <span className={cn('font-pixel text-[10px] shrink-0', m.won ? 'text-retro-win' : 'text-retro-p2')}>
                      {m.won ? 'WIN' : 'LOSS'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}

        {/* Shop & Pass: what the account has, and the way to more looks */}
        {monetizationEnabled() && <div className="space-y-2 border-t border-retro-border pt-4">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">SHOP &amp; PASS</label>
          <PassStatus linkToPass />
          <Link
            to="/shop"
            className="flex min-h-11 items-center justify-between rounded border border-retro-cta/50 px-3 font-pixel text-[9px] tracking-widest text-retro-cta hover:border-retro-cta transition-colors"
          >
            <span>OPEN THE SHOP</span>
            <span className="text-retro-dim" aria-hidden="true">→</span>
          </Link>
        </div>}

        {/* Privacy: policy links and account deletion */}
        <div className="space-y-2 border-t border-retro-border pt-4">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">PRIVACY</label>
          <LegalLinks contact className="text-left" />
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full min-h-11 border border-retro-border bg-retro-card text-retro-dim font-pixel text-[10px] rounded
                hover:text-retro-danger hover:border-retro-danger/60 transition-all active:scale-95"
            >
              DELETE MY DATA
            </button>
          ) : (
            <div role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-body" className="space-y-3 border-2 border-retro-danger bg-retro-tint-danger rounded p-3">
              <p id="delete-title" className="font-pixel text-[10px] text-retro-danger tracking-wider">DELETE EVERYTHING?</p>
              <p id="delete-body" className="font-mono text-[11px] text-retro-text leading-relaxed">
                This removes your profile, friend code, friends, invites, stats, purchases and sign-in account, cancels any Game Night Pass subscription, and cannot be undone. Chat you already sent leaves with its room within a day.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteBusy}
                  className="flex-1 min-h-11 bg-retro-danger text-retro-bg font-pixel text-[10px] rounded transition-all active:scale-95 disabled:opacity-50"
                >
                  {deleteBusy ? 'DELETING…' : 'YES, DELETE'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteBusy}
                  className="flex-1 min-h-11 border border-retro-border text-retro-text font-pixel text-[10px] rounded transition-all active:scale-95 disabled:opacity-50"
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

// Short relative-time label (e.g. "2h ago") — no existing helper in the repo
// to reuse (checked); kept local/minimal since it's only used here.
function formatRelativeTime(ts) {
  if (!ts) return ''
  const diffMs = Date.now() - ts
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'JUST NOW'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}M AGO`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}H AGO`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}D AGO`
  return new Date(ts).toLocaleDateString()
}

function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.9 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  )
}
