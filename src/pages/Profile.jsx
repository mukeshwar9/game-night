import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'
import AuthErrorBanner from '../components/AuthErrorBanner'
import EmptyState from '../components/EmptyState'
import { canonicalAvatar, defaultAvatarForId } from '../lib/avatars'
import { validateName } from '../lib/onboardingLogic'
import { getPlayerId } from '../lib/playerId'
import { useAuth } from '../lib/AuthContext'
import { setProfile } from '../lib/social'
import { getStats, getMatches } from '../lib/profile'
import { getGameConfig } from '../lib/games'
import { UPGRADE_ERRORS, preloadGoogleSignIn } from '../lib/auth'
import { mutedList } from '../lib/moderationLogic'
import { unmute, useMutedMap } from '../lib/mute'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

export default function Profile() {
  const { profile, isAnonymous, upgrade, signOutToGuest, user } = useAuth()
  const [nameEdit, setNameEdit] = useState(null) // null = mirror profile name
  const muted = mutedList(useMutedMap())
  const [busy, setBusy] = useState(false)
  useEffect(() => (isAnonymous ? preloadGoogleSignIn() : undefined), [isAnonymous])
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [nameBusy, runNameSave] = useBusy()
  const [avatarBusy, runAvatarSave] = useBusy()
  // Draft avatar edits — customizer edits this only; SAVE commits to the profile.
  // Seeded from the saved profile avatar; re-seeded when the profile avatar changes
  // externally, but only while the draft isn't dirty (don't clobber in-progress edits).
  // Follows React's sanctioned "adjust state during rendering" pattern (comparing
  // against a tracked previous value in state, not an effect) — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  const savedAvatar = canonicalAvatar(profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId()))
  const [avatarDraft, setAvatarDraft] = useState(savedAvatar)
  const [avatarDraftDirty, setAvatarDraftDirty] = useState(false)
  // The picker is ~900px tall, so it stays folded behind EDIT AVATAR (a
  // /profile#look deep link opens it straight away).
  const [editingAvatar, setEditingAvatar] = useState(() => window.location.hash === '#look')
  const [prevSavedAvatar, setPrevSavedAvatar] = useState(savedAvatar)
  const stats = getStats()
  const matches = getMatches()

  if (savedAvatar !== prevSavedAvatar) {
    setPrevSavedAvatar(savedAvatar)
    if (!avatarDraftDirty) setAvatarDraft(savedAvatar)
  }

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

  const pickAvatar = (next) => {
    setAvatarDraft(next)
    setAvatarDraftDirty(next !== savedAvatar)
  }

  const saveAvatar = () => runAvatarSave(async () => {
    if (avatarDraft === savedAvatar) { setAvatarDraftDirty(false); return }
    await setProfile({ avatar: avatarDraft })
    setAvatarDraftDirty(false)
    setEditingAvatar(false)
    toast.success('AVATAR SAVED!')
  }, () => toast.error("COULDN'T SAVE YOUR AVATAR — TRY AGAIN."))

  // Closing the editor drops unsaved changes — SAVE is the only commit.
  const closeAvatarEditor = () => {
    setAvatarDraft(savedAvatar)
    setAvatarDraftDirty(false)
    setEditingAvatar(false)
  }

  const handleUpgrade = async () => {
    setBusy(true)
    try {
      const u = await upgrade()
      if (u) toast.success('SIGNED IN — YOUR PROFILE IS NOW SAVED ACROSS DEVICES!')
    } catch (e) {
      console.error('Google sign-in failed:', e)
      toast.error(UPGRADE_ERRORS[e?.code] || `SIGN-IN FAILED${e?.code ? ` (${e.code})` : ''}. PLEASE TRY AGAIN.`)
    } finally {
      setBusy(false)
    }
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

  const copyCode = async () => {
    if (!profile?.code) return
    try {
      await navigator.clipboard.writeText(profile.code)
      toast.success('FRIEND CODE COPIED!')
    } catch {
      const el = document.createElement('textarea')
      el.value = profile.code
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      if (ok) toast.success('FRIEND CODE COPIED!')
      else toast.error('COULD NOT COPY THE CODE — PLEASE COPY IT MANUALLY.')
    }
  }

  const shareCode = async () => {
    if (!profile?.code) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Game Night', text: `Add me on Game Night — my friend code is ${profile.code}!`, url: window.location.origin })
        return
      } catch (err) {
        if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') return
        // fall through to clipboard copy
      }
    }
    await copyCode()
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

        {/* Identity card */}
        <div className="bg-retro-card border border-retro-border rounded p-4 flex items-center gap-4">
          <Avatar id={profile?.avatar} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-xs text-retro-text truncate">{profile?.displayName || '…'}</p>
            <p className="font-mono text-[11px] text-retro-dim mt-1">
              {isAnonymous ? 'Guest account' : `Signed in with Google${user?.email ? ` · ${user.email}` : ''}`}
            </p>
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

        {/* Avatar picker */}
        <div id="look" className="space-y-2 scroll-mt-20">
          <p className="font-pixel text-[10px] text-retro-dim tracking-wider">AVATAR</p>
          {!editingAvatar ? (
            <div className="flex items-center gap-3 bg-retro-card border border-retro-border rounded p-2.5">
              <Avatar id={savedAvatar} size={40} />
              <p className="flex-1 min-w-0 font-mono text-[11px] text-retro-dim">Pick a critter or build a person.</p>
              <button
                type="button"
                onClick={() => setEditingAvatar(true)}
                aria-expanded={false}
                className="shrink-0 min-h-11 px-3 border border-retro-border rounded font-pixel text-[9px] text-retro-cta hover:border-retro-cta transition-all active:scale-95"
              >
                EDIT AVATAR
              </button>
            </div>
          ) : (
          <div id="profile-avatar-editor" className="space-y-2">
          <div className={avatarBusy ? 'pointer-events-none opacity-60' : ''}>
            <AvatarPicker value={avatarDraft} onChange={pickAvatar} name={profile?.displayName || localStorage.getItem('playerName') || ''} />
          </div>
          {avatarDraftDirty && (
            <button
              onClick={saveAvatar}
              disabled={avatarBusy}
              className="w-full max-w-[380px] mx-auto block py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-widest rounded
                hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-60 animate-pulse"
              style={{ animationDuration: '1.6s' }}
            >
              {avatarBusy ? 'SAVING…' : 'SAVE'}
            </button>
          )}
          <button
            type="button"
            onClick={closeAvatarEditor}
            disabled={avatarBusy}
            aria-expanded={true}
            aria-controls="profile-avatar-editor"
            className="w-full max-w-[380px] mx-auto block min-h-11 border border-retro-border text-retro-dim font-pixel text-[10px] tracking-widest rounded
              hover:text-retro-text transition-all active:scale-95 disabled:opacity-60"
          >
            {avatarDraftDirty ? 'CANCEL' : 'DONE'}
          </button>
          </div>
          )}
        </div>

        {/* Friend code */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">FRIEND CODE</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-retro-card border border-retro-border rounded px-3 py-2">
              {/* Plain mono, no glow: people copy these characters by eye. */}
              <span className="font-mono text-base text-retro-p1 tracking-[0.2em]">{profile?.code || '······'}</span>
            </div>
            <button
              onClick={copyCode}
              className="min-h-11 px-4 bg-retro-card border border-retro-border text-retro-dim font-pixel text-[10px] rounded
                hover:text-retro-text hover:border-retro-p1 transition-all active:scale-95"
            >
              COPY
            </button>
            <button
              onClick={shareCode}
              className="min-h-11 px-4 bg-retro-card border border-retro-border text-retro-dim font-pixel text-[10px] rounded
                hover:text-retro-text hover:border-retro-p1 transition-all active:scale-95"
            >
              SHARE
            </button>
          </div>
          <Link to="/friends" className="inline-block font-pixel text-[10px] text-retro-cta hover:text-glow-cta transition-all">
            MANAGE FRIENDS →
          </Link>
        </div>

        {/* Muted players — local to this device (lib/mute.js) */}
        <div id="muted" className="space-y-2 scroll-mt-20">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">MUTED PLAYERS</label>
          {muted.length === 0 ? (
            <EmptyState>NOBODY MUTED. TAP A NAME IN ROOM CHAT TO MUTE.</EmptyState>
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
                    UNMUTE
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
            Muted players&apos; chat is hidden on this device only. They aren&apos;t told.
          </p>
        </div>

        {/* Account */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">ACCOUNT</label>
          {isAnonymous ? (
            <button
              onClick={handleUpgrade}
              disabled={busy}
              className="w-full py-2.5 flex items-center justify-center gap-2 border border-retro-p1/40
                bg-retro-card text-retro-p1 font-pixel text-[10px] rounded
                hover:border-retro-p1 hover:shadow-neon-p1 transition-all active:scale-95 disabled:opacity-50"
            >
              <GoogleMark /> {busy ? 'SIGNING IN…' : 'SIGN IN WITH GOOGLE'}
            </button>
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

        {/* Recent matches */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">RECENT MATCHES</label>
          {recentMatches.length === 0 ? (
            <EmptyState>PLAY A MATCH TO SEE IT HERE</EmptyState>
          ) : (
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
