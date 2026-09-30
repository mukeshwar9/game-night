// Push helpers — pure parts unit-tested, thin FCM wrappers beside each.
// FCM web push needs HTTPS, a registered Service Worker, Notification
// permission, and VITE_FIREBASE_VAPID_KEY (Firebase console → Project
// settings → Cloud Messaging → Web Push certificates).

// Token storage shape: users/{uid}/fcmTokens/{tokenHash}: { token, at, ua, platform? }
// tokenHash keeps RTDB keys safe (FCM tokens contain : / chars). `platform` is
// 'ios' | 'android' for native tokens and absent for web ones (the rules also
// accept 'web'; the sender treats a missing platform as web). sendInvitePush
// draws the notification itself for native tokens, where the web service
// worker does it for web ones.
//
// Inside the Capacitor shell there is no service worker or Notification API, so
// the same four entry points (enablePush, resyncPush, disablePush,
// checkPushPermission) delegate to native/nativePush.js, which loads
// @capacitor-firebase/messaging with a dynamic import; nothing here imports
// it, so the web bundle never carries it. Native push stays off behind
// NATIVE_PUSH until the APNs key and real FCM config exist (docs/MOBILE.md).

import { isNative } from './platform'
import { NATIVE_PUSH } from './features'

export const PUSH_PLATFORMS = ['web', 'ios', 'android']

export function isPushSupported(nav = globalThis.navigator, win = globalThis) {
  try {
    return Boolean(
      nav?.serviceWorker &&
      'PushManager' in win &&
      'Notification' in win
    )
  } catch { return false }
}

/**
 * Whether the push toggle can work here: web needs a service worker, the Push
 * API and a VAPID key; the native shell needs the NATIVE_PUSH flag.
 */
export function pushAvailable({
  native = isNative,
  nativeEnabled = NATIVE_PUSH,
  web = isPushSupported() && Boolean(vapidKey()),
} = {}) {
  return native ? Boolean(nativeEnabled) : Boolean(web)
}

export function permissionState() {
  try {
    if (!('Notification' in globalThis)) return 'unsupported'
    return Notification.permission || 'default'
  } catch { return 'unsupported' }
}

// FCM tokens are ~150+ chars with [A-Za-z0-9:_-]; hash to hex for RTDB key.
export async function tokenHash(token) {
  const data = new TextEncoder().encode(String(token || ''))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export function tokenRecord(token, now = Date.now(), platform = 'web') {
  if (typeof token !== 'string' || token.length < 20) return null
  if (!PUSH_PLATFORMS.includes(platform)) return null
  let ua = ''
  try { ua = String(globalThis.navigator?.userAgent || '').slice(0, 200) } catch { /* ignore */ }
  // Web records stay exactly as before (no platform key): a missing platform
  // means web to the sender, and a web client that ships ahead of the rules
  // deploy still writes a shape the old rules accept.
  return { token, at: now, ...(ua ? { ua } : {}), ...(platform === 'web' ? {} : { platform }) }
}

export function vapidKey() {
  return import.meta.env?.VITE_FIREBASE_VAPID_KEY || ''
}

// ---- FCM wrappers (thin, side-effectful; pure parts above stay tested) ----
// Split so boot never pays for firebase/messaging unless user opts in.
import { ref, set, remove } from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'

// The native half, loaded only inside the shell.
const nativePush = () => import('./native/nativePush')

// Writes the signed-in account's record for a token. A null record would make
// set() delete the node, so a token that fails the shape check throws instead.
export async function saveTokenRecord(token, platform = 'web') {
  if (!db) throw new Error('no-db')
  const uid = getUid()
  if (!uid) throw new Error('no-uid')
  const record = tokenRecord(token, Date.now(), platform)
  if (!record) throw new Error('no-token')
  await set(ref(db, `users/${uid}/fcmTokens/${await tokenHash(token)}`), record)
}

export async function removeTokenRecord(token) {
  const uid = getUid()
  if (!db || !uid || !token) return
  try { await remove(ref(db, `users/${uid}/fcmTokens/${await tokenHash(token)}`)) } catch { /* ignore */ }
}

// 'granted' | 'denied' | 'default' | 'unsupported', for either runtime.
export async function checkPushPermission() {
  if (!isNative) return permissionState()
  if (!NATIVE_PUSH) return 'unsupported'
  try { return await (await nativePush()).checkNativePermission() } catch { return 'unsupported' }
}

export async function enablePush() {
  if (isNative) {
    if (!NATIVE_PUSH) throw new Error('unsupported')
    if (!db) throw new Error('no-db')
    return (await nativePush()).enableNativePush()
  }
  if (!isPushSupported()) throw new Error('unsupported')
  if (!db) throw new Error('no-db')
  const key = vapidKey()
  if (!key) throw new Error('no-vapid-key')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(`permission-${perm}`)
  const token = await registerToken(key)
  try { localStorage.setItem('push-enabled', '1') } catch { /* ignore */ }
  return token
}

// The FCM worker (public/firebase-messaging-sw.js) gets its own scope. On the
// default scope (/) it replaced the app's Workbox worker (sw.js): a scope holds
// one worker, so enabling notifications dropped offline support and the update
// check, and the next load put sw.js back, leaving push events with no handler.
// This is the scope the FCM SDK itself uses by default.
export const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope'

// Registers the FCM worker, fetches a token for it and stores it on the
// account. Needs notification permission to already be granted.
async function registerToken(key) {
  const { getMessaging, getToken } = await import('firebase/messaging')
  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: FCM_SW_SCOPE })
  const token = await getToken(getMessaging(), { vapidKey: key, serviceWorkerRegistration: reg })
  if (!token) throw new Error('no-token')
  await saveTokenRecord(token, 'web')
  return token
}

// On boot for someone who turned notifications on: register again under the
// new scope and rewrite the token. Covers accounts enabled before the scope
// fix, whose stored token belongs to a registration that no longer exists.
// Silent: never prompts, never throws.
export async function resyncPush() {
  try {
    if (isNative) {
      if (!NATIVE_PUSH || !db || localStorage.getItem('push-enabled') !== '1') return
      await (await nativePush()).resyncNativePush()
      return
    }
    if (!isPushSupported() || !db || !vapidKey()) return
    if (localStorage.getItem('push-enabled') !== '1' || permissionState() !== 'granted') return
    await registerToken(vapidKey())
  } catch { /* best effort */ }
}

export async function disablePush(token) {
  if (isNative) {
    try { await (await nativePush()).disableNativePush(token) } catch { /* best effort */ }
    try { localStorage.removeItem('push-enabled') } catch { /* ignore */ }
    return
  }
  const uid = getUid()
  try {
    const { getMessaging, deleteToken } = await import('firebase/messaging')
    if (token) await deleteToken(getMessaging(), token).catch(() => {})
  } catch { /* best effort */ }
  if (db && uid && token) {
    try { await remove(ref(db, `users/${uid}/fcmTokens/${await tokenHash(token)}`)) } catch { /* ignore */ }
  }
  try { localStorage.removeItem('push-enabled') } catch { /* ignore */ }
}
