import { describe, it, expect } from 'vitest'
import {
  NATIVE_PROVIDER_DISABLED,
  NATIVE_SIGN_IN_FAILED,
  NATIVE_CREDENTIAL_MISSING,
  NATIVE_UPGRADE_ERRORS,
  accountStatusLine,
  buildAppleRevokeRequest,
  canUseProvider,
  extractAppleTokens,
  extractGoogleTokens,
  isAccountInUseError,
  isNativeCancel,
  providerIdOf,
  toNativeAuthError,
  upgradeErrorMessage,
  upgradeRoute,
} from './nativeAuthLogic'

const on = { googleEnabled: true, appleEnabled: true }

describe('canUseProvider', () => {
  it('web: Google yes, Apple never (flags are ignored)', () => {
    expect(canUseProvider('google', { native: false })).toBe(true)
    expect(canUseProvider('apple', { native: false, ...on })).toBe(false)
  })
  it('native: follows the flags, Apple only on iOS', () => {
    expect(canUseProvider('google', { native: true, platform: 'ios' })).toBe(false)
    expect(canUseProvider('google', { native: true, platform: 'android', ...on })).toBe(true)
    expect(canUseProvider('apple', { native: true, platform: 'ios', ...on })).toBe(true)
    expect(canUseProvider('apple', { native: true, platform: 'ios', googleEnabled: true })).toBe(false)
    expect(canUseProvider('apple', { native: true, platform: 'android', ...on })).toBe(false)
  })
  it('rejects unknown providers', () => {
    // @ts-expect-error deliberately invalid
    expect(canUseProvider('facebook', { native: true, platform: 'ios', ...on })).toBe(false)
  })
})

describe('upgradeRoute', () => {
  it('web Google uses the popup/redirect path', () => {
    expect(upgradeRoute('google', { native: false, isAnonymous: true })).toEqual({ mode: 'web' })
  })
  it('native links an anonymous guest and signs in otherwise', () => {
    const env = { native: true, platform: 'ios', ...on }
    expect(upgradeRoute('google', { ...env, isAnonymous: true })).toEqual({ mode: 'native', action: 'link' })
    expect(upgradeRoute('google', { ...env, isAnonymous: false })).toEqual({ mode: 'native', action: 'signIn' })
    expect(upgradeRoute('apple', { ...env })).toEqual({ mode: 'native', action: 'signIn' })
  })
  it('never falls back to the web popup in the shell: flag off is disabled', () => {
    const r = { mode: 'disabled', code: NATIVE_PROVIDER_DISABLED }
    expect(upgradeRoute('google', { native: true, platform: 'ios', isAnonymous: true })).toEqual(r)
    expect(upgradeRoute('apple', { native: true, platform: 'android', ...on })).toEqual(r)
    expect(upgradeRoute('apple', { native: false, ...on })).toEqual(r)
  })
})

describe('providerIdOf / accountStatusLine', () => {
  it('prefers apple.com, then google.com', () => {
    expect(providerIdOf([{ providerId: 'google.com' }, { providerId: 'apple.com' }])).toBe('apple.com')
    expect(providerIdOf([{ providerId: 'google.com' }])).toBe('google.com')
    expect(providerIdOf([{ providerId: 'password' }])).toBe(null)
    expect(providerIdOf(undefined)).toBe(null)
    expect(providerIdOf([null])).toBe(null)
  })
  it('labels the account by provider', () => {
    const apple = [{ providerId: 'apple.com' }]
    const google = [{ providerId: 'google.com' }]
    expect(accountStatusLine({ isAnonymous: true, providerData: [] })).toBe('Guest account')
    expect(accountStatusLine({ isAnonymous: false, providerData: google, email: 'a@b.co' })).toBe('Signed in with Google · a@b.co')
    expect(accountStatusLine({ isAnonymous: false, providerData: apple, email: 'a@b.co' })).toBe('Signed in with Apple · a@b.co')
    expect(accountStatusLine({ isAnonymous: false, providerData: apple, email: null })).toBe('Signed in with Apple')
  })
  it('hides Apple private-relay addresses and keeps the old Google wording as the fallback', () => {
    expect(accountStatusLine({ isAnonymous: false, providerData: [{ providerId: 'apple.com' }], email: 'x@PrivateRelay.AppleID.com' }))
      .toBe('Signed in with Apple')
    expect(accountStatusLine({ isAnonymous: false, providerData: undefined, email: 'a@b.co' })).toBe('Signed in with Google · a@b.co')
  })
})

describe('token extraction', () => {
  it('Google needs an ID token; the access token is optional', () => {
    expect(extractGoogleTokens({ idToken: 'i', accessToken: 'a' })).toEqual({ idToken: 'i', accessToken: 'a' })
    expect(extractGoogleTokens({ idToken: 'i' })).toEqual({ idToken: 'i', accessToken: null })
    expect(extractGoogleTokens({ accessToken: 'a' })).toBe(null)
    expect(extractGoogleTokens({ idToken: '' })).toBe(null)
    expect(extractGoogleTokens(null)).toBe(null)
  })
  it('Apple maps the plugin nonce to rawNonce and keeps the authorization code', () => {
    expect(extractAppleTokens({ idToken: 'i', nonce: 'raw', authorizationCode: 'c' }))
      .toEqual({ idToken: 'i', rawNonce: 'raw', authorizationCode: 'c' })
    expect(extractAppleTokens({ idToken: 'i', nonce: 'raw' }))
      .toEqual({ idToken: 'i', rawNonce: 'raw', authorizationCode: null })
  })
  it('Apple without a raw nonce or ID token is unusable', () => {
    expect(extractAppleTokens({ idToken: 'i' })).toBe(null)
    expect(extractAppleTokens({ nonce: 'n' })).toBe(null)
    expect(extractAppleTokens(undefined)).toBe(null)
  })
})

