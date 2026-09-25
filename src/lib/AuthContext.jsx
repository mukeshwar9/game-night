import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import PixelDots from '@/components/loading/PixelDots'
import { authReady, onUser, upgradeWithGoogle, signOutToGuest as signOutToGuestFn } from './auth'
import {
  ensureProfile, subscribeProfile, setupPresence, subscribeInvites, subscribeRequests,
} from './social'
import { syncStatsOnBoot } from './statsSync'
import { THEMES, applyTheme, getStoredTheme } from './theme'
import { FONTS, applyFont, getStoredFont } from './font'
import { applyStoredDisplayPrefs } from './displayPrefs'

const AuthContext = createContext(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext) || {}
}

// Mirrors the pre-JS splash markup in index.html so there's no visual jump
// once React mounts and takes over the boot gate.
function ConnectingSplash() {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-4">
      <p className="font-pixel text-base sm:text-lg tracking-[0.15em] text-retro-cta text-glow-cta arcade-blink">
        INSERT COIN
      </p>
      <PixelDots size="lg" glow />
    </div>
  )
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [booted, setBooted] = useState(false)
  const [invites, setInvites] = useState([])
  const [requestCount, setRequestCount] = useState(0)
  const uid = user?.uid ?? null
  const authFailToastShown = useRef(false)

  // Boot: kick anonymous sign-in (if needed) and track auth state.
  useEffect(() => {
    // Local look-and-feel prefs (CRT, motion, text size) live outside the
    // index.html pre-JS snippet, so re-apply the stored set on every boot.
    applyStoredDisplayPrefs()
    const unsub = onUser(setUser)
    authReady().finally(() => setBooted(true))
    return unsub
  }, [])

  // Boot-time anonymous sign-in failure is otherwise silent. Toaster only
  // mounts once `booted` flips `children` on, so this can't fire during the
  // splash — it runs on the render right after, once per session.
  useEffect(() => {
    if (!booted || user || authFailToastShown.current) return
    authFailToastShown.current = true
    toast.error("Couldn't connect — playing as a local guest.")
  }, [booted, user])

  // Per-uid: ensure a profile exists, subscribe to it, and publish presence.
  // Re-runs when the uid changes (e.g. after signing out to a fresh guest).
  // (Profile is exposed as null when there's no uid via the derived value below,
  // so we never need to clear it synchronously here.)
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    let unsubProfile = () => {}
    let unsubPresence = () => {}
    let unsubInvites = () => {}
    let unsubRequests = () => {}
    ;(async () => {
      // Tolerate auth providers / DB rules not being set up yet — the app still
      // works as a guest (getPlayerId falls back to a local id).
      try { await ensureProfile() } catch (e) { console.warn('Profile init skipped:', e?.message) }
      if (cancelled) return
      syncStatsOnBoot()
      unsubProfile = subscribeProfile(uid, p => {
        if (cancelled) return
        setProfile(p)
        // Theme follows the account across devices: applyTheme only touches
        // DOM + localStorage, so this can't loop back into another setProfile write.
        if (p?.theme && THEMES.some(t => t.id === p.theme) && p.theme !== getStoredTheme()) {
          applyTheme(p.theme)
        }
        if (p?.fontFamily && FONTS.some(font => font.id === p.fontFamily) && p.fontFamily !== getStoredFont()) {
          applyFont(p.fontFamily)
        }
      })
      unsubPresence = setupPresence(uid)
      unsubInvites = subscribeInvites(list => { if (!cancelled) setInvites(list) })
      unsubRequests = subscribeRequests(list => { if (!cancelled) setRequestCount(list.length) })
    })()
    return () => {
      cancelled = true
      unsubProfile(); unsubPresence(); unsubInvites(); unsubRequests()
      setInvites([]); setRequestCount(0)
    }
  }, [uid])

  const upgrade = async () => {
    const u = await upgradeWithGoogle()
    if (u) await ensureProfile()
    return u
  }

  const signOutToGuest = async () => {
    await signOutToGuestFn()
  }

  if (!booted) {
    return <ConnectingSplash />
  }

  const value = {
    uid,
    user,
    profile: uid ? profile : null,
    isAnonymous: user?.isAnonymous ?? true,
    invites,
    // M-63: pending game-invite count, exposed alongside requestCount so
    // NavBar can badge it from every screen — a missed 10s invite toast
    // (InviteToasts.jsx) is otherwise only recoverable from Home's own list.
    inviteCount: invites.length,
    requestCount,
    upgrade,
    signOutToGuest,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
