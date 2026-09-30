// Push helpers — pure parts unit-tested, thin FCM wrappers beside each.
// FCM web push needs HTTPS, a registered Service Worker, Notification
// permission, and VITE_FIREBASE_VAPID_KEY (Firebase console → Project
// settings → Cloud Messaging → Web Push certificates).

// Token storage shape: users/{uid}/fcmTokens/{tokenHash}: { token, at, ua }
// tokenHash keeps RTDB keys safe (FCM tokens contain : / chars).

export function isPushSupported(nav = globalThis.navigator, win = globalThis) {
  try {
    return Boolean(
      nav?.serviceWorker &&
      'PushManager' in win &&
      'Notification' in win
    )
  } catch { return false }
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

export function tokenRecord(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length < 20) return null
  let ua = ''
  try { ua = String(globalThis.navigator?.userAgent || '').slice(0, 200) } catch { /* ignore */ }
  return { token, at: now, ...(ua ? { ua } : {}) }
}

export function vapidKey() {
  return import.meta.env?.VITE_FIREBASE_VAPID_KEY || ''
}

// ---- FCM wrappers (thin, side-effectful; pure parts above stay tested) ----
// Split so boot never pays for firebase/messaging unless user opts in.
import { ref, set, remove } from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'

export async function enablePush() {
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
  const uid = getUid()
  if (!uid) throw new Error('no-uid')
  const hash = await tokenHash(token)
  await set(ref(db, `users/${uid}/fcmTokens/${hash}`), tokenRecord(token))
  return token
}

// On boot for someone who turned notifications on: register again under the
// new scope and rewrite the token. Covers accounts enabled before the scope
// fix, whose stored token belongs to a registration that no longer exists.
// Silent: never prompts, never throws.
export async function resyncPush() {
  try {
    if (!isPushSupported() || !db || !vapidKey()) return
    if (localStorage.getItem('push-enabled') !== '1' || permissionState() !== 'granted') return
    await registerToken(vapidKey())
  } catch { /* best effort */ }
}

export async function disablePush(token) {
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
