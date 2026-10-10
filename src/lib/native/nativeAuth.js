// Native sign-in credentials for the Capacitor shell (docs/MOBILE.md). The
// plugin is configured with skipNativeAuth: true (capacitor.config.ts), so it
// only shows the platform sheet and hands back the provider's tokens; the JS
// Firebase SDK in src/lib/auth.js then links or signs in with them, which keeps
// the anonymous uid. Decisions live in src/lib/nativeAuthLogic.js.
//
// The plugin is imported dynamically so the web bundle never contains it, and
// nothing here runs unless `isNative` (src/lib/platform.js) is true.

import { GoogleAuthProvider, OAuthProvider } from 'firebase/auth'
import {
  APPLE_PROVIDER_ID,
  NATIVE_CREDENTIAL_MISSING,
  extractAppleTokens,
  extractGoogleTokens,
  isNativeCancel,
  toNativeAuthError,
} from '../nativeAuthLogic'

async function plugin() {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
  return FirebaseAuthentication
}

/** @param {string} code @param {string} message */
function coded(code, message) {
  return Object.assign(new Error(message), { code })
}

// Runs one plugin sign-in call; a dismissed sheet resolves null (the way a
// closed popup does on the web), anything else rejects with an `auth/…` code.
async function signInResult(call) {
  try {
    const result = await call(await plugin())
    return result?.credential ?? null
  } catch (e) {
    if (isNativeCancel(e)) return null
    throw toNativeAuthError(e)
  }
}

/**
 * Shows the native Google account sheet. Resolves a Firebase Google credential,
 * or null if the person dismissed it.
 */
export async function getNativeGoogleCredential() {
  const raw = await signInResult(p => p.signInWithGoogle({ skipNativeAuth: true }))
  if (!raw) return null
  const tokens = extractGoogleTokens(raw)
  if (!tokens) throw coded(NATIVE_CREDENTIAL_MISSING, 'Google sign-in returned no ID token')
  return GoogleAuthProvider.credential(tokens.idToken, tokens.accessToken)
}

/**
 * Shows the native Sign in with Apple sheet (iOS). Resolves
 * `{ credential, authorizationCode }` or null if dismissed. `credential` is a
 * Firebase apple.com credential built from the ID token and the RAW nonce the
 * plugin generated (Apple received its SHA-256). `authorizationCode` is what
 * account deletion needs to revoke the Apple authorization.
 */
export async function getNativeAppleCredential() {
  const raw = await signInResult(p => p.signInWithApple({ skipNativeAuth: true }))
  if (!raw) return null
  const tokens = extractAppleTokens(raw)
  if (!tokens) throw coded(NATIVE_CREDENTIAL_MISSING, 'Apple sign-in returned no ID token or nonce')
  const credential = new OAuthProvider(APPLE_PROVIDER_ID).credential({
    idToken: tokens.idToken,
    rawNonce: tokens.rawNonce,
  })
  return { credential, authorizationCode: tokens.authorizationCode }
}

/**
 * Forgets the native Google/Apple session so the next sign-in shows the account
 * chooser instead of silently reusing the last one. Best effort.
 */
export async function clearNativeSession() {
  try {
    await (await plugin()).signOut()
  } catch {
    /* no native session, or the plugin is unavailable */
  }
}
