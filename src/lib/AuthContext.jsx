import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import PixelDots from '@/components/loading/PixelDots'
import { identifyUser } from './track'
import { setMonitoringUser } from './monitoring'
import { authReady, onUser, upgradeWithGoogle, upgradeWithApple, signOutToGuest as signOutToGuestFn, consumePendingGuestMerge } from './auth'
import {
  ensureProfile, subscribeProfile, setupPresence, subscribeInvites, subscribeRequests,
  subscribeFriends, subscribePresence,
} from './social'
import { syncStatsOnBoot } from './statsSync'
import { ensureCacheOwner } from './playerCache'
import { shouldMergeGuest } from './playerCacheLogic'
import { mergeGuestAccount, claimSavedBadge } from './accountMerge'
import { THEMES, applyTheme, getStoredTheme } from './theme'
import { FONTS, applyFont, getStoredFont } from './font'
import { applyStoredDisplayPrefs } from './displayPrefs'
import { recordAttribution } from './analytics'
import { resyncPush } from './push'
import { startBlockSync } from './mute'
import { startEntitlements, stopEntitlements, syncAdminAccess, isUnlockedNow, setProfileAdmin } from './entitlements'
import useAccess from '../hooks/useAccess'
import { monetizationEnabled } from './monetizationState'
import { isNative } from './platform'

const AuthContext = createContext(null)

