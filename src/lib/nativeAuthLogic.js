// @ts-check
// Pure decisions for sign-in inside the Capacitor shell (src/lib/native/
// nativeAuth.js does the plugin calls, src/lib/auth.js does the Firebase
// calls). No DOM, Firebase or Capacitor here.
//
// Why native needs its own path: the web upgrade uses signInWithPopup /
// linkWithPopup, which never resolve in a WKWebView (no popup window), and
// Google refuses OAuth in embedded webviews anyway. So the shell asks the
// native Google / Apple SDK for a provider credential
// (@capacitor-firebase/authentication with skipNativeAuth: true) and the JS
// Firebase SDK then links or signs in with it — the anonymous uid carries over
// exactly as on the web.

export const GOOGLE_PROVIDER_ID = 'google.com'
export const APPLE_PROVIDER_ID = 'apple.com'

/** @typedef {'google' | 'apple'} UpgradeProvider */

export const NATIVE_PROVIDER_DISABLED = 'auth/native-provider-disabled'
export const NATIVE_CREDENTIAL_MISSING = 'auth/native-credential-missing'
export const NATIVE_SIGN_IN_FAILED = 'auth/native-sign-in-failed'
export const NATIVE_CANCELLED = 'auth/native-cancelled'

/**
 * Copy for the native-only codes, merged into UPGRADE_ERRORS (src/lib/auth.js).
 */
export const NATIVE_UPGRADE_ERRORS = {
  [NATIVE_PROVIDER_DISABLED]: 'THIS SIGN-IN ISN\'T AVAILABLE IN THIS VERSION OF THE APP YET.',
  [NATIVE_CREDENTIAL_MISSING]: 'SIGN-IN DIDN\'T RETURN A LOGIN — PLEASE TRY AGAIN.',
  [NATIVE_SIGN_IN_FAILED]: 'COULDN\'T START SIGN-IN — PLEASE TRY AGAIN.',
  'auth/user-mismatch': 'THAT ISN\'T THE ACCOUNT YOU\'RE SIGNED IN WITH — USE THE SAME ONE.',
}

/**
 * @typedef {object} ProviderEnv
 * @property {boolean} native            inside the Capacitor shell
 * @property {string | null} [platform]  'ios' | 'android' | null
 * @property {boolean} [googleEnabled]   NATIVE_GOOGLE_SIGNIN
 * @property {boolean} [appleEnabled]    NATIVE_APPLE_SIGNIN
 */

/**
 * Whether a sign-in button for the provider may be offered at all. The web
 * keeps Google only (Apple needs the native sheet); the shell follows the
 * launch flags, and Apple only exists on iOS.
 * @param {UpgradeProvider} provider
 * @param {ProviderEnv} env
 */
export function canUseProvider(provider, { native, platform = null, googleEnabled = false, appleEnabled = false }) {
  if (!native) return provider === 'google'
  if (provider === 'google') return googleEnabled === true
  if (provider === 'apple') return appleEnabled === true && platform === 'ios'
  return false
}

/**
 * Which path an upgrade takes.
 *  - web: the popup / redirect flows in auth.js
 *  - native: plugin credential, then link (anonymous user) or sign in
 *  - disabled: native without the flag, or Apple on the web / Android — the
 *    caller throws `code` so nothing hangs
 * @param {UpgradeProvider} provider
 * @param {ProviderEnv & { isAnonymous?: boolean }} env
 * @returns {{ mode: 'web' } | { mode: 'native', action: 'link' | 'signIn' } | { mode: 'disabled', code: string }}
 */
export function upgradeRoute(provider, env) {
  if (!env.native && provider === 'google') return { mode: 'web' }
  if (!canUseProvider(provider, env)) return { mode: 'disabled', code: NATIVE_PROVIDER_DISABLED }
  return { mode: 'native', action: env.isAnonymous ? 'link' : 'signIn' }
}

/**
 * The provider id to re-authenticate with (and to label the account by):
 * apple.com wins when present, because an Apple account must always go through
 * a fresh Sign in with Apple at deletion so the token can be revoked.
 * @param {ReadonlyArray<{ providerId?: string } | null | undefined> | null | undefined} providerData
 * @returns {string | null}
 */
export function providerIdOf(providerData) {
  const ids = (providerData || []).map(p => p?.providerId)
  if (ids.includes(APPLE_PROVIDER_ID)) return APPLE_PROVIDER_ID
  if (ids.includes(GOOGLE_PROVIDER_ID)) return GOOGLE_PROVIDER_ID
  return null
}

const RELAY_DOMAIN = '@privaterelay.appleid.com'

/**
 * Profile status line: "Guest account" or "Signed in with Apple · email".
 * Apple's private-relay addresses are machine noise, so they are not shown.
 * Unknown providers keep the pre-Apple wording (Google).
 * @param {{ isAnonymous?: boolean, providerData?: ReadonlyArray<{ providerId?: string } | null | undefined>, email?: string | null }} args
 */
export function accountStatusLine({ isAnonymous, providerData, email }) {
  if (isAnonymous) return 'Guest account'
  const label = providerIdOf(providerData) === APPLE_PROVIDER_ID ? 'Apple' : 'Google'
  const shown = email && !email.toLowerCase().endsWith(RELAY_DOMAIN) ? email : ''
  return `Signed in with ${label}${shown ? ` · ${shown}` : ''}`
}

