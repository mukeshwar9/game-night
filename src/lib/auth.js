// Thin wrapper over Firebase Auth. Identity model: every visitor is signed in
// ANONYMOUSLY on boot (a real uid, no login UI), and can optionally UPGRADE to a
// permanent Google account via account-linking — which keeps the same uid, so
// the profile/avatar/friends built up as a guest carry over and become
// cross-device. `getPlayerId()` (src/lib/playerId.js) returns this uid.

import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  signInWithCredential,
  signInWithPopup,
  linkWithPopup,
  signInWithRedirect,
  linkWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
} from 'firebase/auth'
import { auth } from './firebase'

// Actionable messages for the common "it's a console-setup problem, not a bug" codes.
// Imported by Onboarding.jsx and Profile.jsx so both show identical copy.
export const UPGRADE_ERRORS = {
  'auth/operation-not-allowed': 'ENABLE GOOGLE SIGN-IN IN YOUR FIREBASE CONSOLE (AUTHENTICATION → SIGN-IN METHOD).',
  'auth/admin-restricted-operation': 'ENABLE ANONYMOUS SIGN-IN IN YOUR FIREBASE CONSOLE.',
  'auth/unauthorized-domain': 'ADD THIS DOMAIN IN FIREBASE AUTH → SETTINGS → AUTHORIZED DOMAINS.',
  'auth/popup-blocked': 'YOUR BROWSER BLOCKED THE POPUP — ALLOW POPUPS FOR THIS SITE AND RETRY.',
  'auth/configuration-not-found': 'ENABLE A SIGN-IN PROVIDER IN YOUR FIREBASE CONSOLE FIRST.',
}

// Popup-based auth (linkWithPopup/signInWithPopup) is unreliable inside
// standalone/installed PWAs — most notably iOS Safari home-screen installs,
// where the popup opens in a disconnected browsing context and the result
// often never makes it back to the opener — and is generally worse UX on
// mobile browsers too. Redirect is the resilient path there; desktop keeps
// the faster, less disruptive popup flow.
function shouldUseRedirect() {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true
  const mobileUA = /Android|iPhone|iPad|iPod/i.test(window.navigator?.userAgent || '')
  return standalone || mobileUA
}

// Shared fallback for both the popup and redirect upgrade paths: if the
// Google account is already a Firebase user (e.g. upgraded on another
// device), sign into it instead of failing outright.
async function resolveUpgradeError(e) {
  if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') {
    const cred = GoogleAuthProvider.credentialFromError(e)
    if (cred) {
      const res = await signInWithCredential(auth, cred)
      return res.user
    }
  }
  if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
    return null
  }
  throw e
}

// Outcome of a redirect-based sign-in that completed on this (fresh) page
// load, stashed for consumePendingAuthToast() to pick up — see below.
let pendingAuthToast = null

const SIGNED_IN_MESSAGE = 'SIGNED IN — YOUR PROFILE IS NOW SAVED ACROSS DEVICES!'

// Completes a pending signInWithRedirect/linkWithRedirect from a previous
// upgrade() call (see shouldUseRedirect()). The page fully reloaded after the
// redirect — this runs inside authReady(), strictly before AuthContext flips
// `booted`/mounts <Toaster/>, so calling toast() directly here would be
// silently dropped (no live subscriber yet). Instead, stash the outcome for
// consumePendingAuthToast() to surface once a page has actually mounted.
// No-ops if no redirect was pending.
async function consumeRedirectResult() {
  if (!auth) return
  try {
    const result = await getRedirectResult(auth)
    if (result?.user) pendingAuthToast = { type: 'success', message: SIGNED_IN_MESSAGE }
  } catch (e) {
    try {
      const user = await resolveUpgradeError(e)
      if (user) pendingAuthToast = { type: 'success', message: SIGNED_IN_MESSAGE }
    } catch (e2) {
      console.error('Google redirect sign-in failed:', e2)
      pendingAuthToast = {
        type: 'error',
        message: UPGRADE_ERRORS[e2?.code] || `SIGN-IN FAILED${e2?.code ? ` (${e2.code})` : ''}. PLEASE TRY AGAIN.`,
      }
    }
  }
}

// Returns and clears any pending redirect-sign-in toast (see above). Call
// from a mount effect on any screen that can kick off upgradeWithGoogle() —
// currently Profile and Onboarding, the two "SIGN IN WITH GOOGLE" entry
// points, which is also where the redirect lands back — once Toaster is
// guaranteed to already be mounted (i.e. after AuthContext's booted/splash
// gate has passed, which is true by the time any route renders).
export function consumePendingAuthToast() {
  const t = pendingAuthToast
  pendingAuthToast = null
  return t
}

let readyPromise = null

// Resolves once we have a signed-in user. If nobody is signed in yet (first
// visit), kicks off anonymous sign-in. Idempotent — safe to call repeatedly.
// Resolves to null if auth is unavailable (Firebase not configured).
export function authReady() {
  if (!auth) return Promise.resolve(null)
  if (readyPromise) return readyPromise
  readyPromise = new Promise((resolve) => {
    consumeRedirectResult().finally(() => {
      const unsub = onAuthStateChanged(auth, async (user) => {
        unsub()
        if (user) { resolve(user); return }
        try {
          const cred = await signInAnonymously(auth)
          resolve(cred.user)
        } catch (e) {
          console.error('Anonymous sign-in failed:', e)
          resolve(null)
        }
      })
    })
  })
  return readyPromise
}

export function getUid() {
  return auth?.currentUser?.uid ?? null
}

export function isAnonymous() {
  return auth?.currentUser?.isAnonymous ?? true
}

// Subscribe to auth-state changes; returns an unsubscribe function.
export function onUser(cb) {
  if (!auth) { cb(null); return () => {} }
  return onAuthStateChanged(auth, cb)
}

// Upgrade the current (anonymous) account to a permanent Google account, keeping
// the same uid. Returns the user, null if the user cancelled the popup, or
// undefined if a redirect was kicked off (the page is about to navigate away —
// the result is picked up by consumeRedirectResult() on the next authReady()
// boot, since there's no live caller left to hand it to).
// If that Google account is ALREADY a Firebase user (e.g. upgraded on another
// device), we fall back to signing into it — the current guest's data is then
// orphaned (merging is out of scope for v1).
export async function upgradeWithGoogle() {
  if (!auth) throw new Error('Auth unavailable')
  const provider = new GoogleAuthProvider()
  const current = auth.currentUser
  if (shouldUseRedirect()) {
    if (current?.isAnonymous) await linkWithRedirect(current, provider)
    else await signInWithRedirect(auth, provider)
    return undefined
  }
  try {
    // Link to keep the same uid when we have an anonymous guest; otherwise (no
    // user — e.g. anonymous sign-in was unavailable) just sign in with Google.
    const res = current?.isAnonymous
      ? await linkWithPopup(current, provider)
      : await signInWithPopup(auth, provider)
    return res.user
  } catch (e) {
    // That Google account is already a Firebase user — sign into it instead.
    return await resolveUpgradeError(e)
  }
}

// Sign out of a permanent account and drop back to a fresh anonymous guest.
export async function signOutToGuest() {
  if (!auth) return null
  await signOut(auth)
  const cred = await signInAnonymously(auth)
  return cred.user
}
