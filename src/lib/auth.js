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
// often never makes it back to the opener. Regular mobile browsers keep the
// user-gesture popup flow, which avoids redirect-storage failures there.
function shouldUseRedirect() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true
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
// Shown when we know a redirect was kicked off but the app came back with no
// result AND no error (the silent failure mode — see consumeRedirectResult).
const REDIRECT_INCOMPLETE_MESSAGE =
  "SIGN-IN DIDN'T COMPLETE — TRY AGAIN, OR OPEN THIS SITE IN YOUR REGULAR BROWSER (NOT AN IN-APP OR INSTALLED VIEW)."

// sessionStorage marker set just before we navigate away to Google. On the way
// back, its presence is the ONLY way to tell "a redirect was in flight" apart
// from "an ordinary page load" — getRedirectResult() resolves null in both the
// success-after-storage-was-blocked case and the never-returned case, with no
// error to catch. It also survives into the next app open in standalone PWAs
// whose OAuth lands in a different browsing context, so the user still gets a
// signal there. Tolerates storage being unavailable (private mode).
const REDIRECT_PENDING_KEY = 'auth-redirect-pending'

function markRedirectPending() {
  try { sessionStorage.setItem(REDIRECT_PENDING_KEY, '1') } catch { /* storage unavailable */ }
}

function clearRedirectPending() {
  try { sessionStorage.removeItem(REDIRECT_PENDING_KEY) } catch { /* storage unavailable */ }
}

function takeRedirectPending() {
  try {
    const pending = sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1'
    sessionStorage.removeItem(REDIRECT_PENDING_KEY)
    return pending
  } catch {
    return false
  }
}

// Completes a pending signInWithRedirect/linkWithRedirect from a previous
// upgrade() call (see shouldUseRedirect()). The page fully reloaded after the
// redirect — this runs inside authReady(), strictly before AuthContext flips
// `booted`/mounts <Toaster/>, so calling toast() directly here would be
// silently dropped (no live subscriber yet). Instead, stash the outcome for
// consumePendingAuthToast() to surface once a page has actually mounted.
// No-ops if no redirect was pending.
async function consumeRedirectResult() {
  if (!auth) return
  const attempted = takeRedirectPending()
  try {
    const result = await getRedirectResult(auth)
    if (result?.user) {
      pendingAuthToast = { type: 'success', message: SIGNED_IN_MESSAGE }
      return
    }
    // No result and no error. If a redirect WAS in flight, either it silently
    // failed (third-party storage blocked, PWA/ in-app browser lost the result)
    // or the session was restored as a real account anyway — distinguish by
    // whether we still have an anonymous user.
    if (attempted) {
      const current = auth.currentUser
      pendingAuthToast = current && !current.isAnonymous
        ? { type: 'success', message: SIGNED_IN_MESSAGE }
        : { type: 'error', message: REDIRECT_INCOMPLETE_MESSAGE }
    }
  } catch (e) {
    try {
      const user = await resolveUpgradeError(e)
      if (user) pendingAuthToast = { type: 'success', message: SIGNED_IN_MESSAGE }
      else if (attempted) pendingAuthToast = { type: 'error', message: REDIRECT_INCOMPLETE_MESSAGE }
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

// Same value as consumePendingAuthToast() but WITHOUT clearing it, so a
// component can render the outcome on its first paint and then clear it from
// an effect (firing the toast there). Keeping the read side-effect-free lets
// React's StrictMode double-render return the same value both times.
export function peekPendingAuthToast() {
  return pendingAuthToast
}

export function clearPendingAuthToast() {
  pendingAuthToast = null
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

// Starts the Google popup machinery (gapi + auth iframe) ahead of a tap, on
// the browsers that need it ready for the popup to open inside the tap's user
// activation (firebase.js DeferredPopupRedirectResolver). Call from an effect
// on any screen showing a Google sign-in button. It waits a few seconds and
// then for an idle moment, so it never competes with the screen's own first
// load. Returns a cleanup.
const PRELOAD_DELAY_MS = 3000

export function preloadGoogleSignIn() {
  const resolver = auth?._popupRedirectResolver
  if (!resolver?.preload) return () => {}
  let idleId = null
  const run = () => { resolver.preload(auth).catch(() => { /* the popup retries on tap */ }) }
  const timer = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') idleId = requestIdleCallback(run, { timeout: 2000 })
    else run()
  }, PRELOAD_DELAY_MS)
  return () => {
    clearTimeout(timer)
    if (idleId !== null) cancelIdleCallback(idleId)
  }
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
    markRedirectPending()
    try {
      if (current?.isAnonymous) await linkWithRedirect(current, provider)
      else await signInWithRedirect(auth, provider)
    } catch (e) {
      // Never navigated — don't leave a marker behind to misfire on next boot.
      clearRedirectPending()
      throw e
    }
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
