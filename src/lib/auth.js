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
  linkWithCredential,
  reauthenticateWithCredential,
  signInWithPopup,
  linkWithPopup,
  signInWithRedirect,
  linkWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  deleteUser,
  reauthenticateWithPopup,
} from 'firebase/auth'
import { auth } from './firebase'
import { isNative, nativePlatform } from './platform'
import { NATIVE_GOOGLE_SIGNIN, NATIVE_APPLE_SIGNIN } from './features'
import {
  APPLE_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  NATIVE_CANCELLED,
  NATIVE_UPGRADE_ERRORS,
  buildAppleRevokeRequest,
  canUseProvider,
  isAccountInUseError,
  providerIdOf,
  upgradeErrorMessage,
  upgradeRoute,
} from './nativeAuthLogic'

// Actionable messages for the common "it's a console-setup problem, not a bug" codes.
// Imported by Onboarding.jsx and Profile.jsx so both show identical copy.
export const UPGRADE_ERRORS = {
  'auth/operation-not-allowed': 'ENABLE GOOGLE SIGN-IN IN YOUR FIREBASE CONSOLE (AUTHENTICATION → SIGN-IN METHOD).',
  'auth/admin-restricted-operation': 'ENABLE ANONYMOUS SIGN-IN IN YOUR FIREBASE CONSOLE.',
  'auth/unauthorized-domain': 'ADD THIS DOMAIN IN FIREBASE AUTH → SETTINGS → AUTHORIZED DOMAINS.',
  'auth/popup-blocked': 'YOUR BROWSER BLOCKED THE POPUP — ALLOW POPUPS FOR THIS SITE AND RETRY.',
  'auth/configuration-not-found': 'ENABLE A SIGN-IN PROVIDER IN YOUR FIREBASE CONSOLE FIRST.',
  ...NATIVE_UPGRADE_ERRORS,
}

// Message for a failed sign-in, shared by Onboarding and Profile. `provider`
// picks Apple-specific wording where the Google copy would be wrong.
export function upgradeMessage(e, provider = 'google') {
  return upgradeErrorMessage(UPGRADE_ERRORS, e, provider)
}

// Which sign-in buttons to offer. The web offers Google only; the native shell
// offers a provider only once its launch flag is on (src/lib/features.js), and
// Sign in with Apple only on iOS. Screens must not render a button whose
// function would throw auth/native-provider-disabled.
function providerEnv() {
  return {
    native: isNative,
    platform: nativePlatform,
    googleEnabled: NATIVE_GOOGLE_SIGNIN,
    appleEnabled: NATIVE_APPLE_SIGNIN,
  }
}

export function canSignInWithGoogle() {
  return canUseProvider('google', providerEnv())
}