/** @param {unknown} v */
function nonEmpty(v) {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * Pulls what GoogleAuthProvider.credential needs out of the plugin's
 * `credential`. The access token is optional (Android's Credential Manager
 * returns only the ID token). Returns null when there is no ID token.
 * @param {any} credential
 * @returns {{ idToken: string, accessToken: string | null } | null}
 */
export function extractGoogleTokens(credential) {
  const idToken = nonEmpty(credential?.idToken)
  if (!idToken) return null
  return { idToken, accessToken: nonEmpty(credential?.accessToken) }
}

/**
 * Pulls what OAuthProvider('apple.com').credential needs out of the plugin's
 * `credential`. On iOS the plugin sends Apple the SHA-256 of a random nonce and
 * returns the RAW nonce as `nonce` — that raw value is what Firebase wants as
 * `rawNonce` (it hashes it and compares with the token's claim). A token
 * without its raw nonce cannot be used, so that returns null. The
 * authorizationCode (kept for token revocation at deletion) is optional.
 * @param {any} credential
 * @returns {{ idToken: string, rawNonce: string, authorizationCode: string | null } | null}
 */
export function extractAppleTokens(credential) {
  const idToken = nonEmpty(credential?.idToken)
  const rawNonce = nonEmpty(credential?.nonce)
  if (!idToken || !rawNonce) return null
  return { idToken, rawNonce, authorizationCode: nonEmpty(credential?.authorizationCode) }
}

/**
 * True when a plugin rejection means the person dismissed the sheet. The
 * plugin forwards platform messages, so this matches on those: iOS Apple
 * (ASAuthorizationError.canceled is error 1001), iOS Google ("The user
 * canceled the sign-in flow."), Android Credential Manager ("activity is
 * cancelled by the user") and the legacy Google 12501.
 * @param {any} err
 */
export function isNativeCancel(err) {
  const code = String(err?.code ?? '')
  const message = String(err?.message ?? (typeof err === 'string' ? err : ''))
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return true
  if (/cancel|dismiss/i.test(code) || /cancel|dismiss/i.test(message)) return true
  return /\berror 1001\b|\b12501\b/.test(message)
}

/**
 * Gives every plugin failure an `auth/…` code the UI can look up. Firebase
 * codes the plugin already forwarded (auth/network-request-failed, …) pass
 * through; a missing/unimplemented plugin becomes native-provider-disabled;
 * anything else native-sign-in-failed (original kept as `cause`).
 * @param {any} err
 * @returns {Error & { code: string }}
 */
export function toNativeAuthError(err) {
  const code = typeof err?.code === 'string' ? err.code : ''
  if (code.startsWith('auth/') && err instanceof Error) return /** @type {any} */ (err)
  const message = String(err?.message ?? (typeof err === 'string' ? err : '')) || 'Native sign-in failed'
  const unavailable = code === 'UNIMPLEMENTED' || /not implemented|not enabled|not included|unimplemented/i.test(message)
  const mapped = code.startsWith('auth/') ? code : unavailable ? NATIVE_PROVIDER_DISABLED : NATIVE_SIGN_IN_FAILED
  const error = /** @type {Error & { code: string }} */ (new Error(message, { cause: err }))
  error.code = mapped
  return error
}

/**
 * Message shown for a failed sign-in. `table` is UPGRADE_ERRORS. Apple's
 * provider-not-enabled case needs its own wording (the shared copy names Google).
 * @param {Record<string, string>} table
 * @param {any} err
 * @param {UpgradeProvider} [provider]
 */
export function upgradeErrorMessage(table, err, provider = 'google') {
  const code = err?.code
  if (provider === 'apple' && code === 'auth/operation-not-allowed') {
    return 'ENABLE APPLE SIGN-IN IN YOUR FIREBASE CONSOLE (AUTHENTICATION → SIGN-IN METHOD).'
  }
  return (code && table[code]) || `SIGN-IN FAILED${code ? ` (${code})` : ''}. PLEASE TRY AGAIN.`
}

/**
 * Request that revokes a Sign in with Apple authorization at account deletion
 * (App Store guideline 5.1.1(v)). The Firebase JS `revokeAccessToken` always
 * sends tokenType ACCESS_TOKEN, but the native sheet only yields an
 * authorization CODE, which the backend must exchange first. So this mirrors
 * the iOS SDK's `revokeToken(withAuthorizationCode:)` body (tokenType 3 =
 * authorization code, no redirectUri) against the same REST endpoint.
 * Returns null when any input is missing.
 * @param {{ apiKey?: string | null, idToken?: string | null, authorizationCode?: string | null }} args
 * @returns {{ url: string, init: { method: 'POST', headers: Record<string, string>, body: string } } | null}
 */
export function buildAppleRevokeRequest({ apiKey, idToken, authorizationCode }) {
  if (!apiKey || !idToken || !authorizationCode) return null
  return {
    url: `https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(apiKey)}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: APPLE_PROVIDER_ID,
        tokenType: '3',
        token: authorizationCode,
        idToken,
      }),
    },
  }
}

/**
 * Whether an error from linking means "this provider account already belongs
 * to another Firebase user" (sign into that one instead).
 * @param {any} err
 */
export function isAccountInUseError(err) {
  return err?.code === 'auth/credential-already-in-use' || err?.code === 'auth/email-already-in-use'
}