describe('isNativeCancel', () => {
  it('recognises the platform dismiss messages', () => {
    expect(isNativeCancel({ message: 'The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)' })).toBe(true)
    expect(isNativeCancel({ message: 'The user canceled the sign-in flow.' })).toBe(true)
    expect(isNativeCancel({ message: 'activity is cancelled by the user.' })).toBe(true)
    expect(isNativeCancel({ message: '12501: ' })).toBe(true)
    expect(isNativeCancel({ code: 'auth/web-context-canceled' })).toBe(true)
    expect(isNativeCancel({ code: 'auth/popup-closed-by-user' })).toBe(true)
    expect(isNativeCancel('Sign in was cancelled')).toBe(true)
  })
  it('does not swallow real failures', () => {
    expect(isNativeCancel({ code: 'auth/network-request-failed', message: 'A network error' })).toBe(false)
    expect(isNativeCancel({ message: 'error 10012' })).toBe(false)
    expect(isNativeCancel(null)).toBe(false)
    expect(isNativeCancel(undefined)).toBe(false)
  })
})

describe('toNativeAuthError', () => {
  it('passes Firebase auth codes through', () => {
    const e = Object.assign(new Error('x'), { code: 'auth/network-request-failed' })
    expect(toNativeAuthError(e)).toBe(e)
    expect(toNativeAuthError({ code: 'auth/invalid-credential', message: 'm' }).code).toBe('auth/invalid-credential')
  })
  it('maps an unavailable plugin to native-provider-disabled', () => {
    expect(toNativeAuthError({ code: 'UNIMPLEMENTED', message: 'nope' }).code).toBe(NATIVE_PROVIDER_DISABLED)
    expect(toNativeAuthError({ message: 'The Apple provider is not enabled.' }).code).toBe(NATIVE_PROVIDER_DISABLED)
  })
  it('wraps anything else with a sign-in-failed code and keeps the cause', () => {
    const cause = { message: 'boom' }
    const e = toNativeAuthError(cause)
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe(NATIVE_SIGN_IN_FAILED)
    expect(e.message).toBe('boom')
    expect(e.cause).toBe(cause)
    expect(toNativeAuthError(undefined).code).toBe(NATIVE_SIGN_IN_FAILED)
  })
})

describe('upgradeErrorMessage', () => {
  const table = { 'auth/operation-not-allowed': 'GOOGLE COPY', ...NATIVE_UPGRADE_ERRORS }
  it('looks the code up and falls back to a generic line with the code', () => {
    expect(upgradeErrorMessage(table, { code: 'auth/operation-not-allowed' })).toBe('GOOGLE COPY')
    expect(upgradeErrorMessage(table, { code: NATIVE_PROVIDER_DISABLED })).toBe(NATIVE_UPGRADE_ERRORS[NATIVE_PROVIDER_DISABLED])
    expect(upgradeErrorMessage(table, { code: 'auth/weird' })).toBe('SIGN-IN FAILED (auth/weird). PLEASE TRY AGAIN.')
    expect(upgradeErrorMessage(table, new Error('x'))).toBe('SIGN-IN FAILED. PLEASE TRY AGAIN.')
  })
  it('names Apple, not Google, when Apple is not enabled in the console', () => {
    expect(upgradeErrorMessage(table, { code: 'auth/operation-not-allowed' }, 'apple')).toMatch(/APPLE/)
  })
  it('has copy for every native code', () => {
    for (const code of [NATIVE_PROVIDER_DISABLED, NATIVE_SIGN_IN_FAILED, NATIVE_CREDENTIAL_MISSING]) {
      expect(NATIVE_UPGRADE_ERRORS[code]).toMatch(/\S/)
    }
  })
})

describe('buildAppleRevokeRequest', () => {
  it('posts the authorization code the way the iOS SDK does', () => {
    const req = buildAppleRevokeRequest({ apiKey: 'K ey', idToken: 'tok', authorizationCode: 'code' })
    expect(req?.url).toBe('https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=K%20ey')
    expect(req?.init.method).toBe('POST')
    expect(JSON.parse(req?.init.body ?? '{}')).toEqual({
      providerId: 'apple.com', tokenType: '3', token: 'code', idToken: 'tok',
    })
  })
  it('is null when anything is missing', () => {
    expect(buildAppleRevokeRequest({ apiKey: 'k', idToken: 'i', authorizationCode: null })).toBe(null)
    expect(buildAppleRevokeRequest({ apiKey: 'k', idToken: '', authorizationCode: 'c' })).toBe(null)
    expect(buildAppleRevokeRequest({ idToken: 'i', authorizationCode: 'c' })).toBe(null)
  })
})

describe('isAccountInUseError', () => {
  it('matches the two "belongs to another user" codes only', () => {
    expect(isAccountInUseError({ code: 'auth/credential-already-in-use' })).toBe(true)
    expect(isAccountInUseError({ code: 'auth/email-already-in-use' })).toBe(true)
    expect(isAccountInUseError({ code: 'auth/invalid-credential' })).toBe(false)
    expect(isAccountInUseError(null)).toBe(false)
  })
})
