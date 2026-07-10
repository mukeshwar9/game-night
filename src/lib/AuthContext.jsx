import { createContext, useContext, useEffect, useState } from 'react'
import ArcadeLoader from '@/components/ArcadeLoader'
import { authReady, onUser, upgradeWithGoogle, signOutToGuest as signOutToGuestFn } from './auth'
import {
  ensureProfile, subscribeProfile, setupPresence, subscribeInvites, subscribeRequests,
} from './social'
import { syncStatsOnBoot } from './statsSync'

const AuthContext = createContext(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext) || {}
}

function ConnectingSplash() {
  return <ArcadeLoader variant="boot" />
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [booted, setBooted] = useState(false)
  const [invites, setInvites] = useState([])
  const [requestCount, setRequestCount] = useState(0)
  const uid = user?.uid ?? null

  // Boot: kick anonymous sign-in (if needed) and track auth state.
  useEffect(() => {
    const unsub = onUser(setUser)
    authReady().finally(() => setBooted(true))
    return unsub
  }, [])

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
      unsubProfile = subscribeProfile(uid, p => { if (!cancelled) setProfile(p) })
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

  if (!booted) return <ConnectingSplash />

  const value = {
    uid,
    user,
    profile: uid ? profile : null,
    isAnonymous: user?.isAnonymous ?? true,
    invites,
    requestCount,
    upgrade,
    signOutToGuest,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
