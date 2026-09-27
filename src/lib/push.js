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
  const { getMessaging, getToken } = await import('firebase/messaging')
  // FCM background SW lives at /firebase-messaging-sw.js beside workbox sw.js.
  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .catch(() => navigator.serviceWorker.ready)
  const messaging = getMessaging()
  const token = await getToken(messaging, {
    vapidKey: key,
    serviceWorkerRegistration: reg?.active || reg?.waiting ? reg : await navigator.serviceWorker.ready,
  })
  if (!token) throw new Error('no-token')
  const uid = getUid()
  if (!uid) throw new Error('no-uid')
  const hash = await tokenHash(token)
  await set(ref(db, `users/${uid}/fcmTokens/${hash}`), tokenRecord(token))
  try { localStorage.setItem('push-enabled', '1') } catch { /* ignore */ }
  return token
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
