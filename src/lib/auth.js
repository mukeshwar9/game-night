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
  GoogleAuthProvider,
} from 'firebase/auth'
import { auth } from './firebase'

let readyPromise = null

// Resolves once we have a signed-in user. If nobody is signed in yet (first
// visit), kicks off anonymous sign-in. Idempotent — safe to call repeatedly.
// Resolves to null if auth is unavailable (Firebase not configured).
export function authReady() {
  if (!auth) return Promise.resolve(null)
  if (readyPromise) return readyPromise
  readyPromise = new Promise((resolve) => {
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
// the same uid. Returns the user, or null if the user cancelled the popup.
// If that Google account is ALREADY a Firebase user (e.g. upgraded on another
// device), we fall back to signing into it — the current guest's data is then
// orphaned (merging is out of scope for v1).
export async function upgradeWithGoogle() {
  if (!auth) throw new Error('Auth unavailable')
  const provider = new GoogleAuthProvider()
  const current = auth.currentUser
  try {
    // Link to keep the same uid when we have an anonymous guest; otherwise (no
    // user — e.g. anonymous sign-in was unavailable) just sign in with Google.
    const res = current?.isAnonymous
      ? await linkWithPopup(current, provider)
      : await signInWithPopup(auth, provider)
    return res.user
  } catch (e) {
    // That Google account is already a Firebase user — sign into it instead.
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
}

// Sign out of a permanent account and drop back to a fresh anonymous guest.
export async function signOutToGuest() {
  if (!auth) return null
  await signOut(auth)
  const cred = await signInAnonymously(auth)
  return cred.user
}
