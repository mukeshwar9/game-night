import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import NavBar from '../components/NavBar'
import Avatar from '../components/Avatar'
import AvatarCustomizer from '../components/AvatarCustomizer'
import EmptyState from '../components/EmptyState'
import { canonicalAvatar } from '../lib/avatars'
import { useAuth } from '../lib/AuthContext'
import { setProfile } from '../lib/social'
import { getStats } from '../lib/profile'
import { getGameConfig } from '../lib/games'
import { UPGRADE_ERRORS, consumePendingAuthToast } from '../lib/auth'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

export default function Profile() {
  const { profile, isAnonymous, upgrade, signOutToGuest, user } = useAuth()
  const [nameEdit, setNameEdit] = useState(null) // null = mirror profile name
  const [busy, setBusy] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [nameBusy, runNameSave] = useBusy()
  const [avatarBusy, runAvatarSave] = useBusy()
  const stats = getStats()

  // M-07: a redirect-based Google sign-in (mobile/standalone PWA fallback)
  // completes on a full page reload, before <Toaster/> is mounted — auth.js
  // stashes the outcome instead of toasting directly. Surface it here, once
  // this page has actually mounted (Toaster is guaranteed up by then).
  useEffect(() => {
    const pending = consumePendingAuthToast()
    if (!pending) return
    if (pending.type === 'success') toast.success(pending.message)
    else toast.error(pending.message)
  }, [])

  const nameValue = nameEdit ?? profile?.displayName ?? ''
  const dirty = nameEdit !== null && nameEdit.trim() && nameEdit.trim() !== profile?.displayName

  const saveName = () => runNameSave(async () => {
    const trimmed = nameValue.trim()
    if (!trimmed) return
    await setProfile({ displayName: trimmed })
    setNameEdit(null)
    toast.success('NAME SAVED!')
  }, () => toast.error("COULDN'T SAVE YOUR NAME — TRY AGAIN."))

  const pickAvatar = (next) => runAvatarSave(async () => {
    if (next === canonicalAvatar(profile?.avatar)) return
    await setProfile({ avatar: next })
    toast.success('AVATAR SAVED!')
  }, () => toast.error("COULDN'T SAVE YOUR AVATAR — TRY AGAIN."))

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

  return (
    <div className="min-h-screen bg-retro-bg">
      <NavBar />
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm mx-auto space-y-6 pt-2">
        <h1 className="font-pixel text-base text-retro-cta text-glow-cta">PROFILE</h1>

        {/* Identity card */}
        <div className="bg-retro-card border border-retro-border rounded p-4 flex items-center gap-4">
          <Avatar id={profile?.avatar} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-xs text-retro-text truncate">{profile?.displayName || '…'}</p>
            <p className="font-mono text-[11px] text-retro-dim mt-1">
              {isAnonymous ? 'Guest account' : (user?.email || 'Signed in')}
            </p>
          </div>
        </div>

        {/* Display name */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">DISPLAY NAME</label>
          <div className="flex gap-2">
            <input
              value={nameValue}
              onChange={e => setNameEdit(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && dirty && !nameBusy && saveName()}
              maxLength={20}
              placeholder="your name"
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
        </div>

        {/* Avatar picker */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">AVATAR</label>
          <div className={avatarBusy ? 'pointer-events-none opacity-60' : ''}>
            <AvatarCustomizer value={profile?.avatar} onChange={pickAvatar} />
          </div>
        </div>

        {/* Friend code */}
        <div className="space-y-2">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">FRIEND CODE</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-retro-card border border-retro-border rounded px-3 py-2">
              <span className="font-pixel text-sm text-retro-p1 text-glow-p1 tracking-[0.3em]">{profile?.code || '······'}</span>
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
                  <p className="font-pixel text-[7px] text-retro-dim mt-1 tracking-wider">{label}</p>
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
      </div>
      </div>
    </div>
  )
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