export function canSignInWithApple() {
  return canUseProvider('apple', providerEnv())
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
  // The shell never redirects (native sheets only), and getRedirectResult would
  // start the deferred popup/redirect resolver's firebaseapp.com iframe in a
  // webview that can't use it, delaying boot and risking a bogus error toast.
  if (!auth || isNative) return
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
  if (isNative) return () => {} // native sign-in uses the platform sheet, not the popup machinery
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

function coded(code, message) {
  return Object.assign(new Error(message), { code })
}

// Loaded on demand: the plugin wrapper (and through it @capacitor-firebase/
// authentication) only ever exists in the native shell's bundle path.
const loadNativeAuth = () => import('./native/nativeAuth')

// Native upgrade: the platform sheet yields a provider credential, then the JS
// SDK links it to the anonymous guest (same uid) or signs in with it. `getCred`
// resolves the Firebase credential, or null when the sheet was dismissed.
// Like the web fallback, a provider account that already belongs to another
// Firebase user signs into that user instead; the guest's data is then
// orphaned (merging is out of scope for v1).
async function upgradeNative(route, ProviderClass, getCred) {
  const credential = await getCred(await loadNativeAuth())
  if (!credential) return null
  const current = auth.currentUser
  try {
    const res = route.action === 'link' && current
      ? await linkWithCredential(current, credential)
      : await signInWithCredential(auth, credential)
    return res.user
  } catch (e) {
    if (!isAccountInUseError(e)) throw e
    // The error usually carries a ready-to-use credential for the existing
    // account; otherwise the one just obtained works on its own.
    const existing = ProviderClass.credentialFromError(e) || credential
    return (await signInWithCredential(auth, existing)).user
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
// In the native shell there is no popup: the platform Google sheet supplies a
// credential (upgradeNative). While NATIVE_GOOGLE_SIGNIN is off it throws
// auth/native-provider-disabled instead of hanging — screens gate on
// canSignInWithGoogle() so they never offer the button in that state.
export async function upgradeWithGoogle() {
  if (!auth) throw new Error('Auth unavailable')
  const route = upgradeRoute('google', { ...providerEnv(), isAnonymous: auth.currentUser?.isAnonymous === true })
  if (route.mode === 'disabled') throw coded(route.code, 'Google sign-in is not enabled in this build')
  if (route.mode === 'native') {
    return upgradeNative(route, GoogleAuthProvider, n => n.getNativeGoogleCredential())
  }
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

// Sign in with Apple (iOS shell only; the web never offers it). Same contract
// as upgradeWithGoogle: the user, or null if the sheet was dismissed; throws
// auth/native-provider-disabled when NATIVE_APPLE_SIGNIN is off or the
// platform is not iOS (gate the button on canSignInWithApple()).
export async function upgradeWithApple() {
  if (!auth) throw new Error('Auth unavailable')
  const route = upgradeRoute('apple', { ...providerEnv(), isAnonymous: auth.currentUser?.isAnonymous === true })
  if (route.mode !== 'native') {
    throw coded(route.mode === 'disabled' ? route.code : 'auth/native-provider-disabled', 'Sign in with Apple is not enabled in this build')
  }
  return upgradeNative(route, OAuthProvider, async (n) => (await n.getNativeAppleCredential())?.credential ?? null)
}

// Best-effort revocation of the Sign in with Apple authorization (App Store
// guideline 5.1.1(v)). The Firebase JS revokeAccessToken(auth, token) always
// sends tokenType ACCESS_TOKEN, but the native sheet only gives an
// authorization CODE, so this posts the same body the iOS SDK's
// revokeToken(withAuthorizationCode:) does (see buildAppleRevokeRequest). Never
// throws: a failed revoke must not block deleting the account, and the person
// can still remove the app under Settings > Apple ID > Sign in with Apple.
async function revokeAppleAuthorization(user, authorizationCode) {
  try {
    const req = buildAppleRevokeRequest({
      apiKey: auth?.config?.apiKey,
      idToken: await user.getIdToken(),
      authorizationCode,
    })
    if (!req) return false
    const res = await fetch(req.url, req.init)
    if (!res.ok) console.warn('Apple token revocation was rejected:', res.status)
    return res.ok
  } catch (e) {
    console.warn('Apple token revocation failed:', e?.message)
    return false
  }
}

// The Sign in with Apple authorization code from the latest deletion re-auth,
// held until deleteCurrentUser() revokes it. Memory only, never persisted.
let pendingAppleAuthCode = null

// Native re-auth for a sensitive operation: a fresh credential from the
// platform sheet for the provider the account uses, then
// reauthenticateWithCredential. Resolves true once re-authenticated, false if
// the sheet was dismissed. An Apple account always re-authenticates here (even
// if Firebase would not ask) so the authorization code is at hand to revoke.
async function reauthenticateNative(user) {
  const providerId = providerIdOf(user.providerData)
  if (providerId !== APPLE_PROVIDER_ID && providerId !== GOOGLE_PROVIDER_ID) return true
  if (providerId === APPLE_PROVIDER_ID && !canSignInWithApple()) return true // no Apple sheet here; Firebase may still accept the delete
  const native = await loadNativeAuth()
  if (providerId === APPLE_PROVIDER_ID) {
    const res = await native.getNativeAppleCredential()
    if (!res) return false
    await reauthenticateWithCredential(user, res.credential)
    pendingAppleAuthCode = res.authorizationCode
    return true
  }
  const credential = await native.getNativeGoogleCredential()
  if (!credential) return false
  await reauthenticateWithCredential(user, credential)
  return true
}

// Step one of "Delete my data" (social.js deleteMyData), run BEFORE any row is
// removed: in the native shell a permanent account re-authenticates up front, so
// dismissing the sheet aborts with auth/native-cancelled while everything is
// still intact. A no-op on the web (its popup re-auth stays in
// deleteCurrentUser) and for guests.
export async function prepareAccountDeletion() {
  const user = auth?.currentUser
  if (!isNative || !user || user.isAnonymous) return
  if (!(await reauthenticateNative(user))) {
    throw coded(NATIVE_CANCELLED, 'Account deletion cancelled')
  }
}

// Deletes the Firebase Auth account itself (the last step of "Delete my data").
// Deleting is a sensitive operation: an old session gets auth/requires-recent-
// login. A permanent account then signs in once more and retries (web: popup;
// native: the platform sheet). A guest cannot re-authenticate, so it is signed
// out instead: every row is already gone, and the leftover empty anonymous
// sign-in record holds no data. An Apple account's authorization is revoked
// first (best effort). Returns 'deleted' | 'signed-out'.
export async function deleteCurrentUser() {
  const user = auth?.currentUser
  if (!user) return 'signed-out'
  // An Apple account on iOS needs a fresh authorization code even when the
  // session is recent; prepareAccountDeletion() normally got it already.
  if (isNative && !user.isAnonymous && !pendingAppleAuthCode && providerIdOf(user.providerData) === APPLE_PROVIDER_ID) {
    if (!(await reauthenticateNative(user))) throw coded(NATIVE_CANCELLED, 'Account deletion cancelled')
  }
  if (pendingAppleAuthCode) {
    const code = pendingAppleAuthCode
    pendingAppleAuthCode = null
    await revokeAppleAuthorization(user, code)
  }
  try {
    await deleteUser(user)
    return 'deleted'
  } catch (e) {
    if (e?.code !== 'auth/requires-recent-login') throw e
    if (!user.isAnonymous) {
      if (isNative) {
        if (!(await reauthenticateNative(user))) throw coded(NATIVE_CANCELLED, 'Account deletion cancelled')
      } else if (providerIdOf(user.providerData) === APPLE_PROVIDER_ID) {
        await reauthenticateWithPopup(user, new OAuthProvider(APPLE_PROVIDER_ID))
      } else {
        await reauthenticateWithPopup(user, new GoogleAuthProvider())
      }
      await deleteUser(user)
      return 'deleted'
    }
    await signOut(auth)
    return 'signed-out'
  }
}

// Sign out of a permanent account and drop back to a fresh anonymous guest.
export async function signOutToGuest() {
  if (!auth) return null
  await signOut(auth)
  if (isNative) loadNativeAuth().then(n => n.clearNativeSession()).catch(() => { /* no native session */ })
  const cred = await signInAnonymously(auth)
  return cred.user
}