// Permanent accounts claim the SAVED badge once per uid per session (idempotent server-side).
const badgeClaimed = new Set()

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
  const [onlineFriendCount, setOnlineFriendCount] = useState(0)
  const uid = user?.uid ?? null
  const authFailToastShown = useRef(false)
  const userRef = useRef(null)
  useEffect(() => { userRef.current = user }, [user])

  // Boot: kick anonymous sign-in (if needed) and track auth state.
  useEffect(() => {
    // Local look-and-feel prefs (CRT, motion, text size) live outside the
    // index.html pre-JS snippet, so re-apply the stored set on every boot.
    applyStoredDisplayPrefs()
    const unsub = onUser(setUser)
    authReady().finally(() => setBooted(true))
    return unsub
  }, [])

  // Monitoring identity: the uid and whether it is a guest, never a name or e-mail.
  const isGuest = user?.isAnonymous ?? true
  useEffect(() => {
    identifyUser(uid ? { uid, isAnonymous: isGuest } : null)
    setMonitoringUser(uid)
  }, [uid, isGuest])

  // Purchases follow the account: watch entitlements/{uid} for as long as it is signed in.
  // With monetization off it is still watched, since an admin flag there turns on the
  // shop preview (premium.js viewerAccess); the native shell never sells at all.
  useEffect(() => {
    if (uid && !isNative) startEntitlements(uid)
    else stopEntitlements()
  }, [uid])

  // A verified Google account on the admin allowlist unlocks every premium item.
  // The server decides (functions/billing.js); this only asks, once per sign-in.
  const permanent = !!user && !user.isAnonymous
  useEffect(() => {
    if (uid && permanent && monetizationEnabled()) syncAdminAccess()
  }, [uid, permanent])

  // A premium theme or font that is no longer unlocked (a lapsed Pass, a refund,
  // a theme synced from another device) steps back to the free default.
  const access = useAccess()
  useEffect(() => {
    if (!access.loaded) return
    const theme = THEMES.find(t => t.id === getStoredTheme())
    if (theme?.premium && !access.isUnlocked({ kind: 'theme', ...theme })) applyTheme('matcha')
    const font = FONTS.find(f => f.id === getStoredFont())
    if (font?.premium && !access.isUnlocked({ kind: 'font', ...font })) applyFont('press-start')
  }, [access])

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
    // Before anything syncs or mirrors: make sure the per-player localStorage
    // caches belong to this uid (a different account's are cleared).
    ensureCacheOwner(uid)
    let cancelled = false
    let unsubProfile = () => {}
    let unsubPresence = () => {}
    let unsubInvites = () => {}
    let unsubRequests = () => {}
    let unsubFriends = () => {}
    let unsubBlocks = () => {}
    let presenceUnsubs = []
    const onlineByUid = {}
    const recountOnline = () => {
      if (cancelled) return
      setOnlineFriendCount(Object.values(onlineByUid).filter(Boolean).length)
    }
    ;(async () => {
      // Tolerate auth providers / DB rules not being set up yet — the app still
      // works as a guest (getPlayerId falls back to a local id).
      try { await ensureProfile(); recordAttribution() } catch (e) { console.warn('Profile init skipped:', e?.message) }
      if (cancelled) return
      await syncStatsOnBoot()
      const permanentNow = !!userRef.current && !userRef.current.isAnonymous
      // Guest -> existing account: fold the guest's server-side progress into it.
      const pending = consumePendingGuestMerge()
      if (shouldMergeGuest(pending, uid, permanentNow)) {
        try {
          const res = await mergeGuestAccount(pending.guestIdToken)
          if (res.merged) {
            await syncStatsOnBoot({ force: true })
            const [arrows, memory] = await Promise.all([import('./arrowsProgress'), import('./memoryProgress')])
            await Promise.allSettled([arrows.syncArrowsProgress(), memory.syncMemoryBests()])
            toast.success("SWITCHED TO YOUR SAVED ACCOUNT — THIS DEVICE'S PROGRESS WAS MERGED IN.")
          }
        } catch (e) { console.warn('Guest merge skipped:', e?.message) }
      }
      if (permanentNow && !badgeClaimed.has(uid)) {
        badgeClaimed.add(uid)
        claimSavedBadge().catch(() => { /* best effort */ })
      }
      if (cancelled) return
      resyncPush()
      unsubProfile = subscribeProfile(uid, p => {
        if (cancelled) return
        setProfile(p)
        setProfileAdmin(p?.admin === true)
        // Theme follows the account across devices: applyTheme only touches
        // DOM + localStorage, so this can't loop back into another setProfile write.
        if (p?.theme && THEMES.some(t => t.id === p.theme && isUnlockedNow({ kind: 'theme', ...t })) && p.theme !== getStoredTheme()) {
          applyTheme(p.theme)
        }
        if (p?.fontFamily && FONTS.some(font => font.id === p.fontFamily && isUnlockedNow({ kind: 'font', ...font })) && p.fontFamily !== getStoredFont()) {
          applyFont(p.fontFamily)
        }
      })
      unsubPresence = setupPresence(uid)
      unsubBlocks = startBlockSync()
      unsubInvites = subscribeInvites(list => { if (!cancelled) setInvites(list) })
      unsubRequests = subscribeRequests(list => { if (!cancelled) setRequestCount(list.length) })
      // Online-friends dot for the tab bar: one friends-list listener plus one
      // tiny presence/{uid} listener per friend (cheaper than subscribeProfile —
      // no public-profile fan-out). Denied reads count as offline.
      unsubFriends = subscribeFriends(list => {
        if (cancelled) return
        presenceUnsubs.forEach(u => u())
        presenceUnsubs = []
        Object.keys(onlineByUid).forEach(k => delete onlineByUid[k])
        list.forEach(({ uid: fid }) => {
          onlineByUid[fid] = false
          presenceUnsubs.push(subscribePresence(fid, p => {
            if (cancelled) return
            onlineByUid[fid] = p?.online === true
            recountOnline()
          }))
        })
        recountOnline()
      })
    })()
    return () => {
      cancelled = true
      unsubProfile(); unsubPresence(); unsubInvites(); unsubRequests()
      unsubFriends(); unsubBlocks(); presenceUnsubs.forEach(u => u()); presenceUnsubs = []
      setInvites([]); setRequestCount(0); setOnlineFriendCount(0)
      setProfileAdmin(false)
    }
  }, [uid])

  // provider: 'google' (default) or 'apple' (iOS shell only, see canSignInWithApple).
  const upgrade = async (provider = 'google') => {
    const u = provider === 'apple' ? await upgradeWithApple() : await upgradeWithGoogle()
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
    onlineFriendCount,
    upgrade,
    signOutToGuest,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
